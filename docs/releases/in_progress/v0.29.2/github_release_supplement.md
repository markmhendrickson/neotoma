Neotoma v0.29.2 is a patch release. It adds a CI gate for correction and observation-insert integration tests and ships one design proposal for a target-instance check. It changes no code, API, CLI or runtime behavior.

## Highlights

- **Pull requests now run the correction and observation-insert integration tests.** These suites live under `tests/integration`, which the unit lane excludes, so changes to `createCorrection` or the observation insert primitive were never gated by them (#2816).
- **A design proposal for a target-instance check is added under `docs/proposals/`.** It covers data-class admission, stable instance identity and asserted targets. It is design only; nothing is implemented.

## What changed for npm package users

- No change to the CLI, the runtime, the data layer or shipped artifacts. The proposal is not part of the bundled public docs.

## API surface & contracts

- No change. No OpenAPI path, operation, MCP tool or CLI command was added, removed or altered. The README still states 67 MCP tools and 113 REST paths.

## Behavior changes

- None.

## Docs site & CI / tooling

- `.github/workflows/ci_test_lanes.yml` gains a step that runs ten correction and observation-insert integration test files on PRs, then removes the shared `.vitest` test database so later steps start from a fresh one (#2816).
- New `docs/proposals/target_instance_check.md` (#2848), the revision 8 design for slices 1a and 1b of the target-instance check (design issue #2589).

## Internal changes

- None beyond the proposal.

## Security hardening

No security-sensitive surfaces touched. The classifier reports `sensitive=false` for `v0.29.1..HEAD`; see the [security review](https://github.com/markmhendrickson/neotoma/blob/main/docs/releases/in_progress/v0.29.2/security_review.md).

## Tests and validation

- Release prep ran the security lane (classifier, static rules, protected-routes manifest check, auth topology matrix) and the OpenAPI breaking-change diff. Results are in the security review and the [test coverage review](https://github.com/markmhendrickson/neotoma/blob/main/docs/releases/in_progress/v0.29.2/test_coverage_review.md).

## Breaking changes

No breaking changes.
