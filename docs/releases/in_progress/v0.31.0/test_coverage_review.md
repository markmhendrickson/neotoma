# Test coverage review — v0.31.0

Range: `v0.30.0..origin/main`, 2 commits. Release prep reran the tests below (6 files, 174 tests passed), the type check, the auth topology matrix (18 passed, 1 skipped), and the test catalog validation.

## Surfaces

- **#2941 `mirror rebuild --clean` (destructive file removal):** Covers user-observable behavior end to end. `tests/unit/mirror_rebuild_clean_e2e.test.ts` runs real rebuilds on real folders. `tests/unit/mirror_manifest.test.ts`, `mirror_manifest_scope.test.ts` and `mirror_manifest_spellings.test.ts` cover the manifest, scope and path spellings, including symlinks. `tests/unit/mirror_rebuild_auth.test.ts` was updated for the new report.
- **CLI report output (`formatRebuildReport`, `--clean` help text):** Exercised through the end-to-end test. No flag was added.
- **#2937 guest-link confinement:** `tests/security/guest_token_entity_binding.test.ts` asserts 403 for another page's subscription and event routes under all five policy modes, and that a token still manages its own page.

No surface is classified BLOCKING.

## Code review

Verdict: APPROVE (no BLOCKING findings), from a manual pass of the diff against the change guardrails.

- BLOCKING: none.
- ADVISORY: `src/services/mirror_manifest.ts` is 667 lines with several spelling and path resolution paths. Later edits to it should rerun `mirror_manifest_spellings.test.ts`.
- ADVISORY: the breaking behavior change has no deprecation window. The supplement documents the migration.
- NIT: none.
- Guardrails: no OpenAPI, MCP or CLI command change. No schema, per-type branch or determinism concern. No route added.
