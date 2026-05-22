# Agent attribution integration guide

**Audience:** MCP client authors, local-proxy authors, and operators who
need to wire a new agent into Neotoma and confirm the attribution tier
their writes land with.

This page is the end-to-end wiring guide. It does not duplicate
internals — for the data model see
[`src/crypto/agent_identity.ts`](../../src/crypto/agent_identity.ts) and
for verification internals see
[`src/middleware/aauth_verify.ts`](../../src/middleware/aauth_verify.ts).

## 1. Wire format

Neotoma identifies a writing agent via two complementary channels,
stamped into every durable row (observations, relationships, sources,
interpretations, timeline events):

1. **AAuth** (RFC 9421 HTTP Message Signatures + AAuth profile). Wire
   shape: the caller signs the request and sends these headers:

   - `Signature`: the signature bytes.
   - `Signature-Input`: the signature params, MUST cover `@authority`,
     `@method`, `@target-uri`, `content-digest` (when the request has
     a body), and the `signature-key` header itself.
   - `Signature-Key`: the agent's JWK + an agent-token JWT with
     `typ: "aa-agent+jwt"` carrying stable `sub` and `iss` claims.

   Neotoma verifies against the canonical `authority` configured via
   `NEOTOMA_AAUTH_AUTHORITY` (defaults to the local dev host). The
   `authority` value MUST match the server's canonical host — using the
   `Host` header is explicitly unsafe.

2. **MCP `clientInfo` fallback**. On `initialize` the MCP transport
   self-reports `{ name, version }`. Self-reported; subject to generic-
   name normalisation (see §3).

Cursor's native HTTP MCP `url` configuration is a `clientInfo`/OAuth/Bearer
transport; it does not add AAuth HTTP Message Signature headers. Use the
signed stdio shim or another signing client when Cursor writes need to land
as `software`, `operator_attested`, or `hardware`. See
[`docs/developer/mcp_cursor_setup.md`](../developer/mcp_cursor_setup.md).

Both channels contribute to a single `AgentIdentity` record that's
persisted on every write.

## 2. Fallback precedence

For each request Neotoma resolves an `AgentIdentity` by walking these
inputs in order; the first populated field at each layer wins:

```
AAuth (verified signature + JWT)   →  agent_thumbprint, agent_sub, agent_iss,
                                      agent_algorithm, agent_public_key
        │
        ▼
clientInfo.name + version          →  client_name, client_version
        │
        ▼
OAuth connection id                →  connection_id
        │
        ▼
(nothing)                          →  anonymous
```

The resulting **trust tier** is derived once per request. After v0.8.0
the cascade is attestation-aware (see §2a):

| Tier                 | When                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `hardware`           | AAuth verified AND the JWT carries a `cnf.attestation` envelope that the verifier accepts AND, in v0.12.0+, the bound key has not been revoked. |
| `operator_attested`  | AAuth verified AND `iss` (or `iss:sub`) is in `NEOTOMA_OPERATOR_ATTESTED_ISSUERS` / `NEOTOMA_OPERATOR_ATTESTED_SUBS`. |
| `software`           | AAuth verified but no attestation envelope (or attestation failed and operator allowlist did not match), regardless of algorithm. |
| `unverified_client`  | No AAuth, but clientInfo.name survived normalisation.                                         |
| `anonymous`          | Nothing else. `client_info` may have been too generic.                                        |

The Inspector colour-codes rows by tier; the `AttributionCard` component
renders the full identity on detail pages, including the resolved
attestation format and revocation status when present.

## 2a. Cryptographic attestation

When the writing agent attaches a `cnf.attestation` envelope to its
`aa-agent+jwt` agent token, Neotoma cryptographically verifies the
envelope before promoting the request to `hardware`. The
[`docs/subsystems/aauth_attestation.md`](./aauth_attestation.md) page is
the upstream spec; this section is the integrator-facing summary.

### Format / platform / revocation matrix

After v0.12.0 every supported attestation format is verified end-to-end
and participates in revocation:

| Format                  | CLI source(s)                                                    | Platforms             | Server verifier shipped in | Revocation channel                                        | Revocation default behaviour from v0.12.0 |
|-------------------------|------------------------------------------------------------------|-----------------------|----------------------------|-----------------------------------------------------------|-------------------------------------------|
| `apple-secure-enclave`  | `aauth-mac-se` via `neotoma auth keygen --hardware`              | darwin                | v0.8.0                     | Apple anonymous-attestation revocation endpoint           | `enforce`: revoked leaf demotes to `software`, reason `revoked`. |
| `webauthn-packed`       | `aauth-yubikey` via `neotoma auth keygen --hardware --backend=yubikey` | darwin / linux / win32 | v0.9.0                    | OCSP via leaf AIA, CRL fallback via leaf CDP              | `enforce`: revoked leaf demotes to `software`, reason `revoked`. |
| `tpm2` (linux)          | `aauth-tpm2` via `neotoma auth keygen --hardware`                | linux                 | v0.9.0 (FU-3)              | OCSP via AIK leaf AIA, CRL fallback via AIK leaf CDP      | `enforce`: revoked AIK demotes to `software`, reason `revoked`. |
| `tpm2` (win32)          | `aauth-win-tbs` via `neotoma auth keygen --hardware`             | win32                 | v0.9.0 (FU-3, reused)      | OCSP via AIK leaf AIA, CRL fallback via AIK leaf CDP      | `enforce`: revoked AIK demotes to `software`, reason `revoked`. |

### Attestation diagnostics on `/session`

The `attribution.decision.attestation` block on `GET /session`
(and the equivalent `get_session_identity` MCP tool) carries the
verifier outcome:

```json
{
  "attribution": {
    "decision": {
      "attestation": {
        "verified": true,
        "format": "apple-secure-enclave",
        "revocation": {
          "checked": true,
          "status": "good",
          "source": "apple",
          "mode": "enforce",
          "demoted": false
        }
      }
    }
  }
}
```

When the verifier rejects the envelope the block carries
`{ verified: false, format, reason }` instead, with `reason` drawn from
`AttestationFailureReason` (`unsupported_format`, `key_binding_failed`,
`challenge_mismatch`, `chain_invalid`, `signature_invalid`,
`aaguid_not_trusted`, `pubarea_mismatch`, `malformed`, or `revoked`).
`reason: "revoked"` is set by the FU-7 revocation service in `enforce`
mode after a previously-verified outcome is demoted; the underlying
`revocation` block carries `demoted: true` in that case.

### Revocation policy

Operators control revocation behaviour via three knobs (defaults shown
for v0.12.0 and later):

| Variable                                           | Default     | Effect                                                                                                  |
|----------------------------------------------------|-------------|---------------------------------------------------------------------------------------------------------|
| `NEOTOMA_AAUTH_REVOCATION_MODE`                    | `enforce`   | `disabled` skips lookups entirely; `log_only` runs lookups and surfaces the diagnostic without demoting tiers; `enforce` demotes revoked (and, when `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN=0`, unknown) outcomes from `hardware` to `software`. |
| `NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS`       | `3600`      | TTL for the in-memory LRU cache keyed by `SHA-256(leaf DER || channel)`. Cache hits surface as `source: "cache"`. |
| `NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`              | `2000`      | Per-lookup network timeout. Timeouts surface as `status: "unknown"`, `source: "error"`.                |
| `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN`               | `1`         | When `1`, treat `unknown` as `good` for tier purposes (still surfaced on the diagnostic). When `0`, demote `unknown` like `revoked` in `enforce` mode. |
| `NEOTOMA_AAUTH_APPLE_REVOCATION_URL`               | Apple's production endpoint | Override the Apple anonymous-attestation revocation URL (used in tests and air-gapped deployments). |

Operators piloting the v0.11.0 `log_only` window can keep
`NEOTOMA_AAUTH_REVOCATION_MODE=log_only` after upgrading to v0.12.0+ to
preserve the audit-only behaviour.

### Trust configuration

Trust roots and operator allowlists are documented in
[`docs/subsystems/aauth_attestation.md`](./aauth_attestation.md#trust-configuration).
The CLI does not consume them; the server merges the bundled roots
(`config/aauth/apple_attestation_root.pem`,
`config/aauth/tpm_attestation_roots/`,
`config/aauth/yubico_piv_roots.pem`) with any operator-supplied PEMs
from `NEOTOMA_AAUTH_ATTESTATION_CA_PATH`.

## 3. Generic-name normalisation

Self-reported client names go through `normaliseClientNameWithReason()`.
These names are rejected as attribution and surfaced with a reason code
on the `/session` response:

| Reason code     | Triggered when                                     |
| --------------- | -------------------------------------------------- |
| `not_a_string`  | Caller sent a non-string value.                    |
| `empty`         | Empty or whitespace-only string.                   |
| `too_generic`   | Name matches the generic-names blocklist (e.g. `mcp`, `client`, `anonymous`). |

See [`src/crypto/agent_identity.ts`](../../src/crypto/agent_identity.ts)
for the full blocklist.

## 4. Verifying your session

### 4a. HTTP `GET /session`

Before enabling writes, a local proxy or CLI integrator should call
`GET /session` with the same headers they intend to use for writes. The
endpoint is **read-only** and is safe to poll.

```bash
curl -sS \
  -H "Signature: …" \
  -H "Signature-Input: …" \
  -H "Signature-Key: …" \
  "https://neotoma.example/session" | jq
```

Expected shape:

```json
{
  "user_id": "usr_…",
  "attribution": {
    "tier": "software",
    "agent_thumbprint": "…",
    "agent_sub": "agent:…",
    "agent_iss": "https://agent.neotoma.example",
    "agent_algorithm": "RS256",
    "client_name": "my-proxy",
    "client_version": "0.3.1",
    "decision": {
      "signature_present": true,
      "signature_verified": true,
      "resolved_tier": "software"
    }
  },
  "aauth": {
    "verified": true,
    "admitted": true,
    "grant_id": "ent_…",
    "admission_reason": "admitted",
    "agent_label": "Cursor on macbook-pro"
  },
  "policy": { "anonymous_writes": "allow" },
  "eligible_for_trusted_writes": true
}
```

**Integrator preflight rule:** a healthy signed client should see
`attribution.tier === "hardware"` or `"software"`,
`attribution.decision.signature_verified === true`, and
`eligible_for_trusted_writes === true`.

`aauth.verified` ≠ `aauth.admitted` on purpose. Verified means the
signature checked out. Admitted means Neotoma matched that signature to
one of the user's `agent_grant` entities and is treating the caller as
authenticated without OAuth/Bearer. A verified-but-unmatched signature
stays attribution-only — the caller can still write under existing
Bearer/OAuth flows but cannot use AAuth alone for admission. The
`admission_reason` field reports the resolver outcome:

| Reason                 | Meaning                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `admitted`             | Active grant matched. AAuth alone is sufficient on this request.           |
| `no_grants_for_user`   | The owner user has no grants at all yet (Inspector → Agent grants → New).  |
| `no_match`             | This identity does not match any of the user's grants.                     |
| `grant_revoked`        | Identity matched a grant whose status is `revoked`.                        |
| `grant_suspended`      | Identity matched a grant whose status is `suspended`.                      |
| `strict_rejected`      | Strict-AAuth gating rejected the signature before admission ran.           |
| `aauth_disabled`       | This deployment has AAuth disabled; admission did not run.                 |
| `not_signed`           | No AAuth signature was presented; only attribution-only paths are open.    |

If `signature_verified === false`, inspect
`attribution.decision.signature_error_code` — it mirrors the Phase 2 log
line 1:1 (see §6).

### 4b. MCP tool `get_session_identity`

Same payload, reachable over the MCP transport — useful for clients
that don't want a second HTTP round-trip:

```jsonc
{
  "method": "tools/call",
  "params": { "name": "get_session_identity", "arguments": {} }
}
```

### 4c. CLI

```bash
neotoma auth session        # JSON
neotoma auth session --text # Human-readable summary
```

## 5. Policy knobs

The Neotoma server publishes its active attribution policy on the
`/session` response under `policy`:

| Field              | Controlled by                                                    | Default |
| ------------------ | ---------------------------------------------------------------- | ------- |
| `anonymous_writes` | `NEOTOMA_ATTRIBUTION_POLICY=allow|warn|reject`                   | `allow` |
| `min_tier`         | `NEOTOMA_MIN_ATTRIBUTION_TIER=hardware|software|unverified_client` | unset   |
| `per_path`         | `NEOTOMA_ATTRIBUTION_POLICY_JSON={"observations": "reject", …}`  | unset   |

### Per-agent capability scoping (grants)

Independent of the tier-based policy above, Neotoma supports per-agent
`(op, entity_type)` allow-lists, modelled as first-class
`agent_grant` entities (one per (user, agent identity) pair). A caller
whose verified AAuth identity matches an `active` grant can only
perform the listed operations against the listed entity types; every
other call returns 403 `capability_denied` — even when the tier is
`hardware`. This is the layer `agent.neotoma.io` relies on: the
forwarder is pinned to `neotoma_feedback` and nothing else.

Grants are managed in the Inspector under **Agents → Agent grants**
(`/agents/grants`). Each grant carries:

- An identity matcher: `agent_sub` + `agent_iss` (preferred) or
  `agent_thumbprint`, optionally with a human label.
- A `capabilities[]` list of `{ op, entity_types[] }` entries.
- A `status`: `active`, `suspended`, or `revoked`.
- An `owner_user_id` scope — grants are user-scoped and never
  authenticate calls against a different user.

The previous environment variables
(`NEOTOMA_AGENT_CAPABILITIES_JSON`, `NEOTOMA_AGENT_CAPABILITIES_FILE`,
`NEOTOMA_AGENT_CAPABILITIES_ENFORCE`,
`config/agent_capabilities.default.json`) have been removed in favour
of grants. Operators upgrading from the env-config era should run:

```bash
neotoma agents grants import --owner-user-id <usr_…> \
  [--file path/to/agent_capabilities.json]
```

The command reads the legacy registry shape (inline JSON or file) and
creates one `agent_grant` per entry, idempotent on re-runs. See
[`docs/subsystems/agent_capabilities.md`](./agent_capabilities.md) for
the full grant lifecycle (create / suspend / revoke / restore) and the
matching order admission uses.

`NEOTOMA_STRICT_AAUTH_SUBS` (comma-separated `sub`s that MUST present a
valid AAuth signature when claimed via `X-Agent-Label`) is unchanged.

Per-path overrides accept any of the canonical write paths:
`observations`, `relationships`, `sources`, `interpretations`,
`timeline_events`, `corrections`. Missing paths inherit
`anonymous_writes`.

When a write is rejected by policy the server returns HTTP 403 with:

```json
{
  "error": {
    "code": "ATTRIBUTION_REQUIRED",
    "min_tier": "software",
    "current_tier": "anonymous",
    "hint": "Sign requests with AAuth or set NEOTOMA_ATTRIBUTION_POLICY=allow"
  }
}
```

`warn` mode accepts the write, adds an `X-Neotoma-Attribution-Warning`
response header, and emits a structured log event. `allow` is silent.

## 6. Diagnostics checklist

The Phase 2 diagnostic log line is the single source of truth for
attribution resolution decisions. Every request that hits the AAuth
middleware emits exactly one:

```jsonc
// DEBUG
{
  "event": "attribution_decision",
  "signature_present": true,
  "signature_verified": false,
  "signature_error_code": "jwt_expired",
  "resolved_tier": "anonymous"
}
```

Stable fields:

| Field                                       | Type                                                  |
| ------------------------------------------- | ----------------------------------------------------- |
| `event`                                     | Always `"attribution_decision"`.                      |
| `signature_present`                         | Caller sent any of `Signature`, `Signature-Input`, or `Signature-Key` headers. |
| `signature_verified`                        | Signature + JWT both valid.                           |
| `signature_error_code`                      | Short code when `signature_verified` is false. Examples: `signature_invalid`, `jwt_expired`, `jwt_invalid`, `verification_threw`. |
| `client_info_raw_name`                      | Added on the `/session` response when the caller sent a non-empty clientInfo name. |
| `client_info_normalised_to_null_reason`     | `too_generic` / `empty` / `not_a_string` when the raw name was dropped. |
| `resolved_tier`                             | Final tier after merging AAuth + clientInfo.          |

**Safety invariants** (must hold at INFO and above):

- Public keys, agent tokens, and signature bytes MUST NEVER appear in
  logs at INFO or higher.
- `agent_thumbprint` is safe to log at any level.

### Common integrator failures

| Symptom                                                   | Root cause                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `signature_verified: false`, `signature_error_code: "signature_invalid"` | Wrong `@authority`; body hashing misaligned; `content-digest` not covered. |
| `signature_error_code: "jwt_expired"` | Agent token past its `exp`. Refresh the token. |
| `signature_error_code: "verification_threw"`              | Unreachable JWKS URL or malformed headers. Check network + header casing. |
| `signature_present: false` on `GET /session`, `POST /entities/query`, or other non-MCP routes | Expected for unsigned Inspector / REST requests. Filter to `POST /mcp` after an MCP tool call before diagnosing MCP signing. |
| `signature_present: false` on `POST /mcp` from Cursor | Cursor is using a direct HTTP `url` transport, a stale/non-signed MCP entry, or the proxy fell back to unsigned fetch. Use stdio + signed shim and inspect MCP subprocess stderr. |
| `tier: "anonymous"`, no signature headers                 | Caller forgot to sign; OR `Host` header rewriting stripped `@authority`. |
| `tier: "unverified_client"` but expected `software`/`hardware` | AAuth not wired; clientInfo.name survived but signature is missing. |
| `client_info_normalised_to_null_reason: "too_generic"`    | clientInfo.name is in the blocklist (`mcp`, `client`, …). Pick a distinctive name. |

## 7. Transport parity

Attribution is threaded uniformly across every transport that reaches
Neotoma's write-path services. The single enforcement seam is
`enforceAttributionPolicy(path, identity)` inside each service — what
changes per transport is only *how* the identity gets into the
per-request `AsyncLocalStorage` context that the services read from.

| Transport                              | AAuth verification                        | Identity propagation                                                                                         |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| HTTP `/mcp` (MCP over HTTP)            | `aauthVerify` global middleware.          | `attributionContext` + a nested `runWithRequestContext` inside the `/mcp` handler with the server-resolved identity. |
| HTTP direct routes (`/store`, `/correct`, `/observations/create`, `/create_relationship`, …) | `aauthVerify` global middleware. | `attributionContext` middleware (globally applied in `src/actions.ts`).                                      |
| HTTP `GET /session`                    | `aauthVerify` global middleware.          | Read-only; resolves identity inline for response assembly.                                                   |
| MCP stdio (`initialize` + `tools/call`)| None (stdio has no HTTP layer).           | `NeotomaServer.setSessionAgentIdentity` + `sessionClientInfo` assembled in `InitializeRequestSchema`; propagated by `runWithRequestContext` inside `CallToolRequestSchema` dispatch. |
| CLI-over-MCP (`executeToolForCli`)     | None (same as stdio).                     | Same wrap as stdio — `runWithRequestContext({ agentIdentity: this.getAgentIdentity() }, …)` inside `executeToolForCli`. |
| CLI over HTTP (`createApiClient`)      | `aauthVerify` global middleware on target | Signs outbound requests with `~/.neotoma/aauth/` keypair when configured (see `neotoma auth keygen`); middleware stamps the same decision as any other HTTP caller. |

### HTTP fallback headers

Non-MCP HTTP callers (the CLI in particular) can self-report a
`clientInfo`-equivalent value through two optional headers:

- `X-Client-Name` → fallback attribution `client_name`.
- `X-Client-Version` → fallback attribution `client_version`.

Both go through the same
[generic-name normalisation](../../src/crypto/agent_identity.ts) as
MCP's `initialize.clientInfo` handshake, so a value of `mcp` or `client`
is still dropped to `anonymous`.

### CLI signer

The CLI ships an optional AAuth signer so `neotoma …` commands can land
as `hardware` / `software` tier instead of `anonymous`:

```bash
neotoma auth keygen           # Generate ES256 keypair under ~/.neotoma/aauth/
neotoma auth session          # Inspect resolved tier + signer configuration
neotoma auth sign-example     # Print a debugging curl with a signed JWT
```

When a keypair is present at `~/.neotoma/aauth/private.jwk`,
`createApiClient` transparently signs outbound requests via
`@hellocoop/httpsig`. Signing is silently skipped (no error) when no
keypair is configured so existing CLI users are unaffected.

## 8. External actor provenance (GitHub identity)

A separate `external_actor` channel in `observations.provenance` captures
who authored the upstream artifact on GitHub. This is NOT part of AAuth
agent identity — it is a parallel provenance facet. AAuth answers "who
wrote to Neotoma"; `external_actor` answers "who authored the upstream
GitHub issue/comment".

### AAuth alignment

This feature stays in **AAuth Identity-Based mode**: the agent signs
every request, the resource verifies and applies its own access control.
The submitter's GitHub link rides as a **custom claim** on the AAuth
`agent_token` JWT (`https://neotoma.io/external_actors` array). No
`resource_token`, `auth_token`, or Person Server is introduced.

### `verified_via` values

Each `external_actor` carries a `verified_via` field indicating the
strength of the identity claim:

| Value | Meaning |
|---|---|
| `claim` | Self-reported in payload; no independent verification. |
| `linked_attestation` | Carried in the submitter's `agent_token` JWT claim; bound to the same key that authenticated the HTTP request. |
| `oauth_link` | Verified on this install via GitHub OAuth; `linked_neotoma_user_id` is the operator-local user. |
| `webhook_signature` | Verified via GitHub webhook HMAC SHA-256 signature. Strongest. |

### Cross-install identity rules

- `neotoma_user_id` / `linked_neotoma_user_id` is **always install-local**.
- AAuth `thumbprint` / `sub` carry across installs (public-key-derived).
- A remote submitter's GitHub identity reaches the operator via:
  1. Webhook (Phase 3): `verified_via: "webhook_signature"`.
  2. Agent token claim (Phase 4b): `verified_via: "linked_attestation"`.
  3. Operator-local grant link (Phase 4): `verified_via: "oauth_link"`.

### Webhook setup

1. Set `GITHUB_WEBHOOK_SECRET` in the operator's environment.
2. Configure the GitHub repo webhook to POST to `<neotoma-url>/github/webhook`
   with content type `application/json` and events: `issues`, `issue_comment`.
3. Neotoma verifies `X-Hub-Signature-256` using timing-safe HMAC SHA-256.
4. Verified events are stored with `observation_source: "sensor"` and
   `verified_via: "webhook_signature"`.

### Operator-local GitHub linking

The `agent_grant` entity has optional fields `linked_github_login`,
`linked_github_user_id`, and `linked_github_verified_at`. Agents (or
operators) link via `neotoma github link` (CLI) or Inspector OAuth flow.
When a store request's inbound `external_actor.id` matches the grant's
`linked_github_user_id`, `verified_via` is promoted to `oauth_link` and
`linked_neotoma_user_id` is set.

### Submitter-side `--no-external-actors` flag

The CLI's `mintCliAgentTokenJwt` embeds the `https://neotoma.io/external_actors`
claim by default when a local grant has a GitHub link. Submitters can
suppress this with `--no-external-actors` for privacy.

### Inspector surfacing

The `ExternalActorBadge` component shows login, verification pill,
and detailed tooltip. The `IssueAuthorLine` extracts and displays
`external_actor` from provenance alongside existing AAuth attribution.

## 9. Where to go from here

- Model / tier derivation: [`src/crypto/agent_identity.ts`](../../src/crypto/agent_identity.ts)
- AAuth middleware internals: [`src/middleware/aauth_verify.ts`](../../src/middleware/aauth_verify.ts)
- Capability-scoping registry: [`src/services/agent_capabilities.ts`](../../src/services/agent_capabilities.ts) + [`docs/subsystems/agent_capabilities.md`](./agent_capabilities.md)
- Policy enforcement seam: [`src/services/attribution_policy.ts`](../../src/services/attribution_policy.ts)
- Session response assembly: [`src/services/session_info.ts`](../../src/services/session_info.ts)
- Inspector surfacing: [`inspector/src/components/shared/agent_badge.tsx`](../../inspector/src/components/shared/agent_badge.tsx), [`inspector/src/pages/agents.tsx`](../../inspector/src/pages/agents.tsx)
- External actor badge: [`inspector/src/components/shared/external_actor_badge.tsx`](../../inspector/src/components/shared/external_actor_badge.tsx)
- GitHub webhook handler: [`src/services/github_webhook.ts`](../../src/services/github_webhook.ts)
- External actor builder: [`src/services/issues/external_actor_builder.ts`](../../src/services/issues/external_actor_builder.ts)
- External actor promoter: [`src/services/external_actor_promoter.ts`](../../src/services/external_actor_promoter.ts)
- GitHub account linking: [`src/services/github_link.ts`](../../src/services/github_link.ts)
- Attribution backfill: [`src/services/issues/attribution_backfill.ts`](../../src/services/issues/attribution_backfill.ts)
- Related proposals: [`docs/proposals/agent-trust-framework.md`](../proposals/agent-trust-framework.md), [`docs/proposals/trusted_proxy_mode_2026_04_22.md`](../proposals/trusted_proxy_mode_2026_04_22.md)
