---
title: Github Release Supplement
summary: v0.12.1 hardens the v0.12.0 surface area without changing its shape. It closes a guest-token validation gap on the auth path, restores Codex / OpenAI function-tool compatibility for the issue MCP tools (server-side enforcement is unchang...
---

v0.12.1 hardens the v0.12.0 surface area without changing its shape. It closes a guest-token validation gap on the auth path, restores Codex / OpenAI function-tool compatibility for the issue MCP tools (server-side enforcement is unchanged), tightens the prepublish Inspector build, and ships the operator-facing v0.12 documentation that the v0.12.0 tag advertised but did not yet include — a Doctor CLI reference, the operator hardening knobs, the LaunchAgent zombie-cleanup flag, the documented `bulk_close_issues` / `bulk_remove_issues` tools, and dedicated site pages for peer sync, substrate subscriptions, issue reporting, and security hardening.

## Highlights

- **Guest auth: invalid bearer tokens no longer downgrade to anonymous.** `maybeStampGuestPrincipal` is now async and explicitly validates an `Authorization: Bearer …` guest access token against `validateGuestAccessToken` before stamping the request principal. Guest-scoped entity reads also re-assert the token via a new `assertValidGuestAccessToken` helper. The error envelope on a missing or invalid guest principal now reads `Not authenticated - guest principal cannot resolve a user_id …` so operators can grep for it. Behavior under a valid token is unchanged. Regression coverage: `tests/integration/guest_invalid_bearer_routes.test.ts` asserts `401` for `/issues/submit`, `/issues/add_message`, `/issues/status`, `/subscribe`, `/unsubscribe`, `/list_subscriptions`, `/get_subscription_status`, `/events/stream`, and `/entities/duplicates` when the bearer is not a valid guest token.
- **Codex / OpenAI function-tool compatibility for the issue MCP tools.** `submit_issue`, `add_issue_message`, and `get_issue_status` no longer carry a top-level `anyOf` in their JSON Schema, because OpenAI's function-tool registry rejects schemas with a top-level combinator. Server-side enforcement is unchanged: `submit_issue` still returns `400 ERR_REPORTER_ENVIRONMENT_REQUIRED` when neither `reporter_git_sha` nor `reporter_app_version` is supplied (declared in `details.acceptable_field_groups`), and `add_issue_message` / `get_issue_status` still require `entity_id` or `issue_number`. Tool descriptions in `docs/developer/mcp/tool_descriptions.yaml` now describe the constraints in prose so MCP clients see the same contract without the schema combinator.
- **Operator hardening knobs are now documented in the security tree.** `SECURITY.md` and `docs/security/threat_model.md` add the `Operator hardening knobs (v0.12+)` section: `NEOTOMA_GUEST_WRITE_RATE_LIMIT_PER_MIN` (default `30`/min, key precedence AAuth thumbprint > hashed guest token > IP), `NEOTOMA_GUEST_TOKEN_TTL_SECONDS` (default `2592000`, with `revoked_at`-aware revocation), `NEOTOMA_HOSTED_MODE=1` (rejects private/loopback/link-local `sender_peer_url` on inbound peer-sync), and `MCP_PROXY_FAIL_CLOSED=1` (refuses unsigned downstream requests on AAuth proxies). All four were already shipping behaviors in v0.12.0; this release is what makes them findable from the security landing page.
- **`neotoma doctor --json` is now spec-documented.** `docs/developer/cli_reference.md` adds a Doctor section that describes the `--json` shape, every `data.risks[].code` (`icloud_drive`, `macos_synced_desktop_or_documents`, `prior_sqlite_repair_artifacts`), `suggested_safe_data_dir`, the migration command (`neotoma storage set-data-dir <path> --move-db-files`), and the `--tool` override consumed by `neotoma setup --output json`.
- **`reload_neotoma_launchagents.sh --kill-zombies` is documented end to end.** `docs/developer/launchd_dev_servers.md` and `docs/developer/scripts_reference.md` describe the four orphan patterns the flag SIGTERMs (legacy `node dist/index.js` adopted by launchd, `with_branch_ports.js → tsx → src/actions.ts` chains, `tsx watch … src/actions.ts` watchers from integration tests, and `npm exec tsx … src/actions.ts` debug runs) and call out that the steady-state orphan rate after the v0.12.0 process-group fix is near zero — `--kill-zombies` is the recovery path for pre-v0.12.0 leftovers and force-killed test parents.
- **`bulk_close_issues` / `bulk_remove_issues` are now declared in the spec table.** `docs/specs/MCP_SPEC.md` adds rows for both tools with their HTTP twins (`POST /issues/bulk_close`, `POST /issues/bulk_remove`); `docs/subsystems/issues.md` documents their MCP signatures and notes that `bulk_remove_issues` is a soft delete via `deleteEntity` observations and restoration goes through `restore_entity`. The tools shipped in v0.12.0; the spec table omitted them.
- **`store` write-classification, peer attribution, and external-actor fields are spelled out in the spec.** `docs/specs/MCP_SPEC.md` documents the v0.12+ `observation_source` (`sensor` / `workflow_state` / `llm_summary` / `human` / `import` / `sync`), `source_peer_id`, and `external_actor` fields on the `store` request, including the reducer tie-break behavior (`source_priority` first, then `observation_source`) and the AAuth-vs-`external_actor` distinction (signing agent vs the human/account on whose behalf the agent wrote).
- **Inspector packaging fails closed.** `scripts/build_inspector.js` now exits non-zero when the `inspector/` submodule is missing during `prepublishOnly` / `pack:local`, instead of silently skipping. This prevents shipping an npm tarball without the bundled Inspector. `tests/contract/package_scripts.test.ts` pins the Inspector Vite entrypoints (`dev:vite`, `build:vite`, `build:watch`, `preview`) to `--config vite.config.ts` so the build cannot regress to a stale `vite.config.js`.
- **Four new operator-facing site pages cover the v0.12 subsystems.** `/peer-sync`, `/subscriptions`, `/issue-reporting`, and `/security-hardening` are wired into the docs nav, the SEO metadata, the route table, and the doc manifest. Each page links back to its repo source of truth (`docs/subsystems/peer_sync.md`, `docs/subsystems/subscriptions.md`, `docs/subsystems/issues.md`, `SECURITY.md` + `docs/security/threat_model.md`). The changelog page surfaces a v0.12.0 highlight banner pointing at these pages and the breaking `submit_issue` reporter-provenance contract.
- **Release skill now hard-gates security review.** `.cursor/skills/release/SKILL.md` and `.claude/skills/release/SKILL.md` add a hard gate before Step 4 that requires explicit G1 / G2 / G3 / G4 evidence and a populated `security_review.md` with the supplement linked under a `Security hardening` section. The skill also requires re-running Step 3.5 when any commit is added after the security review ran. This is the workflow change that produced this v0.12.1 release plan.

## What changed for npm package users

**MCP tools**

- `submit_issue`, `add_issue_message`, `get_issue_status` JSON Schemas no longer carry a top-level `anyOf`. The server still returns `400 ERR_REPORTER_ENVIRONMENT_REQUIRED` on `submit_issue` when neither `reporter_git_sha` nor `reporter_app_version` is supplied, and still requires `entity_id` or `issue_number` on the other two. Codex and other strict OpenAI function-tool consumers can now register the schemas without rejection. Existing MCP clients that already pass a valid payload see no behavior change.
- Updated tool descriptions surface the reporter-environment requirement and the `entity_id`-or-`issue_number` requirement in prose.

**HTTP API**

- No new operations. No `openapi:bc-diff` breaking changes vs `v0.12.0`.
- `tests/integration/guest_invalid_bearer_routes.test.ts` codifies that the following routes return `401` (not anonymous downgrade) when called with `Authorization: Bearer <invalid-guest-token>`: `GET /entities/duplicates`, `GET /events/stream`, `POST /get_subscription_status`, `POST /issues/add_message`, `POST /issues/status`, `POST /issues/submit`, `POST /list_subscriptions`, `POST /subscribe`, `POST /unsubscribe`.

**CLI**

- `neotoma api start --help` now surfaces the `--env dev` / `--env prod` requirement explicitly. `tests/cli/cli_infra_commands.test.ts` pins the help output to mention `--env dev or --env prod` and the `neotoma api start --env prod` invocation.

## API surface & contracts

- **OpenAPI:** unchanged vs `v0.12.0`. `npm run openapi:bc-diff` reports no breaking changes.
- **MCP tool schemas:** `submit_issue`, `add_issue_message`, `get_issue_status` drop the top-level `anyOf` for OpenAI / Codex compatibility (server-side enforcement preserved). `tests/contract/openclaw_plugin.test.ts` codifies the absence of top-level `anyOf` and the presence of `properties.reporter_git_sha` / `properties.reporter_app_version` on `submit_issue`.
- **Schema seeding:** unchanged.
- **`store` request schema documentation:** the optional v0.12+ fields `observation_source`, `source_peer_id`, and `external_actor` are now described in `docs/specs/MCP_SPEC.md` together with their reducer semantics.

## Behavior changes

- **Guest auth path treats invalid bearer tokens as `401`, not as anonymous downgrade.** Routes that accept guests now require the guest principal to validate against the persisted token grant before being stamped on the request. This closes a gap where a syntactically valid but unrecognized bearer could bypass the validation step on guest-capable surfaces.
- **`prepublishOnly` / `pack:local` fail closed when the Inspector submodule is missing.** Operators who package or publish must run `git submodule update --init inspector` first; the previous "skip and continue" behavior is gone.

## Agent-facing instruction changes

- `.cursor/skills/release/SKILL.md` and `.claude/skills/release/SKILL.md` add the **Hard gate before Step 4** with the G1–G5 evidence checklist and the explicit "rerun Step 3.5 if any commit is added after the security review" rule.
- `docs/specs/MCP_SPEC.md` documents the `bulk_close_issues` / `bulk_remove_issues` MCP tools (and their HTTP twins) and the `observation_source` / `source_peer_id` / `external_actor` fields on `store`.
- `docs/subsystems/issues.md`, `peer_sync.md`, and `subscriptions.md` align with the spec table additions and document the canonical `GET /events/stream?subscription_id=<id>` SSE path (the legacy `/subscriptions/sse` shorthand was removed before v0.12.0; v0.12.1 removes the last reference).

## Tests and validation

- `npx tsc --noEmit`
- `npx vitest run tests/integration/guest_invalid_bearer_routes.test.ts --reporter=verbose`
- `npx vitest run tests/contract/openclaw_plugin.test.ts --reporter=verbose`
- `npx vitest run tests/contract/package_scripts.test.ts --reporter=verbose`
- `npx vitest run tests/cli/cli_infra_commands.test.ts --reporter=verbose`
- `npm run openapi:bc-diff` (no breaking changes vs `v0.12.0`)
- `npm run security:classify-diff`
- `npm run security:lint`
- `npm run security:manifest:check`
- `npm run test:security:auth-matrix`

## Breaking changes

- None at the HTTP layer. None at the schema layer.
- The MCP schema change is **non-breaking for compliant clients** (the `anyOf` was a JSON Schema combinator MCP clients did not rely on for behavior; server-side enforcement still rejects payloads that omit the required fields). It **fixes** behavior for Codex / OpenAI function-tool consumers that previously could not register the schemas at all.
- The Inspector packaging fail-closed (`scripts/build_inspector.js` exits non-zero when the submodule is missing) is breaking only for ad-hoc `npm pack` runs that were intentionally relying on the prior skip; the supported flow is to initialize the submodule before packaging.

## Migration guide

- **MCP clients on Codex / OpenAI:** no action; the JSON Schema simplification removes the previous registration error. If you implemented a workaround that synthesizes the `anyOf` client-side, you can drop it.
- **Operators packaging Neotoma locally:** run `git submodule update --init inspector` before `npm run pack:local` or `npm publish`. The build will now exit `1` instead of producing a tarball without the bundled Inspector.
- **Operators on hosted / multi-tenant deployments:** if you have not already, set `NEOTOMA_HOSTED_MODE=1`, `MCP_PROXY_FAIL_CLOSED=1`, and review `NEOTOMA_GUEST_WRITE_RATE_LIMIT_PER_MIN` / `NEOTOMA_GUEST_TOKEN_TTL_SECONDS`. The new `Operator hardening knobs (v0.12+)` section in `SECURITY.md` and `docs/security/threat_model.md` is the canonical reference; nothing about the runtime defaults changed in this release.

## Security hardening

This release ran the v0.12 G1–G4 security gate on the v0.12.1 diff. Findings, suggested negative tests, residual risks, and the sign-off verdict live at [`docs/releases/in_progress/v0.12.1/security_review.md`](https://github.com/markmhendrickson/neotoma/blob/v0.12.1/docs/releases/in_progress/v0.12.1/security_review.md).

Headline:

- The guest-token validation tightening in `src/actions.ts` is the security-relevant code change. Regression coverage lives in `tests/integration/guest_invalid_bearer_routes.test.ts` and the existing `test:security:auth-matrix` lane.
- The MCP schema simplification (`src/tool_definitions.ts`) is *not* a security-relevant change — server-side enforcement of `reporter_git_sha`-or-`reporter_app_version` on `submit_issue` and `entity_id`-or-`issue_number` on `add_issue_message` / `get_issue_status` is unchanged.
- Operator-facing hardening knob documentation does not change runtime behavior; it makes already-shipped knobs findable from the security landing page so hosted-mode operators are less likely to leave them at single-tenant defaults.
- No new advisory under `docs/security/advisories/`. No CVE.

**Amendment — PR #79 (self-hosted auth + Cloudflare Tunnel, commit `356ee2c10`):**

- `src/crypto/mcp_auth_token.ts` — `getMcpAuthToken()` no longer gates token derivation on `NEOTOMA_ENCRYPTION_ENABLED`. The change only widens the set of accepted valid tokens; constant-time comparison (`safeCompareTokens`) is unchanged.
- `src/actions.ts` — bearer token validation moved above the `encryption.enabled` branch in both REST and MCP middleware; new `NEOTOMA_TRUSTED_PROXY_IPS` opt-in env var for declaring trusted proxy CIDRs. Both changes are off-by-default for existing deployments. Full gate evidence in `security_review.md` § Amendment — PR #79. `test:security:auth-matrix` → 16 passed, 1 skipped.

## Deferred follow-up

- **Inspector UI for plans on issues** (carried from v0.12.0): the `Plans` tab on `IssueDetailPage`, per-message plan chips, and the related contract test remain deferred. The v0.12.0 supplement (now archived under `docs/releases/completed/v0.12.0/`) describes the scope.
