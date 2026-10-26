import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preflightConceptRepair, selectConceptRepairResult} from '../scripts/priority-concept-repair.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const body = '## user\n为什么分段保存？\n## assistant\n分段保存可以减少失败后重复处理的范围。\n## user\n我同意这个解释。\n## assistant\n是否需要我接着运行？\n新的结论是所有任务都应该并发。';
const source = {id: 'isolated-source', hash: hash(body), body};
const payload = {purpose: 'concept-only', historicalRecognition: false, source: {id: source.id, hash: source.hash, offset: 0, total: body.length, text: body}, knownConceptDiscussion: [], analysisTemplates: {concept: {hash: 'isolated-template'}}};
const validConcept = key => ({key, admission: {questionQuote: '为什么分段保存？', answerQuote: '分段保存可以减少失败后重复处理的范围。', userConfirmationQuote: '我同意这个解释。', conclusionQuote: '分段保存可以减少失败后重复处理的范围。', confirmationTarget: '减少失败后重复处理的范围', confirmationMeaning: 'answer-endorsement'}});
const validResult = () => ({concepts: [validConcept('candidate-1')], unresolvedQuestions: [], issues: []});
const badResult = () => ({concepts: [{...validConcept('candidate-1'), admission: {...validConcept('candidate-1').admission, questionQuote: '是否需要我接着运行？'}}], unresolvedQuestions: [{questionQuote: '是否需要我接着运行？', reason: '尚未回答'}], issues: []});

function fixture(t) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'venus-concept-correction-test-'));
  t.after(() => fs.rmSync(work, {recursive: true, force: true}));
  const prepared = {requestHash: hash('isolated-request'), payload};
  const cached = {model: 'gpt-6-astra', requestHash: prepared.requestHash, result: badResult()};
  const artifact = path.join(work, `concept-repair-${prepared.requestHash}.json`);
  fs.writeFileSync(artifact, JSON.stringify(cached));
  const originalBytes = fs.readFileSync(artifact, 'utf8');
  const inspect = async (selected, result) => ({...preflightConceptRepair(selected.payload, result, {source}), partialOutputs: [], ignored: []});
  const corrected = validResult();
  corrected.issues = ['[repair-candidate:1] rewritten: 原提问来自助手，现恢复同一讨论的真实用户问题。'];
  const execute = overrides => selectConceptRepairResult({work, prepared, cached, inspect, run: async () => structuredClone(corrected), gate: async () => {}, ...overrides});
  const audit = () => JSON.parse(fs.readFileSync(path.join(work, fs.readdirSync(work).find(name => name.includes('.correction-'))), 'utf8'));
  return {work, prepared, cached, artifact, originalBytes, inspect, corrected, execute, audit};
}

test('preflight rejects assistant questions and reports literal role and absolute positions', () => {
  const result = preflightConceptRepair(payload, badResult(), {source});
  assert.equal(result.issues.length, 2);
  assert.equal(result.issues[0].kind, 'concept-admission');
  assert.equal(result.issues[0].quotes.questionQuote.locations[0].speaker, 'assistant');
  assert.equal(result.issues[1].kind, 'unresolved-question');
  assert.equal(result.issues[1].locations[0].start, body.indexOf('是否需要我接着运行？'));
  assert.deepEqual(preflightConceptRepair(payload, validResult(), {source}).issues, []);
});

test('preflight preserves answer order and refuses endorsement of a later conclusion', () => {
  const result = validResult();
  result.concepts[0].admission.conclusionQuote = '新的结论是所有任务都应该并发。';
  assert.match(preflightConceptRepair(payload, result, {source}).issues[0].reason, /后续结论/);
  result.concepts[0].admission.questionQuote = '我同意这个解释。';
  assert.match(preflightConceptRepair(payload, result, {source}).issues[0].reason, /顺序/);
});

test('preflight requires actual matching source bytes, exact range and current known evidence', () => {
  assert.throws(() => preflightConceptRepair(payload, validResult(), {source: {...source, body: body + '!'}}), /SHA256/);
  assert.throws(() => preflightConceptRepair({...payload, source: {...payload.source, offset: 1}}, validResult(), {source}), /range/);
  assert.throws(() => preflightConceptRepair({...payload, knownConceptDiscussion: [{start: 0, end: 5, quote: 'stale'}]}, validResult(), {source}), /evidence/);
});

test('historical diagnostics include counterevidence provenance and a masked later conclusion together', () => {
  const text = '## user\n旧方案不对，请解释分段方案。\n## assistant\n分段保存减少重复范围。\n## user\n我同意这个解释。\n## assistant\n另外还应并发处理。';
  const actualSource = {id: 'diagnostic-source', body: text, hash: hash(text)};
  const actualPayload = {...payload, historicalRecognition: true, source: {id: actualSource.id, hash: actualSource.hash, offset: 0, total: text.length, text}};
  const result = {concepts: [{key: 'diagnostic-candidate', admission: {questionQuote: '请解释分段方案。', answerQuote: '分段保存减少重复范围。', userConfirmationQuote: '我同意这个解释。', conclusionQuote: '另外还应并发处理。', confirmationTarget: '减少重复范围', confirmationMeaning: 'answer-endorsement', counterEvidence: ['旧方案不对']}}], unresolvedQuestions: []};
  const review = preflightConceptRepair(actualPayload, result, {source: actualSource});
  assert.equal(review.diagnosticVersion, 2);
  assert.equal(review.issues.length, 1);
  const problem = review.issues[0];
  assert.match(problem.reason, /反对或撤回依据/);
  assert.equal(problem.counterEvidence[0].locations[0].speaker, 'user');
  assert.ok(problem.counterEvidence[0].selectedUserLocation.start < problem.quotes.answerQuote.locations[0].start);
  assert.ok(problem.quotes.answerQuote.locations[0].messageStart < problem.quotes.answerQuote.locations[0].start);
  assert.ok(problem.quotes.answerQuote.locations[0].messageEnd > problem.quotes.answerQuote.locations[0].end);
  assert.deepEqual(problem.independentIssues.map(issue => issue.field), ['counterEvidence', 'conclusionQuote']);
  result.concepts[0].admission.counterEvidence = ['分段保存减少重复范围。'];
  const wrongRole = preflightConceptRepair(actualPayload, result, {source: actualSource}).issues[0];
  assert.equal(wrongRole.counterEvidence[0].locations[0].speaker, 'assistant');
  assert.equal(wrongRole.counterEvidence[0].selectedUserLocation, null);
  assert.match(wrongRole.independentIssues[0].reason, /没有.*用户定位/);
});

test('valid results require no correction model and remain unchanged', async t => {
  const f = fixture(t), result = validResult();
  assert.equal(await f.execute({cached: {...f.cached, result}, run: async () => assert.fail('no correction needed')}), result);
  assert.equal(fs.readdirSync(f.work).filter(name => name.includes('.correction-')).length, 0);
});

test('one bounded correction keeps all original candidates and immutable original cache', async t => {
  const f = fixture(t);
  f.cached.result.concepts = Array.from({length: 4}, (_, index) => ({...f.cached.result.concepts[0], key: `candidate-${index + 1}`}));
  let calls = 0;
  const result = await f.execute({run: async input => {
    calls++;
    assert.equal(input.source.text, body);
    assert.deepEqual(input.repairCorrection.previousResult, f.cached.result);
    assert.equal(input.repairCorrection.previousResult.concepts.length, 4);
    assert.equal(input.repairCorrection.diagnostics.length, 5);
    return {concepts: Array.from({length: 4}, (_, index) => validConcept(`candidate-${index + 1}`)), unresolvedQuestions: [], issues: Array.from({length: 4}, (_, index) => `[repair-candidate:${index + 1}] rewritten: 使用同一讨论的真实用户原问题。`)};
  }});
  assert.equal(calls, 1);
  assert.equal(result.concepts.length, 4);
  assert.equal(fs.readFileSync(f.artifact, 'utf8'), f.originalBytes);
  assert.equal(f.audit().status, 'validated');
  assert.equal(f.audit().originalResult.concepts.length, 4);
  assert.deepEqual(await f.execute({run: async () => assert.fail('resume reuses corrected result')}), result);
});

test('model may mark a candidate not admitted but must record an explicit per-candidate reason', async t => {
  const f = fixture(t);
  const result = await f.execute({run: async () => ({concepts: [], unresolvedQuestions: [], issues: ['[repair-candidate:1] not-admitted: 原提问来自助手，不能确认同一用户问题及答案认可。']})});
  assert.equal(result.concepts.length, 0);
  assert.equal(f.audit().status, 'validated');
});

test('silent candidate loss and another invalid quote fail without replacing cache or retrying', async t => {
  for (const invalid of [{concepts: [], unresolvedQuestions: [], issues: []}, badResult()]) {
    const f = fixture(t);
    let calls = 0;
    await assert.rejects(f.execute({run: async () => { calls++; return structuredClone(invalid); }}), /CORRECTION_REJECTED/);
    assert.equal(f.audit().status, 'rejected');
    await assert.rejects(f.execute({run: async () => { calls++; return validResult(); }}), /BUDGET_EXHAUSTED/);
    assert.equal(calls, 1);
    assert.equal(fs.readFileSync(f.artifact, 'utf8'), f.originalBytes);
  }
});

test('model failure or interruption consumes the correction budget before dispatch', async t => {
  const f = fixture(t);
  let calls = 0;
  await assert.rejects(f.execute({run: async () => { calls++; assert.equal(f.audit().status, 'attempting'); throw Error('isolated capacity failure'); }}), /capacity failure/);
  assert.equal(f.audit().status, 'failed');
  await assert.rejects(f.execute({run: async () => { calls++; }}), /BUDGET_EXHAUSTED/);
  assert.equal(calls, 1);
});

test('existing partial outputs or ignored audits prevent changing a result', async t => {
  for (const saved of [{partialOutputs: [{id: 'saved'}], ignored: []}, {partialOutputs: [], ignored: [{key: 'ignored'}]}]) {
    const f = fixture(t);
    await assert.rejects(f.execute({inspect: async (...args) => ({...await f.inspect(...args), ...saved}), run: async () => assert.fail('must not correct after a partial save')}), /BLOCKED_PARTIAL_SAVE/);
    assert.equal(fs.readdirSync(f.work).filter(name => name.includes('.correction-')).length, 0);
  }
});

test('a validated corrected result can resume only its own partial-save transaction', async t => {
  for (const saved of [{partialOutputs: [{id: 'saved'}], ignored: []}, {partialOutputs: [], ignored: [{key: 'saved-audit'}]}]) {
    const f = fixture(t);
    const result = await f.execute();
    const resultHash = f.audit().correctedResultHash;
    const inspect = async (...args) => ({...await f.inspect(...args), ...saved, resultHash});
    assert.deepEqual(await f.execute({inspect, run: async () => assert.fail('only reuse the same returned correction')}), result);
    await assert.rejects(f.execute({inspect: async (...args) => ({...await inspect(...args), resultHash: hash('different')})}), /BLOCKED_PARTIAL_SAVE/);
  }
});

test('source or audit uncertainty blocks and a pause does not spend correction budget', async t => {
  const f = fixture(t);
  await assert.rejects(f.execute({inspect: async () => ({issues: []})}), /inspection/);
  await assert.rejects(f.execute({gate: async () => { throw Error('USER_TASKS_PAUSED'); }}), /USER_TASKS_PAUSED/);
  assert.equal(fs.readdirSync(f.work).filter(name => name.includes('.correction-')).length, 0);
});
function authorizeExtra(f) {
  const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  const priorFile = path.join(f.work, fs.readdirSync(f.work).find(name => name.includes('.correction-')));
  const prior = f.audit();
  const authorization = {version: 1, extraAttempts: 1, model: f.cached.model, requestHash: f.prepared.requestHash, sourceId: source.id, sourceHash: source.hash, start: 0, end: body.length, originalResultHash: prior.originalResultHash, rejectedResultHash: prior.correctedResultHash, templateHash: hash(canonical(payload.analysisTemplates || {})), originalArtifactHash: hash(fs.readFileSync(f.artifact)), correctionArtifactHash: hash(fs.readFileSync(priorFile))};
  fs.writeFileSync(path.join(f.work, 'fourth-extra-correction-authorization.json'), JSON.stringify(authorization));
  return {priorFile, priorBytes: fs.readFileSync(priorFile, 'utf8'), authorization};
}

test('explicit extra authorization dispatches once and preserves both prior artifacts; resume reuses its exact result', async t => {
  const f = fixture(t);
  await assert.rejects(f.execute({run: async () => badResult()}), /CORRECTION_REJECTED/);
  const auth = authorizeExtra(f);
  let calls = 0;
  const result = await f.execute({run: async input => {
    calls++;
    assert.equal(input.repairCorrection.attempt, 2);
    assert.deepEqual(input.repairCorrection.originalResult, f.cached.result);
    assert.deepEqual(input.repairCorrection.previousResult, f.audit().correctedResult);
    return structuredClone(f.corrected);
  }});
  const extraFile = path.join(f.work, fs.readdirSync(f.work).find(name => name.includes('.extra-')));
  const extra = JSON.parse(fs.readFileSync(extraFile));
  assert.equal(extra.status, 'validated');
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(f.artifact, 'utf8'), f.originalBytes);
  assert.equal(fs.readFileSync(auth.priorFile, 'utf8'), auth.priorBytes);
  const inspect = async (...args) => ({...await f.inspect(...args), partialOutputs: [{id: 'saved'}], resultHash: extra.correctedResultHash});
  assert.deepEqual(await f.execute({inspect, run: async () => assert.fail('no repeat')}), result);
  await assert.rejects(f.execute({inspect: async (...args) => ({...await inspect(...args), resultHash: hash('other')})}), /BLOCKED_PARTIAL_SAVE/);
});

test('extra authorization rejects another fingerprint, partial saves, pause, and retries after failure', async t => {
  for (const mode of ['fingerprint', 'partial', 'pause', 'failure', 'rejected', 'tamper']) {
    const f = fixture(t);
    await assert.rejects(f.execute({run: async () => badResult()}), /CORRECTION_REJECTED/);
    const auth = authorizeExtra(f);
    let calls = 0;
    if (mode === 'fingerprint') {
      auth.authorization.rejectedResultHash = hash('wrong');
      fs.writeFileSync(path.join(f.work, 'fourth-extra-correction-authorization.json'), JSON.stringify(auth.authorization));
    }
    if (mode === 'tamper') fs.appendFileSync(auth.priorFile, ' ');
    const overrides = {run: async () => {calls++; if (mode === 'failure') throw Error('synthetic failure'); return badResult();}};
    if (mode === 'partial') overrides.inspect = async (...args) => ({...await f.inspect(...args), ignored: [{key: 'saved'}]});
    if (mode === 'pause') overrides.gate = async () => {throw Error('USER_TASKS_PAUSED');};
    await assert.rejects(f.execute(overrides), /MISMATCH|BLOCKED_PARTIAL_SAVE|PAUSED|synthetic failure|EXTRA_REJECTED|ARTIFACT_CHANGED/);
    if (['failure', 'rejected'].includes(mode)) {
      await assert.rejects(f.execute({run: async () => {calls++;}}), /EXTRA_BUDGET_EXHAUSTED/);
      assert.equal(calls, 1);
    } else assert.equal(calls, 0);
    assert.equal(fs.readFileSync(f.artifact, 'utf8'), f.originalBytes);
  }
});

test('diagnostics explain a conclusion quote preceding the selected answer within the same assistant message', () => {
  const text = '## user\n为什么分段？\n## assistant\n结论是减少重复。\n分段保存能减少失败后重复处理的范围。\n## user\n我同意这个解释。';
  const actualSource = {id: 'ordered-source', body: text, hash: hash(text)};
  const actualPayload = {...payload, historicalRecognition: true, source: {id: actualSource.id, hash: actualSource.hash, offset: 0, total: text.length, text}};
  const result = {concepts: [{key: 'ordered-candidate', admission: {questionQuote: '为什么分段？', answerQuote: '分段保存能减少失败后重复处理的范围。', conclusionQuote: '结论是减少重复。', userConfirmationQuote: '我同意这个解释。', confirmationMeaning: 'answer-endorsement', confirmationTarget: '减少失败后重复处理的范围'}}], unresolvedQuestions: []};
  const review = preflightConceptRepair(actualPayload, result, {source: actualSource});
  assert.equal(review.issues.length, 1);
  const order = review.issues[0].independentIssues.find(x => x.field === 'conclusionQuote');
  assert.ok(order.conclusionStart < order.answerStart);
  assert.match(order.reason, /precedes/);
  assert.equal(review.issues[0].quotes.conclusionQuote.locations[0].messageStart, review.issues[0].quotes.answerQuote.locations[0].messageStart);
});

test('fifth authorization is independent of the retained fourth authorization and ambiguous grants cannot dispatch', async t => {
  const f = fixture(t);
  await assert.rejects(f.execute({run: async () => badResult()}), /CORRECTION_REJECTED/);
  const auth = authorizeExtra(f);
  const fourthFile = path.join(f.work, 'fourth-extra-correction-authorization.json');
  const fifthFile = path.join(f.work, 'fifth-extra-correction-authorization.json');
  const unrelatedFourth = {...auth.authorization, requestHash: hash('another-request')};
  fs.writeFileSync(fourthFile, JSON.stringify(unrelatedFourth));
  const fourthBytes = fs.readFileSync(fourthFile, 'utf8');
  fs.writeFileSync(fifthFile, JSON.stringify(auth.authorization));
  let calls = 0;
  const result = await f.execute({run: async () => {calls++; return structuredClone(f.corrected);}});
  assert.equal(calls, 1);
  assert.deepEqual(result.concepts, f.corrected.concepts);
  assert.equal(fs.readFileSync(fourthFile, 'utf8'), fourthBytes);
  assert.equal(fs.readFileSync(auth.priorFile, 'utf8'), auth.priorBytes);
  fs.writeFileSync(fourthFile, JSON.stringify(auth.authorization));
  await assert.rejects(f.execute({run: async () => assert.fail('ambiguous authorization')}), /AUTHORIZATION_AMBIGUOUS/);
});
