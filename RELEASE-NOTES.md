# Venus 0.8.0 — 2026-10-26 (Australia/Sydney)

## Built-in update and continuation loop

Venus coordinates its enabled local work inside the application: authorized import or update → request to the configured supported analyzer/Codex runner → current processing state → preserved model return → committed result and readback → continuation from the saved boundary. Continuing an enabled job does not require a chat to keep sending reminders, a separate chat heartbeat or a second extraction queue. The selected local runner and its model access must still be available. This release does not connect an additional AI platform or activate a daily collection schedule.

Pause requests drain the current owner and model leases before reporting a complete stop. Resume keeps existing source hashes, original model provenance, results and spent correction budgets. Reset preserves material and results; rerun requires an explicit selected or full scope. Historical failures remain inspectable without permanently labelling a recovered current run as failed. Model returns are saved before a later transport/gate failure; bounded read retries do not turn an uncertain write into a blind duplicate submission.

## Organization and rules you can update

All four directories use the same semantic domain → stable project reference → content/subtopic route. Projects can appear under multiple domains using the same identity, without copying the underlying material. Fine labels, source links, manual membership and deliberate unassignment remain available. Broad domains are model-derived from evidenced context; titles or a repeated keyword alone do not establish project membership. Unknown and pending material remains explicit.

Existing labels have an explicit bounded maintenance operation. Its original return, source proof and used budget persist; failed overlapping input cannot obtain fresh attempts by changing an operation ID. A preserved return can be recovered without another model call. A failed batch can be explicitly deferred while independent work continues, but deferral is not completion. Newly analyzed material can produce navigation metadata in the same analysis return rather than a second model request.

Users can edit and confirm layer templates and adjust organization through the documented controls. New installations receive generic defaults. Upgrades preserve manually confirmed template text, help, revision and active identity. Runtime help is separate from model instructions. Template changes affect subsequent corresponding layer analysis; they do not silently rewrite old content or change the whole-library classifier's separate summary/tag contract. Reorganizing derived views does not move or rewrite source Markdown.

## Four layers, four different jobs

- **Vault:** the original conversation, document or imported text, with source identity and honest missing-material markers. Logical organization helps find it; it is not a replacement summary of the original.
- **AI knowledge:** retrievable facts, experience, judgments and evidenced relationships. Conditions, uncertainty and the source's position remain visible.
- **AI skills:** reusable prompts built from relevant knowledge, shared settings and criteria. A prompt can describe a procedure or combine a stable character/style definition, a selected variant and this request's change. New generation rules require task, inputs, steps, output, applicability and negative conditions. Existing legacy skills are references unless their method-use status supports more; their presence does not certify proficiency or grant execution permission.
- **Concept cloud:** complete pages for people to read project overviews and developing understanding, with a contents list, parent navigation and traceable references. User-provided information, AI inference, suggestions and confirmed conclusions remain distinct.

For a generic example, a source note can describe a release procedure; knowledge records its observed conditions; a skill packages those conditions into a release-check prompt; a concept page explains the project's overall release approach. Alternatively, a synthetic character's stable identity can be combined with the selected violet outfit and a request to add a silver clip, without mixing all outfit variants together. These are illustrations, not claims of automatic error-free composition or visual consistency.

## Directory, reading and network repairs

A global navigation style had affected content breadcrumbs, pushing the directory below a large blank area. The header and content navigation now have separate layout rules, with independently scrolling drawers and readable sidebar counts. Concept pages open as complete reading pages with one title, contents anchors, parent links and collapsed raw reference excerpts; editing remains explicit.

An empty motion-trail buffer could trigger a WebGL byte-length error during initial network loading. Empty/non-empty transitions now always have initialized typed arrays. Relation projection uses an identity map, and shared-tour membership resolves each node's nearest shared ancestor once. Conservative radial indexing retains the original final geometric checks. These changes preserve approved spacing and motion rules. Large complete networks can still be CPU-bound; this is not a high-frame-rate guarantee.

## Retrieval, validation and privacy

The read-only task-context interface accepts 1–6 explicitly selected nodes and returns bounded bodies, source/version identities and method-use boundaries. The caller must include the retrieved content in its actual request. This is not automatic memory injection into every chat or a new connection to every AI platform.

A bounded nine-call study used two technical cases under three context conditions, two navigation calls and one synthetic variant-composition call. The technical checks were 7/10 without context and 10/10 with either original text or selected saved knowledge/skill references. Items were manually selected; equal character caps were not equal tokens. This does not establish skill superiority over original text, automatic retrieval accuracy or whole-library quality. Old skills and existing libraries are not bulk rewritten by installing this release.

Source content, classifications, private project catalogs, credentials, account-specific tunnel values, running checkpoints, operational logs, personal configuration and live-library screenshots are excluded from the public package. Deletion is exercised only with synthetic fixtures during validation. Shared-source results are protected, and stable generated identities/version tombstones prevent the same deleted output from automatic recreation; old records without stable identities have a narrower guarantee.

See [release review](docs/RELEASE-REVIEW.md), [four-layer workflow](docs/FOUR-LAYERS.md), [privacy](docs/PRIVACY.md) and the existing [synthetic screenshot gallery](docs/SCREENSHOTS-0.6.0.md). The screenshot gallery is historical and does not demonstrate every feature or large-library performance in this version.
