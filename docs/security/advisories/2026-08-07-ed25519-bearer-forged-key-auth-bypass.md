# Ed25519 bearer "public-key-is-the-token" auth bypass (vX.Y.Z fix)

- **Date disclosed:** 2026-08-07
- **GHSA:** _pending_ (draft private advisory before any public branch lands)
- **CVE:** _requested_
- **Severity:** Critical — pre-authentication full read **and** write of a personal-mode instance's entire entity graph, over the public internet, with no secret of any kind. CVSS ~9.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H).
- **Affected:** Personal-mode (`mode: personal`) HTTP deployments that expose the REST API. The Ed25519 bearer accept path has shipped since the public-key registry was introduced; confirmed present through **`0.21.3`**. Sandbox-mode deployments are **not** affected (see § Impact). Fixed range to be stamped at release: `>= <first-affected>, < X.Y.Z`.
- **Fixed in:** `X.Y.Z` (coordinated hotfix; also carries the `sort_by` SQLi advisory of the same date).
- **Reporter:** internal security review (operator-authorized probe of the operator's own hosted instance).
- **CWEs:** [CWE-287](https://cwe.mitre.org/data/definitions/287.html) (Improper Authentication), [CWE-347](https://cwe.mitre.org/data/definitions/347.html) (Improper Verification of Cryptographic Signature), [CWE-290](https://cwe.mitre.org/data/definitions/290.html) (Authentication Bypass by Spoofing), [CWE-639](https://cwe.mitre.org/data/definitions/639.html) (Authorization Bypass Through User-Controlled Key).

## Summary

The REST API's Ed25519 bearer path treats **possession of a public key as authentication**. Any 32-byte value, base64url-encoded, is accepted as a valid bearer token: the server auto-registers it on first sight and then considers it "valid." The accompanying HTTP Message Signature — the only component that would prove possession of the corresponding *private* key — is verified **only if it is present** (`if (signature && req.body)`), so a request that simply omits the signature sails through. Because the token carries no user binding, `getAuthenticatedUserId` then falls through to trusting the caller-supplied `user_id` verbatim. On a personal-mode instance, all data is owned by the shared `LOCAL_DEV_USER_ID` nil-UUID, which is a public constant. The net result: an anonymous attacker forges a random key, passes `user_id: 00000000-0000-0000-0000-000000000000`, and reads or writes the whole graph.

## Impact

For an affected personal-mode deployment reachable on the public internet:

- **Unauthenticated read** of every entity type — contacts, financial records, health data, credentials-adjacent notes, everything stored under the instance's owner.
- **Unauthenticated write / delete** — the same forged principal is eligible for trusted writes (`store`, `correct`, `create_relationship`, `delete_entity`). Confirmed by creating and soft-deleting a throwaway entity during the probe.
- Affects the **REST surface** (all routes registered after the auth middleware: `/entities`, `/entities/query`, `/store`, `/correct`, `/list_*`, `/retrieve_*`, relationship routes). The **`/mcp` streamable transport is not affected** — it validates an OAuth session and returns `401` on an unknown/expired token; it does not take the auto-register path.

**Not affected:**

- **Sandbox-mode** deployments (`NEOTOMA_SANDBOX_MODE`). Sandbox stamps the caller as `SANDBOX_PUBLIC_USER_ID` before reaching this path, and `getAuthenticatedUserId` explicitly refuses a `user_id` override for the sandbox public user — a forged key cannot pivot to another user's data there. (Verified live: a `user_id`-override request against a sandbox instance returns `403 "user_id does not match authenticated user"`.)
- Deployments that keep the REST API off the public internet (loopback-only bind, private network, authenticated front door that strips the path).

## Reproduction (sanitized)

Against an affected personal-mode deployment at `https://example.tld/`, using **placeholder data only**:

```bash
# A forged bearer: 32 random bytes, base64url, no padding. The attacker holds
# no private key for it and knows no server secret.
TOK=$(head -c32 /dev/urandom | basenc --base64url | tr -d '=')

# Baseline: no Authorization header. Expected (correct): 401.
curl -sS -o /dev/null -w "no-auth: %{http_code}\n" \
  -X POST https://example.tld/entities/query \
  -H 'Content-Type: application/json' \
  -d '{"entity_type":"<TYPE>","limit":1}'

# Exploit: forged key + the well-known nil-UUID owner.
# In affected versions this returns 200 with the owner's data.
curl -sS -X POST https://example.tld/entities/query \
  -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"00000000-0000-0000-0000-000000000000","entity_type":"<TYPE>","limit":1}'
```

The `GET /entities?entity_type=<TYPE>&user_id=00000000-0000-0000-0000-000000000000` form is equivalent. Any write route (`POST /store`, `POST /correct`) accepts the same forged principal.

## Root cause

Two independent defects compound; either alone would be a bug, together they are the full bypass.

**(1) Possession of a public key is treated as authentication.** In the REST bearer accept block:

```ts
// PRE-FIX — src/actions.ts (Ed25519 accept path)
const registered = ensurePublicKeyRegistered(bearerToken); // auto-registers ANY 32-byte token
if (registered && isBearerTokenValid(bearerToken)) {        // "valid" because we just registered it
  // Optional: Verify signature if provided
  const { signature } = parseAuthHeader(headerAuth);
  if (signature && req.body) {                              // signature check is SKIPPED when absent
    const isValid = verifyRequest(bodyString, signature, bearerToken);
    if (!isValid) return sendError(res, 403, "AUTH_INVALID", "Invalid request signature");
  }
  // ... token accepted; no private-key proof required ...
}
```

`ensurePublicKeyRegistered` (`src/services/public_key_registry.ts`) returns `true` for any token that base64url-decodes to exactly 32 bytes — it *registers* the key rather than *authenticating* it. The bearer token itself is `base64url(publicKey)`, a non-secret, attacker-derivable value.

**(2) An unbound Ed25519 token is trusted with a caller-supplied `user_id`.** When the forged key resolved to no registered `userId`, no principal was stamped, so `getAuthenticatedUserId` falls to:

```ts
// PRE-FIX — src/actions.ts getAuthenticatedUserId (tail)
const headerAuth = req.headers.authorization || "";
if (!headerAuth.startsWith("Bearer ")) throw new Error("Not authenticated - missing Bearer token");
if (!providedUserId) throw new Error("user_id required when using Ed25519 bearer token");
// For Ed25519 tokens, we trust the provided user_id (token validation happens in middleware)
return providedUserId;
```

The comment's premise — "token validation happens in middleware" — is exactly what defect (1) violates: the middleware validated nothing.

## Fix

Land all of the following on the hotfix branch; the advisory is not complete until the regression gate exists.

1. **Make the signature mandatory on the Ed25519 REST path.** Reject when no `Signature` component is present. Possession of a public key must never authenticate on its own:

   ```ts
   // POST-FIX (shape)
   const { signature } = parseAuthHeader(headerAuth);
   if (!signature || !req.body) {
     return sendError(res, 401, "AUTH_REQUIRED", "Ed25519 bearer requires a request signature");
   }
   const bodyString = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
   if (!verifyRequest(bodyString, signature, bearerToken)) {
     return sendError(res, 403, "AUTH_INVALID", "Invalid request signature");
   }
   ```

2. **Stop treating auto-registration as validation.** `ensurePublicKeyRegistered() === true` means "syntactically a 32-byte key," not "authenticated." An Ed25519 token should only authenticate when it maps to a **pre-provisioned** `userId` in a persistent registry *and* the request carries a valid signature. Consider renaming the boundary so a future reader cannot mistake registration for auth.

3. **Fail closed in `getAuthenticatedUserId`.** For a Bearer request that never resolved an `authenticatedUserId`, throw `AUTH_REQUIRED` rather than returning `providedUserId`. Remove the "we trust the provided user_id" tail entirely.

4. **Regression test (the gate).** Add a G3 auth-topology-matrix row: a well-formed-but-forged 32-byte key + `user_id=<nil-UUID>`, with and without a signature, must yield `401`/`403` on every protected REST route. The existing matrix only exercises *absent* and *garbage* bearers, which is why this class was not caught.

## Operator action

1. **Upgrade to `X.Y.Z` or later** before re-exposing any personal-mode REST API to the public internet.
2. **Until upgraded, do not expose the REST API publicly.** Take the instance offline, bind to loopback, or put it behind an authenticated front door. Rotating `NEOTOMA_BEARER_TOKEN` does **not** mitigate this — the exploit uses no token.
3. **Audit access logs** for the affected window: look for `auth_method=ed25519_bearer` log lines, and for `2xx` responses on `/entities*`, `/store`, `/correct`, `/list_*`, `/retrieve_*` where the request carried a Bearer that is not your provisioned token. Treat any such hit as potential unauthorized access.
4. **Assume data exposure** for any instance that was public during the affected window and evaluate breach-notification obligations for third-party personal data held on that instance (see § Detection for scoping).

## Detection

- Grep server logs for `auth_method=ed25519_bearer` with `user_id=(from token)` or a `user_id` that is not the instance owner.
- A live probe: the sanitized reproduction above returns `200` on a vulnerable host and `401`/`403` on a fixed one. `scripts/security/deployed_probes.sh` should be extended with this exact negative case.

## Gates that catch this regression class going forward

| Gate | What it does |
|------|--------------|
| G1 — `scripts/security/classify_diff.js` | Already routes `src/actions.ts` and `src/services/**/auth`-adjacent changes into the security review lane; extend the concern set to include `src/services/public_key_registry.ts`. |
| G2 — `scripts/security/semgrep_auth_rules.yml` | Add a rule that flags an optional/`if (signature ...)` signature check on an accept path, and any `return providedUserId` reachable without a resolved principal. |
| G3 — `tests/security/auth_topology_matrix.test.ts` + `protected_routes_manifest.json` | Add the forged-key + `user_id`-override rows described in § Fix. This is the primary regression gate. |
| G4 — `scripts/security/ai_review.js` | Add the reviewer question: "can a caller authenticate by presenting a public key without proving possession of the private key?" |
| G5 — `scripts/security/deployed_probes.sh` | Add the forged-key negative probe to the post-deploy and weekly external run. |

## Timeline

| When (UTC) | Event |
|-----------|-------|
| 2026-08-07 | Operator-authorized probe confirms the bypass live on the operator's personal instance; forged random key + nil-UUID returns owner data. |
| 2026-08-07 | Blast-radius check: the bottega8 client instance (personal-mode) confirmed live-exploitable; sandbox confirmed **not** exploitable (user_id override blocked). |
| 2026-08-07 | Operator takes the personal instance and the bottega8 client instance offline. |
| _pending_ | Private GHSA drafted; CVE requested; hotfix branch `hotfix/vX.Y.Z-ed25519-auth-bypass` opened from the affected `main` SHA. |
| _pending_ | Fix + G3 regression rows land; `X.Y.Z` tagged and deployed; instances redeployed before re-exposure. |
| _pending_ | This advisory mirrored public; row added to the advisories index. |

## References

- Root cause: `src/actions.ts` (Ed25519 bearer accept block, `getAuthenticatedUserId`), `src/services/public_key_registry.ts` (`ensurePublicKeyRegistered`, `isBearerTokenValid`, `getUserIdFromBearerToken`).
- Companion advisory (same coordinated release): `docs/security/advisories/2026-08-07-sort-by-order-by-sql-injection.md`.
- Prior auth-bypass advisory (different channel): `docs/security/advisories/2026-05-11-inspector-auth-bypass.md`.
- Threat model: `docs/security/threat_model.md`.
