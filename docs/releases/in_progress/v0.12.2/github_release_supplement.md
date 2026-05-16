---
title: Github Release Supplement
summary: "v0.12.2 reconciles the post-v0.12.1 work that landed on `main` between 2026-05-12 and 2026-05-15. It documents one previously-undeclared MCP response shape change (`add_issue_message` `remote_submission_error`), restores a missing struct..."
---

v0.12.2 reconciles the post-v0.12.1 work that landed on `main` between 2026-05-12 and 2026-05-15. It documents one previously-undeclared MCP response shape change (`add_issue_message` `remote_submission_error`), restores a missing structured `hint` envelope on a CLI tightening (`--base-url`/`--api-only` on access mutations), redacts client IPs from the tunnel rejection log line, and seeds the supplement scaffolding the release process expects.

## Highlights

- **Post-release security work for self-hosted auth + Cloudflare Tunnel.** Five commits land the v0.11.1 advisory follow-up on the v0.12 series: key-file-only deployments now resolve the authenticated user without depending on the keyring; the Cloudflare Tunnel topology accepts a `NEOTOMA_TRUSTED_PROXY_IPS` allowlist; the `forwarded-for-trust` gate (G2) rejects bare `X-Forwarded-For` reads outside `src/actions.ts` and `src/services/root_landing/**`; the security classifier strips its npm-script header from JSON output so the CI gate parses cleanly; and the v0.12.1 supplement + security review were amended in-tree to record the PR #79 evidence. See `docs/security/advisories/2026-05-11-inspector-auth-bypass.md` for the originating regression class.
- **Operator XFF rejection logs are now PII-safe by default.** `src/actions.ts` `isLocalRequest` previously wrote untrusted XFF client IPs verbatim to stderr. The default log path now emits a `/24` (IPv4) or `/48` (IPv6) redaction; setting `NEOTOMA_DEBUG_TUNNEL=1` restores the full IP for tunnel-trust discovery. The intent of the original log line is preserved (operators can still find the right `NEOTOMA_TRUSTED_PROXY_IPS` value) without burning client-egress addresses into every loopback rejection.
- **`add_issue_message` declares its response shape change explicitly.** Commit `778a651d1` treated partial success on the GitHub write path as success when the remote write succeeded but a downstream sync step errored. The `remote_submission_error` field on the response (declared in `openapi.yaml`) is now `required`, with `null` carried on every success path. Follow-up commits `581b1fef4` and `be661c4eb` backfilled the field at every early-return site. A new legacy-payload fixture under `tests/contract/legacy_payloads/` pins the previous shape and flips to `valid` with `remote_submission_error: null`. See "Breaking changes" below.
- **`neotoma access` mutation commands emit a structured `hint`.** The fail-fast added in `dc4cd35a5` previously concatenated remediation text into the flat `error` string. The error envelope now follows the documented shape (`{ ok: false, error: { code: "ERR_REMOTE_OVERRIDE_ON_LOCAL_MUTATION", message, hint: { conflicting_overrides, suggested_action } } }`) per `docs/subsystems/errors.md`. CLI scripts that grepped the message string for `--base-url` continue to work; new automation should consume the `hint` object.
- **Test catalog regenerated.** `docs/testing/automated_test_catalog.md` is regenerated against the current `tests/**` tree per `.claude/rules/test_catalog_maintenance_rules.md`. The post-v0.12.1 additions in `tests/services/schema_recommendation.test.ts` and `tests/cli/cli_access_commands.test.ts` are now indexed.

## What changed for npm package users

**MCP tools**

- `add_issue_message` response objects always carry `remote_submission_error` (typed as `string | null`). MCP clients that ignored the field continue to work. Clients that decoded the response with a strict schema must accept the new key with `null` as the success value.

**HTTP API**

- `POST /issues/add_message` (and the MCP `add_issue_message` tool that wraps it) — see "Breaking changes" for the `remote_submission_error` response field.
- No other contract changes. `npm run openapi:bc-diff` vs `v0.12.1` reports only the `remote_submission_error` addition.

**CLI**

- `neotoma access set ... --base-url ...` and similar combinations with `--api-only` now exit non-zero with a structured `hint` payload instead of a concatenated free-text error. Behavior is unchanged for callers that did not pass these flags on access mutations.

## API surface & contracts

- **OpenAPI:** `add_issue_message` response: `remote_submission_error` flipped from `optional` to `required`, type `string | null`. Diff documented under "Breaking changes".
- **MCP tool schemas:** unchanged.
- **Schema seeding:** unchanged.
- **Schema registry:** the `external_link` entity type (commit `c15729559`) is now seeded with gist metadata fields. Singular type name, declarative seeding per `docs/foundation/schema_agnostic_design_rules.md`. No per-type code branches added.

## Behavior changes

- **`isLocalRequest` log line redacts untrusted XFF IPs by default.** The rejection log now reads `XFF contains untrusted IP(s): a.b.c.x/24` instead of the full IP. Operators discovering the right `NEOTOMA_TRUSTED_PROXY_IPS` value can set `NEOTOMA_DEBUG_TUNNEL=1` for one server boot to see the full IPs, then unset it. This conforms to `docs/subsystems/privacy.md` and `docs/observability/logging.md`.
- **`add_issue_message` returns `success: true` when the GitHub write succeeded but a downstream sync step failed.** The downstream error is carried on `remote_submission_error` instead of failing the whole call.

## Agent-facing instruction changes

- None.

## Tests and validation

- `npx tsc --noEmit`
- `npx vitest run tests/unit/observation_reducer_projection.test.ts`
- `npx vitest run tests/contract/legacy_payloads/replay.test.ts`
- `npm run openapi:bc-diff` (one declared breaking change on `add_issue_message`; see below)
- `npm run security:classify-diff`
- `npm run security:lint`
- `npm run security:manifest:check`
- `npm run test:security:auth-matrix`
- `npm run generate:test-catalog && npm run validate:test-catalog`

## Breaking changes

- **`POST /issues/add_message` / MCP `add_issue_message` response: `remote_submission_error` is now a required field.** Pre-v0.12.2 responses omitted the field on the success path; v0.12.2 carries `remote_submission_error: null` on success and `remote_submission_error: "<error message>"` when the GitHub write succeeded but a downstream step failed. MCP clients consuming the response with a permissive schema are unaffected. Strict consumers must accept the new key with `null`. Migration: treat `result.success && result.remote_submission_error == null` as full success; `result.success && result.remote_submission_error != null` as partial success requiring operator attention.
- **`neotoma access` mutation error envelope reshape.** Mutating `access` subcommands (`access set`, `access reset`, `access remove`) called with `--base-url` or `--api-only` now return `{ ok: false, error: { code: "ERR_REMOTE_OVERRIDE_ON_LOCAL_MUTATION", message, hint: { ... } } }` instead of `{ ok: false, error: "<concatenated message>" }`. Scripts that consumed the flat string still work via `error.message`; scripts that asserted on the exact `error` string need to update to either of `error` or `error.message`.

## Security hardening

This release ran the G1–G4 security gate on the v0.12.1..main diff. The relevant findings and sign-off live at [`docs/releases/in_progress/v0.12.2/security_review.md`](./security_review.md).

Headline: the v0.11.1 advisory class (PR #79 hardening) was previously documented under `docs/releases/in_progress/v0.12.1/`. With the v0.12.2 cut the in-progress directory was reset; see the security review for the canonical post-tag accounting.
