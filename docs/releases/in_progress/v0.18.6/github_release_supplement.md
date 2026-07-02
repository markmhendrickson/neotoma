A single targeted fix: the Inspector graph viewer now renders its nodes, edges, and viewport again. On v0.18.5 the graph could receive valid data yet paint a blank canvas; this release restores rendering on both the standalone explorer and the embedded graph.

## Highlights

- **Inspector graph no longer renders blank.** On v0.18.5, a graph neighborhood could load valid data (correct nodes and relationships, exactly one fetch, no console error) yet the canvas stayed empty: edges did not draw and the viewport never fit to the graph. Root cause: in the production bundle, React Flow v12's per-node `ResizeObserver` never fires its initial measurement callback, so every node's `measured` dimensions stay empty and `nodesInitialized` stays `false`. With no measured dimensions, `fitView` treats every node as invisible and bails, and edge positions can't be computed, so edges never draw. Fixed in `inspector/src/components/shared/graph_auto_fit.tsx` (new) + the two graph pages. Affects both the standalone `/graph` explorer and the embedded `/embed/graph`.

## What changed for npm package users

**Inspector**

- A new `GraphAutoFit` helper, mounted inside the graph's `<ReactFlow>`, forces a node-internals measurement pass (reading real DOM dimensions directly, bypassing the unfired ResizeObserver) whenever the rendered node set changes, then calls `fitView` once nodes report real bounds, retrying on a short cadence until measured. `graphSpecToFlow` also sets `initialWidth`/`initialHeight` as dimension fallbacks.
- Net effect: exploring an entity's neighborhood renders its nodes and edges and fits them into view, on both graph routes.

**Shipped artifacts**

- `openapi.yaml` — unchanged; this is an Inspector-only (frontend) fix. No routes, schema, or server behavior changed.
- The Inspector bundle is rebuilt with the fix.

## API surface & contracts

No API, schema, or contract changes. The data pipeline (`buildGraphFromNeighborhood` / `applyGraphLayout` / `graphSpecToFlow`) was already correct — it emitted valid nodes with finite positions and edges wired to real node ids. The bug was purely in the render/measurement layer.

## Behavior changes

- The Inspector graph renders again. No other behavior changes.

## Fixes

- **Blank-canvas render regression in the Inspector graph viewer.** Valid neighborhood data produced an empty canvas on v0.18.5 because React Flow v12 node measurement did not initialize in the production bundle. `GraphAutoFit` forces measurement + fit. Reported by an external evaluator (Jeroen van 't Hoff, OPSCHUDDING), who isolated it end to end: every layer green (shell 200, render chunk loaded, one neighborhood fetch, valid body, zero console errors) except the drawing, and blank on both the embedded panel and the standalone explorer — confirming a shared render bug, not an embed-specific one.

## Tests and validation

- `inspector/src/lib/graph_layout.test.ts` — a case built from the reporter's exact neighborhood shape (1 entity + 2 related_entities + 2 relationships) asserts the pipeline emits nodes with finite numeric positions, dimension hints, and edges wired to existing node ids. It fails before the fix's pipeline changes and passes after.
- The render-layer fix (measurement + fitView) was verified in a real browser against the production bundle: before = nodes present but 0 edges and an un-fitted viewport (blank); after = edges drawn and viewport fitted. The Inspector unit lane runs in Node without a DOM/React Flow store, so the measurement fix is browser-verified rather than unit-asserted; the unit test guards the pipeline invariants that back it.
- Full inspector test suite green; `security:classify-diff` reports `sensitive=false` (Inspector-only, no auth/route/schema surface).

## Security hardening

Not security-sensitive. `npm run security:classify-diff -- --base v0.18.5 --head HEAD` reported `sensitive=false` (5 changed files, all under `inspector/src/`; no middleware, auth, route, or schema paths). See [docs/releases/in_progress/v0.18.6/security_review.md](security_review.md) — verdict: **yes** (frontend-only render fix).

## Breaking changes

None. Frontend-only, additive render fix. Patch bump is correct per SemVer.
