# Venus 0.8.5 — local API recovery and honest model usage display

A local status-read timeout could be mistaken for a protocol failure and cancel a healthy model request. This update keeps in-flight model control tied to local authoritative pause/cancel intent, and verifies API state at dispatch/save boundaries with finite reconnects.

## Changes

- Classify real DOM `TimeoutError` by its name even when its numeric `code` is 23. Preserve safe exception name/code/cause, method, route and HTTP status diagnostics.
- Remove the periodic workspace HTTP read from in-flight model supervision. Local pause/cancel checks remain; no model progress questions or new UI polling are added.
- Separate transient reads, malformed JSON, HTTP rejections and uncertain write outcomes. Read reconnects remain bounded. Unknown writes are not blindly repeated; original results, idempotency receipts and spent budgets remain authoritative.
- Close local API connections after use to reduce stale keep-alive socket reuse across lengthy local work. Connection resets remain possible and are not claimed eliminated.
- Show protocol/save faults as technical recovery problems, with checkpoint/receipt verification instead of quarantining healthy sources or asking users to interpret source evidence.
- Separate currently configured models from historical usage receipts. A configured model name is not provider confirmation. Historical request averages are not live throughput or proof of the current model.

The README acknowledges the value of full-history review and cross-project connections, and recommends choosing project-related files and importing time-based batches for lighter, focused use. This is input-selection guidance, not a new project/date filter or a promise of fixed token savings; original files and safety backups remain separate.

## Validation and boundaries

The public candidate's own regression run passed **574 tests with zero failures**. These are not the separate private deployment's test totals. Fault injection covers numeric DOM timeouts, HTTP/JSON/write distinctions, bounded reconnects and pause, local in-flight control, durable-return reuse, technical recovery actions and configured SOL versus historical Astra usage.

Isolated browser acceptance uses synthetic documents and disabled model runners. Public-package reconstruction, archive-to-commit hashing and final workflow results are checked for this release separately; local test success alone is not remote package verification. No private-library screenshots or local runtime reports are included.

Provider capacity, account quotas, network resets and permanent protocol/save faults can still occur. Existing bounded backoff, quota-stop protection, exact evidence admission and unresolved/deferred outcomes remain unchanged. This release does not reset budgets, weaken literal evidence, claim full-library completion, measure token savings or change provider pricing. Private one-time model/deadline settings are excluded.

Source archives retain launch scripts, installation guidance, assets, third-party notices and the dependency lockfile. A real authenticated model invocation and broad cross-platform runtime acceptance are outside the public-package smoke test. Earlier 0.8.2 failed packaging and superseded release history remain intact.
