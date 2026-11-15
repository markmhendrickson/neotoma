# Security review — v0.29.2

Manual review lane for `/release` Step 3.5, completed by the release-prep agent with no AI provider (`NEOTOMA_AI_REVIEW_PROVIDER=none`). The supplement's `Security hardening` section links this file.

## Scope

- Base ref: `v0.29.1`
- Code head: `origin/main` at `3dea54e80` (2 commits: #2848, a Markdown proposal, +1879; #2816, +16 lines in `.github/workflows/ci_test_lanes.yml`).
- Release-branch commits on top change only the version (`package.json`, `package-lock.json`), the version lines in `README.md` and `docs/known_limitations.md`, and release docs under `docs/releases/in_progress/v0.29.2/`.

## Lane results

| Check | Command | Result |
|---|---|---|
| Diff classifier | `npm run security:classify-diff -- --base v0.29.1 --head HEAD --json` | `sensitive=false`, no concerns |
| Static rules | `npm run security:lint` | 0 errors, 138 warnings across 472 files; the set is unchanged from v0.29.1 and no changed file is scanned |
| Protected routes manifest | `npm run security:manifest:check` | In sync with `openapi.yaml` (127 routes) |
| Auth topology matrix | `npm run test:security:auth-matrix` (after `npm run build:server`, with `NEOTOMA_ENV=development` and a scratch `NEOTOMA_DATA_DIR`) | 18 passed, 1 skipped |
| OpenAPI diff | `npm run openapi:bc-diff -- --base v0.29.1 --head HEAD` | No breaking changes detected |

## Findings

- None. The range adds one Markdown proposal and one CI test step that runs existing vitest files and deletes `.vitest/*.db*` files in the CI workspace; no secret, permission or trigger changes. No route, middleware, auth, proxy-trust, local-dev, guest-access or AAuth code changed, so the alternate-path auth, proxy trust, local-dev widening, unauthenticated public route, guest-access widening and AAuth downgrade prompts have no surface to apply to.
- Suggested negative tests: none.
- Residual risks: none introduced.

## Sign-off

Verdict: `yes`.
