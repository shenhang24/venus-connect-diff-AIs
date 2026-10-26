import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {classificationExecutorOwned} from '../src/classification-lock.mjs';
import {SemanticProjectMemberships, SEMANTIC_PROJECT_INSTRUCTIONS} from '../src/semantic-project-membership.mjs';

const MODEL = 'gpt-6-astra';
const string = {type: 'string'};
const object = properties => ({type: 'object', additionalProperties: false, required: Object.keys(properties), properties});
const quote = object({documentId: string, quote: string});
export const PROJECT_MEMBERSHIP_SCHEMA = object({model: {type: 'string', enum: [MODEL]}, items: {type: 'array', items: object({
  nodeId: string, decision: {type: 'string', enum: ['assigned', 'unassigned']}, reason: string,
  memberships: {type: 'array', items: object({projectId: string, reason: string, grounds: {type: 'array', items: object({
    kind: {type: 'string', enum: ['mechanism', 'goal', 'artifact', 'context']}, subject: quote, project: quote, explanation: string,
  })}})},
})}});
export function projectMembershipSchema(model = MODEL) {
  if (!['gpt-6-astra', 'gpt-6.1-sol'].includes(model)) throw Error('Unsupported project membership model');
  return {...PROJECT_MEMBERSHIP_SCHEMA, properties: {...PROJECT_MEMBERSHIP_SCHEMA.properties, model: {type: 'string', enum: [model]}}};
}
export const PROJECT_MEMBERSHIP_INSTRUCTIONS = SEMANTIC_PROJECT_INSTRUCTIONS;
const digest = text => createHash('sha256').update(text).digest('hex');
function save(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const text = JSON.stringify(value, null, 2), temporary = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temporary, text); fs.renameSync(temporary, file);
  if (fs.readFileSync(file, 'utf8') !== text) throw Error('Project membership model cache readback mismatch');
}

/** Called by the existing classifier while it holds its existing owner lock. No runner or queue is created. */
export async function continueProjectMembership({api, run, gate, sourceIds, ownerToken, onCurrent = () => {}, cacheDir, force = false, model = MODEL}) {
  const MODEL = model;
  if (!['gpt-6-astra', 'gpt-6.1-sol'].includes(MODEL)) throw Error('Unsupported project membership model');
  if (!Array.isArray(sourceIds) || sourceIds.some(id => typeof id !== 'string' || !id) || new Set(sourceIds).size !== sourceIds.length) throw Error('Project membership continuation needs an explicit unique source scope');
  if (typeof api !== 'function' || typeof run !== 'function' || typeof gate !== 'function') throw Error('Project membership continuation requires the existing API, configured runner and task gate');
  const report = {model: MODEL, requested: sourceIds.length, modelCalls: 0, cacheReused: 0, saved: [], skipped: [], protected: [], awaitingDefinition: [], inputLimited: [], receipts: [], verifiedNodes: []};
  const addUnique = (key, rows) => { for (const row of rows || []) { const value = typeof row === 'string' ? {id: row} : row; if (!report[key].some(old => old.id === value.id)) report[key].push(value); } };
  async function batch(nodeIds) {
    await onCurrent({stage: 'project-membership', ids: nodeIds});
    await gate();
    let prepared;
    try { prepared = await api('workspace/project-analysis/prepare', {nodeIds, force}); }
    catch (error) {
      if (nodeIds.length > 1 && /正文与项目上下文过长/.test(error.message)) {
        const middle = Math.ceil(nodeIds.length / 2);
        await batch(nodeIds.slice(0, middle)); await batch(nodeIds.slice(middle)); return;
      }
      throw error;
    }
    if (prepared?.model !== MODEL || !Array.isArray(prepared.scope) || !prepared.id || !prepared.input) throw Error('Invalid configured project membership preparation');
    addUnique('skipped', prepared.skipped); addUnique('protected', prepared.protected); addUnique('awaitingDefinition', prepared.awaitingDefinition); addUnique('inputLimited', prepared.inputLimited);
    if (!prepared.scope.length) return;
    const ids = prepared.scope.map(node => node.id);
    if (ids.some(id => !nodeIds.includes(id)) || new Set(ids).size !== ids.length) throw Error('Project membership preparation changed the selected scope');
    const payload = {purpose: 'semantic-project-membership', ...prepared.input};
    const inputHash = digest(JSON.stringify(payload));
    const artifact = cacheDir ? path.join(cacheDir, 'project-membership-' + inputHash + '.json') : null;
    let cached = artifact && fs.existsSync(artifact) ? JSON.parse(fs.readFileSync(artifact, 'utf8')) : null;
    if (cached) {
      if (cached.model !== MODEL || cached.inputHash !== inputHash || !cached.result) throw Error('Project membership cached result identity changed');
      report.cacheReused++;
    } else {
      await gate();
      const result = await run(payload);
      if (result?.model !== MODEL) throw Error('Project membership requires the configured model result; no model substitution');
      cached = {model: MODEL, inputHash, result, savedAt: new Date().toISOString()};
      if (artifact) save(artifact, cached);
      report.modelCalls++;
    }
    await gate();
    const preview = await api('workspace/project-analysis/preview', {id: prepared.id, result: cached.result});
    if (!preview.token || !Array.isArray(preview.changes) || preview.changes.length !== ids.length || preview.changes.some(change => !ids.includes(change.id))) throw Error('Project membership preview scope mismatch');
    await gate();
    const receipt = await api('workspace/project-analysis/commit', {token: preview.token, ownerToken});
    if (!receipt.verified || receipt.bodiesChanged !== false || !Array.isArray(receipt.saved) || receipt.saved.length !== ids.length || ids.some(id => !receipt.saved.includes(id))) throw Error('Project membership has no verified save receipt');
    // A successful HTTP response alone is insufficient. Re-prepare must observe saved state.
    const checked = await api('workspace/project-analysis/prepare', {nodeIds: ids});
    if (!Array.isArray(checked.scope) || checked.scope.length) throw Error('Saved project membership did not survive readback');
    const observed = new Set([...(checked.skipped || []), ...(checked.awaitingDefinition || [])].map(row => typeof row === 'string' ? row : row.id));
    if (ids.some(id => !observed.has(id))) throw Error('Saved project membership is no longer the verified project assignment');
    for (const id of ids) {
      const node = await api('node?id=' + encodeURIComponent(id));
      const selected = prepared.scope.find(value => value.id === id), analysis = node.classification?.projectMembershipAnalysis;
      if (node.hash !== selected.hash || analysis?.method !== 'semantic-project-content' || analysis.model !== MODEL || analysis.sourceHash !== node.hash) throw Error('Saved project membership source or model changed: ' + id);
      const actualHash = digest(JSON.stringify(node.classification));
      if (node.classificationHash && node.classificationHash !== actualHash) throw Error('Saved project membership metadata hash mismatch: ' + id);
      report.verifiedNodes.push({id, hash: node.hash, classificationHash: actualHash, decision: analysis.decision, reason: analysis.reason});
      report.saved.push(id);
    }
    addUnique('awaitingDefinition', checked.awaitingDefinition);
    report.receipts.push(receipt);
  }
  for (let index = 0; index < sourceIds.length; index += 6) await batch(sourceIds.slice(index, index + 6));
  return report;
}


// Same executor, same validators and transactional writer. This is an in-process
// adapter, not a server, analyzer, model runner or queue. The existing HTTP API
// remains the independent readback observer while its process stays unchanged.
export function createInProcessProjectMembershipApi({root, ownerToken, model, gate, api, classificationWork}) {
  if (!['gpt-6-astra', 'gpt-6.1-sol'].includes(model) || typeof gate !== 'function' || typeof api !== 'function') throw Error('Invalid in-process project membership configuration');
  let service;
  return async (route, input) => {
    if (!route.startsWith('workspace/project-analysis/')) return api(route, input);
    const operation = route.slice('workspace/project-analysis/'.length);
    if (!['prepare', 'preview', 'commit', 'rollback'].includes(operation)) throw Error('Invalid project membership operation');
    await gate();
    if (!classificationExecutorOwned(root, ownerToken)) throw Error('Project membership requires the live original executor owner');
    service ||= new SemanticProjectMemberships(new Store(root), {model, acceptedModels: ['gpt-6-astra', 'gpt-6.1-sol'], classificationWork, busy: ({ownerToken: selected} = {}) => selected !== ownerToken || !classificationExecutorOwned(root, ownerToken)});
    return service[operation](input);
  };
}
