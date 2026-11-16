Neotoma v0.29.2 is a patch release. It moves 42 Inspector and frontend build packages out of the runtime dependencies, so `npm install neotoma` installs far less. It also makes the worktree env copy opt-in for contributors, adds CI gates, and ships one design proposal. It changes no API, CLI command or data-layer behavior.

## Highlights

- **A production install is 43% smaller.** React, Radix UI, Tailwind helpers and the other packages used only to build the Inspector and the site are now devDependencies. Direct runtime dependencies drop from 70 to 28, installed production packages from 340 to 214, and production `node_modules` from 413,320 KiB to 235,916 KiB. The Inspector still ships prebuilt in `dist/inspector` (#2855, #2860).
- **A new packed production-consumer check guards the published package.** `npm run check:production-consumer` packs the package, installs it into an empty project with `--omit=dev`, rejects frontend build packages in the runtime tree, runs `neotoma --help`, imports the package, reaches `/health`, and requests the Inspector shell and its assets. CI runs it on every PR (#2860).
- **Creating a worktree no longer copies an env file by default.** The copy runs only when `NEOTOMA_WORKTREE_COPY_ENV=1` is set, refuses a source that sets `NEOTOMA_ENV=production`, and no longer prints paths. The pre-commit hook now rejects staged env files other than `*.example` templates (#2862).
- **Pull requests now run the correction and observation-insert integration tests.** These suites live under `tests/integration`, which the unit lane excludes, so changes to `createCorrection` or the observation insert primitive were not gated by them (#2816).

## What changed for npm package users

- `npm install neotoma` no longer installs React, Radix UI, Tailwind, `turndown`, `papaparse` and the other Inspector and site build packages. No server or CLI code imports them; the Inspector is served from the prebuilt bundle as before.
- If your own project imported one of those packages without declaring it, relying on Neotoma to bring it in, add it to your own `package.json`.

## API surface & contracts

- No change. No OpenAPI path, operation, MCP tool or CLI command was added, removed or altered. The README still states 67 MCP tools and 113 REST paths.

## Behavior changes

- Runtime: none.
- Contributor tooling: the `post-checkout` hook, `scripts/cursor-worktree-init.sh` and `npm run copy:env` skip the env copy unless `NEOTOMA_WORKTREE_COPY_ENV=1` is set. Set up a new worktree with `cp .env.example .env.development`, or opt in after reviewing the source file. These scripts are not in the npm package.

## Docs site & CI / tooling

- `.github/workflows/ci_test_lanes.yml` gains steps that install the Inspector's build dependencies, run the packed production-consumer check and its unit tests (#2860), run `tests/scripts/worktree_env_copy.test.ts` (#2862), and run ten correction and observation-insert integration test files on PRs (#2816).
- New `scripts/check_production_consumer.js` and `scripts/deny-staged-env-files.js`.
- `docs/testing/testing_standard.md` documents the production-consumer check and the worktree env copy test. `docs/developer/development_workflow.md`, `docs/developer/worktree_env.mdc` and the agent rule mirrors describe the opt-in copy.
- New `docs/proposals/target_instance_check.md` (#2848), the revision 8 design for slices 1a and 1b of the target-instance check (design issue #2589). It is design only; nothing is implemented.

## Internal changes

- `scripts/simulate_npm_install.js` is updated to match the new dependency split.

## Security hardening

The worktree env change (#2862) stops contributor tooling from copying a production env file, and its credentials, into a new worktree without being asked, and blocks committing env files at pre-commit. No route, middleware, auth or proxy-trust code changed. The classifier reports `sensitive=false` for `v0.29.1..HEAD`; see the [security review](https://github.com/markmhendrickson/neotoma/blob/main/docs/releases/in_progress/v0.29.2/security_review.md).

## Tests and validation

- Release prep ran the security lane (classifier, static rules, protected-routes manifest check, auth topology matrix), the OpenAPI breaking-change diff, `tests/scripts/worktree_env_copy.test.ts` (20 passed) and `tests/scripts/check_production_consumer.test.mjs` (4 passed). The packed production-consumer check passed in CI on `db746e7d6`. Results are in the security review and the [test coverage review](https://github.com/markmhendrickson/neotoma/blob/main/docs/releases/in_progress/v0.29.2/test_coverage_review.md).

## Breaking changes

No breaking changes.
