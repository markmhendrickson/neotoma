# MCP OAuth Troubleshooting Guide

## Overview

This guide helps debug common issues with Neotoma's MCP OAuth authentication flow.

## Quick Diagnostics

**Check these first:**

0. **MCP server running and reachable?**

   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp
   # Expect 401 (auth required) or 200; not 000 or connection refused
   ```

   If connection refused: run `npm run dev:mcp` and use `http://localhost:8080/mcp` as the MCP URL (not `https://...` or port 443). See scenario **0. ECONNREFUSED 127.0.0.1:443** below.

1. **Encryption key configured?**

   ```bash
   echo $MCP_TOKEN_ENCRYPTION_KEY | wc -c
   # Should output 65 (64 chars + newline)
   ```

2. **OAuth client configured?**

   ```bash
   echo $SUPABASE_OAUTH_CLIENT_ID
   # Should output client ID or be empty (dynamic registration)
   ```

3. **Supabase connected?**

   ```bash
   npm run check:advisors
   # Should connect successfully
   ```

4. **Migrations applied?**
   ```bash
   npm run migrate
   # Should show mcp_oauth_connections and mcp_oauth_state tables exist
   ```

## Common Error Scenarios

### 0. ECONNREFUSED 127.0.0.1:443 / "fetch failed" / "No server info found"

**Symptom:** Cursor MCP logs show:

- `Client error for command fetch failed`
- `SSE error: TypeError: fetch failed: connect ECONNREFUSED 127.0.0.1:443`
- `Error connecting to streamableHttp server, falling back to SSE: fetch failed`
- `No server info found` / `Server not yet created, returning empty offerings`

**Root cause:** The MCP client is trying to reach Neotoma at **127.0.0.1:443** (HTTPS, port 443). The Neotoma dev server listens on **HTTP port 8080** at `http://localhost:8080/mcp`. Nothing listens on 443, so the connection is refused.

**Common causes:**

1. **MCP URL misconfigured:** Cursor project MCP or `.cursor/mcp.json` uses `https://127.0.0.1` or `https://localhost` (default port 443) instead of `http://localhost:8080/mcp`.
2. **Neotoma server not running:** The API/MCP server is not started.

**Fix:**

1. **Start the Neotoma MCP server:**

   ```bash
   npm run dev:mcp
   ```

   You should see `HTTP Actions listening on :8080`. For UI + API: `npm run dev:full`.

2. **Use the correct MCP URL** in Cursor:
   - **Local dev:** `http://localhost:8080/mcp` (HTTP, port 8080, path `/mcp`).
   - **Production:** `https://neotoma.fly.dev/mcp` (or your deployment URL).

3. **If using Cursor project MCP / "Add to Cursor":**
   - Remove any existing "neotoma" or "project-0-neotoma-neotoma" MCP entry that uses `https://...` or port 443.
   - Add again via Neotoma MCP Setup ("Add to Cursor") so the URL is `http://localhost:8080/mcp`, or manually set `"url": "http://localhost:8080/mcp"` in `.cursor/mcp.json`.

4. **Verify server is reachable:**

   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp
   ```

   Expect `401` (auth required) or similar; not connection refused.

5. **When using a tunnel (ngrok, cloudflared):** Set `MCP_PROXY_URL` to your tunnel URL (e.g. `https://xxx.ngrok-free.dev`). The Add to Cursor button then uses the proxy URL so Cursor connects via HTTPS. See [`mcp_cursor_setup.md`](mcp_cursor_setup.md) (Add to Cursor / "Using a tunnel or proxy").

**See also:** [`mcp_cursor_setup.md`](mcp_cursor_setup.md) for full setup, [`getting_started.md`](getting_started.md) for environment setup.

### 0a. "Incompatible auth server: does not support dynamic client registration"

**Symptom:** Cursor MCP logs show:

- `Client error for command Incompatible auth server: does not support dynamic client registration`
- `Error connecting to streamableHttp server, falling back to SSE: Incompatible auth server...`
- `No server info found` / `Server not yet created, returning empty offerings`

**Root cause:** Cursor requires the OAuth authorization server to advertise a `registration_endpoint` in `/.well-known/oauth-authorization-server` (RFC 7591). Without it, Cursor refuses to use the auth server.

**Fix:**

1. **Ensure Neotoma exposes `registration_endpoint`:** The discovery document at `http://localhost:8080/.well-known/oauth-authorization-server` (or your API base) must include `"registration_endpoint": "…/api/mcp/oauth/register"`. Recent Neotoma versions add this and implement `POST /api/mcp/oauth/register`.

2. **Enable dynamic OAuth apps in Supabase:** Dashboard → Authentication → OAuth Server → enable **Allow Dynamic OAuth Apps**. The registration endpoint registers a client for Cursor’s redirect URI (`cursor://anysphere.cursor-mcp/oauth/callback`); Supabase must allow that.

3. **Restart the MCP server** after changing Supabase or env, then retry Connect in Cursor.

4. **Verify discovery:**  
   `curl -s http://localhost:8080/.well-known/oauth-authorization-server | jq .registration_endpoint`  
   should output the registration URL, not `null`.

**See also:** Scenario 1 (OAUTH_CLIENT_REGISTRATION_FAILED) for Supabase and `SUPABASE_OAUTH_CLIENT_ID` configuration.

### 1. "OAUTH_CLIENT_REGISTRATION_FAILED"

**Symptom:** OAuth flow fails at initiation with client registration error

**Causes:**

1. **Dynamic OAuth Apps not enabled:**
   - Go to Supabase Dashboard > Authentication > OAuth Server
   - Enable "Allow Dynamic OAuth Apps"
   - Restart server

2. **SUPABASE_OAUTH_CLIENT_ID not configured:**
   - Set `SUPABASE_OAUTH_CLIENT_ID` in `.env` file
   - Get client ID from Supabase Dashboard > Authentication > OAuth Server
   - Restart server

3. **Supabase URL or service key missing:**
   - Check `DEV_SUPABASE_URL` or `SUPABASE_URL` is set
   - Check `DEV_SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_KEY` is set
   - Verify service role key (not anon key)

**Fix:**

```bash
# Option 1: Enable dynamic registration in Supabase
# Then restart server

# Option 2: Manually register client and set SUPABASE_OAUTH_CLIENT_ID
echo "SUPABASE_OAUTH_CLIENT_ID=your-client-id" >> .env
npm run dev:full
```

### 2. "OAUTH_STATE_INVALID" or "OAUTH_STATE_EXPIRED"

**Symptom:** OAuth callback fails with invalid or expired state

**Causes:**

1. **State expired (>10 minutes):**
   - User took too long to complete OAuth flow
   - State tokens expire after 10 minutes

2. **State already consumed:**
   - State token used twice (replay attack prevention)
   - Back button pressed after successful callback

3. **Database connection issue:**
   - State not found in `mcp_oauth_state` table
   - Table not created (missing migrations)

**Fix:**

```bash
# Check if state cleanup is running too aggressively
# (Background job runs every 5 minutes, states expire after 10 minutes)

# Restart OAuth flow
# User should complete within 10 minutes
```

**Debug:**

```sql
-- Check active states
SELECT connection_id, expires_at, created_at
FROM mcp_oauth_state
WHERE expires_at > NOW();

-- Check if state exists
SELECT * FROM mcp_oauth_state WHERE state = 'your-state-token';
```

### 3. "OAUTH_TOKEN_EXCHANGE_FAILED"

**Symptom:** OAuth callback fails when exchanging code for tokens

**Causes:**

1. **Invalid authorization code:**
   - Code already used
   - Code expired (very short TTL, usually seconds)

2. **PKCE validation failed:**
   - Code verifier doesn't match challenge
   - Database state mismatch

3. **Supabase Auth error:**
   - Auth service down
   - Invalid redirect URI
   - Client configuration mismatch

**Fix:**

```bash
# Check Supabase logs for Auth errors
# Restart OAuth flow from beginning

# Verify redirect URI matches exactly
# Check SUPABASE_OAUTH_CLIENT_ID matches registered client
```

### 4. "OAUTH_TOKEN_REFRESH_FAILED"

**Symptom:** MCP calls fail with token refresh error after connection was working

**Causes:**

1. **Refresh token expired:**
   - Supabase refresh tokens typically valid for 30 days
   - User needs to re-authenticate

2. **Refresh token revoked:**
   - User revoked connection
   - User changed password
   - Session invalidated

3. **Decryption failed:**
   - Encryption key changed
   - Token corruption

**Fix:**

```bash
# User must create new OAuth connection
# Delete old connection and start fresh OAuth flow

# Check if encryption key changed (breaks existing tokens)
echo $MCP_TOKEN_ENCRYPTION_KEY
```

### 5. "OAUTH_CONNECTION_NOT_FOUND"

**Symptom:** MCP calls fail with connection not found

**Causes:**

1. **Connection deleted from database:**
   - Manual deletion
   - User cleanup

2. **Wrong connection_id:**
   - Typo in `.cursor/mcp.json`
   - Old connection ID used

3. **Database migration issue:**
   - `mcp_oauth_connections` table not created

**Fix:**

```bash
# Verify connection exists
# Check Neotoma UI > MCP Setup > OAuth Connections

# Verify connection_id in .cursor/mcp.json matches
cat .cursor/mcp.json | grep NEOTOMA_CONNECTION_ID

# Create new connection if needed
```

**Debug:**

```sql
-- Check if connection exists
SELECT connection_id, user_id, created_at, revoked_at
FROM mcp_oauth_connections
WHERE connection_id = 'your-connection-id';

-- List all active connections for user
SELECT connection_id, client_name, created_at, last_used_at
FROM mcp_oauth_connections
WHERE user_id = 'your-user-id' AND revoked_at IS NULL;
```

### 6. "OAUTH_ENCRYPTION_KEY_MISSING" or "OAUTH_ENCRYPTION_KEY_INVALID"

**Symptom:** Server fails to start or encrypt/decrypt tokens

**Causes:**

1. **MCP_TOKEN_ENCRYPTION_KEY not set:**
   - Missing from `.env` file
   - Not exported in environment

2. **Invalid key format:**
   - Key is not 64 hex characters
   - Key contains invalid characters
   - Key is wrong length

**Fix:**

```bash
# Generate new encryption key (32 bytes = 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
echo "MCP_TOKEN_ENCRYPTION_KEY=<generated-key>" >> .env

# Restart server
npm run dev:full
```

**Warning:** Changing encryption key will invalidate all existing OAuth connections. Users must re-authenticate.

### 7. "OAUTH_INVALID_REDIRECT_URI"

**Symptom:** OAuth flow fails with invalid redirect URI

**Causes:**

1. **Invalid URI format:**
   - Not a valid URL
   - Missing protocol

2. **Unsupported protocol:**
   - Protocol not in whitelist (http, https, cursor, vscode, app)

3. **URI mismatch:**
   - Redirect URI doesn't match registered URI in Supabase client

**Fix:**

```bash
# Check redirect URI format
# Must be: http://..., https://..., cursor://..., vscode://..., or app://...

# For web: http://localhost:8080/api/mcp/oauth/callback
# For Cursor: cursor://oauth/callback
```

### 8. Rate Limiting ("Too many requests")

**Symptom:** OAuth endpoint returns 429 Too Many Requests

**Rate Limits:**

- `/api/mcp/oauth/initiate`: 5 requests/minute per IP
- `/api/mcp/oauth/callback`: 10 requests/minute per IP
- `/api/mcp/oauth/token`: 20 requests/minute per IP

**Fix:**

```bash
# Wait 1 minute before retrying
# Check for request loops or automated scripts hitting endpoints

# If legitimate high usage, rate limits can be adjusted in src/actions.ts
```

## Debugging Steps

### Step 1: Check Server Logs

**Look for:**

```
[MCP OAuth] Initiated OAuth flow for connection: ...
[MCP OAuth] Connection created: ... for user: ...
[MCP OAuth] Refreshing access token for connection: ...
[MCP OAuth Audit] oauth_flow_initiated
[MCP OAuth Audit] oauth_callback_success
```

**Warning signs:**

```
[MCP OAuth] Failed to ...
[MCP OAuth Audit] ... FAILED
[ERROR] APIError:schemas_list
```

### Step 2: Verify Database State

```sql
-- Check active connections
SELECT connection_id, user_id, client_name, created_at, last_used_at, revoked_at
FROM mcp_oauth_connections
WHERE revoked_at IS NULL
ORDER BY created_at DESC;

-- Check pending states
SELECT connection_id, expires_at, created_at
FROM mcp_oauth_state
WHERE expires_at > NOW()
ORDER BY created_at DESC;

-- Check if state cleanup is working
SELECT COUNT(*) as expired_states
FROM mcp_oauth_state
WHERE expires_at < NOW();
-- Should be 0 or low (cleanup runs every 5 minutes)
```

### Step 3: Test Token Encryption

```bash
# In Node.js console
node
> const { encryptRefreshToken, decryptRefreshToken } = require('./dist/services/mcp_oauth.js');
> const token = "test-token-123";
> const encrypted = encryptRefreshToken(token);
> const decrypted = decryptRefreshToken(encrypted);
> console.log(decrypted === token); // Should be true
```

### Step 4: Verify Configuration

```bash
# Check all required env vars
cat .env | grep -E "SUPABASE_OAUTH_CLIENT_ID|MCP_TOKEN_ENCRYPTION_KEY|SUPABASE"

# Verify encryption key format (64 hex chars)
echo $MCP_TOKEN_ENCRYPTION_KEY | grep -E "^[0-9a-fA-F]{64}$"

# Check Supabase connection
npm run check:advisors
```

### Step 5: Test OAuth Flow End-to-End

```bash
# 1. Start server
npm run dev:full

# 2. Navigate to http://localhost:5195
# 3. Sign in
# 4. Go to MCP Setup > OAuth Connection tab
# 5. Click "Create OAuth Connection"
# 6. Click "Authorize"
# 7. Check logs for "Connection created"

# 8. Test MCP connection
# Update .cursor/mcp.json with connection_id
# Restart Cursor
# Test: "List my entities via mcp"
```

## Configuration Checklist

**Environment Variables:**

- [ ] `MCP_TOKEN_ENCRYPTION_KEY` set (64 hex characters)
- [ ] `SUPABASE_OAUTH_CLIENT_ID` set OR dynamic registration enabled
- [ ] `DEV_SUPABASE_URL` or `SUPABASE_URL` set
- [ ] `DEV_SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_KEY` set
- [ ] `API_BASE` set (for redirect URIs)

**Supabase Dashboard:**

- [ ] OAuth Server enabled (Authentication > OAuth Server)
- [ ] "Allow Dynamic OAuth Apps" enabled (if not using SUPABASE_OAUTH_CLIENT_ID)
- [ ] Client registered (if using SUPABASE_OAUTH_CLIENT_ID)
- [ ] Redirect URI registered (must match exactly)

**Database:**

- [ ] Migrations applied (`npm run migrate`)
- [ ] `mcp_oauth_connections` table exists
- [ ] `mcp_oauth_state` table exists
- [ ] RLS policies configured correctly

**Server:**

- [ ] Server running (`npm run dev:full`)
- [ ] Background cleanup job started (check logs)
- [ ] No errors in startup logs

## Log Analysis

**Successful OAuth Flow:**

```
[MCP OAuth] Initiated OAuth flow for connection: cursor-2025-01-27-abc123
[MCP OAuth Audit] oauth_flow_initiated { connectionId: "...", success: true }
[MCP OAuth] Connection created: cursor-2025-01-27-abc123 for user: 44e026a5-...
[MCP OAuth Audit] oauth_callback_success { connectionId: "...", userId: "...", success: true }
```

**Failed Flow (State Expired):**

```
[MCP OAuth] Initiated OAuth flow for connection: cursor-2025-01-27-abc123
[MCP OAuth] Invalid or expired state: <state-token>
[ERROR] APIError:MCPOAuthCallback { error: "OAUTH_STATE_EXPIRED" }
```

**Failed Flow (Token Exchange):**

```
[MCP OAuth] Initiated OAuth flow for connection: cursor-2025-01-27-abc123
[MCP OAuth] Connection created: ...
[MCP OAuth] Failed to exchange code: <error-message>
[ERROR] APIError:MCPOAuthCallback { error: "OAUTH_TOKEN_EXCHANGE_FAILED" }
```

## Performance Issues

### Slow OAuth Initiation

**Symptom:** `/api/mcp/oauth/initiate` takes >5 seconds

**Causes:**

- Dynamic client registration on every request (should be cached)
- Slow database connection
- State cleanup blocking (moved to background)

**Fix:**

```bash
# Verify client_id is cached (check logs)
# Should see "Dynamically registered OAuth client" only once

# Check database latency
npm run check:advisors

# Verify state cleanup is background job (check logs)
# Should see "Starting background state cleanup job"
```

### Slow Token Refresh

**Symptom:** MCP calls slow after initial connection

**Causes:**

- Token refresh on every call (should cache)
- Slow Supabase Auth API
- Database query latency

**Fix:**

```bash
# Check token expiry time (should be cached for >5 minutes)
# Verify "Refreshing access token" only appears occasionally

# Check database connection pooling
# Verify Supabase client is cached (single instance)
```

## Security Checks

**Verify security settings:**

1. **Refresh tokens encrypted:**

   ```sql
   -- Check encrypted format (should be iv:authTag:encrypted)
   SELECT refresh_token FROM mcp_oauth_connections LIMIT 1;
   -- Should look like: "abc123:def456:789xyz" (hex strings)
   ```

2. **State tokens expire:**

   ```sql
   -- Check no old states exist
   SELECT COUNT(*) FROM mcp_oauth_state WHERE created_at < NOW() - INTERVAL '10 minutes';
   -- Should be 0 (cleanup job removes them)
   ```

3. **Rate limiting active:**

   ```bash
   # Make 6 rapid requests to /api/mcp/oauth/initiate
   # 6th request should return 429 Too Many Requests
   ```

4. **RLS policies active:**
   ```sql
   -- Verify RLS enabled
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'mcp_oauth%';
   -- rowsecurity should be TRUE
   ```

## Integration Test

**Run full OAuth flow test:**

```bash
# Run integration tests
npm run test:integration -- tests/integration/mcp_oauth_flow.test.ts

# Should pass all tests:
# ✓ creates OAuth state and returns authorization URL
# ✓ validates state format
# ✓ rejects invalid connection_id
# ✓ ... (10+ tests)
```

## Related Documents

- [`docs/subsystems/auth.md`](../subsystems/auth.md) - OAuth flow overview
- [`docs/reference/error_codes.md`](../reference/error_codes.md) - OAuth error codes
- [`docs/developer/mcp_oauth_implementation.md`](./mcp_oauth_implementation.md) - Implementation details
- [`src/services/mcp_oauth.ts`](../../src/services/mcp_oauth.ts) - OAuth service code
