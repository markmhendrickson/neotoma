# Test coverage review — v0.18.6

## Scope

Release diff: `v0.18.5..HEAD`. One fix (Inspector graph blank-canvas render regression, PR #1863). 5 files, all under `inspector/src/`.

## Code review

The fix is a client-side render/layout change: a new `GraphAutoFit` component that forces React Flow node measurement + `fitView`, mounted in both graph pages, plus dimension-fallback fields in the layout builder. No server, schema, route, or contract surface. No migrations.

Verdict: **ADVISORY only** — no BLOCKING gaps.

## Surface coverage

### `inspector/src/lib/graph_layout.ts` — pipeline + dimension fallbacks

- **Change:** `graphSpecToFlow` now sets `initialWidth`/`initialHeight`; pipeline otherwise unchanged.
- **Coverage:** `inspector/src/lib/graph_layout.test.ts` — a case built from the reporter's exact neighborhood shape (1 entity + 2 related_entities + 2 relationships) asserts the pipeline emits nodes with finite numeric positions, dimension hints, and edges wired to existing node ids. Fails before the pipeline change, passes after. Full inspector suite green.

### `inspector/src/components/shared/graph_auto_fit.tsx` — the render-layer fix

- **Change:** forces `updateNodeInternals` (reads real DOM dimensions, populating `measured`, bypassing the unfired ResizeObserver) then `fitView`, retrying until measured.
- **Classification:** UI render behavior; the root-cause layer.
- **Coverage:** verified in a real browser against the production bundle (before = nodes present, 0 edges, un-fitted/blank; after = edges drawn, viewport fitted). The Inspector `.test.ts` lane runs in Node without jsdom/a React Flow store, so this measurement behavior cannot be unit-asserted in-lane; it is browser-verified, and the unit test guards the pipeline invariants that back it. This is an honest, documented coverage boundary, not a gap in the fix.

## Surfaces that do NOT apply

- Destructive / data-mutating operations: none.
- New CLI/MCP/HTTP routes: none.
- Schema / migrations: none.
- Server behavior: none (frontend only).

## Verdict

No BLOCKING coverage gaps. The data-pipeline invariant is unit-tested (failing→passing on the reporter's shape); the render/measurement fix is browser-verified against the prod bundle, with the Node-lane limitation stated explicitly. Release may proceed.
