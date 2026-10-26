import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough, Writable} from 'node:stream';
import {createModelRunner} from '../src/analysis-model.mjs';

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'venus-model-lifecycle-test-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({write(_chunk, _encoding, done) { done(); }});
  let kills = 0;
  child.kill = () => { kills++; return true; };
  let spawned;
  const created = new Promise(resolve => { spawned = resolve; });
  const run = createModelRunner(directory, {
    model: 'fixture-no-real-model', timeoutMs: 1000,
    resolveExecutable: async () => 'fixture-no-real-executable',
    spawnImpl: () => { spawned(); return child; }, ...options,
  });
  const begin = async signal => {
    let settled = false;
    const promise = run({source: {text: 'isolated synthetic input'}}, {signal});
    promise.then(() => { settled = true; }, () => { settled = true; });
    await created;
    await Promise.resolve();
    return {promise, settled: () => settled};
  };
  return {child, begin, kills: () => kills};
}

const turn = () => new Promise(resolve => setImmediate(resolve));

test('timeout requests termination but rejects only after child close confirms exit', async t => {
  const f = fixture(t, {timeoutMs: 10});
  const pending = await f.begin();
  f.child.emit('spawn');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(f.kills(), 1);
  assert.equal(pending.settled(), false, 'caller must retain its executor lock while child remains open');
  f.child.emit('close', null);
  await assert.rejects(pending.promise, /模型调用超过 12 分钟/);
});

test('normal completion returns the model result without requesting termination', async t => {
  const f = fixture(t);
  const pending = await f.begin();
  f.child.emit('spawn');
  f.child.stdout.write(JSON.stringify({type: 'item.completed', item: {type: 'agent_message', text: '{"fixture":true}'}}) + '\n');
  f.child.emit('close', 0);
  assert.deepEqual(await pending.promise, {fixture: true});
  assert.equal(f.kills(), 0);
});

test('pause abort waits for child close before reporting cancellation', async t => {
  const f = fixture(t);
  const controller = new AbortController();
  const pending = await f.begin(controller.signal);
  f.child.emit('spawn');
  controller.abort();
  await turn();
  assert.equal(f.kills(), 1);
  assert.equal(pending.settled(), false);
  f.child.emit('close', null);
  await assert.rejects(pending.promise, /ANALYSIS_CANCELLED/);
});

test('a confirmed spawn failure may reject without waiting for a nonexistent child', async t => {
  const f = fixture(t);
  const pending = await f.begin();
  f.child.emit('error', Error('synthetic ENOENT before spawn'));
  await assert.rejects(pending.promise, /synthetic ENOENT before spawn/);
  assert.equal(f.kills(), 0);
});

test('an error after spawn cannot abandon a running model before close', async t => {
  const f = fixture(t);
  const pending = await f.begin();
  f.child.emit('spawn');
  f.child.emit('error', Error('synthetic running child error'));
  await turn();
  assert.equal(f.kills(), 1);
  assert.equal(pending.settled(), false);
  f.child.emit('close', 1);
  await assert.rejects(pending.promise, /synthetic running child error/);
});

test('a child with a PID is treated as started before its spawn event arrives', async t => {
  const f = fixture(t);
  f.child.pid = 12345;
  const pending = await f.begin();
  f.child.emit('error', Error('synthetic error before spawn event'));
  await turn();
  assert.equal(f.kills(), 1);
  assert.equal(pending.settled(), false);
  f.child.emit('close', 1);
  await assert.rejects(pending.promise, /synthetic error before spawn event/);
});

test('failed termination still retains ownership until a later close receipt', async t => {
  const f = fixture(t, {timeoutMs: 10});
  f.child.kill = () => { throw Error('synthetic kill failure'); };
  const pending = await f.begin();
  f.child.emit('spawn');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(pending.settled(), false);
  f.child.emit('close', 0);
  await assert.rejects(pending.promise, /模型调用超过 12 分钟/);
});

test('metadata callback failure after model close retains the valid return and records the fault',async t=>{const f=fixture(t,{onWorkerState:s=>{if(s.active===false)throw Error('synthetic metadata write failure');}});const pending=await f.begin();f.child.emit('spawn');f.child.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"preserved":true}'}})+'\n');f.child.emit('close',0);assert.deepEqual(await pending.promise,{preserved:true});});
test('failed spawn clears a previously written starting lease',async t=>{const states=[];const f=fixture(t,{onWorkerState:s=>states.push(s)});const pending=await f.begin();f.child.emit('error',Error('synthetic spawn rejection'));await assert.rejects(pending.promise,/spawn rejection/);assert.equal(states.at(-1).active,false);});
