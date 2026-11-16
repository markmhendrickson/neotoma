# Security review — v0.29.2

Manual review lane for `/release` Step 3.5, completed by the release-prep agent with no AI provider (`NEOTOMA_AI_REVIEW_PROVIDER=none`). The supplement's `Security hardening` section links this file.

## Scope

- Base ref: `v0.29.1`
- Code head: `origin/main` at `db746e7d6` (4 commits: #2848 Markdown proposal; #2816 CI integration-test step; #2860 dependency split plus packed production-consumer check; #2862 opt-in worktree env copy plus pre-commit env-file guard).
- Release-branch commits on top change only the version (`package.json`, `package-lock.json`), the version lines in `README.md` and `docs/known_limitations.md`, and release docs under `docs/releases/in_progress/v0.29.2/`.

## Lane results

| Check | Command | Result |
|---|---|---|
| Diff classifier | `npm run security:classify-diff -- --base v0.29.1 --head HEAD --json` | `sensitive=false`, 33 changed files, no concerns |
| Static rules | `npm run security:lint` | 0 errors, 138 warnings across 472 files; unchanged from v0.29.1 |
| Protected routes manifest | `npm run security:manifest:check` | In sync with `openapi.yaml` (127 routes) |
| Auth topology matrix | `npm run test:security:auth-matrix` (after `npm run build:server`, `NEOTOMA_ENV=development`, scratch `NEOTOMA_DATA_DIR`) | 18 passed, 1 skipped |
| OpenAPI diff | `npm run openapi:bc-diff -- --base v0.29.1 --head HEAD` | No breaking changes detected |

## Findings

- #2860 removes 42 packages from runtime `dependencies`. This shrinks the production install's supply-chain surface (340 to 214 installed packages). No file under `src/` or `bin/` imports a moved package. The new check script runs only in CI and release prep and strips `NEOTOMA_BEARER_TOKEN`, `NEOTOMA_BASE_URL` and `OPENAI_API_KEY` from the environment of the server it spawns.
- #2862 reduces credential exposure in contributor tooling. The worktree env copy is off unless `NEOTOMA_WORKTREE_COPY_ENV=1`, refuses a source with `NEOTOMA_ENV=production`, fails closed when the source cannot be parsed, and no longer logs paths. `scripts/deny-staged-env-files.js` blocks staged `.env*` files other than `*.example`. Residual gap, stated in the PR: an opted-in source that points storage at production data without setting `NEOTOMA_ENV=production` is not detected; tracked in a follow-up issue.
- No route, middleware, auth, proxy-trust, local-dev, guest-access or AAuth code changed, so those threat-model prompts have no surface to apply to.
- Suggested negative tests: none beyond the 20 cases in `tests/scripts/worktree_env_copy.test.ts`.

## Sign-off

Verdict: `yes`.
