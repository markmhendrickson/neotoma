# Neotoma threat model — channels covered by the pre-release security gates

**Status:** Track 1 baseline (covers the v0.11.1 Inspector auth-bypass class). Track 2 (advisory + rollout via subscriptions / peer / guest) extends the model with cross-instance notification and rollout obligations.

This document enumerates the threat channels the pre-release security gates (`scripts/security/`) and CI's `security_gates` job are designed to catch. It is the authority `docs/architecture/change_guardrails_rules.mdc` § Touchpoint Matrix refers to, and the prompt scaffolding for `docs/releases/in_progress/<TAG>/security_review.md`.

The model deliberately keeps to the **State Layer** scope (`docs/foundation/layered_architecture.md`): we cover what the Neotoma server, CLI, and shipped client surfaces must enforce. Operational-layer concerns (key management for hosted operators, secret rotation policy, social-engineering resilience) are out of scope here.

## Adversary classes

| Adversary | Position | Capabilities relevant to gates |
|-----------|----------|-------------------------------|
| `unauth-public` | Reaches the server over the public internet without credentials. | Issue raw HTTP requests, control the `X-Forwarded-For` / `Host` headers it sends, attempt path enumeration. |
| `unauth-tunnel` | Reaches the server through an operator-deployed reverse proxy / tunnel (Caddy, nginx, Cloudflare tunnel, ngrok). | Same as `unauth-public` plus the ability to terminate TLS at the proxy and present any forwarded chain. |
| `low-privileged-bearer` | Holds a bearer token but for a different user / scope. | Issue authenticated requests within the bounds of an honest token. |
| `compromised-agent` | Software agent with valid `clientInfo` or AAuth credentials whose runtime is misconfigured. | Issue authenticated writes; potentially impersonate `clientInfo` or downgrade AAuth attribution. |
| `release-author` | Has merge access to the repo and can ship code. | Same authority as the codebase itself; the gates protect against *honest* mistakes (the v0.11.1 shape) rather than malicious insiders. |

## Channels covered by the gates

### 1. Alternate-path auth (G1, G2, G3, G5)

A privileged path is reached without a valid bearer because some other channel — a sandbox-mode shortcut, a guest-access widening, an OAuth callback that resolves a non-bearer principal, an MCP transport that re-uses a session token, or a re-mounted Inspector / docs page — re-derives a user without going through the canonical `getAuthenticatedUserId`.

**Gates:**
- G1 (`classify_diff.js`) routes any change to `src/actions.ts`, `src/services/auth/**`, `src/services/aauth/**`, `src/middleware/**`, `src/services/access_policy.ts`, or `src/services/local_auth.ts` into the security review lane.
- G2 (`semgrep_auth_rules.yml` rule `no-auth-local-fallback`) refuses an `if (!auth && isLocalRequest(...))` branch outside the explicit `assertExplicitlyTrusted("…")` escape hatch.
- G3 (`auth_topology_matrix.test.ts` + `protected_routes_manifest.json`) asserts that every protected route returns `401` / `403` when bearer is absent or invalid, regardless of socket / forwarded shape.
- G5 (`deployed_probes.sh`) replays the same matrix against the live sandbox and primary deployment.

### 2. Proxy / `X-Forwarded-For` trust (G2, G3)

A reverse proxy or tunnel terminates TLS and forwards traffic over loopback. Code that relies on `req.socket.remoteAddress === "127.0.0.1"` or `req.headers["host"]` as a "this is local" signal becomes a public-Internet bypass. This is the **v0.11.1 Inspector auth-bypass shape**.

**Gates:**
- G2 rule `loopback-trust-in-production` refuses bare `req.socket.remoteAddress` checks outside `src/actions.ts` / `src/services/root_landing/**`, where the canonical helpers live.
- G2 rule `forwarded-for-trust` refuses any direct `X-Forwarded-For` / `Host` read outside the canonical helpers.
- G3 cross-product (transport × env × XFF × socket) asserts that `isLocalRequest()` returns `false` for any reverse-proxy or tunnel shape regardless of env, and that `production` defaults to remote unless `NEOTOMA_TRUST_PROD_LOOPBACK=1` is set.
- G5 probes from a real external host so the deployed runtime is exercised — TLS, proxy headers, middleware ordering — not just the in-process express app.

### 3. Local-dev shortcut widening (G1, G2)

`LOCAL_DEV_USER_ID` and the `assertExplicitlyTrusted` escape hatch exist so the CLI bootstrap and tests can advance without bearer plumbing. Widening that surface — referencing `LOCAL_DEV_USER_ID` from a request handler, a sandbox transport, or a re-mounted UI — turns a developer convenience into a production back door.

**Gates:**
- G1 flags any change touching `src/services/local_auth.ts`, `src/services/sandbox_mode.ts`, or any new env var matching `LOCAL_DEV_USER_ID|TRUST_PROD_LOOPBACK|*_AUTH_*`.
- G2 rule `local-dev-user-widening` warns on any new reference to `LOCAL_DEV_USER_ID` outside `src/cli/**`, `src/services/local_auth.ts`, and tests — the warning is intended to land in the security review and force a written rationale.

### 4. Unauthenticated public route (G2, G3, G5)

A new Express route is registered without `auth.requireUser()` / `assertGuestWriteAllowed()` and is not in the explicit allow-list (`/health`, `/version`, `/openapi.yaml`, `/server-info`, `/.well-known/**`, `/mcp/oauth/**`, `/auth/dev-signin`, plus the runtime-only sandbox-session and favicon routes).

**Gates:**
- G2 rule `unauth-public-route` warns on every `app.METHOD(...)` registration without an obvious auth wrapper; reviewers reconcile against the manifest.
- G3 manifest (`protected_routes_manifest.json`) is regenerated from `openapi.yaml` security blocks via `npm run security:manifest:write`. CI rejects drift via `--check`.
- G5 probes assert the deployed runtime returns the expected status for every protected manifest row.

### 5. Guest-access policy widening (G1, G4)

`assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, and `generateGuestAccessToken` define the surface where a guest token can authorize a write. Quietly widening that surface — adding a new `entity_type` to the guest-allow list, or accepting a guest token on a route that previously required a bearer — bypasses bearer auth even though the request technically carries a credential.

**Gates:**
- G1 routes any change to `src/services/access_policy.ts` or `src/services/entity_submission/**` into the review lane.
- G4 (`security_review.md`) requires the reviewer to enumerate the policy delta in plain English and the entity types newly reachable.

### 6. AAuth / agent-identity downgrade (G1, G4)

The attribution contract (`docs/subsystems/agent_attribution_integration.md`) treats AAuth-signed writes as `hardware` / `software` tier and unsigned `clientInfo` as `unverified_client`. A diff that makes it easier to satisfy auth without a verified `aa-agent+jwt` — e.g. a fallback to `clientInfo.name` for a write that previously required `software` tier — is a downgrade.

**Gates:**
- G1 routes any change to `src/middleware/aauth_*.ts`, `src/middleware/attribution_*.ts`, or `src/services/aauth/**` into the review lane.
- G4 prompt explicitly asks the reviewer to enumerate the attribution delta and the new minimum tier per route.

## What the gates do **not** cover

- **Operational-layer secret rotation** (e.g. forcing operators to rotate the bearer token after a regression). Track 2 will wire this through subscriptions / peer / guest with an explicit `remediation_task` entity.
- **Cryptographic correctness.** AAuth signatures, OAuth PKCE, and the encryption-at-rest path are reviewed against `docs/subsystems/aauth.md` and `docs/subsystems/encryption.md`; the gates here check *usage*, not *primitive correctness*.
- **Supply-chain attacks.** `npm audit`, Socket.dev, and the package lockfile policy stay the canonical defense (see `docs/developer/pre_release_checklist.md` § 1.8).
- **Social engineering and phishing.** Out of scope; covered by the operator runbook.

## Versioning & escape hatches

- **`assertExplicitlyTrusted("<reason>")`** in `src/services/access_policy.ts` is the only sanctioned bypass for the auth-local-fallback rule. Every call site MUST cite the reason in the same string the helper records.
- **`// neotoma:security-allow:<rule-id> <reason>`** on the previous line suppresses a single Semgrep finding. The suppression is recorded in the run report and reviewed in `security_review.md`.
- **`NEOTOMA_TRUST_PROD_LOOPBACK=1`** is the only sanctioned production opt-out for the loopback-trust check; operators using single-host deployments document this in their runbook.

## Index of evidence

- `scripts/security/classify_diff.js` — G1 path map.
- `scripts/security/semgrep_auth_rules.yml` + `scripts/security/run_semgrep.js` — G2 rules.
- `tests/security/auth_topology_matrix.test.ts` — G3 cross-product matrix and manifest sanity.
- `scripts/security/protected_routes_manifest.json` — G3 source of truth (regenerated from `openapi.yaml`).
- `scripts/security/sync_protected_routes_manifest.js` — drift detector.
- `scripts/security/ai_review.js` — G4 prompt + scaffold.
- `scripts/security/deployed_probes.sh` — G5 live runner.
- `.github/workflows/ci_test_lanes.yml` § `security_gates` job — CI wiring.
- `.github/workflows/sandbox-weekly-reset.yml` — weekly G5 check on the live sandbox.
- `docs/security/advisories/` — disclosed advisories indexed by `README.md`.
