# Installation and deployment

Venus — Your Personal Galaxy is a personal knowledge-base tool. It requires a runtime and dependencies; this source copy is not a self-contained executable or installer.

## New-user setup order

1. **Prepare the environment.** Use Windows for the tested launcher path. Install Node.js with npm and have Windows PowerShell available. Node.js 20+ is the dependency-driven minimum; the validation host used Node.js 24.19.0. A specific Windows or PowerShell version was not recorded or separately certified. Python is optional for import/backup utilities; those tests used Python 3.12.14, not every Python 3 release. macOS/Linux deployment remains unverified.
2. **Choose whether you need an editor.** Ordinary users need the browser/application interface, not a code editor. Venus has built-in text editing. Developers may use any suitable source editor; no particular editor, extension or IDE is required.
3. **Install the locked dependencies.** Open a terminal in the folder containing package.json, run npm ci, then npm run build. Use the lockfile rather than an existing personal dependency/cache directory. See Runtime dependencies below for exact package versions.
4. **Configure analysis only if wanted.** Existing data can be read, edited and retrieved without model credentials. For analysis, choose a usable provider/model and configure its login or credential environment-variable name as described below. Start with analysis disabled while saving these settings; they take effect on the next backend start.
5. **Start, import and stop.** Run node src/supervisor.mjs with VENUS_ANALYSIS=0 for the first session, or use the relative-path Windows Start-Venus.cmd. Open the local address and import examples/sample.md. Use the application shutdown control under the supervisor to stop the backend; closing the browser alone does not stop it. Enable analysis explicitly only after configuring the analyzer and checking cost.
6. **Know where your data lives.** The default is the project-relative data directory, separate from source code and dependencies. Keep it private and back it up before changes. See Data location and manual editing below.
7. **Maintain deliberately.** Use the built-in editor for corrections, keep project decisions and locations current, and follow the update and troubleshooting guidance below. This documentation is not a report of a clean new-machine deployment.

## Operating systems and tested scope

The Windows application-window launcher uses PowerShell and Microsoft Edge when available, with a browser fallback. Windows is the locally tested environment. The backend is Node.js code, but macOS/Linux installation, launch behavior and native UI have not been verified; cross-platform support is not certified.

The initial publication copy historically passed its build, 159 Node tests and 10 optional Python tests. Those historical counts are not the validation totals for later releases; see the current update notes for release-specific checks. The available validation host reports Node.js 24.19.0 and Python 3.12.14. Those tests do not establish a fresh-machine installation test or a live Gemini/local-model integration test. The documented minimum Node.js 20 follows the locked marked dependency requirement; every supported Node release has not been tested.

## Runtime dependencies

| Component | Version / requirement | Purpose |
| --- | --- | --- |
| Node.js | 20+; validation host 24.19.0 | Server, CLI, MCP and build |
| npm | Available with your Node installation | Lockfile-based dependency installation |
| marked | 16.4.1, locked | Markdown rendering |
| Three.js | 0.180.0, locked | Network rendering |
| Prettier | 3.6.2, locked development dependency | Development tooling |
| Python | Optional Python 3; validation host 3.12.14 | Export conversion and backup utilities |
| Browser | Windows Edge application window or browser fallback | Local interface |
| Analysis provider | Optional; configured separately | Model-based extraction |

Install from the directory containing package.json:

```powershell
npm ci
npm run build
```

npm ci uses package-lock.json. Network access may be needed to download dependencies. Do not copy another user's node_modules, data, caches, credentials or personal environment. Venus is available under the [MIT License](../LICENSE); original dependency notices are retained in third-party-licenses and remain applicable to their respective components.

## First run: no analysis charges from retrieval

Start with automatic analysis disabled:

```powershell
$env:VENUS_ANALYSIS = '0'
node src/supervisor.mjs
```

Open http://127.0.0.1:10001. Check that port is free; do not stop another project to take it. VENUS_PORT can change the backend port, while the Windows launcher and default read client still use 10001 and need corresponding adjustment. No public listener is required.

On Windows, Start-Venus.cmd starts relative to its own directory; it does not require the author's drive layout. It uses Windows PowerShell to invoke the local Start-Venus.ps1. Run only one writer against a data directory. Closing a browser window alone is not proof that the backend stopped; use the application's shutdown control when running under the supervisor.

The application creates its own data directory. Import examples/sample.md first, or paste a short source with a filename into the interface and save. A saved source enters the pending queue. Reading, editing and retrieval do not require a model to run. Original personal databases are not included in the intended publication contents. Optional import scripts convert files that you explicitly supply; they do not collect every conversation automatically. Binary attachments are not fully migrated.

## Recommended archive-to-library workflow

First, ask Codex or another suitable tool to preserve only conversations you can actually access or export. Keep original text and source references, and confirm the tool has permission and access to each source; do not assume it can collect an entire account history. Next, choose and configure your own AI analyzer, validate a small sample and process the archive in batches.

With suitable hardware, a local model can gradually organize a large historical archive and reduce cloud token spending. Model capability and hardware determine speed and extraction quality. This is not free computation or a universally optimal setup: hardware resources, time and electricity still matter. No current model or service is switched by this guidance.

For later daily use, explicitly configure and authorize incremental imports, deduplication and analysis of newly added material only. Avoid reprocessing the full historical archive on each run. Daily scheduling is optional and is not activated by this document.

## Configure analysis deliberately

> [!WARNING]
> Bulk analysis of long conversation archives can consume a substantial amount of tokens, exhaust subscription usage limits, or incur significant API charges. Do not start a full-library run with the most expensive model or highest reasoning setting. Test a small sample first and monitor usage.
>
> Codex analysis consumes subscription usage allowance when using a subscription-backed sign-in; external model APIs may incur separate API charges. These are distinct cost mechanisms. Local models also require hardware resources, time and electricity.

Open the model settings and select Codex CLI, compatible HTTP, Gemini Interactions or a local compatible service. Supply model and endpoint settings appropriate to that provider. Credential fields take environment-variable names, never secret values. Saved provider settings take effect at the next backend start and do not test connectivity or switch active analysis.

This publication copy defaults automatic analysis to off. After configuring a usable analyzer, explicitly set VENUS_ANALYSIS=1 before startup to enable it. The scheduler invokes that analyzer only while the backend is running and automatic processing is enabled. You do not need to send an external Codex instruction for every source. If processing is paused, disabled or lacks a usable analyzer, queued material waits. The current implementation permits up to five concurrent workers; this copy has no new concurrency selector. Stop and plan a validated implementation change if fewer workers are required before importing a large archive.

Continuous imports plus selected-analyzer processing allow incremental knowledge extraction, tag and evidence-backed relationship organization, and skill-evidence integration. Extraction quality depends on model capability, source coverage and instructions. Noise and mistaken associations can be edited. This is external persistent memory, not training model weights, unlimited context, a complete personality model or certification of abilities.

## Credentials

| Use | What the user supplies | Important boundary |
| --- | --- | --- |
| Basic local reading/editing | No model credential | Node and application dependencies are still required |
| Local read-only CLI / stdio MCP | Local service URL or local host configuration | No paid model API is called by the read query itself |
| Codex analysis | An installed Codex CLI with the user's existing sign-in | Analysis consumes the account's allowance; login is not bundled |
| External compatible model API | Provider endpoint, model and the user's own API key | API calls may incur fees; configure a key environment-variable name |
| Gemini analysis | The user's Gemini model/provider settings and key | Adapter has mocked tests, not verified live authentication |
| Local model analysis | Local compatible endpoint and model name | A user-managed token is optional only if the local service requires it |
| Optional remote connection | The user's own Tunnel ID and runtime key, if using a separately installed compatible route | Not required for local retrieval; not bundled or verified end to end in this copy |

All credential examples below are placeholders, not working values:

```text
Provider key environment-variable name: <YOUR_PROVIDER_KEY_ENV_NAME>
Provider key value, set outside project files: <YOUR_PROVIDER_API_KEY>
External endpoint: https://<YOUR_PROVIDER_HOST>/<COMPATIBLE_API_BASE>
Local endpoint: http://127.0.0.1:<YOUR_LOCAL_PORT>/<COMPATIBLE_API_BASE>
Model: <YOUR_MODEL_NAME>
Optional local token: <YOUR_LOCAL_AUTH_TOKEN>
Optional Tunnel ID: <YOUR_TUNNEL_ID>
Optional runtime key: <YOUR_RUNTIME_KEY>
```

Do not paste credentials into Markdown, command-line arguments, screenshots, Git or the public tree. Refer to a credential by its environment-variable name in provider settings. Local mode accepts loopback addresses only. Cloud analysis sends the selected document chunks to the chosen provider; it is separate from local retrieval.

Optional remote-connection information is a prerequisite description, not a statement that the public copy includes that controller or that cloud chat can already access your machine. The prior local readiness checks did not establish successful cloud end-to-end invocation. No real remote ID, key, profile or private configuration belongs in the published tree.

## Connect AI tools

From the project directory, with Venus running:

```powershell
node codex-plugin/query.mjs "Example"
```

This compact read-only command does not invoke a paid model API, does not trigger analysis, and does not save query history. Independently enabled background analysis can still consume allowance. It searches up to 25 candidates and reads at most three core nodes with short source references; it does not promise exhaustive semantic search.

For a tool-capable local Agent/Harness, configure node codex-plugin/readonly-mcp.mjs as a stdio MCP server with six read tools. Resolve the template's PLUGIN_ROOT placeholder to your own install location. VENUS_URL selects the loopback service address. The separate writable MCP and bridge have write capabilities and must not be called read-only. Without an Agent, existing data remains readable and editable in Venus.

HTTP read example: GET /api/read/search?q=Example&kind=knowledge&limit=3 against your local Venus service. External/cloud AI sessions cannot access another computer's loopback address automatically. Gemini and local OpenAI-compatible adapter code are present, with mocked contract tests; successful live setup depends on the user's actual service and model compatibility.

## Optional daily incremental backups

You may ask Codex or another tool-capable Agent/Harness to configure a private Venus plugin or CLI workflow for daily backup and organization of explicitly selected, actually accessible conversation exports or local Markdown. Require deduplication, preservation of original text and source references, and analysis of newly added material only. Verify the configured integration and permissions on a small sample before enabling a schedule.

This requires user configuration and authorization; it is not on by default and is not a claim that Venus or Codex can automatically read every ChatGPT conversation. A compatible external scheduler and source access may be needed. This documentation change creates no automation or cron job, resumes no earlier backup, reads no real chat and runs no analysis. Cloud analysis of new material can still consume subscription allowance or API charges.

## Data location and manual editing

By default, data/ is created relative to the installed project. It contains original Vault Markdown, derived knowledge and skill Markdown, and .venus metadata including indexes, task state, analysis results and history. The derived folders keep their current on-disk names even when the interface is English. VENUS_DATA can select a different data root for the Node backend; the Windows launcher checks the default project-relative data root, so custom-root launcher behavior is not certified. Do not point two writers at one library.

You can edit Vault, knowledge and skill text in the interface without a code editor or AI. Previous versions are retained and affected material can be scheduled for review. Classification tags and relationship explanations/evidence are also editable. A filter hides records; it does not delete them. Dedicated whole-document/individual-link deletion is not exposed by the checked UI/API. See PAGE-TOUR.md and PRIVACY.md for editing and retention limits.

## Updating an installation

No automatic updater or self-contained environment package is provided. Before adopting a future reviewed source version, save open edits, stop the backend through the application control and make a private backup of the entire data directory. Keep that backup outside any public source package. Review the new version's compatibility and migration notes before replacing source files; do not overwrite your library with someone else's data, configuration or caches.

After updating source, install the matching lockfile dependencies with npm ci and rebuild with npm run build. Start with automatic analysis disabled, check that your existing library opens, and review provider settings before deliberately enabling new analysis. The current tests do not establish a migration guarantee for every future version. No update was performed as part of this documentation step.

## Common problems

| Symptom | What to check |
| --- | --- |
| node or npm is not found | Install a compatible Node.js distribution with npm and reopen the terminal. An editor is not a substitute for the runtime. |
| A dependency/module is missing | Run npm ci from the folder containing package.json and package-lock.json. Network access may be needed; do not borrow another user's cache or library. |
| Windows launcher cannot run PowerShell or is blocked by machine policy | Confirm Windows PowerShell is available and follow your organization's execution policy. Do not bypass managed policy. Native launcher behavior outside Windows is unverified. |
| The local port is occupied | Confirm which project owns it. Do not terminate another project to take the port. Changing VENUS_PORT also requires matching client and launcher settings. |
| A source is queued but not analyzed | Publication defaults analysis off. Configure a usable analyzer, enable it explicitly for startup, and check the progress panel for pauses, cooldowns or errors. Queued is not complete. |
| Codex cannot be started or authenticated | Ensure your own installed Codex CLI is available to the backend process and signed in. No account login or allowance is included with Venus. |
| An HTTP, Gemini or local model call fails | Check your endpoint, model, credential environment-variable name, service compatibility and structured-output support. Settings activate at backend restart; saving them is not a successful connection test. Live compatibility with every provider/model is unverified. |
| Token allowance or budget is running out | Pause analysis, review usage and costs, and test a smaller source/model configuration before resuming. Local read-only retrieval can still be used without invoking a paid model API. |
| Closing the window did not stop processing | The browser window and backend are separate. Use the application shutdown control when running through the supervisor. |
| A summary, tag or relationship is wrong | Correct it in the supported manual controls. Investigate storage, display or interface faults as software issues rather than attributing every defect to model judgment. |

## Release package

Version 0.4.0 includes the program, deployment files, locked dependency definitions, synthetic examples, templates, targeted tests, retained dependency notices and English synthetic-demo screenshots. Install dependencies with npm ci before starting. No private data, credentials, remote tunnel profiles or background analysis allowance is bundled. Existing private data must stay outside public version control.

Optional tunnel controller source uses YOUR_TUNNEL_ID as an unconfigured placeholder. A compatible client and the user's own profile are separate prerequisites; cloud connectivity has not been verified by this release. Local retrieval does not require a tunnel.

## Public Tunnel configuration

No account-specific Tunnel ID or private profile is shipped. Configure your own official Tunnel client/profile separately and set `VENUS_TUNNEL_ID` for the local control process. Enter that same ID in the MCP connection dialog; runtime keys remain in memory and are not saved. This package does not provision a Tunnel or claim that platform registration has succeeded.
