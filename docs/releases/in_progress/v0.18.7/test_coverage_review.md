# Test coverage review — v0.18.7

## Scope

Release diff: `v0.18.6..HEAD`. One fix (Inspector `/embed/graph` blank-canvas height collapse). 1 code file changed (`inspector/src/pages/embed_graph.tsx`), className-only.

## Code review

The fix is a client-side CSS/layout change: two `className` edits so the embed graph canvas has a resolved height and React Flow fills it (root `min-h-screen` → `h-dvh`; canvas container → `flex flex-col flex-1 min-h-0`). No server, schema, route, or contract surface. No migrations.

Verdict: **ADVISORY only** — no BLOCKING gaps.

## Surface coverage

### `inspector/src/pages/embed_graph.tsx` — embed graph container height

- **Change:** the graph canvas container now establishes a definite height context (flex column with `min-h-0` under an `h-dvh` root) instead of a min-height-only container, so React Flow's `height:100%` resolves instead of collapsing to `0px`.
- **Classification:** UI layout/render behavior; the root-cause layer.
- **Coverage:** `inspector/src/lib/embed_graph.test.ts` (12/12 pass) guards the pipeline invariants that back the page; it does not assert layout. The height-resolution behavior was verified in a real browser against the built production bundle: with the OLD class chain React Flow's `clientHeight` stayed collapsed, and with the NEW chain it resolved to the full available height (viewport minus the controls bar), swept across viewport widths including a wrapped two-row controls bar. The Inspector `.test.ts` lane runs in Node without a real viewport, so this height behavior cannot be unit-asserted in-lane; it is browser-verified. This is an honest, documented coverage boundary, not a gap in the fix.

## Coverage follow-up (tracked, not blocking this release)

The PR-gating render smoke test (task ent_6636601b50fc2d43b21d5174) is being extended so the `/embed/graph` assertion is **pixel-level** — `document.elementFromPoint()` at a node center returns a `.react-flow__node`, and `.react-flow` has non-zero `clientHeight`, or a screenshot-not-blank check — because this exact bug had nodes-in-DOM and a fitted viewport both true while painting nothing. A DOM-only assertion would not have caught it. This is the structural prevention for the class; it lands with the render-smoke-test task, not in this patch.

## Surfaces that do NOT apply

- Destructive / data-mutating operations: none.
- New CLI/MCP/HTTP routes: none.
- Schema / migrations: none.
- Server behavior: none (frontend only).

## Verdict

No BLOCKING coverage gaps. The pipeline invariant is unit-tested; the layout fix is browser-verified against the prod bundle with the Node-lane limitation stated explicitly; the pixel-level render smoke test that would have caught this class is tracked as a follow-up. Release may proceed.
