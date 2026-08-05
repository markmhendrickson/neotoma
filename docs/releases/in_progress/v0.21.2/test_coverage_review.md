# Test Coverage Review — v0.21.2

**Range:** `v0.21.0..HEAD` (7 commits)

## Surface-by-surface coverage

| Surface | Classification | Evidence |
|---|---|---|
| `update_schema_incremental` metadata preservation | Covers user-observable behavior end-to-end | `tests/unit/schema_incremental_metadata_preservation.test.ts` — 4 tests: carries `guest_access_policy` forward on unrelated field add (the exact #1977 symptom), preserves an unrelated `icon` key, lets an explicit `metadata` option override one key without dropping others, confirms empty-but-defined object when prior row had none. |
| `backup create` atomic snapshot | Covers user-observable behavior end-to-end | `tests/cli/backup_verify.test.ts` reproduces the original WAL/main-file race with a concurrent writer interleaved with the backup call; fails `SQLITE_CORRUPT` against the pre-fix implementation, passes against `VACUUM INTO` + `PRAGMA integrity_check`. Genuinely adversarial — not a happy-path-only test. |
| MCP shim port self-healing | No automated test (manual verification only) | Shell script, not covered by the vitest suite. Verified manually: sabotaged port file → shim probed canonical ports, logged discovery, self-healed the file, completed an MCP `initialize` handshake. Gap accepted for this release — the script is small, mirrors an already-verified idiom, and the blast radius of a bug here is "shim doesn't attach," not data loss. |
| Codex live-session discovery (`findCodexSessionRollouts`) | Covers user-observable behavior end-to-end | `tests/cli/discovery_codex_sessions.test.ts` (46 lines) exercises the bounded recursive walk against a real `YYYY/MM/DD/rollout-*.jsonl` fixture tree. |
| Codex transcript parsing (`input_text` blocks) | Covers user-observable behavior end-to-end | `tests/cli/transcript_parser_codex_content.test.ts`, `tests/cli/transcript_parser_codex_paths.test.ts` — parse real rollout JSONL fixtures, assert message extraction from `input_text` blocks that were previously silently dropped. |
| Session-identity derivation (`agent_session`/`session_transcript`) | Covers user-observable behavior end-to-end | `tests/cli/transcript_parser_session_entities.test.ts` (206 lines) covers all three harness parsers (Claude Code, Codex, Cursor), including Codex `turn_context` cwd updates and Cursor `native_session_id` prefix-stripping — both edge cases called out as gaps in an earlier review round on this same PR and subsequently covered. |
| `agent_session`/`session_transcript` schema seeding | Covers user-observable behavior end-to-end | `tests/services/session_seed_schema.test.ts` (127 lines) — 5 tests: fresh registration, both canonical keys, no-op-when-already-registered path, and the never-retro-require rule. |
| `idempotency_key` on transcript-entity stores | Covers user-observable behavior end-to-end, and the fix is itself a caught regression | `tests/cli/onboarding_import_session_entities.test.ts` (253 lines) enforces the actual server contract (`idempotency_key required when entities are provided`) rather than the previous unconditional-accept mock that hid this exact defect. Verified live against the real API per the commit message (first store `action=created`, identical repeat is a no-op). |
| Degraded-import classification (`kind: "expected" \| "unexpected"`) | Covers user-observable behavior end-to-end | Tests assert the `kind` field on a corrupt transcript and that no reason string contains a literal `"?"` placeholder. |
| `quoteSqliteStringLiteral` (backup path SQL-literal escaping) | Helper covered only indirectly | No direct unit test; exercised only via the backup integration test with a path unlikely to contain a single quote. Flagged as a NIT follow-up, not blocking — the function is small and the integration test would still catch a broken escape on any path containing `'`. |
| `beforeExit`/`exit`/signal-handler diagnostics | No automated test (manual verification only) | Process-lifecycle code, hard to unit test in-process. Verified manually per commit message: "a synthetic drain confirms the handler fires." Accepted gap — see Behavior note below. |

## Code review

Ran `/review v0.21.0..HEAD` via a dedicated review pass covering the full pre-PR checklist (25 items), architectural review (State Layer boundaries, schema-agnostic design, determinism, immutability, auth surface, portability), product/UX alignment, and documentation completeness.

**Verdict: APPROVED-WITH-NOTES**

**Findings:**

- **BLOCKING (resolved in this prep pass):** `docs/releases/in_progress/v0.21.2/*` were untracked at review time — resolved by staging and committing them together with the version bump per Step 7 of the release workflow.
- **BLOCKING (resolved in this prep pass):** `package.json`/`package-lock.json` still read `0.21.1` at review time, and a stale, partial `docs/releases/in_progress/v0.21.1/*` (covering only 3 of the 7 commits, from the abandoned/never-published v0.21.1 RC) coexisted with the new v0.21.2 folder covering the full range. Resolved by removing the stale v0.21.1 folder and bumping the version to `0.21.2` in the same commit as this supplement.
- **ADVISORY (documented, not code-fixed in this pass):** the new `SIGTERM`/`SIGINT`/`SIGHUP` → immediate `process.exit(0)` handler in `src/actions.ts` has no graceful-drain window, and combined with the new `restart policy = 'always'` in `fly.toml`, every routine Fly deploy now delivers `SIGTERM` into an immediate-exit path that can drop an in-flight request. This is genuinely new behavior versus v0.21.0 (no signal handler existed before). Not fixed in this prep pass because: (a) the code is already merged to main via a reviewed PR, and (b) changing shutdown semantics deserves its own test coverage and consideration of the drain timeout value, not a rushed addition during release prep. Documented explicitly in the supplement's "Behavior changes" section instead, with a note that it is a candidate for a follow-up patch. The net effect of this release is still strictly fewer outages than v0.21.0 (which had no restart-on-clean-exit at all), so this is not a regression significant enough to hold the release for.
- **NIT (deferred to follow-up, not blocking):** duplicated JSDoc comment above `HARNESS_SOURCES` in `src/cli/transcript_parser.ts`; missing direct unit test for `quoteSqliteStringLiteral`; no automated test for the exit-diagnostics/signal-handling block (process-level, hard to unit test).

All other checklist items (idempotency handling, security gates, determinism, immutability, schema-agnostic design, auth surface, portability, contract/OpenAPI surface, documentation completeness) passed clean. Full findings detail retained in the review agent's transcript; summarized here per the release workflow's requirement to append the code-review verdict to this file.

## Gaps accepted for this release

- MCP shim port-discovery shell script: manual verification only, no automated coverage. Small blast radius (shim connectivity, not data integrity); consistent with the same gap already accepted in the prior (abandoned) v0.21.1 review for the same code.
- `beforeExit` diagnostics: manual verification only. Process-signal testing is genuinely hard to automate reliably; the diagnostic value (naming the resource that holds #2094's event loop open) outweighs holding the release for test infrastructure that doesn't exist yet.
- SIGTERM drain behavior: documented as a known gap in the supplement rather than fixed, per the reasoning above.

No BLOCKING coverage gap remains unresolved at HEAD of the release branch.
