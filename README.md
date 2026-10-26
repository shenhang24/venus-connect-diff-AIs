# Venus — Your Personal Galaxy

**Latest: 0.7.2 (2026-10-22)** — equal revolution speeds within each ring and asynchronous speeds between rings; recurring tags form project groups at 3/5 independent Markdown sources across all four networks; backdrop dismissal and right-click back navigation. [ Changes today](UPDATE-NOTES-0.7.2.md). Historical screenshots below predate this UI.


You may be surprised by how much knowledge, creativity, and practical experience you've accumulated, once you can finally see how it all connects.

> [!WARNING]
> ## HIGH TOKEN USAGE AND COSTS — IT'S YOUR CHOICE
>
> Bulk analysis of long conversation archives can consume a substantial amount of tokens, exhaust subscription usage limits, or incur significant API charges. Do not start a full-library run with the most expensive model or highest reasoning setting. Test a small sample first and monitor usage.
>
> **The model and settings are your choice. You are responsible for choosing them and monitoring your usage limits, budget and costs before and during analysis.**
>
> Codex analysis consumes subscription usage allowance when using a subscription-backed sign-in; external model APIs may incur separate API charges. These are distinct cost mechanisms. Local models also require hardware resources, time and electricity.

A visual, editable, traceable personal knowledge-base tool for you and your AI.
**Venus is a tool, not an Agent or an AI.** It is an external knowledge base for AI and a way to organize and display the user's accumulated personal knowledge. Venus turns personal material into a visual, editable, traceable knowledge network. Users can explore connections, correct content, and let AI retrieve and reuse knowledge so accumulated work informs future learning and work.

Knowledge coverage depends on how much relevant source material you provide and how complete it is. Extraction quality depends on the actual understanding and summarization ability of your chosen model, the input material and your instructions. The resulting network is not a complete representation of your personality or a certification of your abilities. Venus does not guarantee correct automatic summaries or certify proficiency. Your own AI can organize and write material through a tool-capable Agent/Harness, such as Codex but not limited to it. Without an Agent, you can still read, retrieve and edit existing data.


## What changed in 0.8.0

Venus now coordinates its enabled local update and saved-checkpoint continuation inside the app, so an ongoing job does not need a chat reminder loop. Organization uses shared semantic domains, stable project references and content/subtopics across four layers with different roles. Rules and confirmed layer templates can be updated while original sources and existing manual choices remain traceable.

See [the 0.8.0 update](UPDATE-NOTES-0.8.0.md) and [the four-layer workflow with generic examples](docs/FOUR-LAYERS.md). This is not automatic access to every conversation, arbitrary self-modification or error-free AI organization.

## A place to start

Already have Codex but not sure where to start? Turn your conversations into a personal knowledge base that helps your AI understand your projects, decisions, and working style.

Don't just finish tasks with AI. Build knowledge you can reuse, so your next project starts from what you've learned rather than another round of explaining everything from scratch.

Venus supports this continuity through connected tools and retrieval from your library. It does not train model weights or guarantee permanent AI memory. The workflow is not limited to Codex: other tool-capable Agents/Harnesses and compatible AI services can use the documented interfaces.

## Suggested starting workflow

1. Use Codex or another suitable tool to save conversations you can actually access or export, preserving the original text and source references. Tool access depends on the integration and your authorization; this does not mean any Codex session can fetch your entire account history.
2. Choose and configure your own AI analyzer, then process a small sample and continue in batches. Keep control of model choice, reasoning settings, usage limits and budget.
3. If you have suitable hardware, consider a local model to gradually organize a large historical library and reduce cloud token spending. Speed and extraction quality depend on the model and hardware; local processing still costs hardware resources, time and electricity and is not universally the best option.
4. For ongoing use, configure an authorized daily incremental workflow if you want one: deduplicate imports and process only new material, rather than rerunning the entire history each day. No backup or schedule is activated by following this documentation alone.

## One library across your AI tools

One personal knowledge base across the AI tools you choose, so project context and decisions do not have to be rebuilt in every conversation.

With your authorization and a compatible retrieval connection, different AI tools can consult the same saved background, decisions and sources. This can help reduce inconsistent project assumptions and repeated explanations; it does not guarantee conflict-free answers or decisions. This describes reuse of your personal library, not a new multi-user sharing feature, public synchronization service or automatic access for every AI platform.

Choose each cloud provider deliberately. Giving material to one platform does not authorize every other platform to receive it. The analysis provider you enable receives the relevant analysis input, and an AI host you authorize to retrieve from the library receives the requested results. A configured local model remains an option; see [Privacy and data flow](docs/PRIVACY.md) for limits.

## Explore the pages and data flow

Read the [Page Tour](docs/PAGE-TOUR.md) for each text view, network, integration panel and processing control. Read [Privacy and data flow](docs/PRIVACY.md) for what is saved locally, when configured AI services receive material, and how authorized retrieval returns context to the calling AI. This is a personal library: sharing is your choice, and the author should not receive your private database.

## Four layers, with different jobs

- **Vault** preserves original Markdown from sources you deliberately import.
- **AI Knowledge** provides traceable facts and methods for retrieval and later answers. Near-duplicate reuse requires a measured score of at least 95%: NFKC-normalized core text, whitespace removed, character-bigram multiset Sorensen-Dice. This is textual similarity, not semantic certainty. Related but different statements remain separate.
- **AI Skills** stores user-endorsed methods, applicable scope and limitations, with evidence distinguishing user instructions from assistant suggestions and references. Retrieved methods never override current instructions or authorization. Legacy or unconfirmed records are not treated as endorsed executable methods.
- **Concept Cloud** organizes ideas derived directly from the currently saved Vault material, including user edits. Related ideas can retain distinct conditions, disagreements and evolution, with references for tracing their sources.

Only new, changed or genuinely uncovered ranges enter extraction. Unchanged completed ranges, including valid zero-concept results, skip model generation. Rule-version changes and source references do not schedule semantic re-review. Venus does not reopen old conversations to judge the truth of current material or replace a user's edited version. Content and quoted instructions remain data, never execution authorization.

Each layer has a readable content view and a separate network view. Titles and paragraphs summarize the actual content; tags support retrieval rather than replace meaningful names. English and Chinese interfaces are available. Read the [Page Tour](docs/PAGE-TOUR.md).

## Spatial networks

Networks support orbit, zoom, local node focus and source navigation. Stable connection counts select the primary center; ties retain the current center and promotion transitions smoothly. Relation types are opt-in multi-select filters; hiding an edge does not delete it.

Continuous hierarchical orbits, bounded trails and exterior transfer channels show motion without an N-body physics simulation. During cross-system transfers, moving shared groups pass through other bodies without collision correction. Cruise advances by path distance and real elapsed time at 6 world units per second, with short entry/docking blends. It no longer speeds up with exterior radius. Ordinary resident orbit speeds and body clearance remain separate. Local-radius spacing permits group envelopes to overlap, with body-level avoidance. Fixed-orbit planets and temporarily offset satellites have different roles. Target speeds are independent; close approaches can couple actual speeds. Targeted synthetic checks are not a universal guarantee of collision-free dense scenes or constant frame rate.

Installation, first-run configuration and credential requirements are detailed in [Deployment](docs/DEPLOYMENT.md).

Current release: **0.7.2**. See [changes](CHANGELOG.md).

## Install and start

Requires Node.js 20+. Windows has an application-window launcher. Native operation on other operating systems has not been verified. Optional export/backup scripts require Python 3.

```powershell
npm ci
npm run build
$env:VENUS_ANALYSIS = '0'
node src/supervisor.mjs
```

Open `http://127.0.0.1:10001`. Check the port is free; do not terminate another project to claim it. `VENUS_PORT` changes the backend port, but the Windows launcher and read client default to 10001 and must be adjusted correspondingly. Windows users may also run `Start-Venus.cmd`. Run only one writer against a given data directory.

Venus is designed to run as a long-lived local knowledge service, giving your authorized AI tools ongoing access to your personal library. Keep it running while you want connected tools or configured processing workflows to use it. Saved data persists when Venus is stopped, but live access and background processing require the service to be running.

No personal database is shipped. The application creates its own `data/` directory. Import Markdown through the interface; `scripts/import-chatgpt.py` converts an explicitly supplied ChatGPT export, rather than scraping an account. Binary attachments are not fully migrated. This copy does not install daily backup schedules. Use `examples/sample.md` for a synthetic first document.

### AUTHOR-REPORTED LARGE-LIBRARY EXAMPLE

In this personal-library test, the author reported that the interface displayed 1.23 billion tokens. Historical snapshots grew to tens of gigabytes, while the primary Vault, knowledge and skill data were much smaller. This is an anecdotal observation, not a benchmark or a token-to-storage conversion.

The reported token total was not independently verified. Tokens, subscription usage allowances and API charges are different measures; no fixed tokens-per-week allowance, token-to-storage ratio or expected bill is implied.

## Before enabling analysis

> [!WARNING]
> Bulk analysis of long conversation archives can consume a substantial amount of tokens, exhaust subscription usage limits, or incur significant API charges. Do not start a full-library run with the most expensive model or highest reasoning setting. Test a small sample first and monitor usage.
>
> Codex analysis consumes subscription usage allowance when using a subscription-backed sign-in; external model APIs may incur separate API charges. These are distinct cost mechanisms. Local models also require hardware resources, time and electricity.

Saving a new source automatically adds it to the pending queue. The built-in scheduler calls the configured analyzer only while the backend is running, automatic processing is enabled and the analyzer is available; you do not need to issue a separate external Codex instruction for each document. Queued does not mean analyzed. Without a usable analyzer, or while processing is paused or disabled, the source waits. This publication copy defaults to analysis off; configure and enable it yourself.

As you continue importing material and the selected analyzer processes it, the library can incrementally extract knowledge, organize and extend tags and evidence-backed relationships, and integrate skill evidence. You can edit and correct irrelevant material, noise or mistaken associations. Growth depends on actual imports and analysis; it does not automatically collect every conversation, train model weights or create unlimited context.

Choose the provider, model and input/output budgets in the model settings. Saved settings activate at the next backend start; saving does not test the connection or switch active analysis. When ready, explicitly set `VENUS_ANALYSIS=1` before startup. The current analyzer permits up to five concurrent workers; this copy does not add a concurrency selector. If you need a lower limit, change and validate the implementation before importing a large archive. Progress and checkpoints persist locally. Derived conclusions still need review.

## AI integrations

```powershell
node codex-plugin/query.mjs "Example"
node codex-plugin/readonly-mcp.mjs
```

Local CLI retrieval reads saved knowledge without calling a paid model API or saving query history. The six read-only stdio MCP tools require a local host to start them. In the configuration template, `${PLUGIN_ROOT}` must be expanded by the host or replaced with the install path. `VENUS_URL` selects a loopback service. A separate writable MCP exists; understand its permissions before use and prefer the read-only entry for retrieval.

Read-only HTTP example: `GET /api/read/search?q=Example&kind=knowledge&limit=3`. Compact CLI retrieval reranks at most 25 search candidates and reads at most three nodes with short source references. It is not exhaustive semantic retrieval.

Analysis adapter code supports Codex CLI, OpenAI-compatible HTTP, local OpenAI-compatible services and Gemini Interactions. Local mode allows loopback hosts only. Cloud analysis sends document chunks to the selected provider. Configure credential environment-variable names, never credentials in project files. Adapter tests use mocks; live end-to-end authentication against Gemini and every local model has not been verified. Direct access from cloud chat to local MCP is outside this publication copy's verified scope.

See [integration details](docs/INTEGRATIONS.md).

## Validation and screenshots

Tests use synthetic fixtures and isolated temporary directories. Synthetic thousand/ten-thousand-node rendering checks do not establish performance for ten thousand real long documents. Window adaptation is not a test of every physical display. See [release review](docs/RELEASE-REVIEW.md) for the actual preparation results.

The screenshots below use the latest published image set already included in this repository: the 0.6.0 English synthetic demo. They are actual browser captures with fictional content, not the author's private library or live AI extraction. They document that release snapshot and may predate later interface changes.

### Content pages

![Vault sources](docs/images/0.6.0/01-vault-sources.jpg)
![AI Knowledge by project](docs/images/0.6.0/02-ai-knowledge-projects.jpg)
![AI Skills](docs/images/0.6.0/03-ai-skills.jpg)
![Concept Cloud](docs/images/0.6.0/04-concept-cloud.jpg)

### Network overviews

![Vault network overview](docs/images/0.6.0/05-vault-network-overview.jpg)
![AI Knowledge network overview](docs/images/0.6.0/06-knowledge-network-overview.jpg)
![AI Skill network overview](docs/images/0.6.0/08-skill-network-overview.jpg)
![Concept network overview](docs/images/0.6.0/09-concept-network-overview.jpg)

### Logs and dialogs

![Logs and updates](docs/images/0.6.0/13-logs-updates.jpg)
![Import Markdown](docs/images/0.6.0/14-import.jpg)
![MCP connection](docs/images/0.6.0/15-mcp-connection.jpg)

See the [complete 15-image gallery](docs/SCREENSHOTS-0.6.0.md) for expanded views of all four networks and the [capture receipt](docs/images/0.6.0/screenshot-receipt.json) for the synthetic workload. Third-party notices remain in [third-party-licenses](third-party-licenses/).

## Data and licensing

Back up your entire `data/` directory privately. Per-document version history retains private text. New full-table historical snapshots of classifications and relations are disabled; current tables still save normally. Existing historical files are not automatically deleted by this release. This publication tree excludes personal Vault, knowledge, skills, history, source exports, evidence, logs, credentials, private configuration and prior Git history.

Venus is licensed under the [MIT License](LICENSE), copyright (c) 2026 NowYouKnowShen. You may use, modify, and redistribute the software subject to its notice requirements. It is provided without warranty. Third-party components retain their own licenses and notices in [third-party-licenses](third-party-licenses/); see [license details](docs/LICENSE-STATUS.md). The project license does not grant rights to private user material or third-party content you import.

## Community

See [Contributing](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), [Security](SECURITY.md), and [Support](SUPPORT.md). Use the [bug and feature templates](https://github.com/shenhang24/venus/issues/new/choose) for public reports. This is an early-stage personal project with best-effort maintenance and no guaranteed response times. Share only synthetic examples and redacted diagnostics; never post private Vault content or credentials.

Keeping original material, sources and relationships can allow a stronger, interface-compatible analyzer to improve organization later, even if the application stays the same. This requires a deliberate analyzer change and is not an automatic upgrade or a guarantee of accuracy.

## Your knowledge, under your control

AI-generated summaries and classifications can be incomplete or incorrect. Venus makes them visible and editable; it does not make the underlying model infallible. Building a trustworthy knowledge base still requires your review and corrections. Models can misunderstand sources, omit details, or assign the wrong categories and relationships. Reliable knowledge takes time and effort to review and maintain. Storage, display and interface bugs are software issues, not explanations to attribute to the model; Venus itself can also have defects.

You can manually edit Vault, knowledge and skill text, correct classification tags, and revise the evidence and explanation of relationships; these controls are not reserved for AI. Remove unwanted text within a document or individual category-tag rows, and save your corrections. Whole-document and individual-link deletion are not exposed by the checked UI/API; hiding a record is not deleting it, and old versions may remain. See the [manual controls and deletion limits](docs/PAGE-TOUR.md#manual-control-and-current-deletion-limits).

Keep file locations, project decisions and changes in the same library so an authorized AI can retrieve them and reduce repeated explanations of paths and background. This depends on recording the relevant details and keeping them current; it is not automatic whole-disk search.

## Optional daily incremental workflow

You can ask Codex to configure a private Venus plugin or CLI workflow that backs up and organizes user-specified, actually accessible conversation exports or local Markdown each day. Ask for deduplication, preservation of original text and source references, and analysis limited to newly added material. This is a configuration request, not a bundled scheduling feature or a guarantee that every integration can reach every source.

Daily execution requires your explicit configuration and authorization, access to the selected sources, and a usable analyzer if extraction is requested. It is not enabled by default and does not grant unconditional access to all ChatGPT history. An external Agent/Harness and scheduler may be needed; configure and test their permissions and behavior first. Existing material should not be reanalyzed merely because the daily workflow runs. Normal model and usage costs still apply to new analysis.

## Credentials

Basic local reading and editing require no model credentials. Codex analysis uses your existing Codex sign-in and account allowance. External model APIs require your own provider credentials; local inference requires your service endpoint and model, with authentication only if your service requires it. Keep secrets outside project files and configure only environment-variable names. Optional remote-connection credentials are not required for local CLI or stdio MCP. See the complete [credential requirements](docs/DEPLOYMENT.md#credentials).

## Architecture and the 0.5.0 update

![Venus program architecture](docs/images/venus-architecture-en.png)

[Architecture and processing boundaries](docs/ARCHITECTURE.md) · [SVG diagram](docs/images/venus-architecture-en.svg) · [Detailed update notes](UPDATE-NOTES-2026-10-19.md)

This release adds independent layer controls and network pause/resume, truthful activity and exception recovery, current-material incremental extraction, and provider usage receipts. The bottom status bar reports returned token counters and the latest request's average output rate, including waiting and transport; it does not claim live streaming throughput. Unavailable counters remain unavailable.

Text fields, editors, dialogs and floating panels now have consistent padding, line spacing and wrapping. Long dialog content scrolls independently while actions stay visible. The [published synthetic dialog example](docs/images/0.6.0/14-import.jpg) uses no personal material. Existing English demo screenshots remain illustrative and may predate these controls.

## 0.7.0: projects and full nebula views

All four directories and networks use evidenced project identities, retaining domains as reference dimensions and leaving uncertain ownership unassigned. Every network displays all nodes by default. Selecting focuses; Fit all frames the full filtered nebula. Short labels remain distance-limited, and relation filters remain under user control. All four networks share thirteen activity colors; main stars use unique membership counts. See the update notes for editable templates, incremental sync, deletion and real connection indicators.

The maintainer estimates this round used roughly one tenth of the older workflow's tokens (about 90% less), due to removing repeated semantic reviews and locally skipping unchanged completed content. This is an informal observation, not a benchmark or guarantee. No model calls were made to validate it.

[Full changes and limitations](UPDATE-NOTES-0.6.0.md) · [15 historical synthetic English screenshots](docs/SCREENSHOTS-0.6.0.md)

The left tool ribbon includes **Start / resume checkpoints** and **Pause all tasks** beside Import Markdown. They control the existing configured extraction runner and independent layer queues, without selecting a new provider. Pause retains saved checkpoints and reports **Pausing** until owned requests exit; an external executor is reported separately and never acknowledged as fully paused. Resume does not reset isolated failures or individually paused files. Controls require the updated backend at its next normal start.

Main-category planets orbit the primary in rows of **4, 8, 16, 32, ...**. Nested satellite and sub-satellite capacities, shared-tour packing, visibility freezing and animation pause rules retain their existing behavior.
