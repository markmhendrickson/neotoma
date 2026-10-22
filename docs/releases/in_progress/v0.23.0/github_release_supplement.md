This release ships one feature and three fixes: hosted-instance skills are now visible to MCP-only agents at session start, a stale MCP session id no longer breaks the whole client instead of just that one session, scalar correction tie-breaks now pick the newer write instead of an arbitrary one, and a CLI test process can no longer silently read and write a real operator's data directory.

## Highlights

- **MCP-only agents can now discover skills stored in the graph, not just skills mirrored to disk.** A hosted instance whose skills live in the graph as `skill` rows previously shipped an empty `available_skills` array to any client that never had filesystem access to a `skills/` directory. `serverInfo._neotoma.available_skills` and a new `[INSTANCE SKILLS]` instructions section now union both sources.
- **A restarted MCP server no longer strands every connected agent.** An unknown `mcp-session-id` on an authenticated request was treated as fatal; the server now mints a fresh transport, completes a server-side `initialize` handshake in place, serves the original call, and returns a new session id.
- **Scalar corrections at the same priority tier now resolve to the newer observation, not an arbitrary one.** Previously a tie at the same numeric priority and source-kind tier fell straight to an id-based sort with no regard for recency, so a later correction could silently lose to an earlier one with a lexicographically smaller id.
- **A test-shaped CLI process can no longer silently fall back to a real operator's data directory.** `hydrateDataDirFromUserEnvConfig()` used to resolve `~/.config/neotoma/.env`'s data directory whenever `NEOTOMA_DATA_DIR` was unset, even in a child process spawned by a test that didn't intend to inherit it. That path now refuses and exits non-zero under `VITEST` / `NODE_ENV=test` / `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR=1`, naming the variable to set.

## What changed for npm package users

**Runtime / data layer**

- New env var `NEOTOMA_MCP_INSTANCE_SKILL_HINTS` (default: on). Set to `0` or `false` to disable the instance-skills lookup and instructions section entirely; the instructions payload is then byte-identical to pre-release behavior.
- New env var `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR=1` forces any caller (not just test-shaped processes) to require an explicit `NEOTOMA_DATA_DIR` rather than falling back to the user-level config.
- New env var `NEOTOMA_ALLOW_USER_ENV_IN_TEST=1` opts a test-shaped process back into the user-level data-dir fallback, for the rare test that means to exercise it deliberately against a synthetic `HOME`.
- MCP session recovery: an authenticated `POST /mcp` with an unknown `mcp-session-id` now recovers in place — no durable session persistence, no client-visible failure beyond a new session id in the response.

**Shipped artifacts**

- No `openapi.yaml` changes in this release (`npm run openapi:bc-diff` confirms zero surface changes).

## API surface & contracts

- No new or changed HTTP operations. The instance-skills feature and the MCP session-recovery fix are both MCP-transport-level behaviors, not REST endpoints.
- No breaking changes (`npm run openapi:bc-diff --base v0.22.2 --head HEAD`: no breaking changes detected, zero operation diffs).

## Behavior changes

- **`serverInfo._neotoma.available_skills`** is now the union of the filesystem `skills/` directory scan and graph-stored `skill` rows for the authenticated user. Previously it reflected only the filesystem scan.
- **MCP instructions gain an `[INSTANCE SKILLS]` section** (full mode: names + descriptions + fetch instructions; compact mode: names only, capped by count and byte size with an explicit "...and N more" truncation line) whenever the instance has enabled, graph-stored skills. An instance with no skill rows renders no section — byte-identical to before this feature.
  - `enabled: false` skills are excluded; a malformed `enabled` value fails closed (treated as disabled) rather than defaulting to visible.
  - `user_invocable` is not filtered on — it controls slash-command palette surfacing, not whether an agent is told the skill exists.
  - Skill descriptions are sanitized before rendering: control/bidi/zero-width characters stripped, collapsed to one line, leading markdown structure removed, inline authority tokens neutered. Skill names are validated as identifiers. This closes a channel where any principal able to write a `skill` row could inject text into every connecting agent's instruction stream.
  - A failed instance-skills read is surfaced as `skills_unavailable` / `skills_note` (parallel to the existing `standing_rules_unavailable` pattern) plus an explicit instructions-level note, so a broken read is never presented to an agent as "this instance has no skills."
- **A stale/unknown MCP session id on an authenticated request no longer 404s the connection.** The server recovers in place: mints a fresh transport, replays a server-side `initialize`, serves the original JSON-RPC call, and returns a new session id in the response headers. The remaining unknown-session 404 copy (for unauthenticated or otherwise unrecoverable cases) now leads with restart/stale-client recovery guidance.
- **Scalar correction tie-breaking now falls through to recency, then id, after a priority tie.** Previously, once source-priority and source-kind tier were equal, ordering fell straight to `a.id.localeCompare(b.id)` regardless of which observation was newer. Now a tie at that tier compares `observed_at`, then `created_at`, then id — so a newer correction reliably wins over an older one at the same priority.
- **A CLI or server process running under `VITEST`, `NODE_ENV=test`, or with `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR=1` set now refuses the user-level `~/.config/neotoma/.env` data-directory fallback and exits non-zero** if `NEOTOMA_DATA_DIR` is not explicitly set, naming the variable to set in the error. Every non-test entry point (interactive CLI, server) is unaffected and hydrates exactly as before. The refusal message reports the refused path's length, not the path itself, since it may name a real operator directory.

## Docs site & CI / tooling

- `docs/developer/mcp/instructions.md`, `docs/developer/mcp/compact_instructions.md`, `docs/developer/mcp/proxy.md`, `docs/developer/mcp/tool_descriptions.yaml`, and `docs/specs/MCP_SPEC.md` updated for the `[INSTANCE SKILLS]` section and `available_skills` contract (now one coherent description instead of three contradictory lines, with full/compact/truncated examples verified against real renderer output).
- `docs/subsystems/conflict_resolution.md`, `docs/subsystems/observation_architecture.md`, and `docs/subsystems/reducer.md` updated to describe the recency-then-id tie-break fallback.
- `docs/operations/configuration.md` updated for the new env vars (`NEOTOMA_MCP_INSTANCE_SKILL_HINTS`, `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR`, `NEOTOMA_ALLOW_USER_ENV_IN_TEST`).
- CI: `ci_test_lanes.yml` gains a dedicated step running `tests/integration/instance_skills_initialize_effect.test.ts` against the built server with `--no-file-parallelism`, since the unit suite alone (28 mocked tests) could not catch the backend-driver SQL defect described below — reverting the fix fails 4 of the 10 integration tests while all 28 mocked unit tests kept passing.

## Internal changes

- `src/services/skills/instance_skills.ts` (new): graph-backed skill read (`getInstanceSkillsResult`) structurally parallel to the existing standing-rules read, plus `renderInstanceSkillsSection`.
- Fixed a backend-driver-specific defect in the initial instance-skills query: it selected `entity_snapshots!inner(snapshot)`, a PostgREST embedded-resource hint that libSQL forwards literally into SQL and fails on (`unrecognized token: "!"`). Because the lookup swallows errors so a failed read never blocks session init, this failure was completely silent on the local/libSQL backend — every local session received zero instance skills while all mocked unit tests passed. This is the third occurrence of this exact defect shape in the codebase (after #2131 standing rules and #1975 instance policy); it is now the last remaining `!inner` embed in `src/`.
- `src/mcp_http_session.ts` (new, 236 lines): session-recovery transport minting and replay logic for the stale-session fix.
- `src/reducers/observation_reducer.ts`: added `timestampMs` and `compareObservationRecencyThenId` helpers backing the tie-break fix.
- `src/config.ts`: `hydrateDataDirFromUserEnvConfig()` gains the test-shaped-process refusal gate.
- Tests added: `tests/integration/instance_skills_initialize_effect.test.ts` (400 lines, no DB mock — seeds real rows, drives the real `initialize` handler), `tests/unit/mcp_instance_skill_hints.test.ts` (660 lines, unit suite expanded 28→48), `tests/integration/mcp_session_recover_in_place.test.ts` (286 lines), `tests/integration/correction_scalar_tiebreak_surfaces.test.ts` (512 lines), `tests/unit/observation_reducer_highest_priority_tiebreak.test.ts` (207 lines), `tests/unit/config_refuses_user_env_under_test.test.ts` (170 lines).
- `tests/cli/cli_init_interactive.test.ts` updated: two existing tests that deliberately exercised the user-level data-dir fallback against a synthetic `HOME` now opt in explicitly via `NEOTOMA_ALLOW_USER_ENV_IN_TEST=1` — the guard itself found these tests, "the defect's own pattern caught in the act."

## Fixes

- **Hosted-instance skills invisible to MCP-only clients (#2046).** A hosted instance's graph-stored `skill` rows never reached `available_skills` or the instructions block because the only surfacing path was a filesystem directory scan. Fixed by adding a graph-backed read unioned with the filesystem scan, gated by `NEOTOMA_MCP_INSTANCE_SKILL_HINTS` (default on).
- **A restarted MCP server breaking every connected agent (#2403, #2100).** An unknown `mcp-session-id` on an authenticated request was treated as a fatal 404 rather than a recoverable condition, so any server restart or transport-layer session loss required every connected client to fully reconnect and re-`initialize`. Fixed by recovering in place: mint a fresh transport, replay `initialize` server-side, and serve the original call under a new session id.
- **Scalar correction tie-break ordering not respecting recency (#2396).** Corrections at the same source-priority and source-kind tier fell straight to an id-based sort, so a newer correction could lose to an older one purely on lexicographic id ordering. Fixed by falling through to `observed_at`, then `created_at`, then id.
- **A test-shaped CLI process could silently read and write a real operator's data directory (#2387).** `hydrateDataDirFromUserEnvConfig()` ran unconditionally at module load; a test child process that didn't explicitly set `NEOTOMA_DATA_DIR` but inherited enough environment to reach the user-level fallback would resolve and operate on a real database, exiting 0. Test isolation held only by accident (the vitest worker's `exec` implicitly passed the variable to children) and nothing asserted it. Fixed by refusing the fallback under `VITEST` / `NODE_ENV=test` / `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR=1`.

## Tests and validation

- `npm run type-check`: clean.
- `npm run openapi:bc-diff -- --base v0.22.2 --head HEAD`: no breaking changes, zero operation diffs.
- New/changed-surface tests added in this release: `instance_skills_initialize_effect` (10 tests, integration, no DB mock), `mcp_instance_skill_hints` (unit suite 28→48), `mcp_session_recover_in_place` (integration), `correction_scalar_tiebreak_surfaces` (integration), `observation_reducer_highest_priority_tiebreak` (unit), `config_refuses_user_env_under_test` (unit, drives built config module and built CLI binary in real child processes since the refusal calls `process.exit`).
- Security lane (G1-G3): see Security hardening section below.
- Test coverage review: see `docs/releases/in_progress/v0.23.0/test_coverage_review.md`.

## Security hardening

`npm run security:classify-diff` reports this release `sensitive=true`, driven by `src/actions.ts` touching the auth-middleware surface classifier (the MCP session-recovery fix sits in the same `/mcp` handler). See `docs/releases/in_progress/v0.23.0/security_review.md` for the full adversarial review; summary: the session-recovery branch only fires after existing auth has already passed ("Auth already passed above — do not mint on 401 paths" per the added comment), so it changes behavior after authentication succeeds on a stale session id, not the authentication check itself. `security:lint` (0 errors / 133 warnings, identical categories to baseline), `security:manifest:check` (120 routes, unchanged — no new Express routes this release), and `test:security:auth-matrix` (18 passed / 1 skipped, unchanged from baseline) all confirm no new authorization surface. The instance-skills feature introduces a text-injection surface (graph-writable `skill.description` reaching every connecting agent's instructions) which is sanitized (control/bidi/zero-width stripping, single-line collapse, markdown-structure removal, authority-token neutering) and scoped to the authenticated user; reviewed in detail in the linked file. Sign-off verdict: **with-caveats**.

## Breaking changes

No breaking changes.
