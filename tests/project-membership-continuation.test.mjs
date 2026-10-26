import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store, hash} from '../src/store.mjs';
import {assignProjects} from '../src/project-membership.mjs';
import {SemanticProjectMemberships} from '../src/semantic-project-membership.mjs';
import {continueProjectMembership, PROJECT_MEMBERSHIP_SCHEMA} from '../scripts/project-membership-continuation.mjs';
const mechanism = '异牌链的结算按卡牌顺序保留每一步独立效果。';
const goal = '战斗演出错峰启动，让结果可读而不强制等待全部动画。';
function fixture(t, count = 1) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'venus-project-continuation-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const store = new Store(path.join(directory, 'data')), classificationWork = path.join(directory, 'classification');
  const source = store.import({name: '项目定义', body: '# 项目内容\n' + mechanism + '\n' + goal}).node;
  assignProjects(store, {nodes: [{id: source.id, hash: source.hash, classificationHash: source.classificationHash}], projects: [{id: 'existing', name: '已有游戏'}]});
  const selected = Array.from({length: count}, (_, index) => store.upsert({id: 'k-' + index, kind: 'knowledge', title: '独立子内容' + index, body: '# 独立子内容' + index + '\n' + mechanism + '\n' + goal, sources: [{id: source.id, sourceHash: source.hash, quote: mechanism}]}));
  const service = new SemanticProjectMemberships(store, {classificationWork}), calls = [];
  const api = async (route, input) => {
    calls.push({route, input});
    if (route.startsWith('node?id=')) return store.find(decodeURIComponent(route.slice(8)));
    return service[route.split('/').at(-1)](input);
  };
  const run = async input => ({model: 'gpt-6-astra', items: input.nodes.map(node => ({nodeId: node.id, decision: 'assigned', reason: '目标与机制一致', memberships: [{projectId: 'existing', reason: '同一既有项目的独立子内容', grounds: [mechanism, goal].map((quote, index) => ({kind: index ? 'goal' : 'mechanism', subject: {documentId: node.documentIds.find(id => input.documents.find(document => document.id === id)?.text.includes(quote)), quote}, project: {documentId: input.projects[0].documentIds.find(id => input.documents.find(document => document.id === id)?.text.includes(quote)), quote}, explanation: '具体机制与项目内容一一对应，不根据标题判断。'}))}]}))});
  return {directory, classificationWork, store, source, selected, service, api, calls, run, gate: async () => {}};
}
test('same executor uses batches at most six, exact ASTRA schema and verifies saved nodes before reporting', async t => {
  const f = fixture(t, 13), input = {...f, sourceIds: f.selected.map(node => node.id), ownerToken: 'same-owner'};
  const owners = []; f.service.busy = ({ownerToken}) => { owners.push(ownerToken); return ownerToken !== 'same-owner'; };
  const report = await continueProjectMembership(input);
  assert.deepEqual(PROJECT_MEMBERSHIP_SCHEMA.properties.model.enum, ['gpt-6-astra']);
  assert.equal(report.modelCalls, 3); assert.equal(report.saved.length, 13); assert.equal(report.verifiedNodes.length, 13);
  assert(f.calls.filter(call => call.route.endsWith('/prepare')).every(call => call.input.nodeIds.length <= 6));
  assert.deepEqual(owners, ['same-owner', 'same-owner', 'same-owner']);
  const again = await continueProjectMembership({...input, run: async () => { throw Error('No duplicate inference'); }});
  assert.equal(again.skipped.length, 13); assert.equal(again.modelCalls, 0);
});
test('unchanged unassigned content waits for a definition instead of running on every continuation', async t => {
  const f = fixture(t), node = f.selected[0];
  const run = async () => ({model: 'gpt-6-astra', items: [{nodeId: node.id, decision: 'unassigned', reason: '只有工具子标签，缺少已存在的父项目定义。', memberships: []}]});
  const first = await continueProjectMembership({...f, run, sourceIds: [node.id]});
  assert.equal(first.awaitingDefinition.length, 1);
  assert.equal(f.service.pending({nodeIds: [node.id]}).items.length, 0);
  assert.equal(f.service.pending({nodeIds: [node.id]}).awaitingDefinition.length, 1);
  const second = await continueProjectMembership({...f, run: async () => { throw Error('Should stay pending'); }, sourceIds: [node.id]});
  assert.equal(second.modelCalls, 0); assert.equal(second.awaitingDefinition.length, 1);
  assert.equal(f.service.pending({nodeIds: [node.id], force: true}).items.length, 1);
  f.store.edit({id: f.source.id, expectedHash: f.source.hash, body: f.source.body + '\n项目定义新增具体限定。'});
  assert.equal(f.service.pending({nodeIds: [node.id]}).items.length, 1);
});
test('cached actual result survives a failed commit and is reused only for identical input', async t => {
  const f = fixture(t), sourceIds = [f.selected[0].id], cacheDir = path.join(f.directory, 'model-results');
  let firstCommit = true, runs = 0;
  const api = async (route, input) => { if (route.endsWith('/commit') && firstCommit) { firstCommit = false; throw Error('Synthetic transient save error'); } return f.api(route, input); };
  const run = async input => { runs++; return f.run(input); };
  await assert.rejects(() => continueProjectMembership({...f, api, run, sourceIds, cacheDir}), /transient save/);
  const retry = await continueProjectMembership({...f, api, run, sourceIds, cacheDir});
  assert.equal(runs, 1); assert.equal(retry.cacheReused, 1); assert.equal(retry.saved.length, 1);
});
test('capacity, pause and false save acknowledgements never become saved results', async t => {
  const f = fixture(t), sourceIds = [f.selected[0].id];
  await assert.rejects(() => continueProjectMembership({...f, sourceIds, run: async () => { throw Error('Selected model is at capacity'); }}), /capacity/);
  assert.equal(f.store.find(sourceIds[0]).classification, null);
  await assert.rejects(() => continueProjectMembership({...f, sourceIds, gate: async () => { throw Error('USER_TASKS_PAUSED'); }}), /PAUSED/);
  const api = async (route, input) => route.endsWith('/commit') ? {verified: true, bodiesChanged: false, saved: sourceIds} : f.api(route, input);
  await assert.rejects(() => continueProjectMembership({...f, api, sourceIds}), /did not survive readback/);
});
test('every distinct quote from the same large source retains its own window; overlapping windows merge', t => {
  const f = fixture(t), quote2 = '另一处机制要求验证不同节点之间的输入输出接口。', quote3 = '最终独立检查节点替换后模型调用链的兼容情况。';
  const body = 'x'.repeat(12000) + mechanism + 'x'.repeat(12000) + quote2 + ' nearby ' + quote3 + 'x'.repeat(12000);
  const source = f.store.import({name: '长来源', body}).node;
  const node = f.store.upsert({id: 'k-multiple', kind: 'knowledge', title: '多个原文依据', body: '# 引用\n' + mechanism, sources: [mechanism, quote2, quote3].map(quote => ({id: source.id, quote, sourceHash: source.hash}))});
  const prepared = f.service.prepare({nodeIds: [node.id]});
  const windows = prepared.input.documents.filter(document => document.role === 'source' && document.nodeId === source.id);
  assert.equal(windows.length, 2);
  for (const quote of [mechanism, quote2, quote3]) assert(windows.some(window => window.text.includes(quote)));
});
test('oversized source without verified full ASTRA classification stays input-limited without invoking a model', async t => {
  const f = fixture(t), source = f.store.import({name: '超长未归纳内容', body: '正文'.repeat(110000)}).node;
  const prepared = f.service.prepare({nodeIds: [source.id]});
  assert.equal(prepared.scope.length, 0); assert.equal(prepared.inputLimited.length, 1);
  const report = await continueProjectMembership({...f, sourceIds: [source.id], run: async () => { throw Error('No reread'); }});
  assert.equal(report.modelCalls, 0); assert.equal(report.inputLimited.length, 1);
  assert.equal(f.service.pending({nodeIds: [source.id]}).items.length, 0);
});
test('verified long-source summary stays separate from literal evidence windows and never claims full reread', t => {
  const f = fixture(t), source = f.store.import({name: '超长已归纳内容', body: '正文'.repeat(60000) + mechanism + '正文'.repeat(60000) + goal}).node;
  const proposed = {id: source.id, summary: '完整 ASTRA 保存摘要。', tags: [{name: '机制', reason: '主体机制', quote: mechanism}, {name: '目标', reason: '明确目标', quote: goal}], uncertainties: []};
  f.store.classify({id: source.id, expectedHash: source.classificationHash, sourceHash: source.hash, method: 'codex', ...proposed});
  const saved = f.store.find(source.id);
  fs.mkdirSync(f.classificationWork, {recursive: true});
  fs.writeFileSync(path.join(f.classificationWork, 'progress.json'), JSON.stringify({entries: {[source.id]: {hash: saved.hash, model: 'gpt-6-astra', status: 'saved-verified', classificationHash: hash(JSON.stringify(saved.classification))}}}));
  fs.writeFileSync(path.join(f.classificationWork, source.id + '.review.json'), JSON.stringify({sourceHash: saved.hash, model: 'gpt-6-astra', proposed}));
  const prepared = f.service.prepare({nodeIds: [source.id]});
  assert.equal(prepared.scope[0].completeBody, false);
  assert.equal(prepared.scope[0].savedSummary.notSourceEvidence, true);
  const documents = prepared.input.documents.filter(document => document.role === 'subject');
  assert(documents.every(document => !document.complete && document.text.length < 5100));
  assert(!documents.some(document => document.text.includes(proposed.summary)));
  assert(documents.some(document => document.text.includes(mechanism)) && documents.some(document => document.text.includes(goal)));
});
test('user-confirmed project registry adds a canonical candidate without writing membership or fabricating a source body', t => {
  const f = fixture(t), original = fs.readFileSync(path.join(f.store.root, f.selected[0].path));
  const definition = {id: 'named:comfyui', name: 'ComfyUI', definition: '用户确认节点替换和模型盘点是同一工具项目的独立子内容。', approvedByUser: true, sourceIds: [f.source.id], sourceHashes: {[f.source.id]: f.source.hash}};
  fs.writeFileSync(f.service.registryFile, JSON.stringify({version: 1, entries: [definition]}));
  const prepared = f.service.prepare({nodeIds: [f.selected[0].id]});
  const candidate = prepared.input.projects.find(project => project.id === 'named:comfyui');
  assert(candidate);
  const document = prepared.input.documents.find(document => candidate.documentIds.includes(document.id) && document.role === 'project-definition');
  assert.equal(document.text, definition.definition); assert(document.userApprovedDefinition && document.notSourceBody); assert(document.registryHash);
  assert.equal(f.store.find(f.selected[0].id).classification, null);
  assert.deepEqual(fs.readFileSync(path.join(f.store.root, f.selected[0].path)), original);
});
test('registry definition changes invalidate in-flight proposals and duplicate project names require existing IDs', t => {
  const f = fixture(t);
  const definition = {id: 'named:comfyui', name: 'ComfyUI', definition: '明确既有工具的节点替换与模型盘点工作范围。', approvedByUser: true, sourceIds: [f.source.id], sourceHashes: {[f.source.id]: f.source.hash}};
  fs.writeFileSync(f.service.registryFile, JSON.stringify({version: 1, entries: [definition]}));
  const prepared = f.service.prepare({nodeIds: [f.selected[0].id]});
  fs.writeFileSync(f.service.registryFile, JSON.stringify({version: 1, entries: [{...definition, definition: definition.definition + ' 新增边界。'}]}));
  assert.throws(() => f.service.preview({id: prepared.id, result: {model: 'gpt-6-astra', items: []}}), /定义已变化/);
  fs.writeFileSync(f.service.registryFile, JSON.stringify({version: 1, entries: [{...definition, id: 'wrong-duplicate', name: '已有游戏'}]}));
  assert.throws(() => f.service.catalog(), /复用其身份/);
  fs.writeFileSync(f.service.registryFile, JSON.stringify({version: 1, entries: [{...definition, sourceHashes: {[f.source.id]: 'wrong'}}]}));
  assert.throws(() => f.service.catalog(), /来源缺失或已变化/);
});

test('SOL project membership uses the same executor owner and independent live-store readback without another server', async t => {
  const {createInProcessProjectMembershipApi, projectMembershipSchema} = await import('../scripts/project-membership-continuation.mjs');
  const {classificationLockPath} = await import('../src/classification-lock.mjs');
  const f = fixture(t), ownerToken = 'isolated-sol-project-owner';
  const lock = classificationLockPath(f.store.root);fs.mkdirSync(path.dirname(lock), {recursive:true});
  fs.writeFileSync(lock, JSON.stringify({pid:process.pid,ownerToken,model:'gpt-6-astra',classificationModel:'gpt-6.1-sol'}));
  const sourceBytes=fs.readFileSync(path.join(f.store.root,f.source.path));
  const subjectBytes=fs.readFileSync(path.join(f.store.root,f.selected[0].path));
  const api=createInProcessProjectMembershipApi({root:f.store.root,ownerToken,model:'gpt-6.1-sol',gate:f.gate,api:f.api,classificationWork:f.classificationWork});
  let runs=0;const run=async input=>{runs++;assert.match(input.instructions,/gpt-6.1-sol/);return {...await f.run(input),model:'gpt-6.1-sol'};};
  const report=await continueProjectMembership({api,ownerToken,model:'gpt-6.1-sol',gate:f.gate,run,sourceIds:[f.selected[0].id]});
  assert.equal(runs,1);assert.equal(report.saved.length,1);
  const saved=f.store.find(f.selected[0].id);assert.equal(saved.classification.projectMembershipAnalysis.model,'gpt-6.1-sol');
  assert.deepEqual(fs.readFileSync(path.join(f.store.root,f.source.path)),sourceBytes);
  assert.deepEqual(fs.readFileSync(path.join(f.store.root,f.selected[0].path)),subjectBytes);
  assert.deepEqual(projectMembershipSchema('gpt-6.1-sol').properties.model.enum,['gpt-6.1-sol']);
  const again=await continueProjectMembership({api,ownerToken,model:'gpt-6.1-sol',gate:f.gate,run:async()=>assert.fail('no repeat model'),sourceIds:[saved.id]});
  assert.equal(again.skipped.length,1);
  const current=f.store.find(saved.id);assignProjects(f.store,{nodes:[{id:current.id,hash:current.hash,classificationHash:current.classificationHash}],projects:[]});
  const manual=await continueProjectMembership({api,ownerToken,model:'gpt-6.1-sol',gate:f.gate,run:async()=>assert.fail('manual unassignment protected'),sourceIds:[saved.id]});
  assert.equal(manual.protected.length,1);
});

test('SOL continuation preserves verified ASTRA project results and their original model attribution', async t => {
  const {createInProcessProjectMembershipApi}=await import('../scripts/project-membership-continuation.mjs');
  const {classificationLockPath}=await import('../src/classification-lock.mjs');
  const f=fixture(t),ownerToken='isolated-preserved-astra-owner';
  await continueProjectMembership({...f,ownerToken,sourceIds:[f.selected[0].id]});
  const before=fs.readFileSync(path.join(f.store.meta,'classifications.md'),'utf8');
  const lock=classificationLockPath(f.store.root);fs.mkdirSync(path.dirname(lock),{recursive:true});fs.writeFileSync(lock,JSON.stringify({pid:process.pid,ownerToken,model:'gpt-6-astra'}));
  const api=createInProcessProjectMembershipApi({root:f.store.root,ownerToken,model:'gpt-6.1-sol',gate:f.gate,api:f.api});
  const report=await continueProjectMembership({api,ownerToken,model:'gpt-6.1-sol',gate:f.gate,run:async()=>assert.fail('verified ASTRA must skip'),sourceIds:[f.selected[0].id]});
  assert.equal(report.skipped.length,1);assert.equal(f.store.find(f.selected[0].id).classification.projectMembershipAnalysis.model,'gpt-6-astra');
  assert.equal(fs.readFileSync(path.join(f.store.meta,'classifications.md'),'utf8'),before);
});

test('in-process SOL writes stop on pause or lost owner and reject falsely labelled model results', async t => {
  const {createInProcessProjectMembershipApi}=await import('../scripts/project-membership-continuation.mjs');
  const {classificationLockPath}=await import('../src/classification-lock.mjs');
  const f=fixture(t),ownerToken='isolated-guarded-sol-owner';const lock=classificationLockPath(f.store.root);fs.mkdirSync(path.dirname(lock),{recursive:true});fs.writeFileSync(lock,JSON.stringify({pid:process.pid,ownerToken,model:'gpt-6-astra'}));
  let paused=false;const gate=async()=>{if(paused)throw Error('USER_TASKS_PAUSED');};
  const api=createInProcessProjectMembershipApi({root:f.store.root,ownerToken,model:'gpt-6.1-sol',gate,api:f.api});
  const options={api,ownerToken,model:'gpt-6.1-sol',gate,run:f.run,sourceIds:[f.selected[0].id]};
  await assert.rejects(()=>continueProjectMembership(options),/configured.*result/);
  paused=true;await assert.rejects(()=>api('workspace/project-analysis/prepare',{nodeIds:[f.selected[0].id]}),/PAUSED/);
  paused=false;fs.writeFileSync(lock,JSON.stringify({pid:process.pid,ownerToken:'other-owner',model:'gpt-6-astra'}));
  await assert.rejects(()=>api('workspace/project-analysis/prepare',{nodeIds:[f.selected[0].id]}),/live original executor owner/);
  assert.equal(f.store.find(f.selected[0].id).classification,null);
});
