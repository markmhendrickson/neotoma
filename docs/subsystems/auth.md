# Neotoma Authentication and Authorization
*(Auth Flows, Permissions, and Access Control)*
## Authentication
**Provider:** Local auth (built-in) or OAuth
**Flows:**
- Local dev stub (no credentials)
- OAuth (when configured)
- Key-derived Bearer token (when encryption enabled)
**Token:** JWT or Bearer token, validated on every request.
## Authorization
**MVP:** All authenticated users can access all records (no per-user isolation).
**Future:** Row-Level Security (RLS) by `user_id`.
```sql
-- Future RLS policy
CREATE POLICY "Users see only their records" ON records
  FOR SELECT
  USING (user_id = auth.uid());
```
## MCP Authentication

MCP clients MUST authenticate using OAuth 2.0 Authorization Code flow with PKCE (recommended) or session tokens (deprecated).

### OAuth Flow (Recommended)

**Authentication Flow:**

1. MCP client initiates OAuth via `POST /api/mcp/oauth/initiate` with `connection_id`
2. Backend generates PKCE challenge and returns authorization URL
3. User opens authorization URL in browser and signs in
4. User approves connection
5. Auth provider redirects to callback URL with authorization code
6. Backend exchanges code for access token and refresh token
7. Backend stores encrypted refresh token in database
8. MCP client polls `GET /api/mcp/oauth/status` until status is "active"
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

- `POST /api/mcp/oauth/initiate` - Start OAuth flow, get authorization URL
- `GET /api/mcp/oauth/callback` - OAuth callback, exchange code for tokens
- `GET /api/mcp/oauth/status` - Check connection status
- `GET /api/mcp/oauth/connections` - List user's connections (authenticated)
- `DELETE /api/mcp/oauth/connections/:connection_id` - Revoke connection (authenticated)

**Security:**

- PKCE prevents authorization code interception attacks
- Refresh tokens are encrypted at rest (AES-256-GCM)
- Access tokens are cached and automatically refreshed
- Users can revoke connections via UI
- OAuth state expires after 10 minutes
- All tokens validated via auth provider

### Local Auth (Local Backend)

Local mode uses a built-in auth provider. OAuth endpoints remain the same, but the authorization step is handled by a local login page.

**Local flow summary (encryption off):**

1. Client opens `GET /api/mcp/oauth/authorize` with PKCE parameters.
2. If `dev_stub=1`: Neotoma completes immediately with dev user. Otherwise, redirects to local-login.
3. Local-login auto-uses dev account (no credentials form). Creates OAuth connection and redirects with `code` and `state`.
4. Client exchanges `code` at `POST /api/mcp/oauth/token` and uses the returned access token.

**When encryption is on:** OAuth is not supported. MCP and API require key-derived Bearer token. See Key-Based Auth section below.

**OAuth with local backend (encryption off):**

- When encryption is off, the local-login flow auto-uses the dev account (no email/password form).
- `neotoma auth login --dev-stub` skips the redirect to the login page and completes immediately.

**Base URL when running locally:**

The redirect to the local login page uses `NEOTOMA_HOST_URL` (or the default `http://localhost:8080` in development). If your `.env` has `NEOTOMA_HOST_URL=https://dev.neotoma.io`, the browser will open dev.neotoma.io for login even when the API process is running on your machine. For local-only use, set `NEOTOMA_HOST_URL=http://localhost:8080` or leave it unset, and point Cursor at `http://localhost:8080/mcp`.

**Deployment with multiple instances (local backend):**

OAuth state for the local login flow is stored in SQLite. If more than one API instance is running (e.g. multiple pods or processes behind a load balancer), the instance that serves `/api/mcp/oauth/authorize` may not be the one that serves `/api/mcp/oauth/local-login`. The second instance has no record of the state, so the user sees "authorization link expired or already used" even on first use. Fix: run a single API instance for the local backend, or configure sticky sessions so that all requests under `/api/mcp/oauth` are routed to the same instance for the duration of the flow.

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
