---
title: Inspector / API auth bypass behind a reverse proxy (v0.11.1 fix)
summary: "- **Date disclosed:** 2026-05-11 - **GHSA:** [GHSA-5cvp-p7p4-mcx9](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-5cvp-p7p4-mcx9) - **CVE:** _requested_ - **Severity:** High — pre-authentication exposure of the Insp..."
---

# Inspector / API auth bypass behind a reverse proxy (v0.11.1 fix)

- **Date disclosed:** 2026-05-11
- **GHSA:** [GHSA-5cvp-p7p4-mcx9](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-5cvp-p7p4-mcx9)
- **CVE:** _requested_
- **Severity:** High — pre-authentication exposure of the Inspector SPA and selected REST surfaces to the public internet for any deployment that runs Neotoma behind a reverse proxy / tunnel **without** a configured bearer token.
- **Affected:** Neotoma versions that shipped the Inspector mount and the `isLocalRequest` shortcut without forwarded-hop awareness. Practically: **`>= 0.4.0, < 0.11.1`** when deployed behind a reverse proxy / tunnel without `NEOTOMA_BEARER_TOKEN` set. Single-host deployments with a configured bearer token were not affected.
- **Fixed in:** [`0.11.1`](https://github.com/markmhendrickson/neotoma/releases/tag/v0.11.1)
- **Reporter:** internal review (operator self-reported public Inspector access on a hosted deployment).
- **CWEs:** [CWE-288](https://cwe.mitre.org/data/definitions/288.html) (Authentication Bypass Using an Alternate Path or Channel), [CWE-306](https://cwe.mitre.org/data/definitions/306.html) (Missing Authentication for Critical Function).

## Summary

`src/actions.ts`'s `isLocalRequest(req)` helper treated any request with a loopback `req.socket.remoteAddress` as "local" and granted it the local-development user (`LOCAL_DEV_USER_ID`) when no bearer token was present. Reverse proxies, Cloudflare tunnels, and similar shapes always present a loopback socket to the Node process even for public-internet callers. As a result, hosted deployments that did not set `NEOTOMA_BEARER_TOKEN` exposed the Inspector SPA (and several REST helpers it depends on) to anyone who could reach the public hostname.

## Impact

For affected deployments:

- The Inspector SPA at `/inspector/**` rendered for unauthenticated callers, allowing read-access to entities, observations, sources, schemas, and timeline events for the local-dev user that the runtime auto-provisioned.
- Selected JSON helpers under the same auth path (e.g. `/me`, the unauthenticated landing JSON, and any route that accepted `getAuthenticatedUserId` resolving to `LOCAL_DEV_USER_ID`) returned data without bearer credentials.
- Mutation surfaces still required the rest of the auth chain in many cases, but the read-side disclosure was sufficient to read personal data accumulated under the auto-provisioned user.

Operators who set `NEOTOMA_BEARER_TOKEN`, ran behind authenticated front doors, or deployed without the Inspector mount were not affected.

## Reproduction (sanitized)

Against an affected deployment running behind a reverse proxy at `https://example.tld/`:

```bash
# Public client, no Authorization header. Expected: 401.
curl -sS -o /dev/null -w "%{http_code}\n" https://example.tld/inspector/

# In affected versions, this returned 200 with the Inspector SPA bytes
# because the loopback socket from the proxy + missing Authorization header
# routed the caller through the local-dev shortcut.
```

The `/me` JSON endpoint produced an analogous 200 with the auto-provisioned user payload.

## Root cause

`isLocalRequest` only considered `req.socket.remoteAddress`:

```ts
// PRE-FIX (simplified)
function isLocalRequest(req: express.Request): boolean {
  const remote = (req.socket?.remoteAddress || "").toLowerCase();
  return remote === "127.0.0.1" || remote === "::1" || remote.startsWith("127.");
}
```

A reverse proxy on the same host always satisfies this predicate. The Express auth middleware then granted `LOCAL_DEV_USER_ID` because no bearer token was provided.

The fix re-derives "local" from the canonical signal — the socket **and** the forwarded chain — and refuses to trust loopback alone in production unless the operator opts in:

```ts
// POST-FIX (simplified, verbatim shape from src/actions.ts)
function forwardedForValues(req: express.Request): string[] {
  const headers = req.headers || {};
  const raw = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.flatMap((v) => String(v).split(",")).map((v) => v.trim()).filter(Boolean);
}

function isProductionEnvironment(env = process.env): boolean {
  const value = (env.NEOTOMA_ENV || "development").trim().toLowerCase();
  return value === "production" || value === "prod";
}

export function isLocalRequest(req: express.Request): boolean {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;

  const forwardedFor = forwardedForValues(req);
  if (forwardedFor.length > 0) {
    return forwardedFor.every(isLoopbackAddress);
  }

  if (isProductionEnvironment() && process.env.NEOTOMA_TRUST_PROD_LOOPBACK === "1") {
    return true;
  }
  return !isProductionEnvironment();
}
```

The same logic mirrors into `src/services/root_landing/index.ts` so deployment-mode classification stays aligned with auth-mode classification.

## Fix

Shipped in [v0.11.1](https://github.com/markmhendrickson/neotoma/releases/tag/v0.11.1):

- `src/actions.ts` — new `isLoopbackAddress`, `forwardedForValues`, `isProductionEnvironment` helpers; `isLocalRequest` rewritten to fail closed in production behind a reverse proxy.
- `src/services/root_landing/index.ts` — mirrored helpers; `resolveLandingMode` adopts the production-safe classification.
- `tests/integration/tunnel_auth.test.ts` — extended fake-request helper + new tests for forwarded-for chains and host-header spoofing.
- `tests/integration/root_landing.test.ts` — new mode-classification tests for production reverse-proxy traffic.
- `tests/unit/security_hardening.test.ts` — regression coverage for production loopback rejection and `NEOTOMA_TRUST_PROD_LOOPBACK=1` opt-in.

## Operator action

1. **Upgrade to `0.11.1` or later.** No request-shape changes; safe in-place.
2. **Set `NEOTOMA_BEARER_TOKEN`** for any deployment that exposes the Inspector or REST helpers over the public internet, even after upgrade. The bearer token is the primary auth gate; the v0.11.1 fix removed the silent fallback, but a missing bearer remains an obvious misconfiguration.
3. **Rotate any bearer token** that was in use during the affected window if you have any reason to believe the token may have been observed in transit (e.g. logs that captured headers). The advisory's exposure mode did not require the bearer to be valid, so rotation is conservative rather than required.
4. **Audit access logs** during the affected window for unauthenticated `/inspector/**` and `/me` 200 responses. The hosted nginx-style log line shape is documented under `docs/operations/runbook.md` § Security incident.
5. **Optionally set `NEOTOMA_ENV=production`** explicitly for hosted deployments. The fix infers production by default, but explicit env variables improve observability when reading `/server-info`.

If your deployment runs Neotoma behind a single-host reverse proxy and the bearer-fronted UX is too friction-heavy, you may opt back into trusting the loopback chain with `NEOTOMA_TRUST_PROD_LOOPBACK=1`. Document this choice in your runbook; the gates record any new reference to the env var as security-sensitive.

**Operational note — cloud-fronted topologies (added v0.12.1):** `NEOTOMA_TRUST_PROD_LOOPBACK=1` is nullified when callers arrive through a cloud service (Vercel, CDN edge, Cloudflare Access) that injects a non-loopback `x-forwarded-for` entry. In those topologies, loopback-trust never activates regardless of this variable. The symptom is `401 AUTH_REQUIRED` on requests that work fine from CLI or stdio MCP clients (which carry no XFF). The remedy is explicit bearer authentication from the cloud caller — see `docs/developer/tunnels.md` § "Caller authentication for cloud-fronted topologies". As of v0.12.1, Neotoma logs the untrusted XFF IP to stderr when it rejects a loopback-socket request, making this failure mode self-diagnosing.

## Detection

- Pre-fix releases match the regression shape of the static rule `loopback-trust-in-production` in `scripts/security/semgrep_auth_rules.yml` (i.e. a bare `req.socket.remoteAddress === "127.0.0.1"` check). Run `npm run security:lint` against any pre-0.11.1 checkout to surface the rule firing.
- Pre-fix releases also fail every "tunnel" / "reverse-proxy" row of `tests/security/auth_topology_matrix.test.ts` because the helper returned `true` for those inputs. This is the regression-test layer for the bug class.
- Post-fix deployments are validated by `bash scripts/security/deployed_probes.sh` (G5), which posts the protected-routes manifest at the live host and asserts every protected row returns `401`/`403` without bearer.

## Gates that catch this regression class going forward

| Gate | What it does |
|------|--------------|
| G1 — `scripts/security/classify_diff.js` | Routes any change to `src/actions.ts`, `src/services/root_landing/**`, or the auth helpers into the `/release` Security review lane. |
| G2 — `scripts/security/semgrep_auth_rules.yml` rules `loopback-trust-in-production` + `forwarded-for-trust` | Refuses bare `req.socket.remoteAddress` and direct `X-Forwarded-For` / `Host` reads outside the canonical helpers. |
| G3 — `tests/security/auth_topology_matrix.test.ts` + `protected_routes_manifest.json` | Asserts every transport × env × XFF × socket combination yields the expected `isLocalRequest` verdict and the expected `401` / `403` for every protected route in the manifest. |
| G4 — `scripts/security/ai_review.js` (`docs/releases/in_progress/<TAG>/security_review.md`) | Forces a written reviewer answer to "can an unauthenticated external caller reach a privileged path through an alternate channel?" before `/release` Step 4. |
| G5 — `scripts/security/deployed_probes.sh` | Re-runs the protected-route negative checks from an external host post-deploy and weekly against the live sandbox via `.github/workflows/sandbox-weekly-reset.yml`. |

## Self-test evidence (gates against the v0.11.1 pre-fix shape)

Recorded 2026-05-12 from a clean working copy at the post-fix commit. Mutations were applied transiently and reverted; no commits were made during the self-test.

### G1 — security-sensitive diff classifier

Input: synthetic diff that touches `src/actions.ts` plus a temp file mirroring the pre-fix shape.

```bash
node scripts/security/classify_diff.js --files "src/_tmp/prefix_handler.ts
src/actions.ts" --json
```

```
{
  "sensitive": true,
  ...
  "concerns": [{ "id": "auth-middleware", "files": ["src/actions.ts"] }]
}
```

Classifier flagged the diff as security-sensitive (`auth-middleware` concern), which would force `/release` Step 3.5 and the supplement `Security hardening` section.

### G2 — static rules (`security:lint`)

Input: a temp file (`src/_tmp/prefix_handler.ts`, deleted after) reproducing the pre-fix predicate (`req.socket?.remoteAddress === "127.0.0.1"`, blind `X-Forwarded-For` trust, `LOCAL_DEV_USER_ID` widening).

```
ERROR loopback-trust-in-production src/_tmp/prefix_handler.ts:4
  match: req.socket?.remoteAddress === "127.0.0.1"
ERROR forwarded-for-trust src/_tmp/prefix_handler.ts:9
  match: req.headers["x-forwarded-for"]
WARNING local-dev-user-widening src/_tmp/prefix_handler.ts:17
  match: LOCAL_DEV_USER_ID
summary: 2 error(s), 1 warning(s) across 1 files
```

Two ERROR-level findings (gating in CI) plus a widening warning. The pre-fix shape cannot pass G2.

### G3 — topology auth matrix

Setup: transiently rewrote `isLocalRequest` to a pre-fix simulation (`return isLoopbackAddress(req.socket?.remoteAddress);`). Ran `npx vitest run tests/security/auth_topology_matrix.test.ts`.

```
Tests  7 failed | 9 passed | 1 skipped (17)
First failing cell: [tunnel|production-trust-loopback]
  expected isLocalRequest=false (Tunnel: forwarded-for chain contains a public hop, must be remote)
  AssertionError: expected true to be false
```

Seven of sixteen matrix cells fail under the regression — the cells that exercise reverse-proxy / tunnel topologies in production. After restoring the post-fix helper, all sixteen cells pass:

```
Tests  16 passed | 1 skipped (17)
```

### Conclusion

Both G2 and G3 independently reject a re-introduction of the v0.11.1 shape; G1 routes such a diff into the security review lane in `/release` and CI; G4 forces a written sign-off on `security_review.md`; G5 would catch a deployment that somehow bypassed all the prior gates. The acceptance criterion in the gates plan (`a diff that re-introduces the v0.11.1 bug shape is rejected by at least two independent gates`) is met with one to spare.

## Timeline

| When (UTC) | Event |
|-----------|-------|
| 2026-05-11 | Operator-self-reports public Inspector access on a hosted deployment without configured bearer auth. |
| 2026-05-11 | Internal review confirms the regression shape (`isLocalRequest` trusts loopback socket alone behind a reverse proxy). |
| 2026-05-11 | Hotfix branch `hotfix/v0.11.1-inspector-auth-bypass` opened from `main`; fix landed in `src/actions.ts` and `src/services/root_landing/index.ts` with regression tests. |
| 2026-05-11 | Private GitHub Security Advisory `GHSA-5cvp-p7p4-mcx9` opened; CVE requested. |
| 2026-05-11 | `v0.11.1` tagged, GitHub Release published, npm publish completed, `sandbox.neotoma.io` redeployed. |
| 2026-05-12 | Pre-release security gates (this directory) shipped to prevent regressions of the same class. |
| 2026-05-12 | Self-test recorded: G2 + G3 independently reject the pre-fix `isLocalRequest` shape (see § _Self-test evidence_). |

## References

- v0.11.1 release supplement: `docs/releases/completed/v0.11.1/github_release_supplement.md` (after the in-progress folder is moved per `/release` Step 5).
- Threat model channels covered: `docs/security/threat_model.md` § 1, § 2.
- Track 1 plan that produced the gates: `.cursor/skills/release/SKILL.md` § Step 3.5.
- Track 2 (advisory + rollout via subscriptions / peer / guest) — _planned_.
