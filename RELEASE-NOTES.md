# Venus 0.8.4 — 2026-10-28 (Australia/Sydney)

## Fixed task progress, with real browser acceptance

The persistent row below the header displays saved whole-document counts and execution state. It remains visible in Focus view and narrow windows without covering the workspace. Progress changes in discrete saved-document steps, with no time-based animation. Retries and duplicate events do not add documents. Saved verified classifications and explicitly preserved manual results are included; segments and project-assignment requests are not extra documents. Only the existing final scope, source, classification and literal-evidence verification gates produce a completed full bar.

Running is green. Full pause or checkpoint draining is yellow. Confirmed unexpected exit or blocked work is red. A long model wait does not imply worker death. Event-connection loss is labelled unknown; a manual saved-status snapshot does not falsely claim a live connection. Text and accessibility values accompany color. Existing lifecycle checks and events drive updates; no five- or fifteen-second UI polling or model progress questions were added.

Chrome acceptance inspected the actual production progress row read-only, then the same application HTML, scripts and CSS with isolated synthetic persisted task states through the real event stream. Desktop and 390-pixel narrow layouts, Focus view, discrete save increments, duplicate events, long waits, pause, confirmed-exit simulation, disconnection, manual snapshot, recovery and final verification were checked in actual browser pixels and DOM state. Twenty state records were captured locally. The isolated QA made zero model calls; screenshots of private production content and local QA receipts are not included in this package.

## Preserve source-specific failures while independent work continues

The exact project-evidence validator rejection is classified as source-local and non-retryable, rather than a service-wide fault. Evidence admission remains unchanged. Explicit deferral now handles the existing singleton `ids[]` scope as well as `id`; every source in a failed batch must be explicitly deferred before that batch can stop blocking independent work. Undeferred peers remain blocking. Original returns, failed-source identity, manual membership, source text, checkpoints and spent correction/retry budgets remain preserved. A deferred source is unresolved, cannot obtain a fresh model attempt from this change and prevents a full-scope completion claim.

The original live worker continued from its checkpoint and a newly saved classification passed source/hash/summary/tag/literal-evidence readback. This is bounded continuation evidence, not a claim that the entire private library is complete. No additional production pause or restart was used during final UI acceptance or publication.

## Release history and validation

Version 0.8.2 retains its original failed packaging run and tag. Version 0.8.3 retains its source commit and draft release: it was pushed before browser and continuation acceptance and is not presented as an accepted public release. Version 0.8.4 follows the completed acceptance and final regression checks; no tag or commit history is rewritten.

The final public candidate includes the new source-error classification and singleton/batch deferral regressions. The earlier private suite and browser evidence were bounded checks on different snapshots; they are not relabelled as the final public test run. The reviewed manifest covers only general code, synthetic tests and English documentation. Private sources, task Markdown, model returns, credentials, personal settings, runtime receipts, budgets, checkpoints, logs and real-library screenshots remain excluded. This is a bounded allowlist and sensitive-pattern review, not a complete security audit.

Final public candidate regression: **567 tests passed, zero failed**. Earlier private 558-test and public 565-test runs describe prior snapshots and are retained as historical evidence.
