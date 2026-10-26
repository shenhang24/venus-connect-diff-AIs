import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {conceptAdmission, collectConceptEvidence} from '../src/concept-admission.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const digest = value => hash(canonical(value));

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(file + '.tmp', file);
  if (JSON.stringify(read(file)) !== JSON.stringify(value)) throw Error('Priority repair checkpoint readback mismatch');
};

// Diagnostics use transcript headers, never the model's assertion of a role.
// The actual admission decision remains the existing shared pure validator.
function quoteLocations(quote, part, source, priorEvidence) {
  if (typeof quote !== 'string' || !quote.trim()) return [];
  const markdown = [...source.body.matchAll(/^#{1,6}\s+(user|assistant|human|用户|助手)\s*(?:·[^\n]*|[:：][^\n]*)?\r?$/gmi)];
  const headers = markdown.length ? markdown : [...source.body.matchAll(/^(user|assistant|human|用户|助手)\s*[:：]/gmi)];
  const messages = headers.map((match, index) => ({speaker: /^(user|human|用户)$/i.test(match[1]) ? 'user' : 'assistant', start: match.index + match[0].length, end: headers[index + 1]?.index ?? source.body.length}));
  const locations = [];
  for (let at = source.body.indexOf(quote); at >= 0 && locations.length < 8; at = source.body.indexOf(quote, at + 1)) {
    const end = at + quote.length;
    const inSegment = at >= part.start && end <= part.end;
    if (!inSegment && !priorEvidence.some(e => e.quote === quote && e.start === at && e.end === end)) continue;
    const message = messages.find(block => at >= block.start && end <= block.end);
    locations.push({start: at, end, speaker: message?.speaker ?? 'unknown-or-cross-message', messageStart: message?.start ?? null, messageEnd: message?.end ?? null, context: inSegment ? 'current-segment' : 'saved-read-evidence'});
  }
  return locations;
}

// Explain independent provenance failures together. These diagnostics neither
// replace the admission decision nor select substitute evidence for the model.
function admissionDiagnostics(item, part, context) {
  const a = item.admission || {}, {source, priorEvidence} = context;
  const evidence = collectConceptEvidence(item, part, context);
  const quotes = Object.fromEntries(['questionQuote', 'answerQuote', 'userConfirmationQuote', 'conclusionQuote'].map(key => [key, {quote: a[key] ?? '', locations: quoteLocations(a[key], part, source, priorEvidence)}]));
  const selected = (field, role) => {
    const e = evidence.find(value => value.quote === a[field] && value.speaker === role);
    return e && quotes[field].locations.find(value => value.start === e.start && value.end === e.end && value.speaker === role);
  };
  const answer = selected('answerQuote', 'assistant'), acknowledgement = selected('userConfirmationQuote', 'user');
  const conclusion = selected('conclusionQuote', 'user') || selected('conclusionQuote', 'assistant');
  const independentIssues = [];
  const question = selected('questionQuote', 'user');
  if (question && answer && question.start >= answer.start)
    independentIssues.push({field: 'questionQuote', reason: 'Question quote must precede the selected answer quote.', questionStart: question.start, answerStart: answer.start});
  if (answer && conclusion && conclusion.start < answer.start)
    independentIssues.push({field: 'conclusionQuote', reason: 'Conclusion quote precedes the selected answer quote, even if both are in the same message; preserve the existing admission ordering rule.', answerStart: answer.start, conclusionStart: conclusion.start});
  if (typeof a.confirmationTarget !== 'string' || !a.confirmationTarget.trim() || typeof a.answerQuote !== 'string' || !a.answerQuote.includes(a.confirmationTarget))
    independentIssues.push({field: 'confirmationTarget', reason: 'Confirmation target must be a literal substring of the selected answer quote.'});
  const counterEvidence = (Array.isArray(a.counterEvidence) ? a.counterEvidence : []).map((quote, index) => {
    const locations = quoteLocations(quote, part, source, priorEvidence);
    const actual = collectConceptEvidence({admission: {questionQuote: quote}}, part, context)[0];
    if (context.historical) {
      if (!actual) independentIssues.push({field: 'counterEvidence', index, reason: '反对引文没有已读原文中的用户定位；助手表述或未定位文本不能作为用户反对。'});
      else if (answer && actual.start < answer.start) independentIssues.push({field: 'counterEvidence', index, reason: '反对引文早于本次回答；不能把对先前方案的反对当作对当前回答的反对。', counterStart: actual.start, answerStart: answer.start});
      else independentIssues.push({field: 'counterEvidence', index, reason: '存在回答后的用户反对依据，不能作为已认可概念准入；应保留差异和未准入说明。'});
    }
    return {quote, locations, selectedUserLocation: actual || null};
  });
  if (answer && conclusion && conclusion.messageStart !== answer.messageStart && conclusion.messageStart !== acknowledgement?.messageStart)
    independentIssues.push({field: 'conclusionQuote', reason: '结论必须位于原回答或该用户认可的同一条发言内；之后助手新增的总结不能继承之前的认可。', answerMessageStart: answer.messageStart, acknowledgementMessageStart: acknowledgement?.messageStart ?? null, conclusionMessageStart: conclusion.messageStart});
  return {evidence, quotes, counterEvidence, independentIssues};
}

export function preflightConceptRepair(payload, result, {source} = {}) {
  const selected = payload?.source;
  if (!source || typeof source.body !== 'string' || !selected || source.id !== selected.id || source.hash !== selected.hash || hash(source.body) !== selected.hash)
    throw Error('Concept repair preflight requires the current literal source and matching SHA256');
  const start = selected.offset, end = start + (selected.text?.length ?? 0);
  if (!Number.isInteger(start) || start < 0 || !selected.text || end > source.body.length || selected.total !== source.body.length || source.body.slice(start, end) !== selected.text)
    throw Error('Concept repair preflight range does not match the prepared source');
  const part = {start, end, text: selected.text};
  const priorEvidence = payload.knownConceptDiscussion || [];
  if (!Array.isArray(priorEvidence) || priorEvidence.some(e => !Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end < e.start || source.body.slice(e.start, e.end) !== e.quote))
    throw Error('Concept repair known evidence no longer matches the current source');
  const context = {source, priorEvidence, historical: !!payload.historicalRecognition};
  const issues = [];
  if (!Array.isArray(result?.concepts) || result.concepts.length > 4 || !Array.isArray(result?.unresolvedQuestions) || result.unresolvedQuestions.length > 8)
    return {issues: [{kind: 'shape', reason: 'Concepts and unresolvedQuestions must be bounded arrays'}]};
  for (const [index, item] of result.concepts.entries()) {
    const admission = conceptAdmission(item, part, context);
    if (!admission.accepted) issues.push({kind: 'concept-admission', index, key: item.key, reason: admission.reason, ...admissionDiagnostics(item, part, context)});
  }
  for (const [index, item] of result.unresolvedQuestions.entries()) {
    const evidence = collectConceptEvidence(item, part, context);
    if (typeof item.questionQuote !== 'string' || !item.questionQuote.trim() || !evidence.some(e => e.quote === item.questionQuote && e.speaker === 'user') || typeof item.reason !== 'string' || !item.reason.trim())
      issues.push({kind: 'unresolved-question', index, reason: '可忽略问题须定位到已读原问题；必须是真实 user 原句及原因，不能使用 assistant 的疑问或另换无关引句', quote: item.questionQuote, locations: quoteLocations(item.questionQuote, part, source, priorEvidence), evidence});
  }
  return {diagnosticVersion: 2, issues};
}

async function inspectResult(inspect, prepared, result) {
  const review = await inspect(prepared, result);
  if (!review || !Array.isArray(review.issues) || !Array.isArray(review.partialOutputs) || !Array.isArray(review.ignored))
    throw Error('Concept repair inspection must include issues, partialOutputs and ignored audit arrays');
  return review;
}

function correctionDispositions(original, corrected) {
  const issues = [];
  for (const [index, candidate] of original.concepts.entries()) {
    const marker = `[repair-candidate:${index + 1}]`;
    const entries = (corrected.issues || []).filter(item => typeof item === 'string' && item.startsWith(marker));
    const match = entries.length === 1 && entries[0].match(/^\[repair-candidate:\d+\]\s*(retained|rewritten|not-admitted):\s*(.+)$/);
    if (!match || !match[2].trim()) { issues.push({kind: 'correction-disposition', index, key: candidate.key, reason: 'Each original candidate needs exactly one retained/rewritten/not-admitted reason in issues'}); continue; }
    const exists = corrected.concepts?.some(item => item.key === candidate.key);
    if (match[1] === 'not-admitted' ? exists : !exists) issues.push({kind: 'correction-disposition', index, key: candidate.key, reason: 'Candidate disposition must match the corrected concept key; do not silently drop or rename a candidate'});
  }
  return issues;
}

// Explicit human exception: one additional dispatch for one immutable rejected
// correction. Both earlier artifacts stay byte-for-byte unchanged.
async function selectAuthorizedExtraCorrection({work, prepared, cached, attempt, originalResultHash, originalReview, inspect, run, gate}) {
  const matchingAuthorizations = ['fourth-extra-correction-authorization.json', 'fifth-extra-correction-authorization.json']
    .map(name => path.join(work, name)).filter(file => fs.existsSync(file)).map(read)
    .filter(item => item.requestHash === prepared.requestHash);
  if (!matchingAuthorizations.length) return null;
  if (matchingAuthorizations.length !== 1) throw Error('CONCEPT_REPAIR_EXTRA_AUTHORIZATION_AMBIGUOUS');
  const authorization = matchingAuthorizations[0];
  const source = prepared.payload.source;
  if (authorization.version !== 1 || authorization.extraAttempts !== 1 || authorization.model !== 'gpt-6-astra' || cached.model !== authorization.model ||
      authorization.sourceId !== source.id || authorization.sourceHash !== source.hash || authorization.start !== source.offset || authorization.end !== source.offset + source.text.length ||
      authorization.originalResultHash !== originalResultHash || authorization.rejectedResultHash !== attempt?.correctedResultHash || attempt?.status !== 'rejected' ||
      digest(attempt.correctedResult) !== authorization.rejectedResultHash || digest(prepared.payload.analysisTemplates || {}) !== authorization.templateHash)
    throw Error('CONCEPT_REPAIR_EXTRA_AUTHORIZATION_MISMATCH');
  const originalFile = path.join(work, `concept-repair-${prepared.requestHash}.json`);
  const priorFile = path.join(work, `concept-repair-${prepared.requestHash}.correction-${originalResultHash}.json`);
  const unchanged = () => {
    if (hash(fs.readFileSync(originalFile)) !== authorization.originalArtifactHash || hash(fs.readFileSync(priorFile)) !== authorization.correctionArtifactHash)
      throw Error('CONCEPT_REPAIR_EXTRA_PRIOR_ARTIFACT_CHANGED');
  };
  unchanged();
  const file = path.join(work, `concept-repair-${prepared.requestHash}.extra-${authorization.rejectedResultHash}.json`);
  let extra = fs.existsSync(file) ? read(file) : null;
  if (extra && (extra.version !== 1 || extra.authorizationHash !== digest(authorization) || extra.originalResultHash !== originalResultHash || extra.rejectedResultHash !== authorization.rejectedResultHash))
    throw Error('CONCEPT_REPAIR_EXTRA_AUDIT_IDENTITY_CHANGED');
  const hasSaved = originalReview.partialOutputs.length || originalReview.ignored.length;
  if (hasSaved && !(extra?.status === 'validated' && extra.correctedResultHash === originalReview.resultHash))
    throw Error('CONCEPT_REPAIR_CORRECTION_BLOCKED_PARTIAL_SAVE: 额外纠正只能续交相同已验证结果');
  if (!extra) {
    const review = await inspectResult(inspect, prepared, attempt.correctedResult);
    if (review.partialOutputs.length || review.ignored.length) throw Error('CONCEPT_REPAIR_CORRECTION_BLOCKED_PARTIAL_SAVE');
    await gate();
    unchanged();
    const instructions = '用户仅授权当前指定分段额外纠正一次。原返回和第一次纠正均不可覆盖。逐个审视 originalResult 中所有候选，保留原 key；每个候选都在 issues 写 [repair-candidate:N] retained/rewritten/not-admitted: 具体原因。previousResult 是被拒绝的第一次纠正，不是证据。严格使用当前已读原文；questionQuote 必须是真实用户问题，认可必须针对原回答，结论只能在原回答或该次用户认可的同条发言内。counterEvidence 必须是真实且针对当前回答的用户反对；早于回答的反对不能充当对后来回答的反对。不得换无关引文、放宽准入或静默丢弃候选。无法准入须保留逐项原因，不能捏造问题。返回完整原 schema，其他层数组保持空，模板不变。诊断仅为定位帮助，不是来源证据。';
    const payload = {...prepared.payload, validationFeedback: [prepared.payload.validationFeedback, instructions, JSON.stringify(review.issues)].filter(Boolean).join('\n'), repairCorrection: {attempt: 2, authorizedExtraAttempt: true, diagnosticVersion: 2, requestHash: prepared.requestHash, originalResultHash, rejectedResultHash: authorization.rejectedResultHash, originalResult: structuredClone(cached.result), previousResult: structuredClone(attempt.correctedResult), diagnostics: review.issues}};
    extra = {version: 1, authorizationHash: digest(authorization), originalResultHash, rejectedResultHash: authorization.rejectedResultHash, model: cached.model, requestHash: prepared.requestHash, originalResult: structuredClone(cached.result), previousResult: structuredClone(attempt.correctedResult), payload, status: 'attempting', startedAt: new Date().toISOString()};
    fs.writeFileSync(file, JSON.stringify(extra, null, 2), {flag: 'wx'});
    try {
      const result = await run(payload);
      if (prepared.payload.analysisTemplates) result.analysisTemplates = prepared.payload.analysisTemplates;
      extra.correctedResult = result; extra.correctedResultHash = digest(result); extra.status = 'returned'; extra.returnedAt = new Date().toISOString(); write(file, extra);
    } catch (error) {
      extra.status = 'failed'; extra.error = String(error.message || error); extra.failedAt = new Date().toISOString(); write(file, extra); throw error;
    }
  }
  unchanged();
  if (!['returned', 'validated'].includes(extra.status) || !extra.correctedResult || digest(extra.correctedResult) !== extra.correctedResultHash)
    throw Error('CONCEPT_REPAIR_EXTRA_BUDGET_EXHAUSTED: 额外一次已使用，所有记录保留');
  const review = await inspectResult(inspect, prepared, extra.correctedResult);
  if ((review.partialOutputs.length || review.ignored.length) && review.resultHash !== extra.correctedResultHash) throw Error('CONCEPT_REPAIR_CORRECTION_BLOCKED_PARTIAL_SAVE');
  const issues = [...review.issues, ...correctionDispositions(cached.result, extra.correctedResult)];
  if (issues.length) {
    extra.status = 'rejected'; extra.validation = issues; extra.failedAt = new Date().toISOString(); write(file, extra);
    throw Error('CONCEPT_REPAIR_EXTRA_REJECTED: ' + issues.map(item => item.reason || String(item)).join('; '));
  }
  if (extra.status !== 'validated') { extra.status = 'validated'; extra.validatedAt = new Date().toISOString(); write(file, extra); }
  return extra.correctedResult;
}

// One correction attempt per immutable original artifact. The original is
// never replaced, and a failed/interrupted attempt cannot spend again on resume.
export async function selectConceptRepairResult({work, prepared, cached, inspect, run, gate}) {
  if (!inspect) return cached.result;
  const originalReview = await inspectResult(inspect, prepared, cached.result);
  if (!originalReview.issues.length) return cached.result;
  const originalResultHash = digest(cached.result);
  const file = path.join(work, `concept-repair-${prepared.requestHash}.correction-${originalResultHash}.json`);
  let attempt = fs.existsSync(file) ? read(file) : null;
  if (attempt && (attempt.version !== 1 || attempt.model !== cached.model || attempt.requestHash !== prepared.requestHash || attempt.originalResultHash !== originalResultHash || digest(attempt.originalResult) !== originalResultHash))
    throw Error('Concept repair correction audit identity changed');
  const extraResult = await selectAuthorizedExtraCorrection({work, prepared, cached, attempt, originalResultHash, originalReview, inspect, run, gate});
  if (extraResult) return extraResult;
  const hasSaved = originalReview.partialOutputs.length || originalReview.ignored.length;
  const sameSavedCorrection = attempt?.status === 'validated' && originalReview.resultHash && originalReview.resultHash === attempt.correctedResultHash;
  if (hasSaved && !sameSavedCorrection) throw Error('CONCEPT_REPAIR_CORRECTION_BLOCKED_PARTIAL_SAVE: 已有概念或忽略审计保存，只能继续相同结果');
  if (!attempt) {
    await gate();
    const instructions = '仅纠正当前准确失败段的一次返回，不查外部资料、不改变准入规则。所有原候选均在 previousResult 中：逐个保留、基于真实原文改写或说明不准入，禁止悄悄丢弃、改 key 或为凑通过另换无关引文。questionQuote 必须是实际 user 的原问题；assistant 疑问不能冒充用户问题。认可不可扩展到后续新结论。若候选不准入，在 issues 为每个原候选按原顺序写一条 [repair-candidate:N] retained/rewritten/not-admitted: 具体原因；N 从1开始，retained/rewritten 仍保留原 key。unresolvedQuestions 只有真实 user 原问题及未准入原因；不能定位用户原问题时仅在 issues 留说明，不得捏造或机械换句。返回完整原输出 schema，其他层数组保持空，确认模板不变。所有反馈仅作输入定位诊断，不构成来源证据。';
    const diagnosticVersion = originalReview.diagnosticVersion || 1;
    const correctionPayload = {...prepared.payload, validationFeedback: [prepared.payload.validationFeedback, instructions, JSON.stringify(originalReview.issues)].filter(Boolean).join('\n'), repairCorrection: {attempt: 1, diagnosticVersion, requestHash: prepared.requestHash, originalResultHash, previousResult: structuredClone(cached.result), diagnostics: originalReview.issues}};
    attempt = {version: 1, diagnosticVersion, model: cached.model, requestHash: prepared.requestHash, originalResultHash, originalResult: structuredClone(cached.result), feedback: structuredClone(originalReview.issues), payload: correctionPayload, status: 'attempting', startedAt: new Date().toISOString()};
    write(file, attempt);
    try {
      const result = await run(correctionPayload);
      if (prepared.payload.analysisTemplates) result.analysisTemplates = prepared.payload.analysisTemplates;
      attempt.correctedResult = result;
      attempt.correctedResultHash = digest(result);
      attempt.status = 'returned';
      attempt.returnedAt = new Date().toISOString();
      write(file, attempt);
    } catch (error) {
      attempt.status = 'failed'; attempt.error = String(error.message || error); attempt.failedAt = new Date().toISOString(); write(file, attempt); throw error;
    }
  }
  if (!['returned', 'validated'].includes(attempt.status) || !attempt.correctedResult || digest(attempt.correctedResult) !== attempt.correctedResultHash)
    throw Error('CONCEPT_REPAIR_CORRECTION_BUDGET_EXHAUSTED: 原返回与诊断已保留；一次纠正失败或中断，未覆盖原缓存');
  const review = await inspectResult(inspect, prepared, attempt.correctedResult);
  if ((review.partialOutputs.length || review.ignored.length) && review.resultHash !== attempt.correctedResultHash) throw Error('CONCEPT_REPAIR_CORRECTION_BLOCKED_PARTIAL_SAVE: 纠正后出现其他结果的已保存概念或忽略审计');
  const issues = [...review.issues, ...correctionDispositions(cached.result, attempt.correctedResult)];
  if (issues.length) {
    attempt.status = 'rejected'; attempt.validation = issues; attempt.failedAt = new Date().toISOString(); write(file, attempt);
    throw Error('CONCEPT_REPAIR_CORRECTION_REJECTED: ' + issues.map(item => item.reason || String(item)).join('; '));
  }
  attempt.status = 'validated'; attempt.validatedAt = new Date().toISOString(); write(file, attempt);
  return attempt.correctedResult;
}

export function validateRepairPlan(plan) {
  if (plan?.version !== 1 || plan.model !== 'gpt-6-astra' || plan.reasoningEffort !== 'low' || !Array.isArray(plan.segments) || plan.segments.length !== 5)
    throw Error('Priority repair plan must contain exactly five ASTRA segments');
  const keys = new Set();
  for (const p of plan.segments) {
    const key = `${p.sourceId}:${p.start}:${p.end}`;
    if (!p.sourceId || !/^[a-f0-9]{64}$/.test(p.sourceHash) || !Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0 || p.end <= p.start || p.end - p.start > 40000 || keys.has(key))
      throw Error('Invalid or repeated priority repair range');
    keys.add(key);
  }
  return plan;
}

// Runs inside the existing classification executor and its existing lock.
// Saved receipts are checked by the live store on every resume.
export async function repairPriorityConcepts({work, api, ownerToken, run, gate, inspect, onCurrent = () => {}}) {
  const file = path.join(work, 'priority-concept-repair.json');
  if (!fs.existsSync(file)) return {required: false};
  const plan = validateRepairPlan(read(file));
  const ready = await api('ready');
  if (ready.conceptRepairVersion !== 1) throw Error('CONCEPT_REPAIR_BACKEND_RELOAD_REQUIRED');
  const receipts = [];
  const verifiedReceipt = (receipt, segment) => receipt?.status === 'saved-verified' && receipt.model === plan.model && ['sourceId', 'sourceHash', 'start', 'end'].every(key => receipt[key] === segment[key]);
  for (const segment of plan.segments) {
    onCurrent({...segment, id: segment.sourceId, stage: 'priority-concept-repair'});
    await gate();
    const input = {sourceId: segment.sourceId, sourceHash: segment.sourceHash, start: segment.start, end: segment.end, ownerToken};
    const prepared = await api('concepts/repair/prepare', input);
    let receipt = prepared.receipt;
    if (!prepared.alreadyComplete) {
      if (!/^[a-f0-9]{64}$/.test(prepared.requestHash) || !prepared.payload) throw Error('Invalid concept repair preparation');
      const artifact = path.join(work, 'concept-repair-' + prepared.requestHash + '.json');
      let cached = fs.existsSync(artifact) ? read(artifact) : null;
      if (!cached) {
        const result = await run(prepared.payload);
        if (prepared.payload.analysisTemplates) result.analysisTemplates = prepared.payload.analysisTemplates;
        cached = {model: plan.model, requestHash: prepared.requestHash, result};
        write(artifact, cached);
      }
      if (cached.model !== plan.model || cached.requestHash !== prepared.requestHash) throw Error('Concept repair artifact identity changed');
      const result = await selectConceptRepairResult({work, prepared, cached, inspect, run, gate});
      await gate();
      const saved = await api('concepts/repair/commit', {...input, requestHash: prepared.requestHash, result, model: plan.model});
      receipt = saved.receipt;
    }
    // Never infer successful content recovery from an HTTP acknowledgement.
    if (!verifiedReceipt(receipt, segment)) throw Error('Concept repair missing verified disk receipt');
    const checked = await api('concepts/repair/prepare', input);
    if (!checked.alreadyComplete || !verifiedReceipt(checked.receipt, segment)) throw Error('Concept repair receipt could not be reverified');
    receipts.push(checked.receipt);
    plan.receipts = receipts;
    plan.status = receipts.length === plan.segments.length ? 'saved-verified' : 'repairing';
    plan.updatedAt = new Date().toISOString();
    write(file, plan);
    console.log(JSON.stringify({event: 'priority-concept-repair-verified', sourceId: segment.sourceId, start: segment.start, end: segment.end, done: receipts.length, total: plan.segments.length}));
  }
  return {required: true, verified: receipts.length};
}
