# v0.15.1 Release Supplement

## Summary

v0.15.1 is a patch release bundling transport, contract, and reducer fixes:

1. **MCP SSE keepalive (#1483)** — the MCP StreamableHTTP `/mcp` GET SSE stream now emits an application-level heartbeat so it survives reverse-proxy and client idle timeouts instead of silently dropping under load.
2. **`retrieve_graph_neighborhood` `entity_id` (#276)** — `related_entities` items now expose the canonical `entity_id`, with the legacy `id` field restored as a deprecated alias.
3. **`merge_array` correction replace (#1541)** — a higher-priority `correct()` on an array-typed `merge_array` field now replaces lower-priority array contributions instead of unioning with them.
4. **`delete_relationship` discovery (#277)** — `delete_relationship` now verifies the supplied `(relationship_type, source_entity_id, target_entity_id)` triple matches a live edge, returning `404` with a discovery hint instead of a silent no-op deletion; `list_relationships` excludes soft-deleted edges by default and gains an `include_deleted` opt-in.

## What changed for npm package users

### MCP `/mcp` SSE keepalive (#1483)

The MCP server holds a long-lived GET SSE stream open for server-initiated messages, but the SDK emits no application-level heartbeat on that stream, and Node's `keepAliveTimeout` only governs socket reuse. A reverse proxy (Cloudflare Tunnel, nginx, ngrok) or the client's own idle timeout could then silently close the idle stream mid-session — the process stayed healthy (`/health` green) but the client lost the Neotoma tool registry ("tools not registered") with no recovery short of a manual disconnect/reconnect.

- The long-lived GET SSE stream now emits a periodic SSE comment heartbeat frame (`: hb\n\n`, default every 25 s), sets `X-Accel-Buffering: no` on the `text/event-stream` response so buffering proxies flush each frame immediately, and enables a bounded TCP keepalive on the socket. Heartbeat frames are SSE comment lines, ignored by clients per the spec, and interleave safely with the SDK's own events. This keeps proxies and clients from treating the stream as idle and silently closing it.
- On by default; no configuration required.

#### New runtime configuration (server process)

Read by the Neotoma HTTP server when it serves `/mcp`. Documented in `docs/developer/cli_reference.md` § MCP / SSE transport tuning.

| Environment variable | Default | Purpose |
|----------------------|---------|---------|
| `NEOTOMA_MCP_SSE_KEEPALIVE_MS` | `25000` | Interval (ms) between SSE comment heartbeat frames on the MCP GET SSE stream. Set to `0` (or any value `<= 0`) to disable the heartbeat; an unset, empty, or non-numeric value uses the default. TCP keepalive on the socket stays enabled regardless (probe delay clamped to `[15s, 60s]`). |

(The pre-existing `NEOTOMA_KEEPALIVE_TIMEOUT_MS` / `NEOTOMA_HEADERS_TIMEOUT_MS` socket-level knobs from v0.13.0 are now also documented in the same table.)

The SDK's `retryInterval` transport option was evaluated and deliberately not used: in SDK 1.29 it only emits an SSE `retry:` field inside the priming event, which is written solely on the POST→SSE path and solely when an `eventStore` is configured. Neotoma configures no event store, and the stream that drops is the standalone GET SSE stream, so setting `retryInterval` would be an inert knob with no runtime effect.

### `retrieve_graph_neighborhood` related_entities now carry `entity_id` (#276)

- Each item in the `related_entities` array exposes the canonical `entity_id`, matching `relationships[].source_entity_id` / `target_entity_id` and every other Neotoma response surface (resolves #276). The raw database `id` column is still present as a deprecated alias with the same value for one minor release; prefer `entity_id` and stop reading `id`.
- This patch also restores the `id` field that v0.15.0 silently dropped from `related_entities` when it renamed `id` → `entity_id` (bundled, undocumented, in the #262 mirror change). Re-adding `id` un-breaks any v0.15.0 caller that depended on the legacy field.

## API surface & contracts

- **#1483:** transport-level only — no `openapi.yaml` surface, no request/response/error fields added or changed.
- **#276:** additive only. `openapi.yaml` declares both `entity_id` (canonical) and `id` (`deprecated: true`) on `related_entities` items; no request or response shape is narrowed and no field is removed.
- **#277:** additive only. `openapi.yaml` declares the `404` `RESOURCE_NOT_FOUND` response on `/delete_relationship` (reusing the existing error envelope and `RESOURCE_NOT_FOUND` code — no new `ERR_*`), documents the discovery flow on `/delete_relationship` and `/list_relationships`, and adds an optional `include_deleted` boolean (default `false`) to the `/list_relationships` request. No request shape is narrowed and no field is removed.

## Behavior changes

- **#1483:** the MCP GET SSE stream emits `: hb\n\n` comment frames (invisible to clients per the SSE spec) and carries `X-Accel-Buffering: no`.
- **#276:** callers reading `related_entities[].entity_id` now receive a value instead of `undefined`; callers still reading `related_entities[].id` continue to receive the same value (now formally deprecated).
- **#1541:** `merge_array` fields are now priority-gated. A `correct()` (or any strictly higher-priority write) on an array-typed `merge_array` field now fully **replaces** lower-priority array contributions instead of unioning with them, so corrections can cleanly reset an array. Two consequences for callers: (1) a top-priority `field: null` correction now clears such a field to `[]`; (2) `provenance[<field>]` / `source_observation_id` for a `merge_array` field now lists only the top-`source_priority` contributing observation IDs, not every observation that ever contributed an element. Same-priority observations still union as before.
- **#277:** `delete_relationship` with a `(relationship_type, source_entity_id, target_entity_id)` triple that does not match a live (non-deleted) edge previously returned a silent success after writing a no-op deletion observation; it now reports a not-found failure with a discovery hint pointing to `list_relationships` for type discovery. The guard is enforced on **both** delete surfaces: the HTTP `/delete_relationship` handler returns `404 RESOURCE_NOT_FOUND` with a `details.hint`, and the MCP `delete_relationship` tool raises an `McpError` (`RESOURCE_NOT_FOUND` in its structured `data`) carrying the same hint text. A correct triple that matches a live edge still deletes and returns success as before on both surfaces. Separately, `list_relationships` now excludes soft-deleted edges by default (both the HTTP handler and the MCP tool), so after a successful `delete_relationship` the deleted edge no longer appears and a caller following the discovery-then-delete flow will not re-delete it into the new not-found failure. Pass `include_deleted: true` to include soft-deleted edges for audit/history.

## Fixes

- #1483 — Neotoma MCP SSE connection drops under load. Added an application-level heartbeat (`: hb\n\n` comment frames), `X-Accel-Buffering: no`, and a bounded TCP keepalive to the MCP StreamableHTTP transport's GET SSE stream so it survives proxy and client idle timeouts without manual reconnection. This is the application-level layer above the v0.13.0 `keepAliveTimeout` fix (#148), which addressed socket reuse but not SSE stream idle. The `NEOTOMA_MCP_SSE_KEEPALIVE_MS` disable knob parses defensively so a literal `0` (or negative) value disables the heartbeat rather than silently falling back to the default.
- #276 — `retrieve_graph_neighborhood` `related_entities` exposed only the raw `id`; now exposes the canonical `entity_id`, with `id` retained as a deprecated alias.
- #1541 — `correct()` on an array-typed (`merge_array`) field unioned the correction into the prior array instead of replacing it; the reducer now priority-gates the `merge_array` union so corrections replace lower-priority arrays.
- #277 — `delete_relationship` required the exact `relationship_type` between two entities but offered no discovery path, and a wrong guess silently "succeeded" by writing a no-op deletion observation for an edge that never existed. Both delete surfaces now verify a live edge matches the supplied triple before recording the deletion: the HTTP handler returns `404 RESOURCE_NOT_FOUND` with a structured `details.hint`, and the MCP `delete_relationship` tool raises an `McpError` whose `data` carries `code: "RESOURCE_NOT_FOUND"` and the same hint, both steering the caller to `list_relationships` for type discovery. (The guard is mirrored into each handler rather than pushed into `softDeleteRelationship`, because the GDPR bulk-deletion path intentionally writes a deletion tombstone for every observed edge.) To make that discovery flow self-consistent, `list_relationships` (HTTP and MCP) now filters soft-deleted edges by default with an `include_deleted` opt-in, so a deleted edge is not re-offered for deletion.

## Tests and validation

- **#1483:** new unit regression (`tests/unit/mcp_sse_keepalive.test.ts`, 16 tests) drives the real `attachMcpSseKeepalive` lifecycle and the pure `parseMcpSseKeepaliveMs` env parser with fake timers, asserting runtime behavior (not source strings): heartbeat frames written only after the event-stream is established; `X-Accel-Buffering: no` injected on `text/event-stream` and never on JSON; no heartbeat written into a non-SSE (JSON-RPC POST) body; bounded TCP keepalive enabled; heartbeat stops and `writeHead` restored on close; the env parse matrix (`undefined`/`""`/`"abc"` → default, `"0"` → 0, `"-1"` → -1, `"5000"` → 5000); an env value of `0` reaches the disable guard and writes no heartbeat; and a one-shot warn when the stream ticks without `X-Accel-Buffering` landing. Satisfies the `docs/architecture/change_guardrails_rules.mdc` requirement that new HTTP runtime-config knobs assert observable runtime behavior.
- **#1483:** existing `/mcp` handler integration coverage (`tests/integration/mcp_invalid_bearer_auth.test.ts`) passes unchanged, confirming the keepalive wiring does not alter the auth/initialize path. `npm run security:classify-diff` → `sensitive=false`; `npm run security:manifest:check` in sync (no new routes added).
- **#276:** extended `tests/integration/graph_neighborhood_pagination.test.ts` with a regression that boots the Express app and asserts every `related_entities` item carries a string `entity_id`, that `id === entity_id`, and that `entity_id` values match the relationship target ids exactly. `npm run openapi:generate` regenerated `src/shared/openapi_types.ts`.
- **#277:** `tests/integration/relationship_delete_discovery.test.ts` boots the Express app and asserts the HTTP discovery flow (list-then-delete, wrong-type `404` + hint, soft-delete filtering, tenant isolation). A companion `tests/integration/relationship_delete_discovery_mcp.test.ts` drives the MCP `NeotomaServer.deleteRelationship` handler directly and asserts a wrong/non-existent triple raises an `McpError` carrying the `RESOURCE_NOT_FOUND` discovery hint (and writes no deletion observation for the bogus triple), a live triple deletes, and re-deleting the removed edge raises the same hint. Verified the MCP test fails without the guard and passes with it, so the two surfaces are now consistent.
- `npm run type-check` clean; `npm run lint` 0 errors (pre-existing `no-explicit-any` warnings only, none in the changed code); `npm run format:check` clean.

## Security hardening

No security-sensitive surface changed by either fix. The #1483 diff classifier returned `sensitive=false`; the change adds keepalive framing on an already-authenticated stream and does not touch auth, proxy-trust, local-dev, public-route, or guest-access surfaces. No advisories opened or referenced.

## Breaking changes

No breaking changes. Re-adding the `related_entities[].id` alias (#276) is additive; the field is now marked deprecated and will be removed in a future minor release after callers migrate to `entity_id`.

The #1541 `merge_array` changes listed under "Behavior changes" are **not** classified as breaking: they correct `correct()` to its documented semantics (corrections "always win"). (a) The provenance-shape change only affects code that walks `provenance[<field>]` / `source_observation_id` for a `merge_array` field on a correction code path — non-correction paths are unaffected, and the documented contract was always "the contributing source(s)", not "every observation that ever touched the field"; callers should walk only the IDs listed and not assume every contributor appears. (b) The null-correction-clears-to-`[]` behavior is a new capability (previously there was no single-call way to clear such a field), not a narrowing of any previously-accepted input. No API contract is narrowed and no field is removed.

The #277 `delete_relationship` change listed under "Behavior changes" is **not** classified as breaking. The prior `200` response was a silent no-op: it wrote a deletion observation for an edge that never existed and deleted nothing, so no caller depended on a useful contract there. The new `404 RESOURCE_NOT_FOUND` makes the existing failure explicit; a correct triple that matches a live edge behaves exactly as before. The HTTP status code observably changed (`200` → `404`) only for the wrong-/unknown-type case, so it is called out here explicitly. The `list_relationships` soft-delete filtering is additive (it removes rows that were never useful deletion targets) and gated by the new opt-in `include_deleted` flag, which defaults to the prior-intent (live-only) view; no request shape is narrowed and no response field is removed.
