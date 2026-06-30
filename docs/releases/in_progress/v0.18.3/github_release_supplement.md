Three connected fixes that make by-reference source storage reachable over the HTTP REST route and stop the Inspector graph viewer from polling in a loop. All three were reported by an external evaluator running Neotoma against a production database.

## Highlights

- **`source_storage: "reference"` now works over `POST /store`, not just MCP.** v0.18.1 added the field to the OpenAPI contract, but the REST handler still read every file into a buffer and stored it inline. `handleStorePost` now branches on `source_storage` and routes the file leg through `storeRawReference`, so a REST reference store copies zero bytes and writes `storage_mode=reference`, matching the MCP route. Fixed in `src/actions.ts`.
- **Combined "file + its entities" reference stores no longer 500.** A `POST /store` carrying `entities[]` and a `file_path` with `source_storage: "reference"` previously failed with `UNIQUE constraint failed: observations.id`. The structured leg's `createObservation` did a blind insert, where the MCP store path already guarded the content-addressed id with an existing-observation check. The REST path now has the same guard and returns the existing observation instead of colliding. Fixed in `src/services/observation_storage.ts`.
- **Inspector graph viewer no longer fires `retrieve_graph_neighborhood` in an unbounded loop.** The viewer mounted TanStack Query with a global `refetchInterval: 5000`, so every graph hook re-polled on a five-second timer (observed as 126+ calls in three minutes against an embedded graph). The three graph hooks now set `refetchInterval: false`, and the embed canvas fills the viewport instead of collapsing. Fixed in `inspector/src/hooks/use_graph.ts` and `inspector/src/pages/embed_graph.tsx`.

## What changed for npm package users

**Runtime / data layer**

- `POST /store` with `source_storage: "reference"` is now honored on both the file-only shape and the combined `entities[] + file_path` shape. No client changes are required; callers already sending `source_storage` over MCP get the same behavior over REST.
- `createObservation` is now idempotent on the REST structured path: re-storing content-addressed-identical observations returns the existing row instead of throwing on the `observations.id` UNIQUE constraint. The existence check is scoped to `(id, user_id)`, so it never reads or masks another user's observation. This matches the long-standing MCP store behavior.

**Inspector**

- The embedded graph (`/embed/graph`) renders once and stays put rather than re-fetching every five seconds. If you embed the Inspector graph, this removes the runaway request volume and the blank-canvas symptom.

**Shipped artifacts**

- `openapi.yaml` — unchanged; `source_storage` was already declared in v0.18.1. No new routes or fields in this patch.
- `dist/` — updated for the changed source files.

## API surface & contracts

No OpenAPI changes. `source_storage` is an existing `StoreRequest` field; this release makes the REST handler actually act on it. Request and response shapes are unchanged.

## Behavior changes

- REST `POST /store` reference stores now copy zero bytes and register the source by path, the same as MCP. Callers that relied on the prior silent inline fallback will now get a real reference source row.
- The REST structured store no longer returns a 500 on a duplicate-content observation; it replays the existing observation. This is a strict robustness improvement and matches MCP.
- The Inspector graph stops periodic background refetching. Open graphs no longer update on a timer; they refetch on navigation and explicit interaction.

## Fixes

- **#1826** — `source_storage: "reference"` was unreachable over HTTP `POST /store`. The OpenAPI contract accepted it (v0.18.1) but `handleStorePost` still stored inline. The REST handler now honors reference mode end to end.
- **#1827 (REST extension)** — the combined `entities[] + file + source_storage:reference` call returned a 500 on `observations.id` UNIQUE collision because the REST structured leg lacked the existing-observation guard that the MCP path has. Brought to parity.
- **#1837** — the Inspector graph viewer fired `retrieve_graph_neighborhood` in an unbounded loop and never painted. Root cause was a global `refetchInterval: 5000`, not unbounded traversal. Polling disabled on the graph hooks; canvas height fixed.

## Tests and validation

- `tests/integration/http_store_reference_source.test.ts` — exercises the real Express `/store` handler over HTTP. Asserts `storage_mode=reference` on both the file-only store and the combined `entities[] + file` store (the case that previously 500'd).
- `docs/testing/automated_test_catalog.md` — regenerated (517 total / 145 integration files).
- Security gates: G1 (`security:classify-diff`) flagged `src/actions.ts` as auth-adjacent; manual review confirmed no authz change (the only new query is `(id, user_id)`-scoped). G2 (`security:lint`) 0 errors. G3 (`security:manifest:check` 115 routes in sync, `test:security:auth-matrix` 18 passed / 1 skipped) passed.

## Security hardening

`npm run security:classify-diff -- --base v0.18.2 --head HEAD` reported `sensitive=true` solely because `src/actions.ts` matches the `auth-middleware` path heuristic (the store handler lives there). The change adds no authentication or authorization logic. The new observation existence check is scoped to `(id, user_id)`, mirroring the MCP store path, and cannot leak or mask another user's data.

Security review artifact: [docs/releases/in_progress/v0.18.3/security_review.md](security_review.md) — verdict: **yes** (no findings, no residual risks).

## Breaking changes

No breaking changes. No OpenAPI tightening, no request-shape changes, no field promotions or removals. Both behavior changes (reference stores honored, duplicate observations replayed) are strict improvements aligning REST with MCP. Patch bump is correct per SemVer.
