import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {assignProjects} from '../src/project-membership.mjs';
import {SemanticProjectMemberships, projectAssignmentProtected} from '../src/semantic-project-membership.mjs';
import {organizeProjectKnowledge} from '../public/taxonomy.js';
import {buildMainTagGraph} from '../public/main-tags.js';

const mechanism = '异牌链的结算按卡牌顺序保留每一步独立效果。';
const goal = '战斗演出错峰启动，让结果可读而不强制等待全部动画。';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venus-semantic-project-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const store = new Store(path.join(root, 'data'));
  const source = store.import({name: '既有项目定义', body: '# 已有项目内容\n' + mechanism + '\n' + goal}).node;
  assignProjects(store, {nodes: [{id: source.id, hash: source.hash, classificationHash: source.classificationHash}], projects: [{id: 'example-existing', name: 'ExampleProject'}]});
  const subject = store.upsert({id: 'k-detail', kind: 'knowledge', title: '战斗视觉节奏', body: '# 战斗视觉节奏\n' + mechanism + '\n' + goal, sources: [{id: source.id, quote: mechanism, sourceHash: source.hash}]});
  const service = new SemanticProjectMemberships(store);
  return {root, store, source, subject, service};
}
function response(prepared, projectId = 'example-existing') {
  const subject = prepared.scope[0];
  const candidate = prepared.input.projects.find(project => project.id === projectId);
  const projectDocument = prepared.input.documents.find(document => candidate.documentIds.includes(document.id) && document.text.includes(mechanism));
  return {model: 'gpt-6-astra', items: [{nodeId: subject.id, decision: 'assigned', reason: '具体卡牌链结算与演出目标均匹配现有项目内容。', memberships: [{projectId, reason: '保留独立视觉节奏子内容，复用已有项目身份。', grounds: [
    {kind: 'mechanism', subject: {documentId: subject.documentIds[0], quote: mechanism}, project: {documentId: projectDocument.id, quote: mechanism}, explanation: '双方均采用按异牌链顺序逐步结算的同一机制。'},
    {kind: 'goal', subject: {documentId: subject.documentIds[0], quote: goal}, project: {documentId: projectDocument.id, quote: goal}, explanation: '双方使用同一错峰战斗演出约束，支持这个项目中的节奏子内容。'},
  ]}]}]};
}
test('preparation preserves full selected body, includes source context and existing project contents without invoking a model', t => {
  const {service, subject, source} = fixture(t), prepared = service.prepare({nodeIds: [subject.id]});
  assert.equal(prepared.modelInvoked, false);
  assert.equal(prepared.model, 'gpt-6-astra');
  assert(prepared.input.documents.some(document => document.nodeId === source.id && document.role === 'source'));
  assert.equal(prepared.input.documents.find(document => document.role === 'subject').text, subject.body);
  assert.equal(prepared.input.projects[0].id, 'example-existing');
  assert(!subject.title.includes('ExampleProject'));
});
test('validated content membership reuses existing project, preserves all source bytes and supports field-only rollback', t => {
  const {service, store, subject, source} = fixture(t);
  const sourceBytes = fs.readFileSync(path.join(store.root, source.path)), subjectBytes = fs.readFileSync(path.join(store.root, subject.path));
  const prepared = service.prepare({nodeIds: [subject.id]}), preview = service.preview({id: prepared.id, result: response(prepared)});
  const receipt = service.commit({token: preview.token});
  assert(receipt.verified); assert(fs.existsSync(receipt.backupPath));
  let saved = store.find(subject.id);
  assert.equal(saved.classification.projectMemberships[0].id, 'example-existing');
  const state = organizeProjectKnowledge({nodes: store.nodes});
  assert.equal(state.nodes.find(node => node.id === subject.id).projectScopes[0].name, 'ExampleProject');
  const graph = buildMainTagGraph(state.nodes.filter(node => node.kind === 'knowledge'), []);
  assert.equal(graph.nodes.find(node => node.isMainTag).title, 'ExampleProject');
  store.classify({id: saved.id, expectedHash: saved.classificationHash, sourceHash: saved.hash, summary: '后续人工更新的摘要保留', tags: [{name: '逐项结算', reason: '独立效果', quote: mechanism}]});
  assert(service.rollback({receiptId: receipt.receiptId}).verified);
  saved = store.find(subject.id);
  assert.equal(saved.classification.summary, '后续人工更新的摘要保留');
  assert.equal(saved.classification.projectMemberships, undefined);
  assert.deepEqual(fs.readFileSync(path.join(store.root, source.path)), sourceBytes);
  assert.deepEqual(fs.readFileSync(path.join(store.root, subject.path)), subjectBytes);
});
test('unknown project, wrong model, invented quotes, duplicate grounds and isolated Combo/Straight never pass', t => {
  const {service, subject} = fixture(t), prepared = service.prepare({nodeIds: [subject.id]});
  for (const mutate of [
    result => { result.model = 'gpt-6.1-sol'; },
    result => { result.items[0].memberships[0].projectId = 'invented'; },
    result => { result.items[0].memberships[0].grounds[0].subject.quote = '这是原文里根本不存在的足够长的内容。'; },
    result => { result.items[0].memberships[0].grounds[1] = structuredClone(result.items[0].memberships[0].grounds[0]); },
    result => { result.items[0].memberships[0].grounds[0].subject.quote = 'Combo'; },
    result => { result.items[0].memberships[0].grounds.forEach(ground => { ground.kind = 'context'; }); },
  ]) { const result = response(prepared); mutate(result); assert.throws(() => service.preview({id: prepared.id, result})); }
});
test('manual membership and manual unassignment are protected and suppress repeated-tag projects', t => {
  const {service, store, subject} = fixture(t);
  for (const projects of [[{id: 'manual', name: '人工项目'}], []]) {
    const current = store.find(subject.id);
    assignProjects(store, {nodes: [{id: current.id, hash: current.hash, classificationHash: current.classificationHash}], projects});
    const node = store.find(subject.id), prepared = service.prepare({nodeIds: [node.id]});
    assert(projectAssignmentProtected(node)); assert.equal(prepared.scope.length, 0); assert.equal(prepared.protected.length, 1);
    const repeated = Array.from({length: 5}, (_, i) => ({id: 'v-' + i, kind: 'vault', hash: 'h', body: mechanism, classification: {sourceHash: 'h', tags: [{name: '重复主题', reason: '讨论主题', quote: mechanism}]}}));
    repeated[0] = {...repeated[0], classification: {...repeated[0].classification, projectMemberships: projects.map(project => ({...project, basis: 'user-assigned-project'}))}};
    const state = organizeProjectKnowledge({nodes: repeated});
    assert.deepEqual(state.nodes[0].projectScopes.map(project => project.id), projects.map(project => project.id));
    assert(state.recurringProjects.some(project => project.status === 'promoted'));
  }
});
test('current source and classification hashes guard preview and commit; busy tasks prevent writes', t => {
  const {service, store, subject} = fixture(t), prepared = service.prepare({nodeIds: [subject.id]});
  const preview = service.preview({id: prepared.id, result: response(prepared)});
  service.busy = () => true;
  assert.throws(() => service.commit({token: preview.token}), /活动/);
  service.busy = () => false;
  store.edit({id: subject.id, expectedHash: subject.hash, body: subject.body + '\n新增内容'});
  assert.throws(() => service.commit({token: preview.token}), /变化/);
  assert.throws(() => service.preview({id: prepared.id, result: response(prepared)}), /变化/);
});
test('uncertain result stays unassigned; a later evidence change makes semantic membership visibly pending', t => {
  const {service, store, subject, source} = fixture(t);
  let prepared = service.prepare({nodeIds: [subject.id]});
  let preview = service.preview({id: prepared.id, result: {model: 'gpt-6-astra', items: [{nodeId: subject.id, decision: 'unassigned', reason: '只有通用术语，没有项目特定机制。', memberships: []}]}});
  service.commit({token: preview.token});
  assert.equal(organizeProjectKnowledge({nodes: store.nodes}).nodes.find(node => node.id === subject.id).projectScopes.length, 0);
  prepared = service.prepare({nodeIds: [subject.id], force: true});
  preview = service.preview({id: prepared.id, result: response(prepared)});
  service.commit({token: preview.token});
  store.edit({id: source.id, expectedHash: source.hash, body: source.body + '\n项目依据已更新'});
  const view = organizeProjectKnowledge({nodes: store.nodes}).nodes.find(node => node.id === subject.id);
  assert(view.projectMembershipNeedsReview); assert.equal(view.projectScopes.length, 0);
});
test('multi-project associations keep independent evidence; same names do not merge project identities', t => {
  const {service, store, subject} = fixture(t);
  const second = store.import({name: '另一现有项目', body: '# 第二个项目\n' + mechanism + '\n' + goal}).node;
  assignProjects(store, {nodes: [{id: second.id, hash: second.hash, classificationHash: second.classificationHash}], projects: [{id: 'another-existing', name: 'ExampleProject'}]});
  const prepared = service.prepare({nodeIds: [subject.id]}), result = response(prepared);
  result.items[0].memberships.push(response(prepared, 'another-existing').items[0].memberships[0]);
  const preview = service.preview({id: prepared.id, result});
  service.commit({token: preview.token});
  assert.deepEqual(store.find(subject.id).classification.projectMemberships.map(project => project.id), ['example-existing', 'another-existing']);
});
test('rollback refuses later manual assignment rather than overwriting it', t => {
  const {service, store, subject} = fixture(t), prepared = service.prepare({nodeIds: [subject.id]});
  const receipt = service.commit({token: service.preview({id: prepared.id, result: response(prepared)}).token});
  const saved = store.find(subject.id);
  assignProjects(store, {nodes: [{id: saved.id, hash: saved.hash, classificationHash: saved.classificationHash}], projects: [{id: 'manual', name: '人工修订'}]});
  assert.throws(() => service.rollback({receiptId: receipt.receiptId}), /不能覆盖回退/);
  assert.equal(store.find(subject.id).classification.projectMemberships[0].id, 'manual');
});
test('clearing a semantic assignment manually creates an enduring manual unassignment', t => {
  const {service, store, subject} = fixture(t), prepared = service.prepare({nodeIds: [subject.id]});
  service.commit({token: service.preview({id: prepared.id, result: response(prepared)}).token});
  const saved = store.find(subject.id);
  assignProjects(store, {nodes: [{id: saved.id, hash: saved.hash, classificationHash: saved.classificationHash}], projects: []});
  const current = store.find(subject.id);
  assert.equal(current.classification.projectMembershipAnalysis.method, 'manual');
  assert(projectAssignmentProtected(current));
  assert.equal(service.prepare({nodeIds: [subject.id]}).scope.length, 0);
});
test('all four content kinds expose the same committed project and preserve their existing source metadata', t => {
  const {service, store, subject} = fixture(t), prepared = service.prepare({nodeIds: [subject.id]});
  service.commit({token: service.preview({id: prepared.id, result: response(prepared)}).token});
  const saved = store.find(subject.id);
  for (const kind of ['vault', 'knowledge', 'skill', 'concept']) {
    const synthetic = {...saved, kind};
    const view = organizeProjectKnowledge({nodes: store.nodes.map(node => node.id === saved.id ? synthetic : node)});
    const selected = view.nodes.find(node => node.id === saved.id);
    assert.equal(selected.projectScopes[0].id, 'example-existing');
    const graph = buildMainTagGraph([selected], []);
    assert.equal(graph.nodes.find(node => node.isMainTag).title, 'ExampleProject');
    assert.deepEqual(selected.sources, saved.sources);
  }
});
test('evidence from a different node cannot be borrowed as the selected item evidence', t => {
  const {service, store, subject} = fixture(t);
  const unrelated = store.import({name: '同术语但另一事项', body: '# 独立事项\n' + mechanism + '\n' + goal}).node;
  const prepared = service.prepare({nodeIds: [subject.id, unrelated.id]});
  const result = response(prepared);
  result.items.push({nodeId: unrelated.id, decision: 'unassigned', reason: '独立事项尚无足够来源说明。', memberships: []});
  result.items[0].memberships[0].grounds[0].subject.documentId = prepared.scope[1].documentIds[0];
  assert.throws(() => service.preview({id: prepared.id, result}), /对应输入/);
});
test('saved ASTRA assignment with unchanged subject and evidence is skipped without a new model input', t => {
  const {service, subject} = fixture(t), prepared = service.prepare({nodeIds: [subject.id]});
  service.commit({token: service.preview({id: prepared.id, result: response(prepared)}).token});
  const repeat = service.prepare({nodeIds: [subject.id]});
  assert.equal(repeat.status, 'already-saved');
  assert.equal(repeat.scope.length, 0);
  assert.equal(repeat.skipped[0].id, subject.id);
  assert.equal(repeat.modelInvoked, false);
});
