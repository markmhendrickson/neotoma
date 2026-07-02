A single targeted fix: the Inspector embedded graph (`/embed/graph`) now paints again. On v0.18.6 the standalone `/graph` explorer rendered correctly, but the embed shell showed a blank canvas even with a fully healthy graph — because its canvas container had a min-height but no resolved height, collapsing React Flow to zero painted pixels.

## Highlights

- **Embedded graph (`/embed/graph`) no longer renders blank.** On v0.18.6, the embed graph could lay out perfectly — nodes measured with real dimensions, edges with real path data, the viewport transform applied (so `fitView` ran) — yet paint zero pixels, with `document.elementFromPoint()` at a node's center hitting the page background instead of the node. Root cause: the graph canvas container used `flex-1 min-h-[calc(100dvh-5rem)]` — a **min**-height with no definite height. React Flow's root element needs `height:100%`, which resolves against the parent's computed `auto` height → `0px`; React Flow's `overflow:hidden` then clips the correctly-laid-out graph to nothing. The standalone `/graph` was unaffected because its wrapper is `h-[600px]` (a definite height). Fixed in `inspector/src/pages/embed_graph.tsx`. This is a **separate** bug from the v0.18.6 measurement fix (`GraphAutoFit`), which remains correct and is confirmed working.

## What changed for npm package users

**Inspector**

- The embed graph shell now establishes a definite height context so React Flow fills it: the root shell is `h-dvh` (was `min-h-screen`) and the canvas container is a flex column that lets React Flow flex to fill (`flex flex-col flex-1 min-h-0`, was `flex-1 min-h-[calc(100dvh-5rem)]`). This is the flex-column approach rather than a hard `calc()` height, so it stays correct when the controls bar wraps to two rows at narrow widths.
- Net effect: exploring an entity's neighborhood in the embedded panel renders and paints its nodes and edges, matching the standalone explorer.

**Shipped artifacts**

- `openapi.yaml` — unchanged; Inspector-only (frontend) fix. No routes, schema, or server behavior changed.
- The Inspector bundle is rebuilt with the fix.

## API surface & contracts

No API, schema, or contract changes. The data pipeline and the render/measurement layer were already correct as of v0.18.6; this was purely a CSS layout collapse in the embed shell.

## Behavior changes

- The embedded graph renders again. No other behavior changes.

## Fixes

- **Blank embedded graph in the Inspector (`/embed/graph`).** The canvas container had a min-height but no resolved height, so React Flow's `height:100%` collapsed to `0px` and `overflow:hidden` clipped the graph. Reported and root-caused end to end by an external evaluator (Jeroen van 't Hoff, OPSCHUDDING), who isolated it precisely: DOM fully healthy (nodes measured, edges with path data, viewport transform applied) but zero pixels painting and `elementFromPoint` at a node center hitting the background — and pinned the cause to the percentage-height-against-`auto` collapse, distinguishing it from the standalone route's explicit `h-[600px]`.

## Tests and validation

- `inspector/src/lib/embed_graph.test.ts` — 12/12 pass (unchanged; the pipeline invariants are unaffected).
- The CSS layout fix was verified in a real browser against the built production bundle: reproducing the exact class chain, the old container left React Flow's `clientHeight` collapsed while the new class chain resolves it to the full available height (viewport minus the controls bar), swept across viewport widths including a wrapped two-row controls bar. The Inspector unit lane runs in Node without a real viewport, so the height-resolution behavior is browser-verified rather than unit-asserted.
- A follow-up hardening item (tracked): the PR-gating render smoke test must assert **paint at the pixel level** on `/embed/graph` (e.g. `elementFromPoint` at a node center returns a `.react-flow__node`, or a screenshot-not-blank check), not merely nodes-in-DOM + a fitted viewport — because this bug had both of those true while painting nothing.
- `security:classify-diff` (base v0.18.6): `sensitive=false`.

## Security hardening

Not security-sensitive. `npm run security:classify-diff -- --base v0.18.6 --head HEAD` reported `sensitive=false` (1 changed file under `inspector/src/`; no middleware, auth, route, or schema surface). See [docs/releases/in_progress/v0.18.7/security_review.md](security_review.md) — verdict: **yes** (frontend-only CSS layout fix).

## Breaking changes

None. Frontend-only, additive layout fix. Patch bump is correct per SemVer.
