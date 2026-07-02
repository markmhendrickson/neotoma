# Security review — v0.18.6

## Scope

- Base ref: `v0.18.5`
- Head ref: `HEAD`
- Diff classifier: **not sensitive** (`sensitive=false`).
- Changed files: 5, all under `inspector/src/` (frontend render/layout only).
- Protected routes manifest: unchanged (no routes touched).

## Findings

- **No auth-path changes.** The diff adds an Inspector render helper (`inspector/src/components/shared/graph_auto_fit.tsx`) that forces React Flow node measurement + `fitView`, plus two-line mounts in the two graph pages and dimension-fallback fields in `graph_layout.ts`. No server code, middleware, route registration, schema, or access-policy path is touched.
- **No new routes / no manifest change.** `security:manifest:check` unaffected; the change is client-side only.
- **No data-exposure change.** The fix changes only how already-fetched neighborhood data is measured and laid out for display. It does not alter what data the graph endpoints return or who can call them.
- **No proxy-trust, local-dev-widening, guest-access, or AAuth changes.**
- `security:classify-diff` (base v0.18.5): `sensitive=false`.

## Residual risks

None. Frontend-only render fix confined to the Inspector graph view.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| ateles-agent (automated) | yes | 2026-07-01 |

Verdict `yes` — not security-sensitive (Inspector render/layout only). No block.

## Diff appendix

- `inspector/src/components/shared/graph_auto_fit.tsx`
- `inspector/src/lib/graph_layout.ts`
- `inspector/src/lib/graph_layout.test.ts`
- `inspector/src/pages/embed_graph.tsx`
- `inspector/src/pages/graph_explorer.tsx`
