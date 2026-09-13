This is a patch release with four fixes: a real database-backed `/ready` health check plus a Fly deploy-drift guard, a new CI workflow that auto-deploys the operator's own instance on green `main`, a large entity-count performance fix, and a routing bug that made `GET /entities/duplicates` unreachable.

## Highlights

- **Deploys that shrink a running machine now show a warning instead of a silent downgrade.** `scripts/check_fly_config_drift.sh` compares a Fly config against the live machine before deploy and exits non-zero if memory or CPU would drop; a new `GET /ready` endpoint performs a real, bounded database read so the health check catches a wedged process instead of returning 200 through an outage.
- **`entities find-duplicates` and `GET /entities/duplicates` work again.** The route was registered after the catch-all `/entities/:id`, so every request matched `:id` first and returned a 404. A boot-time route-shadowing assertion now refuses to start if this class of bug recurs on any resource.
- **Entity-count queries on large graphs are fast again.** `POST /entities/query` with `limit: 1` on a ~166k-entity instance dropped from 25-81 seconds to about 1ms by reading the already-materialized `entity_snapshots` table instead of recomputing deletion state from the full observation log on every request.

## What changed for npm package users

**Runtime / data layer**

- `countVisibleEntities` and `getDeletedEntityIds` now read liveness from `entity_snapshots` (materialized on every observation write) instead of re-scanning `observations` per request. A new covering index on `entity_snapshots (user_id, entity_type)` makes the count an indexed aggregate. No migration required — the index is created via `ensureSchema`'s `CREATE INDEX IF NOT EXISTS`, which runs on every DB open.
- Measured overhead for a `limit: 1` query, before → after: 1,000 entities 5.8ms → 0.2ms; 10,000 entities 58.5ms → 1.7ms; 40,000 entities 235.8ms → 1.1ms (flat, previously linear in corpus size).

**Shipped artifacts**

- `openapi.yaml` — one additive operation, `GET /ready` (see API surface section below).

## API surface & contracts

- **New: `GET /ready`.** Runs a bounded real database read (default timeout `NEOTOMA_READY_DB_TIMEOUT_MS=20000`, deliberately below Fly's 30s deploy timeout) and returns `503` with `{"ok":false,"checks":{"database":"failed"}}` on error or timeout, `200` with latency on success. Distinct from `GET /health`, which only reads `package.json` off disk and answers `200` even when the database is completely wedged.
- No breaking changes (`npm run openapi:bc-diff` confirms one additive operation, `GET /ready`; no other schema changes).

## Behavior changes

- **`include_merged: true` on `POST /entities/query` now actually changes the returned `total_count` on the default (unfiltered) path.** Previously it silently returned the same total as `include_merged: false` on that path — merged-away entities have no `entity_snapshots` row, so a count over that table could never surface them no matter which flag value was passed. The default count now adds an indexed count of merged-away `entities` rows on top of the live-snapshot count when the flag is set. If code depended on the prior (buggy) behavior of `include_merged` being a no-op on the default count, that workaround is no longer needed and should be removed.
- `GET /entities/duplicates` (and the CLI `entities find-duplicates`) now return real duplicate-candidate results instead of a `404 Entity not found`. The MCP tool `list_potential_duplicates` was unaffected (it dispatches in-process and never hit this bug), which is why the HTTP and MCP surfaces previously disagreed.
- Guest-principal auth on `/entities/:id`-shaped routes now fails closed for reserved path segments (`duplicates`, `merge`, `split`, `query`) rather than matching them as if they were an entity id.
- Boot now refuses to start if any static Express route is registered after a param route that would shadow it (an audit at merge time found exactly one such case among 142 route registrations, the one described above).
- `fly.toml` and `fly.sandbox.toml` health checks now point at `/ready` instead of `/health`, with grace period `120s` (was `30s`, to cover schema seeding and migrations before listen), timeout `30s` (was `10s`), and interval `30s` (was `15s`). Memory floor raised `1gb` → `2gb` on both, below Node's ~2GB heap ceiling. `fly.sandbox.toml` gained a health check where it previously had none.
- `fly.operator.toml` guest size corrected `shared/2/4gb` → `performance/2/8gb` to match the actual running configuration of the largest operator-run instance (re-read directly from the live machine, not a relayed figure); the prior declared value would have downgraded both CPU class and memory on the next deploy.
- New CI workflow (`deploy-operator-instance.yml`) auto-deploys merged `main` to the operator's own hosted instance, gated on the target commit's combined CI check-runs reporting green (polled directly, not via `workflow_run`, and a 45-minute poll timeout is treated as a failure, never a pass). Concurrency is queue-not-cancel, since a cancelled `flyctl deploy` against a single-machine app with an attached volume can leave the machine stopped or detached mid-update. Requires `OPERATOR_INSTANCE_APP` and `OPERATOR_INSTANCE_TOKEN` secrets (operator-only to add); the job skips cleanly without them rather than failing. Verification now includes a fifth check beyond the existing four: an authenticated `GET /entities?limit=1` read, budgeted 90s for a cold post-restart read against a large graph.

## Docs site & CI / tooling

- Added `scripts/check_fly_config_drift.sh`: run against a live Fly app and a config file, reports whether deploying that config would shrink memory or downgrade CPU class on the currently running machine. Exit `0` = safe, `1` = drift detected, `2` = could not determine (kept distinct from `0` so an inconclusive check never reads as "fine"). Not run in CI (no Fly credentials there); its config-shape invariants are covered instead by `tests/contract/fly_deploy_config.test.ts`, which iterates the `fly*.toml` directory so a new config file is covered automatically.
- `docs/infrastructure/client_instance_deployment.md` updated for the new operator-instance auto-deploy workflow and the `/ready` check.

## Internal changes

- `tests/integration/entity_query_deleted_count.test.ts`, `tests/unit/entity_queries_status_projection.test.ts`, and `tests/performance/entity_query_count.bench.test.ts` added for the entity-count fix.
- `tests/unit/readiness_probe.test.ts` (10 tests: hang, error, throw, unhandled-rejection safety) and `tests/contract/fly_deploy_config.test.ts` added for the readiness/drift work.
- `src/services/route_shadowing.ts` (new): walks the registered route table at boot and asserts no static route is shadowed by an earlier param route; no-ops (does not fail boot) if it cannot introspect Express internals, since a defensive check failing boot would be worse than the bug it guards against. 14 new tests in `route_shadowing.test.ts`, plus 4 new guest-principal regression cases in `tests/subscriptions/subscription_guest_auth.test.ts`.

## Fixes

- **`GET /entities/duplicates` unreachable (#2208).** Fixed by both correcting route registration order and closing the underlying guest-auth regex match that would have turned the 404 into a 500 once the ordering fix landed alone.
- **`/health` reporting healthy through a real outage; Fly deploys silently shrinking a running machine's resources (#2279, partially — see Fixes note below).** `GET /ready` and `check_fly_config_drift.sh` narrow this gap; they do not close it entirely (a corrupt-at-runtime SQLite file with an already-open handle can still pass `/ready`, since the process serves from its page cache — see the PR body for the full caveat list).
- **`POST /entities/query` with `limit: 1` taking 25-81 seconds on large instances (#2266).** Root cause: full observation-log rescan on every request regardless of result-set size. Fixed by reading materialized liveness state instead of recomputing it.
- **Operator's own hosted instance going undeployed for days after merges (#2277).** No workflow previously targeted it; the existing `deploy-client-instance.yml` workflow deploys a different app entirely (confirmed via a `workflow_dispatch` run that updated the client instance but left the operator's instance on a 5-day-old commit).

## Tests and validation

- Full unit + integration + contract suite run directly against both this release candidate and `v0.22.1` in isolated worktrees for comparison: **22 failed test files / 83 failed tests, byte-identical file list, at both `v0.22.1` and this release candidate** — confirmed pre-existing and unrelated to this release, not a regression. This release candidate additionally passes 4 more test files and 61 more individual tests than baseline (the new tests this release adds: `readiness_probe`, `fly_deploy_config`, `route_shadowing`, `entity_query_deleted_count`, `entity_queries_status_projection`, plus new cases in `subscription_guest_auth`), with zero new failures introduced.
- Contract suite: 188/188 passing. Targeted new/changed-surface test files for all four fixes: 94/94 passing.
- `npm run type-check`: clean. `npm run format:check`: clean. `npm run validate:test-catalog`: up to date.
- `npm run openapi:bc-diff -- --base v0.22.1 --head HEAD`: no breaking changes, one additive operation (`GET /ready`).
- Security lane (G1-G3): `security:classify-diff` reports `sensitive=true` (see Security hardening); `security:lint` 0 errors / 133 warnings, all pre-existing categories (`unauth-public-route` matches on long-standing routes, `LOCAL_DEV_USER_ID` references in `sandbox_mode.ts`); `security:manifest:check` in sync (120 routes); `test:security:auth-matrix` 18 passed / 1 skipped.

## Security hardening

`npm run security:classify-diff` reports this release `sensitive=true`, driven by path matches on `openapi.yaml` (new `GET /ready` operation), `scripts/security/protected_routes_manifest.json` (auto-regenerated for the new route), `src/actions.ts` (the guest-principal auth fix for reserved path segments), and `src/middleware/aauth_admission.ts`. See `docs/releases/in_progress/v0.22.2/security_review.md` for the full adversarial review; summary: the new `/ready` route is registered in the protected-routes manifest as unauthenticated-by-design (it exposes only a boolean health signal plus latency, no entity data), the guest-principal fix is a narrowing (fewer paths get guest treatment, not more), and the route-shadowing guard fails closed (refuses boot) rather than warning. No new authenticated data-read surface, no widening of `LOCAL_DEV_USER_ID`, no change to bearer-token or AAuth verification logic itself — `aauth_admission.ts` appears in the diff only because the guest-principal reserved-segment check sits in the same request path. Sign-off verdict recorded in the linked review.

## Breaking changes

No breaking changes.
