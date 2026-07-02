# Security review — v0.18.7

## Scope

- Base ref: `v0.18.6`
- Head ref: `HEAD`
- Diff classifier: **not sensitive** (`sensitive=false`).
- Changed files: 1 (`inspector/src/pages/embed_graph.tsx`, frontend CSS/className only), plus the release version bump + supplement docs.
- Protected routes manifest: unchanged (no routes touched).

## Findings

- **No auth-path changes.** The diff changes two `className` strings on the embed graph page so the graph canvas container has a resolved height (root `min-h-screen` → `h-dvh`; canvas `flex-1 min-h-[calc(100dvh-5rem)]` → `flex flex-col flex-1 min-h-0`). No server code, middleware, route registration, schema, or access-policy path is touched.
- **No new routes / no manifest change.** The change is client-side only.
- **No data-exposure change.** The fix changes only how already-fetched neighborhood data is laid out for display (the container's height). It does not alter what data the graph endpoints return or who can call them. The embed CORS/frame-ancestors gating shipped in v0.18.5 is unchanged.
- **No proxy-trust, local-dev-widening, guest-access, or AAuth changes.**
- `security:classify-diff` (base v0.18.6): `sensitive=false`.

## Residual risks

None. Frontend-only CSS layout fix confined to the Inspector embed graph view.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| ateles-agent (automated) | yes | 2026-07-02 |

Verdict `yes` — not security-sensitive (Inspector embed layout/CSS only). No block.

## Diff appendix

- `inspector/src/pages/embed_graph.tsx`
