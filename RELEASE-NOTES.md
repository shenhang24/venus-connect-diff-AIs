# Venus 0.8.1 — 2026-10-27 (Australia/Sydney)

## Completion-driven processing

The original sequential executor writes an immutable request Markdown file and durable task identity before one submission. It waits for the actual runner exit and returned result, validates and reads back saved content, then continues automatically. Successful saved results retain source versions, original model provenance and correction budgets. An unresolved submission outcome blocks blind resubmission; confirmed no-return execution failures use only existing finite recovery budgets. Local process acceptance is not a provider acceptance receipt.

The interface receives task events and bounded changed-node updates instead of fixed five-second full-state refreshes. Opening a page still loads its initial library snapshot; a missed delta history can require another snapshot. Existing pages need one reload to load the updated interface. A local elapsed-time display sends no requests. The background task continues independently of the page.

Refresh saved status reads local records without invoking a model. Ask a question requires explicit text, discloses possible model usage, attaches no library content and refuses to interrupt active analysis. Completed request duration and wall-clock duration are distinct.

## Bounded recovery

Capacity failures have persistent same-model cooldown and finite backoff. Source-specific eligible failures retain exact locations and reasons in the original executor's tail ledger, with fairness between due retries and other work. Permission failures, exhausted budgets and uncertain outcomes remain visible. Deferral is not completion. Original material, preserved returns and spent correction budgets survive continuation.

## Validation and limits

The public candidate is tested with isolated synthetic fixtures. Earlier local acceptance observed four consecutive real requests, each submitted once and saved with literal-evidence readback, and five manual saved-status reads with no new model receipts. These bounded observations do not establish whole-library completion or universal performance.

The former refresh timers made local HTTP requests. There is no evidence that those timers consumed model tokens or caused provider capacity errors; no token-saving percentage is claimed. No model progress-question loop was identified. Necessary local ownership, process-exit and filesystem checks remain.

Only reviewed general code, tests and English release documentation are published. Private sources, task Markdown, model returns, runtime receipts, checkpoints, logs, credentials, personal configuration and live-library screenshots are excluded. Existing confirmed templates and unrelated public UI controls are preserved. This release adds no MCP or Agent connection and does not restart an installed backend.
