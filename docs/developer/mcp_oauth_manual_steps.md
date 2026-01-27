# MCP OAuth Manual Setup Steps

## Overview

The OAuth implementation is complete. This document lists the manual steps needed to complete the deployment.

## Prerequisites

All code and migrations are implemented and ready. Complete these steps to enable OAuth.

## Step 1: Enable OAuth 2.1 Server and Register Client (REQUIRED)

**⚠️ CRITICAL:** OAuth 2.1 Server MUST be enabled and a client must be registered before MCP OAuth will work.

**Error you'll see if not configured:** `"Unsupported provider: Provider could not be found"` (HTTP 400)

**Setup Steps:**

1. **Go to** Supabase Dashboard → **Authentication** → **OAuth Server**
2. **Toggle** "Enable OAuth 2.1 Server" to **ON**
3. **Configure** Authorization Path (e.g., `/oauth/consent`)
4. **Register OAuth Client** (choose one):
   - **Option A (Recommended):** Toggle **"Allow Dynamic OAuth Apps"** to **ON**
     - **Automatic client registration is now implemented** - the code will automatically register an OAuth client on first use
     - No manual `client_id` configuration needed
     - The `client_id` is cached in memory after first registration
     - If registration fails, you'll see a clear error message with instructions
   - **Option B:** Manually register an OAuth client:
     - Click "Register Client" or "Add Client" button
     - Configure client (name, redirect URIs, etc.)
     - Copy the generated `client_id`
     - Add `SUPABASE_OAUTH_CLIENT_ID=<client_id>` to your `.env` file
     - This overrides automatic registration (manual registration takes precedence)
5. **Save** changes

**Why This Is Required:**

- OAuth 2.1 Server requires a `client_id` parameter for all authorization requests
- Our MCP OAuth flow uses Supabase Auth's own authentication (email/password), not third-party providers
- The `/auth/v1/oauth/authorize` endpoint requires `client_id` (mandatory for OAuth 2.1 Server)

**Automatic Registration (Now Implemented):**

When "Allow Dynamic OAuth Apps" is enabled and `SUPABASE_OAUTH_CLIENT_ID` is not set:
- The code automatically registers an OAuth client on first use
- The `client_id` is cached in memory for subsequent requests
- No manual configuration needed - just enable the toggle in Supabase Dashboard

**Manual Registration (Alternative):**

If you prefer manual registration or dynamic registration fails:
- Manually register a client in Supabase Dashboard
- Set `SUPABASE_OAUTH_CLIENT_ID` in your `.env` file
- Manual registration takes precedence over automatic registration

**Verification:**

After enabling, test the OAuth flow in the web UI. If you still see "Unsupported provider" errors:
- Wait a few minutes for configuration to propagate
- Verify you're using the correct Supabase project (check project URL)
- Ensure "Enable OAuth 2.1 Server" toggle is ON
- If using manual registration, verify `SUPABASE_OAUTH_CLIENT_ID` is set in `.env`

## Step 2: Generate Encryption Key

Generate a secure encryption key for refresh tokens:

```bash
openssl rand -hex 32
```

Copy the output and add to `.env`:

```bash
MCP_TOKEN_ENCRYPTION_KEY=<paste-output-here>
```

**Security:** This key encrypts refresh tokens at rest. Keep it secure and never commit to git.

## Step 3: Apply Database Migrations

**⚠️ Known Issue:** Automated migrations fail with "public.public.mcp_oauth_connections" error due to Supabase migration runner bug.

**✅ Recommended:** Apply manually via Supabase Dashboard SQL Editor.

### Recommended Method: Manual SQL (Reliable)

**Complete guide:** `docs/developer/mcp_oauth_migrations_manual.md` contains the exact SQL to run with step-by-step instructions.

**Quick version:**

1. **Go to** Supabase Dashboard → SQL Editor
2. **Run** the SQL from `supabase/migrations/20250121000001_add_mcp_oauth_connections.sql`
3. **Run** the SQL from `supabase/migrations/20250121000002_add_mcp_oauth_state.sql`

### Alternative: Automated (If Issue Resolved)

```bash
npm run migrate
```

If this works without errors, skip to Step 4. If you see "public.public.mcp_oauth_connections" error, use the manual method above.

### Verify Tables Created

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('mcp_oauth_connections', 'mcp_oauth_state');
```

Expected output: Both tables listed.

## Step 4: Restart Services

Restart backend server to load new configuration:

```bash
# If running dev server
npm run dev

# Or if running HTTP actions server
npm run dev:http
```

## Step 5: Test OAuth Flow

### Via Web UI

1. **Sign in** to Neotoma web UI (http://localhost:5195)
2. **Navigate** to MCP Setup page
3. **Go to** "OAuth Connection" tab
4. **Generate** a connection ID
5. **Click** "Start OAuth Flow"
6. **Verify** authorization URL is generated
7. **Click** "Open Authorization Page"
8. **Approve** connection in browser
9. **Wait** for "Connection active" confirmation
10. **Verify** connection appears in list below

### Via API (Manual Testing)

```bash
# 1. Initiate OAuth flow
curl -X POST http://localhost:8080/api/mcp/oauth/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "test-connection-123",
    "client_name": "Test Client"
  }'

# Response: { "auth_url": "...", "connection_id": "...", "expires_at": "..." }

# 2. Open auth_url in browser, sign in, approve

# 3. After callback redirect, check status
curl http://localhost:8080/api/mcp/oauth/status?connection_id=test-connection-123

# Response: { "status": "active", "connection_id": "..." }
```

## Step 6: Test MCP Connection

### Update MCP Config

Edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/neotoma",
      "env": {
        "NEOTOMA_CONNECTION_ID": "test-connection-123"
      }
    }
  }
}
```

### Test in Cursor

1. **Restart Cursor** completely
2. **Open chat** in Cursor
3. **Test** MCP connection:
   ```
   List my Neotoma entities via MCP
   ```
4. **Verify** connection works and returns data

## Step 7: Run Integration Tests

After migrations are applied and tables exist:

```bash
# Run OAuth integration tests
npm test -- tests/integration/mcp_oauth_flow.test.ts

# Expected: All tests passing
```

## Step 9: Monitor Deprecation Warnings

Test session token (deprecated) to verify warnings:

1. Update `.cursor/mcp.json` to use `NEOTOMA_SESSION_TOKEN`
2. Restart Cursor
3. Check MCP server logs for deprecation warning
4. Expected: "WARNING: Using deprecated session token authentication"

## Troubleshooting

### Migrations Fail: "relation does not exist"

Try applying migrations manually via Supabase Dashboard SQL Editor.

### "MCP_TOKEN_ENCRYPTION_KEY not configured"

Add encryption key to `.env` (see Step 1).

### OAuth Flow Times Out

Check:
1. Frontend URL is correct in environment
2. API base URL is correct
3. OAuth callback endpoint is accessible

### Connection Status Stuck on "pending"

Check:
1. OAuth callback was successful (check logs)
2. Tokens were stored in database (query mcp_oauth_connections)
3. No errors in backend logs

## Verification Checklist

- [ ] OAuth 2.1 Server enabled in Supabase Dashboard
- [ ] OAuth client registered (via "Allow Dynamic OAuth Apps" or manual registration)
- [ ] `SUPABASE_OAUTH_CLIENT_ID` set in `.env` (if using manual registration)
- [ ] Encryption key generated and added to `.env`
- [ ] Database migrations applied successfully
- [ ] Tables `mcp_oauth_connections` and `mcp_oauth_state` exist
- [ ] Backend server restarted with new config
- [ ] OAuth flow completed via web UI
- [ ] Connection appears in connections list
- [ ] MCP client config updated with connection ID
- [ ] MCP connection works in Cursor/Claude
- [ ] Integration tests pass
- [ ] Deprecation warnings appear for session tokens

## Success Criteria

All items in verification checklist completed and:
- Users can create OAuth connections via web UI
- MCP clients authenticate using connection IDs
- Tokens automatically refresh
- Users can list and revoke connections
- Documentation accurately reflects OAuth as primary method
- Session tokens still work (with deprecation warnings)

## Related Documentation

- `docs/developer/mcp_oauth_implementation.md` - Technical details
- `docs/developer/mcp_oauth_migration_guide.md` - User migration guide
- `docs/developer/mcp_oauth_implementation_summary.md` - Complete changes summary
- `docs/subsystems/auth.md` - Authentication architecture
- `docs/specs/MCP_SPEC.md` - MCP specification
