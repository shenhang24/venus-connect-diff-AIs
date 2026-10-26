# Venus — Your Personal Galaxy

A local, editable memory workspace for your projects, source material and AI tools.

**Current version: [0.8.0](https://github.com/shenhang24/venus-connect-diff-AIs/releases/tag/v0.8.0).** [What's new](UPDATE-NOTES-0.8.0.md) · [中文简介](docs/README-zh.md)

## From a source to reusable context

Import material you choose. Venus can ask your configured, supported analyzer or Codex runner to organize it, preserve the result, show its actual state and continue from the saved checkpoint. An enabled job runs inside Venus; a chat does not have to keep telling it to continue.

You remain in control: pause, resume, reset a task or rerun an explicit scope. Saved material and spent correction budgets remain traceable. If processing fails, the relevant item shows the reason and available recovery action.

Venus is a knowledge tool, not a model. A supported runner, valid access and an explicitly enabled workflow are still required. It does not automatically fetch every conversation or connect every AI provider.

## Four layers, four purposes

| Layer | What it keeps | A generic example |
| --- | --- | --- |
| **Vault** | Original Markdown and source references | Your imported workshop notes |
| **AI Knowledge** | Searchable facts, experience and relationships grounded in sources | A tested way to diagnose a failed build |
| **AI Skills** | Reusable complete Prompts: shared settings, criteria, steps, boundaries and task-specific variants | A review Prompt that keeps the same rubric while changing the document |
| **Concept Cloud** | Human-readable overviews and complete topic pages, with the nature of each claim kept clear | A project overview connecting decisions, ideas and open questions |

All four use **semantic domain → project → content/subtopic**. A project may appear under several domains through the same stable reference; that does not duplicate its material. Fine labels and source links stay available. Pending and uncertain assignments remain visible.

You can update organization rules and layer templates as your needs change. This is controlled configuration and bounded derived-content maintenance, not unlimited self-modification. Retrieved content never overrides current instructions or permissions.

## Networks and reading

Read full content pages or explore separate spatial networks with orbit, zoom, focus and relation filters. Hiding a relation does not delete it. Large, dense scenes can be CPU-heavy; animation performance depends on the workload and hardware.

![Current English knowledge network](docs/images/0.8.0/01-knowledge-network.jpg)

[Current English screenshot tour](docs/SCREENSHOTS-0.8.0.md): seven actual application views, using synthetic text and anonymized geometry. Processing is disabled in the demonstration; the paused network is not a performance benchmark.

## Start locally

Requires Node.js 20+. Windows launchers are provided; native operation on other operating systems is not verified.

~~~powershell
npm ci
npm run build
$env:VENUS_ANALYSIS = '0'
node src/supervisor.mjs
~~~

Open http://127.0.0.1:10001. Keep one writer per data directory and do not replace another application's listener. Import a synthetic first source from examples/sample.md. No personal database or daily collection schedule is shipped.

Configure a supported analyzer before enabling processing. Analysis-off mode still lets you read and edit existing material. The service must stay running for live retrieval and enabled background work.

[Deployment](docs/DEPLOYMENT.md) · [Integrations](docs/INTEGRATIONS.md) · [Page tour](docs/PAGE-TOUR.md) · [Four-layer examples](docs/FOUR-LAYERS.md)

## Bring context to your AI

The documented read-only CLI, HTTP and MCP interfaces can return selected knowledge and source references to an authorized caller. The caller must actually use that context. This does not train model weights, guarantee permanent memory or prove that your current chat is already connected.

~~~powershell
node codex-plugin/query.mjs "Example"
node codex-plugin/readonly-mcp.mjs
~~~

Provider adapter availability is not the same as verified live access for every provider. Authorize each connection separately. Binary attachments and inaccessible history may remain incomplete.

## Usage and privacy

> [!WARNING]
> Long histories and large context windows can consume substantial subscription allowance or incur API charges. Choose your model and reasoning settings, start with a small sample and monitor your budget. Local processing also needs hardware and time. If you currently have extra Codex allowance, it can be a useful window for organizing a long backlog; no promotion or expiry date is promised here.

Keep your database and backups private. A configured cloud analyzer receives the relevant input; an authorized retrieval client receives requested context. The author does not need your private library. Summaries and tags depend on the material and model and can be wrong.

[Privacy and data flow](docs/PRIVACY.md) · [Network behavior](NETWORK-BEHAVIOR.md) · [Security](SECURITY.md)

## Validation and license

The 0.8.0 release passed 525 JavaScript tests, with separate focused and Python checks. The current documentation and English-control update passed 526 JavaScript tests. The release workflow validates release packages. These checks do not certify every library, provider or hardware configuration, and finite AI evaluations do not establish whole-library quality.

MIT licensed; see [LICENSE](LICENSE), [third-party notices](THIRD-PARTY-NOTICES.md) and [changes](CHANGELOG.md).
