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
   `NEOTOMA_AUTH_AUTHORITY` (defaults to the local dev host). The
   `authority` value MUST match the server's canonical host — using the
   `Host` header is explicitly unsafe.

2. **MCP `clientInfo` fallback**. On `initialize` the MCP transport
   self-reports `{ name, version }`. Self-reported; subject to generic-
   name normalisation (see §3).

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

The resulting **trust tier** is derived once per request:

| Tier                 | When                                                      |
| -------------------- | --------------------------------------------------------- |
| `hardware`           | AAuth verified AND algorithm in `{ES256, EdDSA}`.         |
| `software`           | AAuth verified with any other algorithm.                  |
| `unverified_client`  | No AAuth, but clientInfo.name survived normalisation.     |
| `anonymous`          | Nothing else. `client_info` may have been too generic.    |

The Inspector colour-codes rows by tier; the `AttributionCard` component
renders the full identity on detail pages.

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
  "policy": { "anonymous_writes": "allow" },
  "eligible_for_trusted_writes": true
}
```

**Integrator preflight rule:** a healthy signed client should see
`attribution.tier === "hardware"` or `"software"`,
`attribution.decision.signature_verified === true`, and
`eligible_for_trusted_writes === true`.

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

### Per-agent capability scoping

Independent of the tier-based policy above, Neotoma supports per-agent
`(op, entity_type)` allow-lists. A caller whose verified AAuth identity
matches a registry entry can only perform the listed operations against
the listed entity types; every other call returns 403
`capability_denied` — even when the tier is `hardware`. This is the
layer `agent.neotoma.io` relies on: the forwarder is pinned to
`neotoma_feedback` and nothing else.

| Env var                              | Purpose                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `NEOTOMA_AGENT_CAPABILITIES_JSON`    | Inline JSON registry. Takes precedence when set.                                                           |
| `NEOTOMA_AGENT_CAPABILITIES_FILE`    | Path to a registry file. Used when the inline variable is unset.                                           |
| (committed default)                  | `config/agent_capabilities.default.json` — scopes `agent-site@neotoma.io` to `neotoma_feedback`.           |
| `NEOTOMA_AGENT_CAPABILITIES_ENFORCE` | `1` rejects out-of-scope calls; `0` (default during rollout) logs a warning and allows through for a soak. |
| `NEOTOMA_STRICT_AAUTH_SUBS`          | Comma-separated `sub`s that MUST present a valid AAuth signature when claimed via `X-Agent-Label`.         |

See [`docs/subsystems/agent_capabilities.md`](./agent_capabilities.md)
for the registry format, matching order, rollout runbook, and rollback
steps.

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

## 8. Where to go from here

- Model / tier derivation: [`src/crypto/agent_identity.ts`](../../src/crypto/agent_identity.ts)
- AAuth middleware internals: [`src/middleware/aauth_verify.ts`](../../src/middleware/aauth_verify.ts)
- Capability-scoping registry: [`src/services/agent_capabilities.ts`](../../src/services/agent_capabilities.ts) + [`docs/subsystems/agent_capabilities.md`](./agent_capabilities.md)
- Policy enforcement seam: [`src/services/attribution_policy.ts`](../../src/services/attribution_policy.ts)
- Session response assembly: [`src/services/session_info.ts`](../../src/services/session_info.ts)
- Inspector surfacing: [`inspector/src/components/shared/agent_badge.tsx`](../../inspector/src/components/shared/agent_badge.tsx), [`inspector/src/pages/agents.tsx`](../../inspector/src/pages/agents.tsx)
- Related proposals: [`docs/proposals/agent-trust-framework.md`](../proposals/agent-trust-framework.md), [`docs/proposals/trusted_proxy_mode_2026_04_22.md`](../proposals/trusted_proxy_mode_2026_04_22.md)
