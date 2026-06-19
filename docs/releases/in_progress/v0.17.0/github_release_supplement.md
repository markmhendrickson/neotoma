# v0.17.0 Release Supplement

## Summary

v0.17.0 ships four agent-facing capabilities surfaced from a high-volume production integration: a single-call entity-identity resolver, a machine-readable per-release capability delta, discard-by-default high-velocity intake with read-time sightings aggregation, and an embeddable (chrome-less) Inspector graph. All four are additive and backward-compatible — existing callers that pass no new fields behave exactly as before.

1. **`identify_entity_by_signals` — single-call multi-signal resolver (#1603, #1670)** — resolve "is this the same person/company I already have?" in one MCP call. Accepts a set of identity signals (`name`, `email`, `company`, `domain`, `phone`, …) plus optional `entity_type`, and returns the best-match entity (id + medium-density snapshot) with an identity score and `matched_signals`, plus top-N disambiguation candidates. No LLM-invented ids — unknown inputs stay unresolved rather than creating orphans. Lets an agent auto-merge on a high score, ask a human on a medium score, and create-new on a low score without chaining `retrieve_entity_by_identifier` → `list_potential_duplicates` → `retrieve_entity_snapshot`.

2. **Machine-readable per-release capability delta (#1605, #1693, #1694)** — `npm_check_update` gains an opt-in `include_capability_delta` boolean. When true, the response carries `new_tools` / `removed_tools` (string arrays) and a one-line `capability_delta_recommendation` ("upgrade then extend your integration to use: …"), plus a `capability_delta_note` that is present **only** when the delta degraded (unparseable versions or a missing manifest). Sourced from a generated `src/shared/capability_manifest.json` (built by `scripts/generate-capability-manifest.ts`, which walks `vX.Y.Z` release tags — no hand-maintained list). An auto-upgrading agent can enumerate newly added tools after an upgrade in one call. Complements the real-server-version-in-`initialize` work already shipped in #1689.

3. **Discard-by-default intake + `canonical_key` sightings (#1604, #1697)** — two disciplines for high-velocity sources (news/social/firehose) made first-class:
   - **Overflow sink:** `store` accepts an optional `intake: { mode: "graph" | "overflow", reason? }`. Default `"graph"` is today's behavior. `mode: "overflow"` appends the raw payload as a JSONL line to a configured sink (`NEOTOMA_OVERFLOW_SINK`, daily `overflow-YYYY-MM-DD.jsonl`) and returns `{ overflowed: true, sink_path, line_offset }` **without** creating entities/observations — so a firehose never pollutes the graph. If `mode: "overflow"` is used with the env unset, a structured hint is returned (never a silent write or uncaught throw).
   - **Sightings + read-time aggregation:** new indexed `canonical_key` + `sighting_source_id` columns on observations (additive migration via the existing `addColumnIfMissing` pattern). Each sighting is an idempotent row keyed by `{source_id}:{canonical_key}`. `retrieve_entities` gains `collapse_by: "canonical_key"`, which groups rows sharing a key at **read time** into one synthesized result (union of sources, max caller-supplied `significance`, `sightings[]`). Underlying rows are never merged or deleted — dedup is a view, not a write-path merge, so dedup bugs can't corrupt stored data. CI enforces manifest/catalog freshness.

4. **Embeddable Inspector graph — phases 1–2 (#1606, #1698)** — white-label the Inspector graph inside another product:
   - **Phase 1 — `apiBase`-parameterized API client:** an `ApiBaseProvider` / `useApiBase` context and `*WithBase` helpers let Inspector views target an arbitrary API origin instead of assuming same-origin (TanStack Query cache keyed by `apiBase` so multiple origins stay isolated). Zero behavior change when no provider is mounted.
   - **Phase 2 — chrome-less `/embed/graph` route:** renders the graph explorer with no app shell (no sidebar/header), accepts `?apiBase=<url>` and `?node=<id>`, inherits the existing CSS-variable skin tokens (`NEOTOMA_INSPECTOR_SKIN`), and emits `postMessage` on node double-click so a host iframe can react. The normal in-app `/graph` route is unchanged. Entity-list embed and the multi-instance aggregate view remain as later phases of #1606.

## Upgrade notes

- **Fully backward-compatible.** Every new surface is opt-in: `include_capability_delta`, `intake`, `canonical_key`/`sighting_source_id`, and `collapse_by` all default to prior behavior when omitted. The `canonical_key` columns are nullable additive columns — existing rows stay `NULL`.
- **New env var:** `NEOTOMA_OVERFLOW_SINK` (absolute path or directory). Only consulted when a `store` call passes `intake.mode: "overflow"`; unset = overflow disabled (a hint is returned if overflow is requested without it).
- **Embedders:** point an iframe at `/embed/graph?apiBase=<your-api-origin>`; theme via the existing `NEOTOMA_INSPECTOR_SKIN` / `NEOTOMA_INSPECTOR_SKIN_CONFIG` mechanism from v0.16.0.

## Breaking changes

None. This release is additive.
