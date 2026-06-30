Five fixes from an external evaluator stress-testing Neotoma as a deterministic audit ledger in offline/local mode: two new store-time warnings that surface silent data-integrity footguns, a corrected store response on deduplicated replays, documented migration guidance for the `observation_source` enum, and a local-transport fix so `neotoma issues create` works offline without a bearer token.

## Highlights

- **You now get warned before a silent overwrite under `highest_priority`.** Two new non-blocking `store_warnings` fire at write time: `SOURCE_PRIORITY_ESCALATION` when an unprioritized write (the default `source_priority=100`) could outrank an explicit lower priority, and `NULL_CLEARED_FIELD` when an incoming `null` actually clears a prior non-null value. Both surface footguns that were previously invisible until you noticed the data had changed.
- **Deduplicated stores return the real snapshot, not `{}`.** A verbatim re-store now returns the populated `entity_snapshot_after` plus a `deduplicated: true` marker, instead of an empty object, so replay-driven pipelines can trust the store response without a follow-up `getEntitySnapshot`.
- **`neotoma issues create` works offline.** Local requests to `/issues/submit` and `/issues/add_message` no longer require an API bearer token, so file-an-issue works in offline/local SQLite mode the same way `gh issue create` does — without weakening auth for any remote caller.
- **`observation_source` migration is now documented and the CLI matches the API.** The v0.17→v0.18 enum restriction is now in the release notes and CLI help with a concrete mapping (custom labels move to `data_source`), and the CLI accepts the full enum including `sync`, ending a silent CLI/API drift.

## What changed for npm package users

**Runtime / data layer**

- **`SOURCE_PRIORITY_ESCALATION` store warning (#1838).** When a write omits `--source-priority` (defaulting to `100`) and targets a field whose schema uses the `highest_priority` strategy, the store response now includes a `SOURCE_PRIORITY_ESCALATION` warning. The default `100` beats any explicit priority `1–99`, so an unprioritized write could silently overwrite a trusted lower-priority value; the warning names the field and the effective strategy. Behavior is unchanged — this is warn-only. The default value of `100` is intentionally **not** changed (that would be breaking). Mitigation documented in `docs/subsystems/conflict_resolution.md`: pass an explicit `--source-priority` on every write that participates in a `highest_priority` field.
- **`NULL_CLEARED_FIELD` store warning (#1839).** Under `highest_priority`, a `null` is an explicit tombstone (only `undefined` is dropped). When a `null` is the resolved winner and actually clears a prior non-null value, the store response now emits a `NULL_CLEARED_FIELD` warning. Clearing semantics are unchanged; if you do not want a source to be able to clear a field, have it omit the field rather than send `null`. The warning fires only when the field genuinely clears (the HTTP path persists the typed `null`; the MCP path strips typed `null` to `raw_fragments` and retains the prior value, so no false warning there).
- **Deduplicated store response now carries the snapshot + a marker (#1840).** Re-storing a content-identical observation (same entity, fields, and priority — which the CLI keys via a deterministic content hash) trips the idempotency-replay path. That path previously rebuilt the response without `entity_snapshot_after`, so callers saw `{}` even though the persisted snapshot (and `getEntitySnapshot`) was correct. The response now reads the persisted snapshot into `entity_snapshot_after` and sets `deduplicated: true`. No storage semantics changed; observation count still stays at 1 on replay.

**CLI**

- **`observation_source` CLI/API parity + migration guidance (#1841).** The CLI enum now matches the API exactly: `sensor`, `llm_summary`, `workflow_state`, `human`, `import`, `sync` (the CLI previously omitted `sync`, which the API and OpenAPI already accepted). The invalid-value error and `--observation-source` help text now list the valid values and direct custom v0.17 labels (e.g. `cboe_live`, `stale_cache`, `computed_greeks`) to the free-form `data_source` field. See **Breaking changes** for the migration.
- **`neotoma issues create` / `add_message` work in offline/local mode (#1842).** These commands post to the API submit endpoint, which gates on a bearer token, while `neotoma issues auth` only configures `gh_cli` (GitHub-mirror auth). Local/offline users hit `AUTH_REQUIRED`. Local requests to `/issues/submit` and `/issues/add_message` now resolve to the local user without a bearer, matching how local entity reads already work. Remote callers are unaffected and still require auth.

## API surface & contracts

No OpenAPI route or schema changes. `observation_source` already declared the full enum (including `sync`) in `openapi.yaml`; this release brings the CLI validator into line with it. The store response gains an optional `deduplicated` boolean and reliably populated `entity_snapshot_after` on replay; both are additive. The two new `store_warnings` codes (`SOURCE_PRIORITY_ESCALATION`, `NULL_CLEARED_FIELD`) are additive entries in the existing `store_warnings` array.

## Behavior changes

- Stores that would silently escalate priority or clear a field via `null` now carry a `store_warning`. The underlying merge result is unchanged; only the response gains a warning.
- A deduplicated store returns the current snapshot and `deduplicated: true` instead of an empty `entity_snapshot_after`.
- Local/offline `issues create` and `issues add_message` succeed without a bearer token. Remote behavior is unchanged.

## Fixes

- **#1838** — default `source_priority=100` was an undocumented silent trust-escalation footgun. Documented in `docs/subsystems/conflict_resolution.md` + CLI help; new `SOURCE_PRIORITY_ESCALATION` store warning. (PR #1853)
- **#1839** — `highest_priority` reducer cleared a field on a winning `null` with no warning. New `NULL_CLEARED_FIELD` store warning, fired only when the field actually clears; clearing semantics unchanged. (PR #1854)
- **#1840** — store response returned an empty `entity_snapshot_after` on a deduplicated observation replay. Response now populates the snapshot and adds a `deduplicated` marker; root cause was the CLI content-hash idempotency-key tripping the replay early-return in `src/server.ts`. (PR #1852)
- **#1841** — `observation_source` enum restriction (v0.17→v0.18) was undocumented and the CLI rejected `sync`. CLI now matches the API; migration to `data_source` documented in CLI help, the error message, and the migration docs. (PR #1851)
- **#1842** — `neotoma issues create` failed with `AUTH_REQUIRED` on local/offline installs. Local-loopback trust extended to `/issues/submit` + `/issues/add_message`. (PR #1850)

## Tests and validation

- `tests/integration/store_source_priority_ignored_warning.test.ts` — escalation warning on both MCP and HTTP store paths (#1838).
- `tests/unit/null_cleared_field_warning.test.ts` + `tests/integration/store_null_cleared_field_warning.test.ts` — `NULL_CLEARED_FIELD` warning fires only on a genuine clear (#1839).
- `tests/integration/store_dedup_snapshot_after.test.ts` — identical re-store returns `deduplicated: true` + a populated `entity_snapshot_after` equal to `getEntitySnapshot`, observation count stays 1 (#1840).
- `tests/unit/cli_observation_source_flag.test.ts` — CLI accepts `sync`; invalid value's error includes the `data_source` migration hint (#1841).
- `tests/integration/issues_local_auth_fallback.test.ts` — local `/issues/submit` with no bearer creates an issue; a remote request with no bearer still returns 401 `AUTH_REQUIRED` (#1842).
- `docs/testing/automated_test_catalog.md` — regenerated.
- All PRs passed the `security_gates` and `baseline` CI lanes before merge.

## Security hardening

This release is **security-sensitive**: `npm run security:classify-diff -- --base v0.18.3 --head HEAD` reports `sensitive=true` because the #1842 fix touches `src/actions.ts` (the route principal resolver).

- **Surface affected:** the auth gate for `/issues/submit` and `/issues/add_message`. The change adds a local-loopback fallback so a **local** request (per `isLocalRequest`) with **no** `Authorization: Bearer` header resolves to the local dev/sandbox user instead of returning `AUTH_REQUIRED`, scoped to exactly those two issue-write routes via a dedicated allow-list helper.
- **Exposure shape if a regression had landed:** if the fallback were reachable by remote traffic (e.g. via a spoofable `isLocalRequest`) or matched routes beyond the two issue-write paths, an unauthenticated remote caller could write issue entities. The change is gated on all three conditions simultaneously (local request AND no bearer AND one of the two exact routes), and the remote-no-bearer path still returns `AUTH_REQUIRED`.
- **Gate that catches this class going forward:** G1 (`security:classify-diff`) flags `src/actions.ts` changes for review; G2 (`security:lint`, including the `local-dev-user-widening` rule) passed with 0 errors; G3 (`security:manifest:check` + `test:security:auth-matrix`) confirmed the protected-routes manifest stayed in sync and the auth matrix passed. A dedicated negative test asserts a remote/untrusted request with no bearer is still rejected.
- **Operator action:** upgrade to v0.18.4. No token rotation required. Operators running Neotoma behind a reverse proxy should confirm their proxy does not cause `isLocalRequest` to return true for external traffic (see the security review for the trust-boundary analysis).

Security review artifact: [docs/releases/in_progress/v0.18.4/security_review.md](security_review.md) — adversarial review of the #1842 local-loopback change.

## Breaking changes

No new breaking changes are introduced in v0.18.4. This release **documents** a breaking change that already shipped in v0.18.x:

- **`observation_source` is a fixed enum since v0.18.0 (#1841).** In v0.17, `--observation-source` accepted arbitrary strings; v0.18.x restricts it to `sensor`, `llm_summary`, `workflow_state`, `human`, `import`, `sync`. This was previously undocumented.
  - **Before/after:** `neotoma store … --observation-source cboe_live` succeeded in v0.17; in v0.18.x it errors with `Invalid --observation-source "cboe_live". Expected one of: sensor, llm_summary, workflow_state, human, import, sync.`
  - **Error/hint:** the error message now appends migration guidance directing custom labels to the `data_source` field.
  - **Migration:** map your custom value to the closest enum member (`import` is the safe fallback for ETL/ingestion sources) and store the original label in the free-form `data_source` field. Example: `--observation-source sensor --data-source cboe_live`.

The two new `store_warnings` and the additive `deduplicated` response field do not tighten any request shape and are not breaking. Patch bump is correct per SemVer.
