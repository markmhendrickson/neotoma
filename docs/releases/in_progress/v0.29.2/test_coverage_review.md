# Test coverage review — v0.29.2

Range: `v0.29.1..db746e7d6`, 4 non-merge commits (#2848 proposal; #2816 CI step; #2860 dependency split; #2862 worktree env copy). Release-branch commits on top change only the version, version lines in `README.md` and `docs/known_limitations.md`, and release docs.

## Surfaces

- Published package manifest (#2860): covered by the new `npm run check:production-consumer`, which installs the packed tarball with `--omit=dev` and exercises the CLI, the package import, `/health` and the Inspector shell and assets. CI ran it green on `db746e7d6`. Its helpers are covered by `tests/scripts/check_production_consumer.test.mjs` (4 passed locally).
- Contributor tooling (#2862): covered by `tests/scripts/worktree_env_copy.test.ts` (20 passed locally), now a required baseline CI step.
- #2816 is itself a test gate. #2848 is a design-only document.
- No CLI command or flag, API path, parser, migration or server runtime setting changed.

## Code review

`/review v0.29.1..HEAD` verdict: APPROVE. Findings: none BLOCKING.

- ADVISORY: a downstream project that imported React, `turndown`, `papaparse` or another moved package transitively through `neotoma` will need to declare it. Called out in the supplement under "What changed for npm package users".
- ADVISORY: the `Remote integration nightly` workflow has failed on `main` since 2026-11-13 (before this range) because the job runs vitest without building `dist/`. Not introduced by this range; it does not gate the release.
- No `openapi.yaml`, contract mapping, schema, MCP tool or agent instruction changed. New files are snake_case or follow existing kebab-case script names in `scripts/`; none are in the repo root.
