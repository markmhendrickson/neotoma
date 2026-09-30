# Test coverage review — v0.24.1

Range: `v0.24.0..HEAD` (`b3cb17e04`). There are 2 commits (#2523 and #2541), touching 40 files (+518/−180 lines).

## Code review

`/review v0.24.0..HEAD`. Surfaces: CLI (skills mirror), MCP `initialize` response, MCP instruction block, docs/site, tests, and CI manifest. High-risk: one local filesystem mutation (`unlinkSync` of a harness skills symlink). There are no auth, data-layer, or contract changes.

**Verdict: APPROVE.** No blocking findings.

Pre-PR checklist (relevant items):

- 1, 2, 12, 13, 21 (OpenAPI, contract mappings, routes): N/A. `openapi:bc-diff` reports no changes, and `security:manifest:check` is in sync.
- 3 Contract tests: covered by the full unit/contract run on the release head (see Tests below).
- 5 MCP / CLI instruction parity: ✓. Only the canonical MCP fenced block changed (`[INITIALIZATION]`). Under `agent_instructions_sync_rules`, `cli_agent_instructions.md` correctly carries no duplicate.
- 10 bc-diff reviewed: ✓. The supplement says `No breaking changes.`
- 14 Supplement present under `docs/releases/in_progress/v0.24.1/`: ✓. No completed supplements were modified.
- 16, 25 Determinism: ✓. `getPackageSkills()` sorts both the installable and deprecated lists, and `listSkillNames` already sorts.
- 18 No PII: ✓. The new log line names only a local directory path, on CLI stdout.
- 20 Security gates: ✓. See `security_review.md` (sensitive=true, root-landing nav array only, sign-off `yes`).
- Test catalog: ✓. `docs/testing/automated_test_catalog.md` was regenerated in #2523 for the new `tests/unit/skill_deprecation.test.ts`.

Advisory:

- **A1: `isDeprecatedSkillDir` fails open** (`src/shared/skill_deprecation.ts:24`). A malformed frontmatter, or a quoted `deprecated: "true"`, counts as not deprecated. The comment documents this as an intentional choice for an advisory filter. The worst outcome is that a retired skill stays advertised. It is not blocking, and a follow-up could accept the quoted form.
- **A2: `getPackageSkills()` reads every `SKILL.md` synchronously on each authenticated `initialize`** (`src/server.ts:441`). There are about 13 small files per call, so it is negligible today. Consider caching per process if the skills directory grows.
- **A3: root fall-through edge.** If every skill under the first root were deprecated, `getPackageSkills()` would fall through to the next root instead of returning an empty list. This cannot happen with the shipped package.

Nit:

- The deprecated `SKILL.md` stubs keep their `triggers:` lists. They are harmless, because harnesses no longer link the stubs after a re-sync.

## User-facing surfaces

| Surface | Test | Classification |
|---|---|---|
| `neotoma setup` / `neotoma skills sync` skip deprecated skills (fresh install forces per-skill mode) | `tests/cli/skills_mirror.test.ts` › "forces per-skill mode (never a whole-dir symlink) when the source has a deprecated skill". Drives `mirrorToHarness` against a real temp filesystem and asserts which links are on disk. | Covers user-observable behavior end-to-end |
| Existing whole-dir symlink converted to per-skill links (destructive local-filesystem op) | `tests/cli/skills_mirror.test.ts` › "removes both retired wrappers from a pre-existing whole-dir install while preserving workflows". Creates a real symlink install, re-syncs, and asserts that the retired names no longer resolve, active skills resolve, and the source directory is intact. | Covers user-observable behavior end-to-end |
| Per-skill links to newly deprecated skills are pruned, and foreign entries are kept | `tests/cli/skills_mirror.test.ts` › "prunes a per-skill link to a skill that became deprecated, keeping active and foreign entries" | Covers user-observable behavior end-to-end |
| MCP `initialize` `available_skills` excludes deprecated package skills | `tests/unit/mcp_initialize_skills.test.ts` and `tests/integration/instance_skills_initialize_effect.test.ts`. Both drive the real initialize handler. | Covers user-observable behavior end-to-end |
| Graph-stored `skill` row named like a retired package skill is dropped from `available_skills` and `[INSTANCE SKILLS]` | `tests/integration/instance_skills_initialize_effect.test.ts` | Covers user-observable behavior end-to-end |
| Frontmatter detection helper | `tests/unit/skill_deprecation.test.ts` | Helper test. The end-to-end tests above cover the user-facing paths. |
| Capability manifest includes `list_relationship_types` / `register_relationship_type` | `npm run validate:capability-manifest` (a CI step): "OK: capability_manifest.json is up-to-date." | Covered (generator check) |
| MCP instruction block edit | `tests/unit/mcp_instructions_fallback_invariants.test.ts` (full unit run) | Covered |
| Site: retired skill pages removed | `SkillDetailPage` redirects unknown slugs to `/skills` (`frontend/src/components/subpages/SkillDetailPage.tsx:365`) | Existing behavior. No new test needed. |

No BLOCKING gaps.

## Tests run on the release head

- `tests/cli/skills_mirror.test.ts`, `tests/unit/mcp_initialize_skills.test.ts`, `tests/unit/skill_deprecation.test.ts`, `tests/integration/instance_skills_initialize_effect.test.ts`, `tests/integration/graph_neighborhood_pagination.test.ts`: 5 files, 59 passed.
- `npm run test:security:auth-matrix`: 18 passed, 1 skipped.
- `npm run type-check`: passed.
- `npm run validate:capability-manifest`: up to date.
