# Neotoma Authentication and Authorization
*(Auth Flows, Permissions, and Access Control)*
## Authentication
**Provider:** Supabase Auth
**Flows:**
- Email/password
- OAuth (Google, GitHub)
- Magic link
**Token:** JWT issued by Supabase, validated on every request.
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
3. User opens authorization URL in browser and signs in via Supabase Auth
4. User approves connection
5. Supabase redirects to callback URL with authorization code
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
- All tokens validated via Supabase Auth

### Local Auth (Local Backend)

Local mode uses a built-in auth provider and does not call Supabase. OAuth endpoints remain the same, but the authorization step is handled by a local login page.

**Local flow summary:**

1. Client opens `GET /api/mcp/oauth/authorize` with PKCE parameters.
2. Neotoma shows `GET /api/mcp/oauth/local-login` and collects local credentials.
3. On successful login, Neotoma creates a local OAuth connection and redirects to the client redirect URI with `code` and `state`.
4. Client exchanges `code` at `POST /api/mcp/oauth/token` and uses the returned access token.

**Local users:**

- Stored in SQLite (`local_auth_users` table)
- First successful login bootstraps the initial local user
- Subsequent logins require valid local credentials

**Dev-only stub:**

- Disabled by default
- Enabled only via CLI: `neotoma auth login --dev-stub`

**Base URL when running locally:**

The redirect to the local login page uses `API_BASE_URL` (or the default `http://localhost:8080` in development). If your `.env` has `API_BASE_URL=https://dev.neotoma.io`, the browser will open dev.neotoma.io for login even when the API process is running on your machine. For local-only use, set `API_BASE_URL=http://localhost:8080` or leave it unset, and point Cursor at `http://localhost:8080/mcp`.

**Deployment with multiple instances (local backend):**

OAuth state for the local login flow is stored in SQLite. If more than one API instance is running (e.g. multiple pods or processes behind a load balancer), the instance that serves `/api/mcp/oauth/authorize` may not be the one that serves `/api/mcp/oauth/local-login`. The second instance has no record of the state, so the user sees "authorization link expired or already used" even on first use. Fix: run a single API instance for the local backend, or configure sticky sessions so that all requests under `/api/mcp/oauth` are routed to the same instance for the duration of the flow.

### Session Token Flow (Deprecated)

**Will be removed in a future version. Use OAuth instead.**

**Authentication Flow:**

1. User signs in via Supabase Auth (frontend)
2. Frontend obtains `access_token` (JWT) from Supabase session
3. MCP client passes session token in environment variable during initialization
4. MCP server validates token using Supabase Auth
5. MCP server extracts `user_id` from validated token
6. All subsequent MCP actions use authenticated `user_id`

**Implementation:**

```typescript
// MCP initialization with session token (deprecated)
{
  "env": {
    "NEOTOMA_SESSION_TOKEN": "supabase_access_token_here"
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
