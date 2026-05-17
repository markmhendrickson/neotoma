---
title: Neotoma Authentication and Authorization
summary: "*(Auth Flows, Permissions, and Access Control)* ## Authentication **Provider:** Local auth (built-in) or OAuth **Flows:** - Local dev stub (no credentials) - OAuth (when configured) - Key-derived Bearer token (when encryption enabled) **..."
---

# Neotoma Authentication and Authorization
*(Auth Flows, Permissions, and Access Control)*
## Authentication
**Provider:** Local auth (built-in) or OAuth
**Flows:**
- Local dev stub (no credentials)
- OAuth (when configured)
- Key-derived Bearer token (when encryption enabled)
**Token:** JWT or Bearer token, validated on every request.

## User-ID Resolution

All user-scoped endpoints resolve the effective `user_id` through a single helper, `getAuthenticatedUserId(req, providedUserId?)` in `src/actions.ts`. Do not introduce a parallel resolution path.

Resolution order:

1. **Auth middleware has set `req.authenticatedUserId`** (Bearer, OAuth, or local-dev session):
   - If `providedUserId` is absent or matches the authenticated user → return the authenticated user.
   - If `providedUserId` differs and the authenticated user is `LOCAL_DEV_USER_ID` (`00000000-0000-0000-0000-000000000000`) → allow the override (dev / test flows).
   - If `providedUserId` differs otherwise → reject with an error (session authZ cannot be bypassed).
2. **No session set** (no auth middleware or explicit Bearer-skip): fall back to `providedUserId` from the body or query.

**Implications for new endpoints:**

- Always call `getAuthenticatedUserId` with the caller-provided value (body `user_id` for POST/PATCH, query `user_id` for GET/DELETE).
- Never read `req.body.user_id` or `req.query.user_id` directly for authorization.
- New read endpoints that accept a `user_id` query parameter must declare it in `openapi.yaml` (see `docs/architecture/openapi_contract_flow.md`).
- The `LOCAL_DEV_USER_ID` override is a deliberate dev-flow affordance; widening it to other users requires an explicit security review.

## Authorization
**MVP:** All authenticated users can access all records (no per-user isolation).
**Future:** Row-Level Security (RLS) by `user_id`.
```sql
-- Future RLS policy
CREATE POLICY "Users see only their records" ON records
  FOR SELECT
  USING (user_id = auth.uid());
```
## AAuth (Agent Authentication) and the Trust-Tier Contract

AAuth gives every write a cryptographically verifiable *agent identity* that is orthogonal to the human `user_id` above. Where `user_id` answers "whose data is this?", AAuth answers "which agent wrote it?". The two live side-by-side on every durable row.

### Wire channels

Per-request identity is resolved from (in precedence order):

1. **AAuth** — RFC 9421 HTTP Message Signatures plus an `aa-agent+jwt` agent token (`Signature`, `Signature-Input`, `Signature-Key` headers). Covers `@authority`, `@method`, `@target-uri`, `content-digest`, and `signature-key`.
2. **MCP `clientInfo`** — the self-reported `{ name, version }` from `initialize`. Generic names (`mcp`, `client`, `anonymous`, …) are dropped via `normaliseClientNameWithReason`.
3. **HTTP fallback headers** — `X-Client-Name` / `X-Client-Version` for non-MCP callers (CLI, tools that cannot wield `clientInfo`). Same normalisation as MCP.
4. **OAuth connection id** — last-resort correlate when none of the above fire.

### Trust-tier contract

A single enum is stamped onto every observation, relationship, source, interpretation, and timeline event:

| Tier                | When                                                                                |
| ------------------- | ----------------------------------------------------------------------------------- |
| `hardware`          | AAuth verified AND signing algorithm is `ES256` or `EdDSA`.                         |
| `software`          | AAuth verified with any other algorithm.                                            |
| `unverified_client` | No AAuth, but a non-generic `clientInfo.name` / `X-Client-Name` survived filtering. |
| `anonymous`         | Nothing distinctive. `client_info` may have been too generic or absent.             |

Tier derivation is centralised in `src/crypto/agent_identity.ts`; the policy seam that rejects or warns based on tier is `enforceAttributionPolicy` in `src/services/attribution_policy.ts`. Do not re-derive tiers in services or clients — always read the resolved `AgentIdentity` from the per-request context.

### Bearer / AAuth / clientInfo precedence

Precedence for the *user* is always the OAuth / bearer / local-dev chain documented above — AAuth never bypasses user-scope resolution. Within that user scope, the attribution identity is resolved from AAuth → clientInfo → X-Client-Name → OAuth connection. Bearer tokens provide `user_id` only; they do not mint an attribution tier above `anonymous` on their own.

### Attribution policy knobs

The server publishes its active policy on `GET /session` under `policy`:

| Field              | Controlled by                                                       | Default |
| ------------------ | ------------------------------------------------------------------- | ------- |
| `anonymous_writes` | `NEOTOMA_ATTRIBUTION_POLICY=allow\|warn\|reject`                    | `allow` |
| `min_tier`         | `NEOTOMA_MIN_ATTRIBUTION_TIER=hardware\|software\|unverified_client`| unset   |
| `per_path`         | `NEOTOMA_ATTRIBUTION_POLICY_JSON={"observations":"reject", …}`      | unset   |

`reject` returns HTTP 403 `ATTRIBUTION_REQUIRED` with `min_tier` / `current_tier`. `warn` stamps an `X-Neotoma-Attribution-Warning` header + structured log; `allow` is silent.

### Preflight (mandatory for new integrators)

Before enabling writes, call `GET /session` (or `get_session_identity` over MCP, or `neotoma auth session` via CLI) and confirm:

- `attribution.decision.signature_verified === true` (when AAuth is intended).
- `attribution.tier` is `hardware` or `software` (for signed clients) or at least `unverified_client` for clientInfo-only fallback.
- `eligible_for_trusted_writes === true`.

### Where to go next

- Full integration guide (wire format, diagnostics, transport parity, troubleshooting): [`docs/subsystems/agent_attribution_integration.md`](./agent_attribution_integration.md).
- Fleet quickstart (AAuth key setup, fleet schemas, snapshot export + drift): [`docs/developer/fleet_onboarding.md`](../developer/fleet_onboarding.md).
- Capability scoping (per-agent `(op, entity_type)` allow-lists): [`docs/subsystems/agent_capabilities.md`](./agent_capabilities.md).

## MCP Authentication

MCP clients MUST authenticate using OAuth 2.0 Authorization Code flow with PKCE (recommended) or session tokens (deprecated).

### OAuth Flow (Recommended)

**Authentication Flow:**

1. MCP client initiates OAuth via `POST /mcp/oauth/initiate` with `connection_id`
2. Backend generates PKCE challenge and returns authorization URL
3. User opens authorization URL in browser and signs in
4. User approves connection
5. Auth provider redirects to callback URL with authorization code
6. Backend exchanges code for access token and refresh token
7. Backend stores encrypted refresh token in database
8. MCP client polls `GET /mcp/oauth/status` until status is "active"
9. MCP client passes `connection_id` in environment variable during initialization
10. MCP server retrieves refresh token, obtains access token, extracts `user_id`
11. All subsequent MCP actions use authenticated `user_id`

**Implementation:**

```typescript
// MCP initialization with OAuth connection
// Set environment variable in mcp.json:
{
  "env": {
    "NEOTOMA_CONNECTION_ID": "cursor-2025-01-21-abc123"
  }
}
```

**OAuth Endpoints:**

- `POST /mcp/oauth/initiate` - Start OAuth flow, get authorization URL
- `GET /mcp/oauth/callback` - OAuth callback, exchange code for tokens
- `GET /mcp/oauth/status` - Check connection status
- `GET /mcp/oauth/connections` - List user's connections (authenticated)
- `DELETE /mcp/oauth/connections/:connection_id` - Revoke connection (authenticated)

**Security:**

- PKCE prevents authorization code interception attacks
- Refresh tokens are encrypted at rest (AES-256-GCM)
- Access tokens are cached and automatically refreshed
- Users can revoke connections via UI
- OAuth state expires after 10 minutes
- All tokens validated via auth provider

### Local Auth (Local Backend)

Local mode uses a built-in auth provider. OAuth endpoints remain the same, but the authorization step is handled by a local login page.

**Local flow summary (key-gated OAuth):**

1. Client opens `GET /mcp/oauth/authorize` with PKCE parameters.
2. If the browser session has not been key-authenticated, Neotoma redirects to `/mcp/oauth/key-auth`.
3. User provides private key hex or mnemonic (plus optional passphrase); Neotoma validates against configured key source and caches a short-lived session.
4. Neotoma continues to local-login and creates OAuth connection for the local dev user, then redirects with `code` and `state`.
5. Client exchanges `code` at `POST /mcp/oauth/token` and uses the returned access token.

**OAuth with local backend (encryption off):**

- OAuth is allowed only after key-auth preflight (`/mcp/oauth/key-auth`) succeeds.
- `dev_stub` bypass is disabled.
- **When the server is reached via a tunnel (remote MCP):** The server requires explicit approval (an "Approve this connection" page) and only allows redirect URIs to localhost or known app schemes (e.g. `cursor://`).
- If key-auth is unavailable for a user/session, remote access should use `Authorization: Bearer <NEOTOMA_BEARER_TOKEN>` instead of OAuth. See [tunnels.md](../developer/tunnels.md#security).

**Base URL when running locally:**

The redirect to the local login page uses `NEOTOMA_HOST_URL` (or the default `http://localhost:3080` in development). If your `.env` has `NEOTOMA_HOST_URL=https://dev.neotoma.io`, the browser will open dev.neotoma.io for login even when the API process is running on your machine. For local-only use, set `NEOTOMA_HOST_URL=http://localhost:3080` or leave it unset, and point Cursor at `http://localhost:3080/mcp`.

**Deployment with multiple instances (local backend):**

OAuth state for the local login flow is stored in SQLite. If more than one API instance is running (e.g. multiple pods or processes behind a load balancer), the instance that serves `/mcp/oauth/authorize` may not be the one that serves `/mcp/oauth/local-login`. The second instance has no record of the state, so the user sees "authorization link expired or already used" even on first use. Fix: run a single API instance for the local backend, or configure sticky sessions so that all requests under `/mcp/oauth` are routed to the same instance for the duration of the flow.

### Key-Based Auth and Encryption (Local Backend)

When `NEOTOMA_ENCRYPTION_ENABLED=true`, local authentication and data encryption use a single cryptographic root: either an Ed25519 private key file or a BIP-39 mnemonic phrase.

**Key derivation:**

Three separate keys are derived from the root secret using HKDF (RFC 5869):

1. **Auth Key** (`neotoma-auth-v1`): Ed25519 seed for signing and authentication. Suitable for future event signing.
2. **Data Key** (`neotoma-data-v1`): AES-256-GCM key for encrypting sensitive DB columns (observations.fields, entity_snapshots.snapshot, etc.).
3. **Log Key** (`neotoma-logs-v1`): AES-256-GCM key for encrypting persistent log entries.

**Key sources:**

| Source | Config | Use case |
|--------|--------|----------|
| Private key file | `NEOTOMA_KEY_FILE_PATH` | Machine-bound; key never leaves device |
| Mnemonic phrase | `NEOTOMA_MNEMONIC` (+ optional `NEOTOMA_MNEMONIC_PASSPHRASE`) | Backup-friendly; same mnemonic restores access on any device |

**Mnemonic flow:**

1. User provides 12 or 24-word BIP-39 mnemonic.
2. BIP-39 PBKDF2 derives a 512-bit seed.
3. Seed feeds HKDF; Auth, Data, Log keys derived identically to the private key path.

**What is encrypted (local backend):**

- Content columns: observations.fields, entity_snapshots.snapshot, entity_snapshots.provenance, relationship_snapshots.snapshot, relationship_snapshots.provenance, raw_fragments.fragment_value, raw_fragments.fragment_envelope
- Not encrypted: IDs, timestamps, entity types, hash chain fields, signatures (needed for querying and future blockchain compatibility)

**Key loss warning:** Without the key file or mnemonic, encrypted data is unrecoverable.

### Session Token Flow (Deprecated)

**Will be removed in a future version. Use OAuth instead.**

**Authentication Flow:**

1. User signs in (frontend)
2. Frontend obtains `access_token` (JWT) from session
3. MCP client passes session token in environment variable during initialization
4. MCP server validates token
5. MCP server extracts `user_id` from validated token
6. All subsequent MCP actions use authenticated `user_id`

**Implementation:**

```typescript
// MCP initialization with session token (deprecated)
{
  "env": {
    "NEOTOMA_SESSION_TOKEN": "access_token_here"
  }
}
```

**Limitations:**

- Tokens expire when user signs out or after inactivity
- Requires manual token copying from web UI
- No automatic token refresh
- Less secure for long-lived connections
## Error Handling
| Error Code | Meaning | HTTP Status |
|------------|---------|-------------|
| `AUTH_REQUIRED` | No token provided | 401 |
| `AUTH_INVALID` | Invalid token | 401 |
| `AUTH_EXPIRED` | Token expired | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
## Agent Instructions
Load when implementing auth logic, securing endpoints, or adding permissions.
Required co-loaded: `docs/subsystems/privacy.md`, `docs/subsystems/errors.md`
Constraints:
- MUST validate tokens on every request
- MUST NOT log tokens or PII
- MUST use RLS for data isolation (future)
