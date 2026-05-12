# Security Policy

## Supported Versions

| Version  | Supported |
|----------|-----------|
| `0.11.x` | Yes       |
| `0.10.x` | Yes       |
| `< 0.10` | No (patch only on critical advisories — see [advisories index](docs/security/advisories/README.md)) |

The most recent published Neotoma version is the only one that receives proactive support. Critical advisories may produce a one-off patch on the previous minor when the affected range is large; see the per-advisory file under [`docs/security/advisories/`](docs/security/advisories/README.md) for the exact range.

## Reporting a vulnerability

If you discover a security vulnerability in Neotoma, please report it **privately**. **Do not open a public GitHub Issue.**

- **Preferred:** Use the repository [Security](https://github.com/markmhendrickson/neotoma/security) page to send a **private vulnerability report** to the maintainers (the same UI that opens a private GitHub Security Advisory).
- **Email fallback:** if the GitHub flow is not available, email `security@neotoma.io` (or the address listed on the Security page) with the same content the GHSA template asks for.
- **Response time:** we aim to acknowledge a private report within 48 hours and confirm or refute the regression within 5 business days.
- **Include:** description of the vulnerability, affected versions, reproduction steps (sanitized of any real data or credentials), suggested fix when known, and the disclosure timeline you prefer.

## Disclosure flow

1. **Private intake.** A reporter files via the GitHub Security tab or `security@`. The maintainer opens (or accepts) a private GHSA and requests a CVE when warranted.
2. **Hotfix branch.** Fix lands on `hotfix/<version>-<slug>` cut from the affected `main` SHA, with regression tests under `tests/integration/` or `tests/security/` that fail on the pre-fix code and pass post-fix.
3. **Pre-release security gates** (`docs/security/threat_model.md`, `.cursor/plans/pre-release_security_gates_44e01d74.plan.md`):
   - G1 `npm run security:classify-diff` confirms the diff is sensitive.
   - G2 `npm run security:lint` is clean.
   - G3 `npm run security:manifest:check` + `npm run test:security:auth-matrix` are green.
   - G4 `docs/releases/in_progress/<TAG>/security_review.md` is filled and signed off.
4. **Coordinated release.** Tag, GitHub Release, npm publish, and Fly deploy follow `.cursor/skills/release/SKILL.md`.
5. **Deployed probes.** G5 `bash scripts/security/deployed_probes.sh --tag <TAG>` runs from an external host; the report lands at `docs/releases/in_progress/<TAG>/post_deploy_security_probes.md`.
6. **Public advisory.** A dated file is added to [`docs/security/advisories/`](docs/security/advisories/README.md) using the template in that directory's `README.md`. The release supplement's `Security hardening` section links the advisory and the post-deploy probe report.
7. **Direct notification.** The maintainer reaches out to known operators (issue threads, mailing list, peer instances when Track 2 lands) with the upgrade instruction and any rotation guidance.

## Security model

Neotoma implements defense-in-depth at the State Layer:

- **Bearer authentication** for the HTTP `/mcp` endpoint and protected REST routes.
- **AAuth (RFC 9421 + `aa-agent+jwt`)** for verified per-agent attribution; see [`docs/subsystems/aauth.md`](docs/subsystems/aauth.md) and [`docs/subsystems/agent_attribution_integration.md`](docs/subsystems/agent_attribution_integration.md).
- **Loopback / reverse-proxy classification** centralized in `src/actions.ts` (`isLocalRequest`, `forwardedForValues`, `isProductionEnvironment`); see [`docs/security/threat_model.md`](docs/security/threat_model.md) for the channels this covers.
- **Guest access policy** — `src/services/access_policy.ts` and the entity-submission flow gate non-owner writes; see [`docs/subsystems/guest_access_policy.md`](docs/subsystems/guest_access_policy.md).
- **Audit trail** — every observation, relationship, source, timeline event, and interpretation carries the writer's attribution tier; immutable by design (see [`docs/subsystems/observation_architecture.md`](docs/subsystems/observation_architecture.md)).
- **Row-level user scoping** on local SQLite; planned hosted-Postgres parity in a future release.

See [`docs/subsystems/auth.md`](docs/subsystems/auth.md), [`docs/subsystems/aauth.md`](docs/subsystems/aauth.md), and [`docs/subsystems/privacy.md`](docs/subsystems/privacy.md) for details.

## Pre-release gates (operator-visible summary)

Every release runs through the pre-release security gates before tagging and again after deploy:

| Gate | Stage | What it does |
|------|-------|--------------|
| G1 — diff classifier | PR + `/release` Step 3.5 | Flags any change touching `src/actions.ts`, `src/services/{root_landing,auth,aauth,subscriptions,sync,issues,entity_submission,access_policy}/**`, `src/middleware/**`, `openapi.yaml` security blocks, or `LOCAL_DEV_USER_ID|TRUST_PROD_LOOPBACK|*_AUTH_*` env vars. |
| G2 — static rules | PR + `/release` Step 3.5 | `npm run security:lint` — Semgrep rules (with a Node fallback runner) for the v0.11.1 bug class. |
| G3 — auth topology matrix | PR + `/release` Step 3.5 | `npm run test:security:auth-matrix` — cross product of transport × env × `X-Forwarded-For` × socket; manifest sync against `openapi.yaml`. |
| G4 — AI adversarial review | `/release` Step 3.5 | `npm run security:ai-review` — produces `docs/releases/in_progress/<TAG>/security_review.md` for human sign-off. |
| G5 — deployed probes | `/release` Step 5 + weekly | `bash scripts/security/deployed_probes.sh` — external probe of every protected route in the manifest against the live host. |

The full plan and rationale are in [`.cursor/plans/pre-release_security_gates_44e01d74.plan.md`](.cursor/plans/pre-release_security_gates_44e01d74.plan.md).

## Security best practices for operators

When deploying or developing Neotoma:

1. **Set `NEOTOMA_BEARER_TOKEN`** for any deployment exposed to the public internet, even when the deployment is behind a reverse proxy. Loopback alone is not a trust signal; the v0.11.1 advisory documents that regression class.
2. **Set `NEOTOMA_ENV=production`** explicitly in production. The runtime infers production by default, but explicit env variables improve observability and unlock the production-safe loopback policy.
3. **Use OAuth or AAuth** for verified MCP attribution rather than long-lived bearer tokens whenever the harness supports it.
4. **Use HTTPS** for all API endpoints and Inspector access.
5. **Verify configuration** with `npm run doctor` before exposing the server.
6. **Keep storage paths and data directories private**; do not symlink them into a web-served directory.
7. **Rotate bearer tokens** periodically and after any advisory in `docs/security/advisories/` whose affected range includes your deployment.
8. **Never commit `.env` or credentials** — see [`docs/conventions/code_conventions.md`](docs/conventions/code_conventions.md).

## Index

- [`docs/security/advisories/README.md`](docs/security/advisories/README.md) — disclosed advisories.
- [`docs/security/threat_model.md`](docs/security/threat_model.md) — channels covered by the gates.
- [`.cursor/plans/pre-release_security_gates_44e01d74.plan.md`](.cursor/plans/pre-release_security_gates_44e01d74.plan.md) — Track 1 plan (pre-release gates).
- [`docs/subsystems/auth.md`](docs/subsystems/auth.md) — auth subsystem.
- [`docs/subsystems/aauth.md`](docs/subsystems/aauth.md) — AAuth signing and verification.
- [`docs/subsystems/privacy.md`](docs/subsystems/privacy.md) — privacy / PII boundaries.
- [`docs/developer/pre_release_checklist.md`](docs/developer/pre_release_checklist.md) §§ 1.11, 1.12 — security gate checklist.
