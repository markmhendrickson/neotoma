This minor release lets an atomic correction depend on a record it does not change, makes schema updates atomic, and fixes the contrast of the 404 page's "Go home" button. It also publishes the v0.27.0 security advisory.

## What changed for npm package users

**Compare-only guards in atomic corrections**

- `correct_transaction` (MCP), `POST /corrections/transaction` (HTTP) and `neotoma request --operation correctTransaction` (CLI) now accept a participant with `changes: []`. Such a participant is a guard: it is checked but not written.
- A guard must declare at least one field in `expected_snapshot`, and at least one other participant in the same request must make a correction. The guard's scoped identity, type, `expected_observation_count` and expected fields are checked in the same database transaction as the writes. If the guarded record changed, the whole transaction is refused and nothing is written.
- A guard adds no observation and sends no notification. It is part of the idempotency hash, so an exact replay stays effect-free, and changing the guard under the same key is refused.
- Agents admitted through agent grants need the `correct` operation on the guard's entity type as well as on the written types.
- Requests where every participant writes behave exactly as before.

**Atomic schema updates**

- Incremental schema updates (MCP `update_schema_incremental`, HTTP `POST /update_schema_incremental`) and schema registration now resolve the current schema, merge, register and activate inside one database transaction. Concurrent additive updates no longer lose fields, and a failed update no longer leaves a half-activated schema.
- An update now activates the exact row it just registered. Before, it looked the row up again by version string, which could select an older inactive row with the same version.
- Non-merge reducer settings on the current schema are kept across incremental updates.
- Icon generation and schema snapshot export run only after the change commits, and not at all when it is refused or rolled back.
- `migrate_existing` backfill of historical `raw_fragments` still runs as a separate step after the schema commits.

## API surface & contracts

- `openapi.yaml`: in the `correctTransaction` request, `changes` now allows `minItems: 0`. The `changes` and `expected_snapshot` descriptions state the compare-only rules. Generated types are regenerated. `npm run openapi:bc-diff` reports no breaking changes.
- MCP tool description for `correct_transaction`, the MCP instructions and the CLI agent instructions describe the compare-only form.

## Behavior changes

- `correctTransaction` now checks that every `expected_snapshot` field is declared in the participant's active schema and returns `VALIDATION_ERROR` if one is not. Before, such a request also always failed, because snapshots contain only declared fields, but it failed with `CONFLICT`. A caller that retried on `CONFLICT` now gets a non-retryable validation error for this mistake.
- When a replay re-reads a committed transaction target, a target whose entity type has changed is now refused as `CONFLICT`.
- Schema registration now fails if it cannot deactivate the previously active schema. Before, it logged a warning and could leave two active rows.

## Fixes

- The 404 page's "Go home" button kept the site's link color and was unreadable in some themes. It now uses the button's own foreground color in light and dark mode.

## Docs site & CI / tooling

- New advisory: `docs/security/advisories/2026-11-04-peer-sync-and-agent-grant-scope.md` (the v0.27.0 peer-sync and agent-grant scope fix), listed in the advisories index.
- `docs/known_limitations.md` drops "A later ordinary write can replace a correction", fixed in v0.27.0.
- Install pages and observation docs updated to the v0.27.0 behavior.
- `docs/developer/atomic_corrections.md` and `docs/developer/cli_reference.md` document compare-only guards and their retry rule.
- CI's atomic-null lane now also runs `tests/integration/correction_transaction_mcp_transport.test.ts`. `test:e2e:graph-render` now includes the 404 page spec.

## Tests and validation

- Compare-only guards: service tests (`src/services/correction_transaction.test.ts`), HTTP and CLI tests (`tests/cli/request_atomic_transaction.test.ts`), MCP transport tests over `POST /mcp` (`tests/integration/correction_transaction_mcp_transport.test.ts`), and a replay eval (`atomic_correction_compare_only_guard`). They cover guarded apply, stale-guard refusal with no writer effect, cross-tenant and wrong-type guards, rollback, and replay without growth.
- Schema atomicity: `tests/services/schema_registry_atomic.test.ts` covers concurrent callers, same-version collision, rollback on activation or deactivation failure, scope isolation and post-commit effects.
- 404 contrast: `playwright/tests/not-found.spec.ts` checks the label contrast in both themes.
- Release prep: type-check passed. Targeted service, CLI, MCP, contract and tenant-isolation suites passed 403 of 404 locally. The one failure is a `/store` reference-path test whose code is not changed in this release, and it passes in CI. CI test lanes are green on the release head.

## Security hardening

The diff classifier marked this release sensitive because `openapi.yaml` changed. The only contract change is the compare-only guard. Guards stay scoped to the authenticated user, need the `correct` agent-grant operation on their type, and fail closed when absent, cross-tenant, of the wrong type, undeclared or malformed. `security:lint` reports 0 errors, the protected-routes manifest is in sync, and the auth topology matrix passes. See [`security_review.md`](security_review.md). Advisory published in this release: [`2026-11-04-peer-sync-and-agent-grant-scope.md`](../../../security/advisories/2026-11-04-peer-sync-and-agent-grant-scope.md).

## Breaking changes

No breaking changes.
