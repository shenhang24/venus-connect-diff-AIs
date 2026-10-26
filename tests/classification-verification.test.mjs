import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifySavedClassification} from '../scripts/classification-verification.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const node = {id: 'synthetic-source', path: 'Vault/synthetic.md', hash: hash('synthetic original'), body: 'Synthetic source explains the original claim and its limit.'};
  const proposed = {id: node.id, summary: 'The source explains a claim and a limit.', tags: [{name: 'Claim boundary', reason: 'The discussion distinguishes a claim from its limit.', quote: 'the original claim and its limit'}], uncertainties: ['Practice is not established.', 'No external verification was requested.']};
  const saved = {method: 'codex', sourceHash: node.hash, summary: proposed.summary + '\n\n待核实：' + proposed.uncertainties.join('；'), tags: structuredClone(proposed.tags)};
  const done = {hash: node.hash, model: 'gpt-6-astra', status: 'saved-verified', classificationHash: hash(JSON.stringify(saved))};
  const review = {sourceHash: node.hash, model: done.model, proposed};
  return {node, done, saved, review};
}

test('verified classification matches the current source, review, summary, tags and saved digest', () => {
  const input = fixture(), before = structuredClone(input);
  assert.deepEqual(verifySavedClassification(input), {status: 'saved-verified'});
  assert.deepEqual(input, before, 'verification must be pure');
});

test('changed source, model or completion status cannot count as complete', () => {
  for (const change of [
    input => { input.node.hash = hash('changed source'); },
    input => { input.done.model = 'gpt-6.1-sol'; },
    input => { input.done.status = 'running'; },
    input => { delete input.done; },
  ]) {
    const input = fixture(); change(input);
    assert.throws(() => verifySavedClassification(input), /source, model or status changed/);
  }
});

test('saved summary, uncertainty appendix or tag fields cannot drift after verification', () => {
  for (const change of [
    input => { input.saved.summary = 'Changed summary'; },
    input => { input.saved.summary = input.review.proposed.summary; },
    input => { input.saved.tags[0].name = 'Different theme'; },
    input => { input.saved.tags[0].reason = 'Changed reasoning'; },
    input => { input.saved.tags[0].quote = 'original claim'; },
    input => { input.saved.tags.push({...input.saved.tags[0]}); },
  ]) {
    const input = fixture(); change(input);
    assert.throws(() => verifySavedClassification(input), /Previously saved classification changed/);
  }
});

test('an exact saved digest detects changes outside summary and tags', () => {
  const input = fixture();
  input.saved.extraMetadata = 'changed after the original receipt';
  assert.throws(() => verifySavedClassification(input), /Previously saved classification changed/);
});

test('literal evidence is required even when saved result and receipt agree', () => {
  for (const quote of ['not present in the source', '', '   ']) {
    const input = fixture();
    input.review.proposed.tags[0].quote = quote;
    input.saved.tags = structuredClone(input.review.proposed.tags);
    input.done.classificationHash = hash(JSON.stringify(input.saved));
    assert.throws(() => verifySavedClassification(input), /Invalid literal tag evidence/);
  }
});

test('review evidence must match the source and ASTRA and identify the same item', () => {
  for (const change of [
    input => { input.saved.sourceHash = hash('other'); },
    input => { input.review.sourceHash = hash('other'); },
    input => { input.review.model = 'gpt-6.1-sol'; },
    input => { delete input.review; },
    input => { delete input.review.proposed; },
    input => { input.review.proposed.id = 'different-source'; },
  ]) {
    const input = fixture(); change(input);
    assert.throws(() => verifySavedClassification(input), /evidence unavailable|Invalid saved classification result/);
  }
});

test('manual classifications stay preserved once source and completion identity match', () => {
  for (const status of ['saved-verified', 'manual-preserved']) {
    const input = fixture();
    input.done.status = status;
    input.saved = {method: 'manual', summary: 'User-authored content remains authoritative.', tags: []};
    delete input.review;
    assert.deepEqual(verifySavedClassification(input), {status: 'manual-preserved'});
    input.node.hash = hash('changed raw source');
    assert.throws(() => verifySavedClassification(input), /source, model or status changed/);
  }
});

test('a formerly manual classification must not silently become an automated completion', () => {
  const input = fixture();
  input.done.status = 'manual-preserved';
  assert.throws(() => verifySavedClassification(input), /Previously preserved manual classification changed/);
});

test('older completion records without a saved digest remain valid only with full review evidence', () => {
  const input = fixture();
  delete input.done.classificationHash;
  assert.deepEqual(verifySavedClassification(input), {status: 'saved-verified'});
  delete input.review;
  assert.throws(() => verifySavedClassification(input), /evidence unavailable/);
});

test('empty tags and absent uncertainties can be valid, but empty summaries cannot', () => {
  const input = fixture();
  input.review.proposed.tags = [];
  delete input.review.proposed.uncertainties;
  input.saved.tags = [];
  input.saved.summary = input.review.proposed.summary;
  input.done.classificationHash = hash(JSON.stringify(input.saved));
  assert.deepEqual(verifySavedClassification(input), {status: 'saved-verified'});
  input.review.proposed.summary = '';
  assert.throws(() => verifySavedClassification(input), /Invalid saved classification result/);
});

test('explicit SOL continuation verifies SOL evidence while preserving prior ASTRA provenance', () => {
  const old = fixture(), original = structuredClone(old);
  assert.deepEqual(verifySavedClassification({...old, model: old.done.model}), {status: 'saved-verified'});
  assert.deepEqual(old, original);
  const sol = fixture(); sol.done.model = 'gpt-6.1-sol'; sol.review.model = 'gpt-6.1-sol';
  assert.deepEqual(verifySavedClassification({...sol, model: 'gpt-6.1-sol'}), {status: 'saved-verified'});
  sol.review.model = 'gpt-6-astra';
  assert.throws(() => verifySavedClassification({...sol, model: 'gpt-6.1-sol'}), /evidence unavailable/);
});
