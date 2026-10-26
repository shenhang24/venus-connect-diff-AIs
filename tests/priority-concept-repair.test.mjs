import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {repairPriorityConcepts, validateRepairPlan} from '../scripts/priority-concept-repair.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const keyOf = value => `${value.sourceId}:${value.start}:${value.end}`;
const makePlan = () => ({
  version: 1, model: 'gpt-6-astra', reasoningEffort: 'low',
  segments: Array.from({length: 5}, (_, index) => ({
    sourceId: `isolated-source-${index}`, sourceHash: hash(`source-${index}`),
    start: index * 40000, end: (index + 1) * 40000,
  })),
});

function fixture(t, plan = makePlan()) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'venus-priority-repair-test-'));
  t.after(() => fs.rmSync(work, {recursive: true, force: true}));
  const file = path.join(work, 'priority-concept-repair.json');
  fs.writeFileSync(file, JSON.stringify(plan));
  const events = [];
  const saved = new Map();
  let activeModels = 0;
  const ownerToken = 'isolated-test-owner';
  const api = async (route, input) => {
    if (route === 'ready') { events.push('ready'); return {conceptRepairVersion: 1}; }
    assert.equal(input.ownerToken, ownerToken);
    const key = keyOf(input);
    events.push(`${route}:${key}`);
    const segment = plan.segments.find(item => keyOf(item) === key);
    assert.ok(segment, 'only explicitly selected ranges may be dispatched');
    assert.equal(input.sourceHash, segment.sourceHash);
    if (route === 'concepts/repair/prepare') {
      if (saved.has(key)) return {alreadyComplete: true, receipt: saved.get(key)};
      return {requestHash: hash(key), payload: {key, analysisTemplates: {concept: '# Isolated template'}}};
    }
    assert.equal(route, 'concepts/repair/commit');
    assert.equal(input.model, 'gpt-6-astra');
    assert.equal(input.requestHash, hash(key));
    assert.deepEqual(input.result, {concepts: [key], analysisTemplates: {concept: '# Isolated template'}});
    const receipt = {status: 'saved-verified', model: 'gpt-6-astra', sourceId: segment.sourceId, sourceHash: segment.sourceHash, start: segment.start, end: segment.end};
    saved.set(key, receipt);
    return {receipt};
  };
  const run = async payload => {
    activeModels++;
    assert.equal(activeModels, 1, 'priority repair must be serial');
    events.push(`model:${payload.key}`);
    await Promise.resolve();
    activeModels--;
    return {concepts: [payload.key]};
  };
  const gate = async () => { events.push('gate'); };
  const execute = overrides => repairPriorityConcepts({work, ownerToken, api, run, gate, ...overrides});
  return {work, file, plan, events, saved, api, run, execute};
}

test('exactly the five priority segments save serially before classification can begin', async t => {
  const f = fixture(t);
  const current = [];
  const result = await f.execute({onCurrent: value => current.push(value)});
  f.events.push('classification');
  assert.deepEqual(result, {required: true, verified: 5});
  assert.deepEqual(f.events.filter(event => event.startsWith('model:')), f.plan.segments.map(segment => `model:${keyOf(segment)}`));
  for (let index = 0; index < 5; index++) {
    const key = keyOf(f.plan.segments[index]);
    const commitAt = f.events.indexOf(`concepts/repair/commit:${key}`);
    const recheckAt = f.events.lastIndexOf(`concepts/repair/prepare:${key}`);
    assert.ok(recheckAt > commitAt);
    const nextAt = index === 4 ? f.events.indexOf('classification') : f.events.indexOf(`model:${keyOf(f.plan.segments[index + 1])}`);
    assert.ok(nextAt > recheckAt, 'next work waits for verified persistence');
    assert.equal(current[index].stage, 'priority-concept-repair');
    assert.equal(current[index].id, f.plan.segments[index].sourceId);
  }
  const disk = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  assert.equal(disk.status, 'saved-verified');
  assert.equal(disk.receipts.length, 5);
  assert.ok(disk.receipts.every(receipt => receipt.status === 'saved-verified'));
});

test('resume rechecks all persisted receipts against the backend and skips saved model work', async t => {
  const f = fixture(t);
  await f.execute();
  f.events.length = 0;
  const result = await f.execute({run: async () => { assert.fail('verified content must not be regenerated'); }});
  assert.deepEqual(result, {required: true, verified: 5});
  assert.equal(f.events.filter(event => event.startsWith('concepts/repair/prepare:')).length, 10);
  assert.equal(f.events.filter(event => event.startsWith('concepts/repair/commit:')).length, 0);
});

test('local saved status alone cannot skip a segment the backend cannot verify', async t => {
  const plan = makePlan();
  plan.status = 'saved-verified';
  plan.receipts = plan.segments.map(segment => ({...segment, status: 'saved-verified'}));
  const f = fixture(t, plan);
  await f.execute();
  assert.equal(f.events.filter(event => event.startsWith('model:')).length, 5);
});

test('a failed segment blocks later segments and the full-library continuation', async t => {
  const f = fixture(t);
  let classifierCalled = false;
  const failedKey = keyOf(f.plan.segments[1]);
  await assert.rejects(async () => {
    await f.execute({run: async payload => {
      if (payload.key === failedKey) throw Error('Selected model is at capacity');
      return f.run(payload);
    }});
    classifierCalled = true;
  }, /at capacity/);
  assert.equal(classifierCalled, false);
  assert.equal(f.saved.size, 1);
  assert.ok(!f.events.includes(`concepts/repair/prepare:${keyOf(f.plan.segments[2])}`));
  const disk = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  assert.equal(disk.receipts.length, 1);
  assert.equal(disk.status, 'repairing');
});

test('missing backend support or unavailable backend blocks before any model call', async t => {
  for (const unavailable of [false, true]) {
    const f = fixture(t);
    let modelCalls = 0;
    let calls = 0;
    await assert.rejects(f.execute({
      api: async route => {
        calls++;
        assert.equal(route, 'ready');
        if (unavailable) throw Error('backend offline');
        return {};
      },
      run: async () => { modelCalls++; },
    }), unavailable ? /backend offline/ : /CONCEPT_REPAIR_BACKEND_RELOAD_REQUIRED/);
    assert.equal(modelCalls, 0);
    assert.equal(calls, 1);
  }
});

test('generated result survives a commit error and is reused after resume', async t => {
  const f = fixture(t);
  const first = keyOf(f.plan.segments[0]);
  await assert.rejects(f.execute({api: async (route, input) => {
    if (route === 'concepts/repair/commit') throw Error('isolated commit write failure');
    return f.api(route, input);
  }}), /commit write failure/);
  assert.equal(f.saved.size, 0);
  const artifact = path.join(f.work, `concept-repair-${hash(first)}.json`);
  const cached = JSON.parse(fs.readFileSync(artifact, 'utf8'));
  assert.equal(cached.model, 'gpt-6-astra');
  assert.equal(cached.requestHash, hash(first));
  assert.deepEqual(cached.result.concepts, [first]);
  f.events.length = 0;
  await f.execute();
  assert.equal(f.saved.size, 5);
  assert.ok(!f.events.includes(`model:${first}`));
  assert.equal(f.events.filter(event => event.startsWith('model:')).length, 4);
});

test('successful HTTP commit without a verified receipt cannot allow later work', async t => {
  const f = fixture(t);
  await assert.rejects(f.execute({api: async (route, input) => {
    if (route === 'concepts/repair/commit') return {ok: true};
    return f.api(route, input);
  }}), /missing verified disk receipt/);
  assert.ok(!f.events.includes(`concepts/repair/prepare:${keyOf(f.plan.segments[1])}`));
});

test('a claimed saved receipt must pass backend revalidation before advancing', async t => {
  const f = fixture(t);
  await assert.rejects(f.execute({api: async (route, input) => {
    if (route === 'concepts/repair/commit') return {receipt: {status: 'saved-verified', model: 'gpt-6-astra', ...f.plan.segments[0]}};
    return f.api(route, input);
  }}), /could not be reverified/);
  assert.ok(!f.events.includes(`concepts/repair/prepare:${keyOf(f.plan.segments[1])}`));
});

test('a receipt for another source, range or model cannot release priority work', async t => {
  for (const wrong of [{sourceId:'other'}, {sourceHash:'a'.repeat(64)}, {end:1}, {model:'gpt-6.1-sol'}]) {
    const f=fixture(t);
    await assert.rejects(f.execute({api:async(route,input)=>route==='concepts/repair/commit'?{receipt:{status:'saved-verified',model:'gpt-6-astra',...f.plan.segments[0],...wrong}}:f.api(route,input)}),/missing verified disk receipt/);
    assert.equal(f.saved.size,0);
  }
});

test('pause before dispatch prevents model work and prevents commits', async t => {
  const first = fixture(t);
  await assert.rejects(first.execute({gate: async () => { throw Error('USER_TASKS_PAUSED'); }}), /USER_TASKS_PAUSED/);
  assert.equal(first.events.filter(event => event.startsWith('model:')).length, 0);
  const second = fixture(t);
  let gateCalls = 0;
  await assert.rejects(second.execute({gate: async () => {
    if (++gateCalls === 2) throw Error('USER_TASKS_PAUSED');
  }}), /USER_TASKS_PAUSED/);
  assert.equal(second.saved.size, 0);
  assert.equal(second.events.filter(event => event.startsWith('model:')).length, 1);
});

test('malformed or duplicate plans fail before contacting the backend', async t => {
  const changes = [
    plan => { plan.version = 2; },
    plan => { plan.model = 'gpt-6.1-sol'; },
    plan => { plan.reasoningEffort = 'high'; },
    plan => { plan.segments.pop(); },
    plan => { plan.segments[4] = {...plan.segments[0]}; },
    plan => { plan.segments[0].sourceHash = 'invalid'; },
    plan => { plan.segments[0].sourceId = ''; },
    plan => { plan.segments[0].start = -1; },
    plan => { plan.segments[0].start = 0.5; },
    plan => { plan.segments[0].end = 0; },
    plan => { plan.segments[0].end = 40001; },
  ];
  for (const change of changes) {
    const plan = makePlan();
    change(plan);
    assert.throws(() => validateRepairPlan(plan));
    const f = fixture(t, plan);
    await assert.rejects(f.execute({api: async () => { assert.fail('invalid plan must never reach backend'); }}));
  }
});

test('no priority plan keeps the preexisting workflow available without network or model work', async t => {
  const f = fixture(t);
  fs.unlinkSync(f.file);
  assert.deepEqual(await f.execute({
    api: async () => assert.fail('no plan requires no backend request'),
    run: async () => assert.fail('no plan requires no model request'),
  }), {required: false});
});
