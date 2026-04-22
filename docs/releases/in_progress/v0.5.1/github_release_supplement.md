v0.5.1 started as a verification-follow-up patch to v0.5.0 and also folds in inspector/read-model enrichments that were already in the working tree before tagging. It adds uniform tenant-scoped reads (a `NEOTOMA_USER_ID` env var and missing `--user-id` flags), surfaces store idempotency replays explicitly with a new `replayed` response field, adds a structured upgrade hint when the legacy `attributes`-nested payload shape hits `ERR_STORE_RESOLUTION_FAILED`, lets `neotoma ingest` auto-upload file bytes over remote/tunneled transports, ships a headless production deployment guide in `install.md` plus a one-line CLI advisory so `neotoma api start --env prod` on a source checkout is no longer silent about routing through the tsx watcher, and expands inspector-facing HTTP responses for recent conversations, recent activity, and entity/relationship detail views.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, `neotoma ingest`, …)**

- New `--user-id` flags on `neotoma entities get` and `neotoma stats` (the two read verbs that were missing them); existing read verbs continue to honor `--user-id`.
- New `NEOTOMA_USER_ID` environment variable with `flag > env > default` precedence, joining `NEOTOMA_API_ONLY` and `NEOTOMA_OFFLINE` in the CLI's transport/preAction layer. Read verbs (`entities list/get/search/find-duplicates`, `observations list/get`, `relationships list`, `timeline list/get`, `schemas list`, `sources list`, `stats`, `recent`, `memory-export`) all resolve their effective user id through the same helper so tenant scoping is uniform. Empty/whitespace env values are rejected so shell expansion mistakes surface immediately instead of silently falling through to `LOCAL_DEV_USER_ID`.
- `neotoma store` and `neotoma store-structured` now print a stderr warning in commit mode when the response reports `entities_created=0` and the server did not flag the call as an idempotency replay (`replayed: true`) and no existing entities were matched/updated. This catches the v0.5.0 "silent zero-commit" verification symptom regardless of its underlying cause, and suggests the three usual culprits (flatten `attributes`, check user scope, check registered schema).
- `neotoma ingest` grows two new flags: `--source-upload` forces byte upload regardless of transport; `--source-content <inline>` skips the filesystem entirely and base64-encodes the provided string. By default, `ingest` now auto-detects non-localhost base URLs (tunnel / remote production) and switches from `file_path` to `file_content` so tunneled client/server topologies no longer fail with `ENOENT` when the server can't read the client's filesystem. Localhost / offline callers keep `file_path` to avoid the base64 memory hit on large blobs. The CLI enforces a ~7.5 MB upload cap (chosen against the server's 10 MB JSON body limit, accounting for base64 overhead) and aborts with a clear error before network I/O when exceeded.
- `neotoma api start --env prod` on a source checkout now emits a one-line stderr advisory before spawning the tsx watcher (`dev:prod`) to make the routing visible and point operators at the supervised systemd recipe. Suppressed under `--output json` to preserve machine-readable output. Does not fire on `--env dev`, on installed-package checkouts without source watch scripts, or on the tunnel path.

**Runtime / data layer**

- `POST /store` (`StoreStructuredResponse`) now carries an explicit `replayed: boolean` field. `true` on the existing-source idempotency-replay branch (same `(user_id, idempotency_key)` as a prior commit); `false` on the fresh-write branch. Every response path sets the field explicitly so clients can rely on it rather than inferring replay state from other shape signals. Entity hash, idempotency keying, and observation/source determinism are unchanged.
- `ERR_STORE_RESOLUTION_FAILED` issue objects gain an optional `hint: string` field. The server populates it with structured upgrade guidance when `CanonicalNameUnresolvedError.seen_fields` is exactly `{"attributes"}` or `{"entity_type", "attributes"}` — i.e. a caller is still sending the pre-0.5.0 `attributes: { … }` wrapper. The hint text is schema-guidance only (no caller payload values are echoed back) and is absent for unrelated unresolved-name scenarios.

**Shipped artifacts**

- `openapi.yaml` declares: `user_id` as an optional query parameter on `GET /entities/{id}` and `GET /stats`; `replayed: boolean` on `StoreStructuredResponse`; new `StoreResolutionIssue` (with `hint`) and `StoreResolutionErrorEnvelope` schemas; `StoreResolutionErrorEnvelope` wired to the `400` response for `POST /store`. The same contract pass also carries inspector-facing response enrichments already in the tree: extra entity detail metadata (`entity_type_label`, `primary_fields`, `created_at`), richer relationship expansion fields, and the `GET /recent_conversations` operation. `src/shared/openapi_types.ts` regenerated to match.

## API surface & contracts

- **New response field:** `StoreStructuredResponse.replayed: boolean` (set on every response path — replay and fresh-write).
- **New query params (additive, existing server handlers already honor them):** `GET /entities/{id}?user_id=…`, `GET /stats?user_id=…`. The `user_id` param is optional and is still validated through the existing `getAuthenticatedUserId` gate; it does not widen the existing dev-override surface (only `LOCAL_DEV_USER_ID` auth contexts may pass a different `user_id`; real Bearer-authenticated callers still get 403 on mismatched ids).
- **New error field:** `StoreResolutionIssue.hint?: string` (optional). Emitted today for the `attributes`-nested payload case; the schema allows the same structured hint surface to carry future targeted guidance without another breaking change.
- **Inspector/read-model additions already in the branch:** `GET /recent_conversations`, richer `GET /entities/{id}` response metadata (`entity_type_label`, `primary_fields`, `created_at`), and expanded `GET /entities/{id}/relationships?expand_entities=true` response fields for caller-friendly source/target labels. `contract_mappings.ts` now maps `getRecentConversations` as an HTTP-only infra surface.

## Behavior changes

- **`/store` idempotency replay is now explicit.** Clients that inspected `entities_created_count: 0` as a proxy for replay-vs-failure should switch to the new `replayed` field. The CLI's new commit-mode stderr guard does exactly this: it fires only when `entities_created=0` AND `replayed !== true` AND no entities were matched/updated.
- **`attributes`-nested payloads surface upgrade guidance.** Callers still sending `{"entity_type": "…", "attributes": { … }}` receive a structured `hint` in every `ERR_STORE_RESOLUTION_FAILED` issue pointing them at the flat post-0.5.0 shape and the v0.5.0 release notes. Behavior is still a 400 error; no compat shim (aligns with v0.5.0 R1/R2 strictness).
- **`neotoma ingest` over remote transports changes its request shape automatically.** Non-localhost / non-offline base URLs send `file_content` (base64) + `mime_type` + `original_filename` instead of `file_path`. Localhost and offline callers are unchanged. Force with `--source-upload`; opt out by passing explicit inline content with `--source-content`.
- **`neotoma api start --env prod` is no longer silent on source checkouts.** It still routes through `dev:prod` (tsx watcher) for contributors who rely on hot-reload in `NEOTOMA_ENV=production`, but now prints a single stderr line directing headless-deployment operators at the supervised systemd recipe in `install.md`. The default routing fix itself is deferred to a separate phased plan (v0.5.2 → v0.6.0); v0.5.1 only ships the advisory.
- **Inspector views get richer server-computed payloads.** `record_activity` items now carry typed enrichment fields (`entity_name`, `source_filename`, relationship/entity ids, `group_key`, etc.) so the UI can group or decorate entries without re-querying. `recent_conversations` returns nested conversation → message → linked-entity structures ordered by latest activity. Entity detail responses expose schema-derived labels and primary fields so overview cards can render without duplicating schema-order logic client-side.

## Breaking change notice (retroactive to v0.5.0)

v0.5.0's schema-agnostic strictness (R1/R2) dropped the undocumented `attributes: { … }` wrapper convention that some pre-0.5.0 clients used when building `/store` payloads. Callers wrapping entity fields in `attributes` now receive `ERR_CANONICAL_NAME_UNRESOLVED` instead of silently writing. This was the intended behavior under R1/R2 (the `attributes` wrapper was never a schema-registry concept — just a client convention), but it was not flagged in the v0.5.0 release notes. v0.5.1 retroactively documents the break and adds the structured `hint` above to make the fix obvious.

Before (pre-0.5.0):

```json
{
  "entity_type": "person",
  "attributes": { "email": "a@b.com", "full_name": "Ada Example" }
}
```

After (v0.5.0+):

```json
{
  "entity_type": "person",
  "email": "a@b.com",
  "full_name": "Ada Example"
}
```

## Docs site & CI / tooling

- `docs/developer/cli_reference.md` adds:
  - `NEOTOMA_USER_ID` row in the Runtime overrides table with precedence and empty-value rejection.
  - Store section entries for the new `replayed` flag and the commit-mode stderr guard.
  - New Ingest section documenting `--source-upload`, `--source-content`, the localhost/remote auto-detection heuristic, and the upload size cap.
- `docs/developer/cli_agent_instructions.md` gains matching bullets under `[CONVENTIONS]` (User scope, Ingest source transport, Silent-failure guard), propagated through the anchor-table rule in `.cursor/rules/developer_agent_instructions_sync_rules.mdc` (anchor rows 72b / 72c / 72d; CLI-only). `neotoma cli-instructions check` continues to pass.
- `docs/developer/mcp/instructions.md` keeps the v0.5.1 CLI/MCP parity bullets and also adds human-readable naming guidance for chat artifacts (`agent_message.canonical_name` and `conversation.title`) so stored chat rows present better labels downstream.
- `install.md` adds a new **Production deployment (headless / systemd)** subsection with a tested `neotoma.service` unit file, env var list, the `ProtectSystem=no` / `PrivateTmp=no` caveat for `/usr/lib/node_modules/neotoma` resolution, and a forward reference to `docs/operations/runbook.md`.
- `docs/operations/runbook.md` cross-links back to the new install-md section from its production deployment block.
- `docs/subsystems/auth.md` documents the tenant-scoped-read pathway end-to-end (flag > env > default > `LOCAL_DEV_USER_ID`) and makes explicit that the dev-override surface is not widened.
- `docs/subsystems/errors.md` documents the new `hint` field on `ERR_STORE_RESOLUTION_FAILED` issues.

## Internal changes

- `src/actions.ts`: `storeStructuredForApi` sets `replayed: true` on the idempotency-replay branch and `replayed: false` on every fresh-commit return path; the `CanonicalNameUnresolvedError` → HTTP mapping computes an `attributes`-specific hint via a new `buildAttributesHint` helper and preserves the optional `hint` field through the error envelope.
- `src/cli/index.ts`: new `resolveEffectiveUserId()` helper threads `--user-id` / `NEOTOMA_USER_ID` through every read verb; new `isLocalhostBaseUrl()` helper handles IPv4, IPv6, and hostname-equivalence cases; new `--source-upload` / `--source-content` flags and auto-upload branch on `ingest`; commit-mode stderr guard on `store` / `store-structured`; stderr advisory on `api start --env prod` (background branch is guarded on `outputMode !== "json"`).
- Inspector/read-model services: `src/services/recent_conversations.ts` adds a SQLite-backed recent-conversations aggregator with nested message/entity expansion; `src/services/recent_record_activity.ts` exposes richer typed fields and a server-computed `group_key`; `src/services/entity_queries.ts` adds schema-derived `entity_type_label` and `primary_fields`; `src/shared/contract_mappings.ts` maps the HTTP-only `getRecentConversations` operation.

## Fixes

- **`store --file` vs `store --entities` parity.** With `NEOTOMA_USER_ID` fixed on both calls, both paths create equivalent entities with the same `entities_created_count`, identical entity ids, and the same `replayed` flag on repeat calls with the same `--idempotency-key`. This closes the v0.5.0 "silent zero-commit" report; the root cause was tenant-scoping asymmetry and is resolved by the user-id work above rather than a server-side patch.
- **`relationships create --user-id` now actually scopes the write.** The CLI now forwards `user_id` to `/create_relationship`, and the API resolves it through `getAuthenticatedUserId()` instead of hard-coding the single-user UUID. This restores parity with `relationships list/delete/restore` and fixes cross-layer tenant-scoped relationship flows.
- **`ingest` over tunneled client/server.** The CLI no longer sends a client-side `file_path` the server cannot read; remote transports carry the bytes in the request body.
- **Untracked `src/shared/openapi_types.ts` drift.** Regenerated alongside every `openapi.yaml` change; the contract-parity tests in `tests/contract/` stay green.
- **Inspector payload completeness.** Recent-conversation and relationship/entity-detail responses now include the metadata the UI previously had to re-derive or re-fetch, reducing follow-on queries and avoiding client-side schema-order duplication.

## Tests and validation

- New regression tests:
  - `tests/cli/cli_user_id_propagation.test.ts` — `NEOTOMA_USER_ID` env var, per-call `--user-id` flag override, and flag wiring across every read verb.
  - `tests/cli/cli_store_file_vs_entities_parity.test.ts` — `--file` vs `--entities` produce equivalent results for the same payload; second call with the same `--idempotency-key` returns `replayed: true` on both paths; commit-mode stderr guard is wired on `store` and `store-structured`.
  - `tests/integration/store_resolution_attributes_hint.test.ts` — `ERR_STORE_RESOLUTION_FAILED` includes the `hint` when fields are nested under `attributes`; absent for unrelated unresolved-name cases.
  - `tests/cli/cli_ingest_remote_upload.test.ts` — `isLocalhostBaseUrl` IPv4/IPv6/hostname coverage; auto-upload on non-localhost base URLs; `--source-upload` forces upload regardless of transport; oversize abort before network I/O.
  - `tests/cli/cli_api_start_prod_advisory.test.ts` — advisory text and install.md § reference present on both spawn branches; fires on `--env prod + hasSource + childScript === dev:prod`; background branch is guarded on `outputMode !== "json"`.
- Existing inspector/contract surfaces also ride the release: `openapi.yaml` and `src/shared/openapi_types.ts` now cover `GET /recent_conversations` plus the entity/relationship enrichment fields used by inspector views.
- Full CLI + integration test suite (444 tests) green on the patch branch.

## Breaking changes

- None introduced in v0.5.1 itself. The patch retroactively documents the v0.5.0 `attributes`-nested-payload break (see **Breaking change notice (retroactive to v0.5.0)** above) and adds a structured upgrade hint, but the strict server behavior is unchanged.
