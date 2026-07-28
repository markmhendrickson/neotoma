# v0.18.9 — release supplement

## Highlights

Deep pagination on `queryEntities` no longer blocks the server. A client paginating all contacts with `include_snapshots:true` at `offset:1300` froze a hosted instance for 4.8–7.5s per call — `/health` and every concurrent request stalled for the duration. Pagination is now keyset-based: each page seeks past the previous page's last row instead of re-scanning to it, so cost is constant at any depth.

## What changed for npm package users

Nothing breaks for callers paginating shallowly (the overwhelming majority). Two request shapes that were previously accepted are now rejected — see **Breaking changes**. Both rejections ship a structured `details.hint` carrying the migration path, and both are covered by legacy-payload fixtures under `tests/contract/legacy_payloads/v0.18.x/`.

## API surface & contracts

- **New**: `cursor` request param and `next_cursor` response field on `POST /entities/query`, its `GET /entities` alias, MCP `retrieve_entities`, and CLI `entities list --cursor`. The cursor is an **opaque** base64url token — pass it back verbatim; its encoding is an implementation detail and may change.
- **New error code**: `INVALID_CURSOR` (400, non-retryable) — declared in `openapi.yaml` and the canonical table in `docs/subsystems/errors.md`. Surfaces as `InvalidParams` on MCP with the same structured envelope on `data`.
- **Deprecated**: `offset` on the entity-query surface. Still accepted, now bounded (see below).
- `POST /entities/query` gained a `400` response declaration; it previously declared only `200`.

## Behavior changes

- Cursor pagination is scoped to the default `sort_by=entity_id`. Other sorts and any `search` keep offset paging.
- A cursor minted under one `sort_order` is rejected if replayed under another, rather than silently seeking the wrong direction.
- `sendValidationError` now lifts a structured `hint` from the first Zod issue that carries one to the flat `details.hint` slot. Zod nests custom issue metadata under `params`, so a hint previously landed at `details.issues[].params.hint` where no client — nor the legacy-payload replay harness — reads it.

## Fixes

- `queryEntities` deep-offset pagination was O(offset): the chunked scan re-read and discarded `offset` visible rows in JS per page, with a `getDeletedEntityIds` round-trip per chunk, on a synchronous SQLite driver sharing the single Node event loop (#1943).
- Added index `observations(entity_id, source_priority, observed_at)` so deleted-state resolution is an index seek rather than a full table scan.

## Tests and validation

Cursor pages tile a listing with no gaps or duplicates and match the equivalent offset paging exactly; deep pages stay ~constant time; the `INVALID_CURSOR` envelope is asserted over a real HTTP round trip and a real MCP client/transport pair. Both envelope tests were verified as genuine gates — disconnecting either catch branch fails the matching test. Both legacy-payload fixtures were verified likewise: removing the hint lift fails them with `saw hints: []`.

**Known gap (disclosed):** the concurrency regression test does not reproduce the production freeze at its fixture scale. Measured with the keyset seek reverted: 10.7ms at `offset:0` vs 13.4ms at `offset:1300` — flat, and ~400x under the test's own 200ms bound. The pre-fix cost only materializes when the underlying tables are large in absolute terms (the reported instance had ~100k+ observations behind that listing). Tracked as #1947 rather than tuning a bound to manufacture a passing assertion. The test still guards that the cursor path answers a deep page and serves a concurrent `/health` over real HTTP.

## Security hardening

See `security_review.md` in this directory. The diff classifier labels this release `sensitive=true` (touches `openapi.yaml` and `src/actions.ts`); the review records no new authz surface, no PII in the cursor token, and no auth-scope change.

## Breaking changes

Two previously-accepted request shapes on `POST /entities/query` and MCP `retrieve_entities` now return `400 VALIDATION_INVALID_FORMAT`. Both are validation tightenings per `docs/developer/github_release_process.md` § Validation tightening is breaking.

1. **`offset` above 2000 is rejected.** Deep offset paging is O(offset) and blocks the event loop — the defect this release fixes. The cap sits deliberately above the reported repro depth (`offset:1300`), so the exact client that triggered the bug keeps working on the legacy path while the unbounded case is closed.
   - *Migration*: drop `offset`; read `next_cursor` from each response and pass it back as `cursor`. Constant-time at any depth.
   - *Hint*: shipped on the rejection (`ERR_OFFSET_TOO_DEEP`). *Fixture*: `v0.18.x/entities_query_deep_offset`.

2. **`limit` above 500 is rejected while `include_snapshots` is true.** Each snapshot hydrates synchronously on the event loop, so an unbounded page monopolized it — the same freeze class reached by page size rather than depth.
   - *Migration*: request ≤500 per page (walk the rest with `cursor`), or set `include_snapshots:false` — the lightweight projection is not capped.
   - *Hint*: shipped on the rejection (`ERR_SNAPSHOT_PAGE_TOO_LARGE`). *Fixture*: `v0.18.x/entities_query_large_snapshot_page`.

Neither tightening affects a caller paginating shallowly with default page sizes.
