# Security review — v0.18.8

**Base:** v0.18.7 · **Head:** release/v0.18.8
**`npm run security:classify-diff -- --base v0.18.7 --head HEAD`:** `sensitive=true`
**Flagged surface:** `auth-middleware: src/actions.ts`
**Verdict: ship — no security regression.**

## Gate results (G1–G3)

- **G1 `security:classify-diff`:** `sensitive=true`, single concern `auth-middleware` on `src/actions.ts`.
- **G2 `security:lint`:** 0 errors, 125 warnings across 380 files (full-repo scan; warnings are pre-existing baseline noise, not new to this diff — confirmed no `error`-level findings).
- **G3 `security:manifest:check`:** `protected_routes_manifest.json` in sync with `openapi.yaml` (115 routes) — no drift, no regeneration needed.
- **G3 `test:security:auth-matrix`:** 18 passed, 1 skipped, 0 failed.

## Why the classifier flagged `sensitive=true`

The diff since v0.18.7 touches `src/actions.ts`, which the classifier treats as auth-middleware-adjacent. The changes in that file across this release window are:

1. **#1905 (onboarding batch):** adds a single read-only field, `environment`, to the `storage` block returned by `get_authenticated_user`. It exposes `config.environment` (`"development"` | `"production"`) — a non-secret, already-derivable value (the DB path already differs: `neotoma.db` vs `neotoma.prod.db`). No change to authentication, authorization, token handling, or the resolved `user_id`. Strictly additive observability so a caller can confirm which graph it is on before writing.
2. **#1860/#1878 (offline transport-parity fix):** the offline/HTTP `/store` dedup-replay path now surfaces the current snapshot in `entity_snapshot_after` and marks replayed entries `deduplicated: true`, mirroring the MCP transport. This is a response-shape parity fix on the store path; it reads a persisted snapshot on an idempotency replay and writes no new observation. No auth-surface change.

No other file in this release range falls under `src/actions.ts`, `src/services/root_landing/**`, or the `isLocalRequest`/`forwardedForValues`/`isProductionEnvironment` helpers governed by the change guardrails rule.

## Assessment per changed area

- **`get_authenticated_user`** — adds a non-secret environment string to an already-authenticated response. No new data exposure (the value is inferable from the DB path), no auth-logic change. Safe.
- **`/store` replay path (offline transport)** — response-completeness fix; no privilege change, no new write, no cross-user surface. The replay path reads a persisted snapshot the requesting user already owns (same `user_id` scoping as the original store); mirrors an already-shipped MCP behavior. Safe.
- **Packaging (#1904)** — `packages/*` added to the npm `files` allowlist. Ships hook *templates* (Python/JS the user opts to install); no server code. The templates are inert until a user runs `hooks install`. Safe.
- **`neotoma setup` no-op guard (#1906)** — narrows when a local config file is written (fewer writes). Strictly reduces filesystem side effects. Safe.
- **Docs (#1907)** — documents a Read/Glob/Grep-vs-Bash isolation gap and ships a **fail-closed** reference `PreToolUse` hook. Security-positive: closes a user expectation gap; the example denies on parse failure.
- **`issue_spec` schema (#1901)** — new entity type registration only (identity rule, field declarations, merge policies). No route, no auth-path change, no data migration of existing rows. Safe.
- **URL emitter fix (#1555)** — string-substitution change in agent-facing link builders (`/inspector/...` → unprefixed). No routing or auth-logic change; the underlying `/inspector/*` redirect already existed and still works for stale links. Safe.
- **Inspector render smoke test (#1874)** — CI-only Playwright test addition; no production code path. Safe.

## Conclusion

No middleware, route-guard, token, or authorization logic changed in this release. The `sensitive=true` flag is driven by the `actions.ts` path heuristic, not by an actual auth-surface modification. The batch is additive/observability + a transport-parity fix + a new schema registration + packaging/docs/CI. **Ship.**
