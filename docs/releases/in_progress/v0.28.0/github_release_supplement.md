Neotoma v0.28.0 adds coherent exact-identity reads, explicit planning declarations, safer atomic updates and faster current-state retrieval, together with packaged session-recovery workflows and clearer CLI diagnostics.

## Highlights

- **Distinguish a unique identity from missing or unavailable evidence.** `retrieve_entities` can opt into `read_mode: "exact_identity"` and report singleton, absent, ambiguous or unproved evidence from one authenticated database view.
- **Discover planning levels without guessing from type names.** `schema_definition.planning` declares an instance-defined numeric level and optional read-only marker, with catalog completeness evidence.
- **Keep related corrections consistent with a record you only need to check.** `correct_transaction` accepts compare-only participants whose preconditions are checked atomically with the writing participants.
- **Read current state without replaying ordinary observation history.** List, count-certification and snapshot paths use the rows that decide the answer, while exhaustive history remains available for historical and integrity operations.
- **Recover interrupted agent work with the packaged workflows.** The installable skills now include `continue-session`; `digest` retains its acting default and offers an explicitly read-only report mode.

## What changed for npm package users

### Exact identity reads

- HTTP `POST /entities/query`, MCP `retrieve_entities`, and the generic CLI request operation `queryEntities` accept an optional exact mode. Supply only `read_mode`, one `entity_type`, and one `snapshot_filters` string equality on the schema's sole declared canonical identity field. Use POST so the identity value does not appear in a URL.
- Inspect `exact_identity.state` and `common_view`. A proved singleton includes the owned raw snapshot and field provenance; absent proves no match; ambiguous proves at least two matches. `unproved` means the proof is unavailable or incomplete, never that the identity is absent. The response binds its requested value with a SHA-256 digest rather than echoing that predicate in the scope receipt.
- Proof currently requires an available pinned file-libSQL reader. Unsupported storage, exhausted reader capacity, malformed evidence or exceeded evidence budgets returns unproved rather than an ordinary query result. Public direct SQLite is not positively supported by this mode. Type and field identifiers must be 1–64 lowercase ASCII letters/digits/underscore, beginning with a letter; the value must contain 1–256 Unicode characters without C0/C1 controls.
- Evidence caps remain explicit: 2,500 scoped entities, 10,000 distinct entity/raw-JSON identity facts, 16 candidates and 128 observations per candidate. Repeated identical facts are losslessly deduplicated before the fact cap; raw types, case, collisions and candidate history still matter.
- New exact-read admission remains unavailable while retired native reader work is still alive, including across database-handle replacement. Ordinary routing retains its existing contract. The deadline bounds response/evidence validity; it does not promise immediate native cancellation or a total CPU/physical-scan bound.

### Planning declarations and schema catalogs

- Registration accepts optional `schema_definition.planning = { level: <finite number>, read_only?: <boolean> }`. `update_schema_incremental` and HTTP `POST /update_schema_incremental` accept `planning` alone. `neotoma schemas update <type> --planning '<json>'` exposes that existing versioned operation through the CLI.
- Omitting planning preserves the current declaration. A declaration-only update preserves the other definition fields, identity rules, reducers, row metadata and scope. Numeric ordering is instance-defined; a read-only marker or its omission grants no execution or editing authority. Existing schema-write grants and effect gates still apply.
- MCP `list_entity_types` and HTTP `GET /schemas?summary=true&limit=<budget>&offset=0` expose compact declarations and `registry_coverage`. The CLI equivalent is `neotoma schemas list --summary --limit <budget> --json`.
- A complete census requires an unfiltered authenticated registry result, all rows returned, known matching totals, `version: "1"`, `state: "complete"`, `source: "registry"`, `exhausted: true`, no reasons and valid declarations on every row. A filtered/page-limited result, code fallback, unreadable catalog or malformed legacy declaration is unknown. `planning_error: "invalid_declaration"` exposes invalid legacy marks; it must not be treated as a missing level.

### Compare-only guards and atomic schema updates

- `correct_transaction`, HTTP `POST /corrections/transaction`, and CLI `neotoma request --operation correctTransaction` accept a participant with `changes: []`. The guard must contain at least one declared field in `expected_snapshot`, and another participant must write. The scoped entity identity, type, observation count and expected fields are checked inside the same transaction as the corrections. A stale guard refuses the entire transaction with no writer effect.
- A guard adds no observation or notification. It participates in the idempotency hash: identical retries remain effect-free; changing the guard under the same key is refused. An admitted agent needs the `correct` operation on guard types as well as writer types. Existing all-writer transactions retain their behavior.
- Schema registration and incremental schema changes resolve, merge, register and activate atomically. Concurrent additive updates no longer lose fields; activation selects the exact new row rather than another row sharing its version string. Non-merge reducer settings are preserved. A deactivation failure now aborts the change rather than merely logging a warning.
- Icon generation and schema snapshot export occur after commit and do not escape rollback. Historical `migrate_existing` fragment backfill remains a separate post-commit step; atomic schema metadata does not make that backfill one transaction with registration.

### Retrieval performance and visible details

- Entity-id ordered deep-offset scans seek from the last key instead of repeatedly applying SQL OFFSET to each internal chunk. Visible pagination stays linear in offset; cursor pagination remains the way to avoid that depth cost. Canonical-name ordering retains OFFSET, and the existing cursor contract is unchanged.
- Current list pages, totals, hidden-entity count certification and snapshots read deciding visibility rows and the newest eligible raw fragment per entity/key. New indexes support fragment selection and attached lifecycle-authority checks. Before-cutover fallback cases, legacy fragments, merge tombstones and historical/provenance operations retain their documented exhaustive paths.
- Current-state reads no longer re-check historical rows that cannot decide the current answer. Malformed attached lifecycle authority is still refused. Exhaustive provenance, timeline, as-of and lifecycle-storage verification retain their integrity checks. See [the read-path inventory](https://github.com/markmhendrickson/neotoma/blob/b5738a3872eece72a4ba53417330b92e87bb67eb/docs/performance/history_independent_reads.md).
- A fragment is eligible only when its source still has an observation of that entity. Ties on `last_seen` now choose the greater fragment id instead of scan order. Source-walk trace reasons now apply only to the legacy-fragment path; entity-named fragment read failures use `raw_fragments_unavailable`.
- This release does not fix observation/fragment growth when an unchanged record is re-stored in an otherwise changed batch, and does not compact existing histories. The storage-growth benchmark remains an expected failure.

### CLI setup and diagnostics

- Setup's transport line describes only the Neotoma MCP entries that invocation generated and recorded as written. It explicitly says other entries, including repaired or re-pointed entries, were not checked. It describes each preset's mechanism without printing endpoint, command or environment values.
- The local stdio preset discloses its npm update check unless `NO_UPDATE_NOTIFIER=1`. Setup no longer claims an absence of network activity. This changes reporting, not a general network-isolation guarantee.
- MCP configuration discovery labels `claude_desktop_config.json` as Claude Desktop on supported platforms.
- Failed single and batch relationship writes print the server's refusal code and message when present; otherwise the existing fixed failure message remains. Other response detail is not printed by this formatter.

## API surface & contracts

- OpenAPI and generated types include `ExactIdentityRead`, the opt-in `read_mode`, `PlanningDeclaration` and `SchemaRegistryCoverage`; schema catalog responses expose planning metadata and acquisition evidence. Registration's advertised MCP schema now derives from OpenAPI, including the planning restriction.
- The atomic transaction contract allows an empty `changes` array for guarded participants and documents the required expected fields and at-least-one-writer rule.
- These are changes to existing tools and routes. The existing release candidate's README count predates the newer containing-main changes; no freshly audited total tool/path count is asserted here.

## Behavior changes

- An undeclared `expected_snapshot` field in an atomic transaction now produces `VALIDATION_ERROR` instead of the previous `CONFLICT`. Such requests already failed; callers should correct the invalid field rather than retry it as concurrent modification. Replays also refuse a target whose entity type has changed.
- Exact-mode invalid requests are rejected rather than silently falling back. GET/HEAD entity-list forms cannot carry exact proofs; use POST. Ordinary queries do not certify uniqueness.
- Malformed planning declarations are now rejected. The required migration is described under Breaking changes below.

## Agent-facing instruction changes

- Canonical MCP instructions explain compare-only guards, same-key retry after an uncertain response, and refusal to force a conflict by increasing correction priority. CLI instructions point to the same behavioral contract.
- Retrieval instructions explain exact proof states, request/value bounds, the pinned-reader requirement and that ordinary/unproved queries cannot certify identity. Deep-pagination guidance is condensed while retaining opaque cursor, exhaustion and sort-consistency rules.
- A delivered `[PLANNING DECLARATIONS]` block directs agents to read valid instance declarations and certify a complete registry census. Agents must treat missing/malformed/filtered/fallback evidence as unknown, must not infer levels from type names or encountered task ancestry, and must preserve existing authority/effect gates. CLI references point to this canonical block.

## Plugin / hooks / SDK changes

- The existing packaged skill distribution grows from 12 installable skills in published v0.27.0 to 13 in this source, adding `continue-session`. It binds exact source sessions, reconstructs accepted work and planning ascent, and conditionally recovers a coordinated family only when the accepted scope includes it. Its document fallback remains available where native skill discovery is unavailable.
- The status directory remains in place with invocation name `digest`. Default digest reports, acts on movable work and records its digest; `digest --report-only` performs zero writes, including bookkeeping, and takes no next action. `end` and `where` callers select that read-only mode for verified readouts.
- This is packaged workflow/instruction support. The source and mirror tests do not establish model adherence, live installation, actual compaction or cross-harness recovery.
- Exact-read transport tests exercise the existing SDK HTTP and local transports and both generic CLI payload forms. This release does not assert a new dedicated SDK method or positive public direct-SQLite proof support.

## Security hardening

A manual, provider-less security review of `v0.27.0..b5f59f795` (the release code; later release-branch commits change only release notes) found no cross-tenant or unauthenticated path. Its verdict is with-caveats; the non-gating follow-up negative tests are tracked as issues #2808 to #2811. Static rules reported 0 errors, the protected-routes manifest is in sync and the auth topology matrix passed. See the [security review](https://github.com/markmhendrickson/neotoma/blob/aa1f4cd17849c00bee33a392fdf71f596fcd86cc/docs/releases/in_progress/v0.28.0/security_review.md). Deployed security probes are a later release-completion gate; no new probe report is claimed here.

- Compare-only guards retain authenticated-owner scoping and require correction capability for every participating type. A regression could turn them into cross-scope value probes; service, HTTP and MCP negative tests cover absent, wrong-type, malformed and cross-tenant guards. Release G1–G4 must qualify the full range and G5 must verify the deployed runtime.
- Exact identity reads bind the authenticated owner, refuse user-id overrides, require a coherent pinned view, and return unproved when evidence or worker capacity is unavailable. Identity-bearing request diagnostics are suppressed for exact reads, with ordinary logging controls retained. Cross-owner, malformed-request and worker-settlement tests exercise these boundaries; full-range adversarial review remains required.
- Planning metadata confers no authority; existing per-type schema-write capability checks remain applicable to declaration-only updates. Malformed writes are refused before a new version is stored, and incomplete catalogs cannot certify a planning census. Scope, preservation, malformed-input and transport-parity tests cover these contracts.
- Opt-in legacy MCP identifier timing requires both `NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_HEADER` and `NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_TITLE_PREFIX`, a validated single trace header, the configured primary bearer and a narrowly qualified lookup. It records dispatch/completion/header/finish-or-close timing under `mcp_identifier_lookup_timing`, without the identifier itself. It is disabled when configuration/request qualification fails, does not change response behavior and is not a general server-latency measurement.
- This release adds repository documentation for the already published [GHSA-9xrf-c4rq-h4gw](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-9xrf-c4rq-h4gw), fixed in v0.27.0. The advisory was published on November 4, 2026; v0.28.0 is not its first disclosure or fixing version. See [the advisory and operator actions](https://github.com/markmhendrickson/neotoma/blob/b5738a3872eece72a4ba53417330b92e87bb67eb/docs/security/advisories/2026-11-04-peer-sync-and-agent-grant-scope.md). Operators upgrading from before v0.27.0 should also review that release's peer/grant migration guidance.

## Docs site & CI / tooling

- Localized legal Markdown routes bind to the intended legal source page; canceled fallback continuations stop before acting on the abandoned iframe. The legal text itself is unchanged.
- Inspector bundled-docs footer links point FAQ to its bundled page and include TypeScript and Python SDK entries. The 404 page's Go home button retains readable label contrast in light and dark mode.
- Install and observation documentation reflects v0.27.0 corrections. The obsolete limitation that an ordinary write can replace a correction is removed. Candidate docs identify v0.28.0 while the public install pin continues to follow the currently published package.
- CI contract selectors include correction parity and compare-only MCP transport; acquisition checks include deep-offset scanning; the history-length read benchmark and planning surface/registration contracts run in the existing lanes. Test catalogs and generated OpenAPI types are updated.

## Internal changes

- File-libSQL pinned-reader lifetime tracking preserves custody across handle replacement and settlement. New current-state readers centralize bounded visibility and eligible-fragment acquisition.
- The DB reader-pool saturation warning now names the queued statement shapes.
- Test-only corrections assert `entity_version` and `replayed` in HTTP/MCP correction parity and `fallbackReason: "embedding_unavailable"` when semantic embedding generation returns null. These do not claim new semantic-search behavior.

## Tests and validation

- Existing CI run [43173724960](https://github.com/markmhendrickson/neotoma/actions/runs/43173724960) passed all ten jobs for the tested merge `6c523b79db6ad59cdaa5c5c9e814e8cc8666d41d`: baseline, contract parity, security gates, frontend, site export, graph-render smoke, agentic evals, replay scenarios, combined evals and Python SDK. The baseline log proves checkout of that merge and records the native compiled schema gate's 22 invocations.
- The contract lane passed its history-length read regressions and current selectors; security CI passed classifier/static-rule/manifest/auth-matrix steps. Those results do not replace the release-specific full-range adversarial security and test-coverage review artifacts or authorize release execution.
- Committed behavior tests cover guarded apply/refusal/replay without growth, schema concurrency/rollback/post-commit effects, planning declaration-only round trips and preservation through HTTP/MCP/built CLI, malformed registration hints/no-write outcomes, exact identity snapshots/provenance/owner isolation/unavailable evidence across transports, and actual native worker settlement. Read-path tests compare bounded/exhaustive answers and cover fragment eligibility and lifecycle modes.
- Performance evidence is synthetic. The committed history-length benchmark holds equal entity populations with 1 versus 500 observations to its unchanged 2x read bound and observation-row criterion in both lifecycle modes. It deliberately retains an expected failure for re-store storage growth. Production performance and a served release effect are not established.
- Release prep ran a manual, provider-less security review and a local full-suite run on `b5f59f795`: 8566 tests, 18 failures, all of which also fail on v0.27.0. These are recorded in the [security review](https://github.com/markmhendrickson/neotoma/blob/aa1f4cd17849c00bee33a392fdf71f596fcd86cc/docs/releases/in_progress/v0.28.0/security_review.md) and the [test coverage review](https://github.com/markmhendrickson/neotoma/blob/aa1f4cd17849c00bee33a392fdf71f596fcd86cc/docs/releases/in_progress/v0.28.0/test_coverage_review.md), which also list the gaps, the frontend and Playwright suites not run locally and the unverified CI state of the final head. No deployed probe was run; the final publication commit remains to be established. The older 403-of-404 local release-prep result describes the earlier scope and is not presented as full-range validation.

## Breaking changes

**Reserved planning declaration shape.** `schema_definition.planning` was previously accepted as opaque metadata. For example, `"planning": { "level": "high" }` now fails schema registration with HTTP `400 VALIDATION_INVALID_FORMAT` and structured `details.hint`. New declarations must be exactly `{ "level": <finite number>, "read_only"?: <boolean> }`; extra declaration keys, non-finite/non-numeric levels and non-boolean read-only values are invalid. The hint is: `Use planning: {"level": <finite number>, "read_only"?: <boolean>}, or omit planning to preserve the current declaration.` Migrate custom opaque metadata to another declaration name, supply a valid numeric planning mark, or omit planning when updating a schema whose existing declaration should be preserved. Existing definitions without planning remain valid. Malformed legacy declarations are exposed by catalog `planning_error`; they cannot support a complete planning census. See [the compatibility record](https://github.com/markmhendrickson/neotoma/blob/b5738a3872eece72a4ba53417330b92e87bb67eb/tests/contract/legacy_payloads/CHANGES.md).

This is a minor release from v0.27.0 under the project's 0.x validation-tightening policy. No additional version change is proposed by these notes.
