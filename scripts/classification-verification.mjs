import {createHash} from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');

// Check the current source and saved bytes supplied by the caller. A progress
// marker alone never establishes that the classification is still intact.
export function verifySavedClassification({node, done, saved, review, model = 'gpt-6-astra'}) {
  const name = node?.path || node?.id || 'unknown source';
  const fail = reason => { throw Error(`${reason}: ${name}`); };
  if (!node || typeof node.hash !== 'string' || typeof node.body !== 'string' ||
      done?.hash !== node.hash || done.model !== model ||
      !['saved-verified', 'manual-preserved'].includes(done.status))
    fail('Completed classification source, model or status changed');

  if (saved?.method === 'manual') return {status: 'manual-preserved'};
  if (done.status === 'manual-preserved') fail('Previously preserved manual classification changed');

  const result = review?.proposed;
  if (!saved || saved.sourceHash !== node.hash || !result ||
      review.sourceHash !== node.hash || review.model !== model)
    fail('Saved classification evidence unavailable');
  if (result.id !== node.id || typeof result.summary !== 'string' || !result.summary.trim() ||
      !Array.isArray(result.tags) || result.tags.length > 16 ||
      result.uncertainties !== undefined && (!Array.isArray(result.uncertainties) || result.uncertainties.some(value => typeof value !== 'string')))
    fail('Invalid saved classification result');
  for (const tag of result.tags) {
    if (typeof tag?.name !== 'string' || !tag.name.trim() || tag.name.length > 40 ||
        typeof tag.reason !== 'string' || !tag.reason.trim() ||
        typeof tag.quote !== 'string' || !tag.quote.trim() || !node.body.includes(tag.quote))
      fail('Invalid literal tag evidence');
  }
  const summary = result.summary + (result.uncertainties?.length ? '\n\n待核实：' + result.uncertainties.join('；') : '');
  if (saved.summary !== summary || JSON.stringify(saved.tags) !== JSON.stringify(result.tags) ||
      done.classificationHash && done.classificationHash !== hash(JSON.stringify(saved)))
    fail('Previously saved classification changed');
  return {status: 'saved-verified'};
}
