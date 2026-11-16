# Test coverage review — v0.30.0

Range: `v0.29.1..3eb3c1354`, 5 non-merge commits (#2848 proposal; #2816 CI step; #2860 dependency split; #2862 worktree env copy; #2867 unified field provenance). Release-branch commits on top change only the version, version lines in `README.md`, `docs/known_limitations.md` and `SECURITY.md`, and release docs.

## Surfaces

- **Field provenance response, HTTP and MCP (#2867):** covers user-observable behavior end-to-end. `tests/integration/field_provenance_contract_parity.test.ts` calls both transports and asserts the same body. It covers complete merged evidence, the projections, deterministic ordering and aliases, an interpreted field, and the integrity and not-found envelopes. `tests/integration/field_provenance_corrected_and_merged.test.ts` covers corrected fields with null sources and merged fields. All passed locally, and CI runs them on PRs.
- **`neotoma request` error output keeps hints (#2867):** covers user-observable behavior end-to-end. `tests/cli/cli_field_provenance.test.ts` spawns the built CLI through `execFileLocal` against the test server. It asserts nonzero exit, the domain code and the hint on stderr for not-found and integrity failures, plus the success-path output. It passed locally.
- **Tenant scoping of provenance reads (#2867):** `tests/security/provenance_read_scoping.test.ts` covers own reads and foreign reads on HTTP and MCP. It passed locally.
- **Published package manifest (#2860):** covered by `npm run check:production-consumer`, which runs in CI on every PR and passed on `main`. Its helpers are covered by `tests/scripts/check_production_consumer.test.mjs`.
- **Contributor tooling (#2862):** covered by `tests/scripts/worktree_env_copy.test.ts`, a required baseline CI step.
- #2816 is itself a test gate. #2848 is a design-only document.
- No migration, parser, new CLI command or server runtime setting changed.

Local run, five files including the auth matrix: 65 passed, 1 skipped. CI test lanes passed on `main` at `3eb3c1354`.

## Code review

`/review v0.29.1..HEAD` verdict: APPROVE. Findings: none BLOCKING.

- ADVISORY: #2867 changes the response contract of an existing operation in four ways: a closed, projected HTTP body, removal of MCP `source.file_urls`, an integrity error instead of a partial 200, and a new `observation_ids` order. All four are named with migration notes in the supplement's Breaking changes, and the version is a minor bump. The change is response-side, so the request-side legacy-payload corpus (`tests/contract/legacy_payloads/`) does not apply.
- ADVISORY: the `FieldProvenanceError` envelope sets `timestamp` from the wall clock. This is response metadata, not data-layer output, so determinism is not affected.
- ADVISORY: sources are read one at a time with `getOwnedSource`. That is fine for the typical one to three sources per field, but it scales linearly for heavily merged fields.
- ADVISORY: a downstream project that imported React, `turndown`, `papaparse` or another moved package transitively through `neotoma` must now declare it. This is called out in the supplement.
- Contract seams for #2867 are aligned. `openapi.yaml`, `openapi_actions.yaml` and `src/shared/openapi_types.ts` are regenerated. The tool description and MCP instruction line are updated. `docs/reference/error_codes.md` documents the new code, and the test catalog is regenerated. No new operation, so no new `contract_mappings.ts` row is needed.
