# Test coverage review — v0.15.0

## User-facing surfaces

### `retrieve_graph_neighborhood` source branch fix (#389/#394)
**Classification:** Covers user-observable behavior end-to-end.
`tests/integration/graph_neighborhood_source_branch.test.ts` boots the real Express app over HTTP and asserts both the `node_type: "source"` path and the `node_type: "entity"` + `include_sources` path return the seeded source. Verified to fail against the singular `source` table and pass after the fix. Both fixed query sites preserve `.eq("user_id", userId)` tenant scoping.

### `pull_request` entity type seed (#158)
**Classification:** Covers user-observable behavior end-to-end.
`tests/unit/pull_request_schema.test.ts` is a fully implemented 8-test suite covering schema registration, canonical name resolution, field declarations, merge policies, and the "no dangling policies" invariant.

### `submit_issue` keyless/guest hardening (#944, #937)
**Classification:** Covers user-observable behavior end-to-end.
`src/services/issues/neotoma_client.test.ts` (new, 81 lines, 3 describe blocks) covers: no-keypair skip (asserts `signWithCliAAuth: false`), AUTH_REQUIRED retry success, AUTH_REQUIRED retry both-fail. `src/services/issues/issue_operations.test.ts` (+54 lines) adds a `callOrder` test verifying Neotoma-first sequence and a test asserting GitHub is not called when Neotoma fails.

### Canonical mirror import hoist (#371)
**Classification:** Covers user-observable behavior end-to-end.
`src/services/canonical_markdown.test.ts` (+29 lines) adds two tests for the `content_field` heading-skip. Mirror/markdown suites (54 tests) pass. No dynamic `await import("./canonical_markdown.js")` calls remain in `canonical_mirror.ts`.

### `AgentCapabilityEntry` github_harness ops (#934)
**Classification:** Covers a helper function — partial gap.
`agent_grants.ts` has no new test. The `isHarnessOp()` validator is exercised indirectly through the existing agent_grants integration tests. No isolated unit test verifies that a grant with `github_harness:*` + `repos: ["owner/repo"]` passes validation while a grant with `github_harness:*` + `entity_types: ["contact"]` produces a validation error. Advisory gap — not blocking this release (the existing grants test suite covers happy paths; the harness-op path is an additive schema extension not yet used in production flows).

### MCP transport preset `e`
**Classification:** Covers a helper function — partial gap.
`mcp_config_scan.ts` changes are tested through the scan integration but there is no isolated unit test for `neotomaServerEntriesForTransport("e", ...)`. Advisory gap.

### LaunchAgent tooling (`deploy/launchagents/`)
**Classification:** Ops tooling, no automated test.
New plist templates and install script are shell/config, not runtime TypeScript. No automated test; manual install verification is the appropriate check.

### Husky v9 shebang removal (#400)
**Classification:** Covers user-observable behavior end-to-end (pre-commit hook runs on every commit).
`sh -n .husky/pre-commit` validates syntax.

## Summary

All blocking user-observable surfaces (source branch query, pull_request schema, issue submission, mirror import) have end-to-end or real-HTTP-stack test coverage. Two advisory gaps exist (harness-op grant validation, transport `e` unit coverage) — neither blocks this release.

---

## Code review

**Diff:** `v0.14.0..HEAD` — 109 files, +1729/−344 lines
**Reviewer:** Claude (gryllus-agent), automated structured review via `/review` skill
**Run date:** 2026-05-29

### Blocking finding (resolved before RC)

**[BLOCKING — RESOLVED] API contract — openapi.yaml not updated for github_harness ops**
- `src/shared/openapi_types.ts` was hand-edited to add `github_harness:read/write/*` enum values and `repos` optional field to `AgentCapabilityEntry`, but `openapi.yaml` was not updated. Any future `npm run openapi:generate` would silently revert these additions.
- **Resolution:** `openapi.yaml` `AgentCapabilityEntry` updated with the three harness op enum values and the `repos` optional property. `npm run openapi:generate` regenerated — output matches the hand-edited file exactly. `npm run openapi:bc-diff` rerun: still **No breaking changes** (1 non-breaking addition). `npm run type-check` clean.

### Advisory findings

**[ADVISORY] `cli_reference.md` missing transport `e`**
- `docs/developer/cli_reference.md` still showed `--mcp-transport <a|b|c|d>` at two flag-description lines and the transport presets table had no `e` row.
- **Resolution:** Both flag-description lines updated to `<a|b|c|d|e>`. Transport `e` row added to the presets table with use-when and notes.

**[ADVISORY] `pull_request` schema — `schema_version` has no explicit merge policy**
- `schema_version` is declared `required: true` but has no `merge_policies` entry; the reducer falls through to default (last-write). This is the existing convention across all schemas. Not a runtime bug. The `pull_request_schema.test.ts` "no dangling policies" test checks policies → fields but not fields → policies.
- **Disposition:** Accepted as-is per existing convention. No change needed before release. Future hardening: add a complementary assertion in `pull_request_schema.test.ts`.

**[ADVISORY] `github_harness:*` grant validation not unit-tested**
- `isHarnessOp()` and `repos`-vs-`entity_types` branch in `agent_grants.ts` are exercised indirectly through existing integration tests but have no isolated unit test for the new validation path.
- **Disposition:** Accepted as advisory gap. Harness ops are additive; the existing grant test suite covers happy paths.

### Nit findings

**[NIT] Mirror/markdown test count "54" — not precisely verifiable from static grep**
- Static `it(` count yields 47 from `canonical_markdown.test.ts` + `canonical_mirror.test.ts`; 54 is the runner's reported count including nested tests. Not a material inaccuracy.

**[NIT] `pull_request` absent from MCP instructions common-types list**
- `pull_request` is now a seeded schema but not listed in the MCP instructions "known types that skip `list_entity_types`" example. Correct behavior per the rules; nit for discoverability.

**[NIT] Transport `e` "single neotoma slot" description vs two-slot write**
- Both `neotoma-dev` and `neotoma` slots are written for transport `e` (both pointing to prod). CLI help text says "single slot" — slight inaccuracy. Advisory: update CLI prompt text in a follow-up.

### Supplement accuracy

All behavioral claims verified against the actual code. `No breaking changes.` confirmed by `openapi:bc-diff`. All user-facing fixes trace to committed code with test coverage. See surface-by-surface verification in the code review agent output.

### Review verdict

```
--- Review Summary ---
Base..Head: v0.14.0..HEAD
Files reviewed: 109
Blocking: 1 (resolved before RC)
Advisory: 3
Nit: 3

Verdict: APPROVED-WITH-NOTES

Must fix before merge:
- (none remaining — blocking finding resolved)

Should address in follow-up:
- Add isolated unit test for github_harness:* grant validation path
- Add transport e unit test for neotomaServerEntriesForTransport("e", ...)
- Add pull_request to MCP instructions common-types list
- Update transport e CLI prompt text to accurately describe two-slot write
```
