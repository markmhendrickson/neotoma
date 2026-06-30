# Test coverage review — v0.18.3

## Scope

Release diff: `v0.18.2..HEAD` (7 files: 2 source, 1 schema, 2 inspector, 1 integration test, 1 generated catalog). Three connected bug fixes (#1826, #1827 REST extension, #1837).

## Code review

Ran the release diff review against `v0.18.2..HEAD`. The store-side changes route an existing request field to existing reference-storage code and add a user-scoped idempotency guard that mirrors the MCP path. The inspector changes disable a polling timer and fix a CSS height. No new CLI commands, no new routes, no new HTTP/MCP contract surfaces, no migrations, no external file parsers.

Verdict: **ADVISORY only** — no BLOCKING findings. The store fixes carry an HTTP integration test that exercises the real Express handler for both call shapes, including the combined shape that previously 500'd.

## Surface coverage

### `src/actions.ts` + `src/shared/action_schemas.ts` — REST `/store` reference mode

- **Change:** `handleStorePost` branches on `source_storage` to skip the inline `readFileSync` and route the file leg through `storeRawReference`; `StoreRequestSchema` already declared the field.
- **Classification:** Covers user-observable behavior end-to-end (HTTP request → sources row).
- **Test coverage:** `tests/integration/http_store_reference_source.test.ts` boots the real Express `app` and issues live `POST /store` requests. Asserts `storage_mode=reference` and a non-null `reference_path`/`content_hash` on the sources row for the file-only shape, and `body.unstructured.storage_mode === "reference"` for the combined `entities[] + file` shape. Both pass.

### `src/services/observation_storage.ts` — REST structured-store idempotency

- **Change:** `createObservation` looks up the content-addressed observation id scoped to `(id, user_id)` and returns the existing row instead of colliding on the `observations.id` UNIQUE constraint.
- **Classification:** Covers user-observable behavior (combined reference store no longer 500s).
- **Test coverage:** The combined-shape case in `http_store_reference_source.test.ts` is the direct regression: before the fix it returned 500, after it returns 200 with the reference source row. Verified by stashing the fix and observing the 500 reproduce, then confirming green with the fix. Idempotency/replay semantics confirmed unregressed by running `tests/integration/idempotency_collision.test.ts` (3 pass) and `tests/integration/idempotency_key_content_mismatch.test.ts` (5 pass) per-process.

### `inspector/src/hooks/use_graph.ts` + `inspector/src/pages/embed_graph.tsx` — graph polling + layout

- **Change:** `refetchInterval: false` on `useGraphNeighborhood`, `useGraphNeighborhoodWithBase`, `useRelatedEntities`; embed root and canvas height changed to fill the viewport.
- **Classification:** UI behavior (stops timer-driven refetch; renders the canvas).
- **Test coverage:** No automated test (the loop was a runtime polling timer + CSS height, not a logic branch reachable by a unit assertion). Verified by source inspection: the three hooks now disable the interval, and the canvas uses `min-h-[calc(100dvh-5rem)]`. Manual/embedded verification belongs to the reporter's environment, which is why the supplement asks for confirmation on the next pull.

## Surfaces that do NOT apply to this release

- Destructive / data-mutating operations: none.
- External file-shape parsers: none (reference storage reuses the existing path resolver).
- New CLI commands or flags: none.
- New HTTP/MCP routes: none.
- Migrations: none.

## Verdict

No BLOCKING coverage gaps. The two store fixes have end-to-end HTTP integration coverage verified by inspection of the test bodies and by reproducing the pre-fix 500. The inspector change is a polling/layout fix with no logic branch to assert and is verified by source inspection. Release may proceed.
