# Test coverage review — v0.18.8

## Code review

`/review v0.18.7..HEAD` was run against the full release diff (12 commits, 28 files, +1862/-67 lines) in the isolated worktree for `release/v0.18.8`.

### Scope reviewed

Full diff read for every changed file. Verified with: `npx tsc --noEmit` (clean), `npm run build` (clean, incl. Inspector), `npx eslint` on all touched files (0 errors, pre-existing `no-explicit-any` warnings only), targeted `vitest run` on every new/changed test file (109/109 passed across unit/CLI/contract/integration lanes), `npx playwright test inspector-graph-render.spec.ts --project=chromium` (2/2 passed against the real built bundle), `npm run validate:test-catalog` (up to date), `npm run security:manifest:check` (in sync, 115 routes), CI workflow YAML syntax validated.

### Conditional docs loaded

`docs/subsystems/auth.md`, `docs/security/threat_model.md` (src/actions.ts touched), `docs/developer/mcp/instructions.md`, `docs/developer/agent_instructions_sync_rules.mdc` (server.ts / mcp/instructions.md touched), `docs/developer/cli_reference.md` (src/cli/* touched), `docs/foundation/schema_agnostic_design_rules.md`, `docs/subsystems/schema_registry.md` (new issue_spec registration), `docs/architecture/openapi_contract_flow.md`, `docs/testing/testing_standard.md`, `docs/developer/package_scripts.md`.

### Pre-PR checklist (Phase 4)

All 25 checklist items evaluated. 23 items ✓ or — N/A. Two items initially flagged BLOCKING (both instances of item 1/13, "new response fields declared in openapi.yaml"): `get_authenticated_user`'s new `storage.environment` field was populated in `src/actions.ts` (#1905) but not declared in `openapi.yaml`.

**Resolution applied in this preparation pass:** Added the `environment` field to the `storage` object schema for `POST /get_authenticated_user` in `openapi.yaml` (`type: string`, `enum: [development, production]`, with a description matching the field's purpose), then ran `npm run openapi:generate` to regenerate `src/shared/openapi_types.ts`. Re-verified:

- `npm run openapi:bc-diff -- --base v0.18.7 --head HEAD` — still **no breaking changes detected** (purely additive field).
- `npx vitest run tests/integration/get_authenticated_user_environment.test.ts` — passes.
- `npx vitest run tests/contract/` — 147/147 passed.
- `npx tsc --noEmit` — clean.
- `npm run build` — clean.

The related `entity_snapshot_after` field (used by the #1860 transport-parity fix) was flagged as a pre-existing, un-declared response field, but it was introduced by the earlier #1840 MCP-side fix (already on `main` before this release range), not by this diff. Not fixed in this pass — tracked as a separate, smaller follow-up since it is not a regression introduced by v0.18.8's changes. Noted here for visibility rather than left silent.

### Architectural review (Phase 5)

- **State-layer boundaries**: clean. No strategy/execution logic added; `issue_spec` is a passive data schema for an external (Ateles swarm) consumer.
- **Schema-agnostic design**: clean. The new `issue_spec` schema is a pure declarative `SchemaDefinition` addition (fields, composite+fallback `canonical_name_fields`, `merge_policies`) with zero per-type branches introduced elsewhere in the codebase.
- **Determinism**: clean. `issue_spec` canonical-name resolution is deterministic; `entity_snapshot_after` on replay reads an already-persisted snapshot rather than recomputing.
- **Immutability**: clean. The #1860 fix reads existing observations/snapshots and writes nothing new on replay (verified: observation count stays 1 in both `store_dedup_snapshot_after.test.ts` and `transport_parity_store_snapshot_auth.test.ts`).
- **Auth surface** (`src/actions.ts`): no `req.socket.remoteAddress` / `X-Forwarded-For` / `Host` reads outside canonical helpers introduced; no `user_id` read from body/query for access control; no new `LOCAL_DEV_USER_ID` references outside allowed paths; no new unguarded route. Corroborates the independent `security_review.md` "ship" verdict.

### Product/UX and documentation completeness (Phase 5b/5c)

- The `/inspector` prefix removal (#1555) is consistently applied across all URL emitters (`docs/developer/mcp/instructions.md`, `src/server.ts`'s compact mirror, `packages/agent/src/turn_report.ts`, `packages/client/src/turn_report.ts`) — no drift between the canonical MCP doc and its CLI/agent mirrors.
- `docs/integrations/hooks/claude_code.md`'s new "Bash-tool gap" section is actionable and transparent about the reference hook's limitations.
- **Advisory (not blocking)**: `docs/developer/cli_reference.md` was not updated to reflect the #1880/#1904 behavior change (global install + `--tool claude-code` now writes a project-root `.mcp.json` it previously silently skipped). The release supplement adequately informs users of the behavior change for this release; tracked as a fast-follow doc update rather than blocking this release.

### Effect-test verification for the six named fixes

Each was verified by reading the actual test body, not just the file name:

| Fix | Test | Verified assertion |
|---|---|---|
| #1904 (hook packages in npm) | `tests/contract/package_contents.test.ts` | Real `npm pack --json --dry-run`; asserts the tarball manifest contains the three installer-referenced template files. |
| #1905 (active env) | `tests/integration/get_authenticated_user_environment.test.ts` | Real Express app, POST `/get_authenticated_user`, asserts `storage.environment ∈ {development, production}` over HTTP. |
| #1906 (no-op reformat) | `tests/cli/cli_doctor_setup.test.ts` | Asserts `changed === false` AND on-disk bytes + mtime unchanged for a differently-formatted-but-equivalent file. |
| #1907 (Bash-deny docs) | — | Documentation-only; no test applicable (correctly not claimed as tested). |
| #1860/#1878 (transport parity) | `tests/integration/store_dedup_snapshot_after.test.ts`, `tests/integration/transport_parity_store_snapshot_auth.test.ts`, `tests/helpers/transport_parity_matrix.ts` | Drives `storeStructuredForApi` (offline) and `NeotomaServer` (MCP) with the same idempotency key; asserts observation count stays 1, `entity_snapshot_after` populated and matches an independent `getSnapshot()` read, `deduplicated === true` on both transports via `assertIdenticalEffect`. |
| #1874 (graph render smoke) | `playwright/tests/inspector/inspector-graph-render.spec.ts` | Re-run against the real built prod bundle; asserts pixel-level rendering (`document.elementFromPoint` hit-test, non-zero `.react-flow` clientHeight, non-identity viewport transform) on both `/graph` and `/embed/graph`. |

All effect tests assert user-observable outcomes, not merely that a function was called or a contract validates.

## Verdict

**APPROVED-WITH-NOTES** (after the openapi.yaml fix applied in this pass; originally NEEDS-CHANGES on one BLOCKING finding, now resolved).

Must fix before merge: none remaining — the sole BLOCKING finding (`get_authenticated_user.storage.environment` undeclared in `openapi.yaml`) has been fixed in this preparation pass and re-verified (bc-diff clean, contract tests pass, typecheck/build clean).

Should address in follow-up:
- Declare the pre-existing `entity_snapshot_after` field on `StoreStructuredResponse.entities[]` in `openapi.yaml` (introduced by #1840, predates this release).
- Update `docs/developer/cli_reference.md` to reflect the global-install `.mcp.json` behavior change from #1880/#1904.
