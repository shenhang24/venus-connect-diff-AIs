# Venus 0.8.3 — 2026-10-28 (Australia/Sydney)

## A fixed, truthful task progress bar

A persistent row below the header now displays task state and saved whole-document counts. It remains outside the workspace and Focus view's hidden diagnostics, with a compact narrow-window layout. The bar jumps only when the saved document count changes; it has no animated or time-based growth. Its denominator is the current classifier scope. Replayed events and retries do not add documents. Saved verified classifications and explicitly preserved manual results are included; individual segments and project-assignment requests are not extra documents. Full completion requires the existing final source, classification and literal-evidence verification gates.

Running is green. Fully paused or checkpoint-draining work is yellow. A confirmed unexpected worker exit or blocked failure is red. Waiting for a long model return is not evidence of worker death. A lost event connection is explicitly unknown, with a local saved-status refresh available; a refreshed snapshot does not falsely claim a live connection. State text and progress accessibility values accompany color.

The original local ownership tick now pushes only lifecycle/count changes through the existing event stream. No five- or fifteen-second interface polling or model progress questions were added. Existing capacity cooldown, bounded retries, source-tail fairness, pause/cancel, immutable request receipts and manual questions remain unchanged.

## Validation and limits

Synthetic regression tests cover discrete count changes, duplicate events, pause, confirmed exit, long waits, recovery, disconnect, final-verification gating and accessibility attributes. Existing completion-driven and idempotent-submission tests also remain in the suite. A local authorized maintenance restart retained the source and correction/retry receipts. The real runtime correctly reported an existing evidence-validation block, rather than pretending to resume or complete it. No new successful production save is claimed for this release.

Browser-based visual and narrow-window inspection could not be completed because the browser connection returned a constraints error. Layout visibility is covered by structural/CSS regression tests, not a claimed real-browser screenshot or frame-rate measurement. Original material, model results, runtime checkpoints, task Markdown, logs, personal configuration and real-library screenshots are excluded from this public package.

## Packaging correction

The 0.8.2 tag failed packaging because its public-file manifest had not been refreshed. Version 0.8.3 retains that history and publishes the corrected reviewed manifest. No private source was included; the flagged path was an existing generic folder-picker example.
