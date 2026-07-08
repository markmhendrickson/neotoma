# Security review — v0.18.8

**Base:** v0.18.7 · **Head:** release/v0.18.8
**`npm run security:classify-diff -- --base v0.18.7 --head HEAD`:** `sensitive=true`
**Flagged surface:** `auth-middleware: src/actions.ts`
**Verdict: ship — no security regression.**

## Why the classifier flagged `sensitive=true`

The diff since v0.18.7 touches `src/actions.ts`, which the classifier treats as auth-middleware-adjacent. The changes in that file across this release window are:

1. **#1905 (this release's onboarding batch):** adds a single read-only field, `environment`, to the `storage` block returned by `get_authenticated_user`. It exposes `config.environment` (`"development"` | `"production"`) — a non-secret, already-derivable value (the DB path already differs: `neotoma.db` vs `neotoma.prod.db`). No change to authentication, authorization, token handling, or the resolved `user_id`. It is strictly additive observability so a caller can confirm which graph it is on before writing.
2. **#1860/#1878 (merged to main before this batch):** the offline/HTTP `/store` dedup-replay path now surfaces the current snapshot in `entity_snapshot_after` and marks replayed entries `deduplicated: true`, mirroring the MCP transport. This is a response-shape parity fix on the store path; it reads a persisted snapshot on an idempotency replay and writes no new observation. No auth-surface change.

## Assessment per changed area

- **`get_authenticated_user`** — adds a non-secret environment string to an already-authenticated response. No new data exposure (the value is inferable from the DB path), no auth-logic change. Safe.
- **`/store` replay path** — response-completeness fix; no privilege, no new write, no cross-user surface. Safe.
- **Packaging (#1904)** — `packages/*` added to the npm `files` allowlist. Ships hook *templates* (Python/JS the user opts to install); no server code. The templates are inert until a user runs `hooks install`. Safe.
- **`neotoma setup` no-op guard (#1906)** — narrows when a local config file is written (fewer writes). Strictly reduces filesystem side effects. Safe.
- **Docs (#1907)** — documents a Read/Glob/Grep-vs-Bash isolation gap and ships a **fail-closed** reference `PreToolUse` hook. Security-positive: it closes a user expectation gap and the example denies on parse failure.

## Conclusion

No middleware, route-guard, token, or authorization logic changed. The `sensitive=true` flag is driven by the `actions.ts` path heuristic, not by an actual auth-surface modification. The batch is additive/observability + a response-parity fix + packaging/docs. **Ship.**
