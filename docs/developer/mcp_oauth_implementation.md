# MCP OAuth Implementation

## Overview

MCP authentication has been upgraded to use OAuth 2.0 Authorization Code flow with PKCE. This provides secure, long-lived connections with automatic token refresh, replacing the manual session token approach.

## Changes Summary

### Backend

1. **Database Schema** (2 new tables):
   - `mcp_oauth_connections` - Stores OAuth connections with encrypted refresh tokens
   - `mcp_oauth_state` - Temporary PKCE state storage (10 minute TTL)

2. **OAuth Service** (`src/services/mcp_oauth.ts`):
   - `initiateOAuthFlow()` - Start OAuth flow with PKCE
   - `handleOAuthCallback()` - Exchange code for tokens
   - `getAccessTokenForConnection()` - Get valid access token (auto-refresh)
   - `getConnectionStatus()` - Check connection status
   - `listConnections()` - List user's connections
   - `revokeConnection()` - Revoke connection

3. **REST Endpoints** (`src/actions.ts`):
   - `POST /api/mcp/oauth/initiate` - Start OAuth flow
   - `GET /api/mcp/oauth/callback` - Handle OAuth redirect
   - `GET /api/mcp/oauth/status` - Poll connection status
   - `GET /api/mcp/oauth/connections` - List connections (authenticated)
   - `DELETE /api/mcp/oauth/connections/:id` - Revoke connection (authenticated)

4. **MCP Server** (`src/server.ts`):
   - Updated to support both `NEOTOMA_CONNECTION_ID` (OAuth) and `NEOTOMA_SESSION_TOKEN` (deprecated)
   - Automatic token refresh via OAuth service
   - Deprecation warnings for session token usage

5. **Configuration** (`src/config.ts`):
   - Added `apiBase` configuration
   - Added `mcpTokenEncryptionKey` for refresh token encryption

### Frontend

1. **MCP Configuration Page** (`frontend/src/components/MCPConfigurationPage.tsx`):
   - New "OAuth Connection" tab (default)
   - OAuth flow UI (initiate, authorize, poll status)
   - Auto-generated connection IDs
   - Updated config examples to use connection IDs

2. **MCP Connections List** (`frontend/src/components/MCPConnectionsList.tsx` - NEW):
   - Lists all active connections
   - Shows connection details (ID, client name, timestamps)
   - Revoke connections button

3. **MCP Setup Dialog** (`frontend/src/components/MCPSetupDialog.tsx`):
   - Added deprecation notice for session tokens
   - Updated to reference OAuth flow

### Documentation

- `docs/subsystems/auth.md` - Updated MCP Authentication section
- `docs/specs/MCP_SPEC.md` - Updated authentication specification
- `docs/developer/mcp_cursor_setup.md` - Updated setup instructions
- `docs/developer/mcp_claude_code_setup.md` - Updated setup instructions
- `docs/api/rest_api.md` - Added OAuth endpoints documentation
- `env.example` - Added OAuth configuration variables

## OAuth Flow

```
1. User navigates to MCP Setup → OAuth Connection tab
2. User enters connection ID (or generates one)
3. User clicks "Start OAuth Flow"
4. Backend creates OAuth state with PKCE challenge
5. User clicks "Open Authorization Page" → opens browser
6. User signs in and approves connection in browser
7. Supabase redirects to callback with authorization code
8. Backend exchanges code + verifier for access + refresh tokens
9. Backend stores encrypted refresh token in database
10. Frontend polls status until "active"
11. User copies connection ID to MCP client config
12. MCP client uses connection ID (not session token)
13. MCP server retrieves refresh token, gets access token
14. MCP server validates access token and extracts user_id
```

## Migration Path

### For New Users

Use OAuth from the start. Follow the OAuth setup instructions in:
- `docs/developer/mcp_cursor_setup.md`
- `docs/developer/mcp_claude_code_setup.md`

### For Existing Users (Session Token)

1. **Continue using session tokens** (still supported for backward compatibility)
2. **Migrate to OAuth when ready**:
   - Go to MCP Setup → OAuth Connection tab
   - Create OAuth connection
   - Update MCP config to use `NEOTOMA_CONNECTION_ID` instead of `NEOTOMA_SESSION_TOKEN`
   - Remove `NEOTOMA_SESSION_TOKEN` from config

### Deprecation Timeline

- **Current**: Both OAuth and session tokens supported
- **Next release**: Session tokens show deprecation warnings in logs
- **Future release**: Session tokens removed, OAuth only

## Security

### Token Encryption

- Refresh tokens encrypted at rest using AES-256-GCM
- Encryption key: `MCP_TOKEN_ENCRYPTION_KEY` environment variable
- Same encryption service as other sensitive data

### PKCE

- Code verifier: 64-128 characters (base64url)
- Code challenge: SHA-256 hash of verifier
- State tokens: 32 characters (base64url)
- State expires after 10 minutes

### Connection Management

- Users can revoke connections via UI
- Revoked connections cannot be used
- Multiple connections per user supported
- Connection IDs are unique globally

## Testing

### Unit Tests

`src/services/__tests__/mcp_oauth.test.ts`:
- PKCE generation
- Auth URL creation
- Configuration validation
- **URL parameter validation** (validates no invalid provider parameter, matches OAuth 2.1 Server requirements)

### Integration Tests

`tests/integration/mcp_oauth_flow.test.ts`:
- OAuth state creation
- Connection status queries
- List connections
- Revoke connections

### Manual Testing

1. **Create OAuth connection:**
   - Go to MCP Setup page
   - Create connection via OAuth flow
   - Verify connection appears in list

2. **Use OAuth connection:**
   - Update `.cursor/mcp.json` with connection ID
   - Restart Cursor
   - Test MCP actions
   - Verify authentication works

3. **Revoke connection:**
   - Revoke connection via UI
   - Try to use MCP with revoked connection ID
   - Verify authentication fails

### Configuration Requirements

**CRITICAL: Supabase OAuth 2.1 Server MUST be enabled for MCP OAuth to work.**

**Error: "Unsupported provider: Provider could not be found"**

This error occurs when:
- OAuth 2.1 Server is not enabled in Supabase Dashboard, OR
- OAuth 2.1 Server is enabled but not properly configured

**Setup Steps (Required):**

1. **Enable OAuth 2.1 Server** in Supabase Dashboard:
   - Navigate to: **Authentication > OAuth Server**
   - Toggle **"Enable OAuth 2.1 Server"** to ON
   - Configure **Authorization Path** (e.g., `/oauth/consent`)
   - Save changes

2. **Register OAuth Client** (choose one method):
   - **Option A (Recommended):** Enable **"Allow Dynamic OAuth Apps"**
     - Toggle to ON
     - **Automatic client registration is now implemented** - the code will automatically register an OAuth client on first use
     - No manual `client_id` configuration needed
     - The `client_id` is cached in memory after first registration
   - **Option B:** Manually register OAuth client:
     - Click "Register Client" or "Add Client"
     - Configure client settings (name, redirect URIs)
     - Copy the generated `client_id`
     - Add `SUPABASE_OAUTH_CLIENT_ID=<client_id>` to your `.env` file
     - This overrides automatic registration (manual registration takes precedence)

3. **Verify Configuration:**
   - Ensure OAuth 2.1 Server toggle is ON (this is the critical setting)
   - Check that authorization path is set
   - If using manual registration, verify `SUPABASE_OAUTH_CLIENT_ID` is set in `.env`
   - Test the OAuth flow in the web UI

**Why This Is Required:**

- `/auth/v1/authorize` without a `provider` parameter only works when OAuth 2.1 Server is enabled
- Without OAuth 2.1 Server, Supabase expects a `provider` parameter (for third-party OAuth like Google/GitHub)
- Our MCP OAuth flow uses Supabase Auth's own authentication (email/password), not third-party providers
- OAuth 2.1 Server allows Supabase to act as an OAuth provider for our own authentication

**Troubleshooting:**

- **Error persists after enabling OAuth 2.1 Server:** Wait a few minutes for configuration to propagate, then try again
- **Still seeing provider errors:** Verify OAuth 2.1 Server is enabled in the correct Supabase project (check project URL matches your `SUPABASE_URL`)
- **Need help:** See `docs/developer/mcp_oauth_manual_steps.md` for detailed walkthrough

**Dynamic Client Registration (Experimental):**

The code attempts automatic OAuth client registration when "Allow Dynamic OAuth Apps" is enabled:
- If `SUPABASE_OAUTH_CLIENT_ID` is not set, the code attempts to register a client
- First tries JavaScript client method `supabase.auth.admin.createOAuthClient()` (if available)
- Falls back to REST API endpoint `/auth/v1/admin/oauth/clients` if JavaScript method doesn't exist
- The registered `client_id` is cached in memory to avoid re-registration
- Manual registration (via `SUPABASE_OAUTH_CLIENT_ID`) takes precedence over dynamic registration

**Current Status:**
- **JavaScript client method**: May not be available in current `@supabase/supabase-js` versions (tested with 2.90.1)
- **REST API endpoint**: Experimental - OAuth 2.1 Server is in beta and admin API endpoints may not be fully documented
- **Recommended approach**: Manual client registration via Supabase Dashboard (see manual steps guide)

**Implementation Details:**
- Uses `/auth/v1/oauth/authorize` endpoint with `client_id` parameter (required for OAuth 2.1 Server)
- Automatic registration attempts happen on first OAuth flow initiation
- Client would be registered with name "Neotoma MCP Client" and the callback redirect URI
- If dynamic registration fails, clear error messages guide users to manual registration

## Configuration

### Environment Variables

**Required:**
```bash
# Encryption key for refresh tokens (generate with: openssl rand -hex 32)
MCP_TOKEN_ENCRYPTION_KEY=your-encryption-key-here
```

**Optional:**
```bash
# API base URL (defaults to http://localhost:8080 in dev)
API_BASE_URL=http://localhost:8080

# OAuth connection ID (for MCP clients)
NEOTOMA_CONNECTION_ID=cursor-2025-01-21-abc123

# Session token (deprecated)
# NEOTOMA_SESSION_TOKEN=your-session-token-here
```

### MCP Client Configuration

**Cursor (`.cursor/mcp.json`):**
```json
{
  "mcpServers": {
    "neotoma": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/neotoma",
      "env": {
        "NEOTOMA_CONNECTION_ID": "cursor-2025-01-21-abc123"
      }
    }
  }
}
```

**Claude Code (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "neotoma": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/neotoma/dist/index.js"],
      "env": {
        "NEOTOMA_CONNECTION_ID": "claude-2025-01-21-abc123"
      }
    }
  }
}
```

## Troubleshooting

### "MCP_TOKEN_ENCRYPTION_KEY not configured"

Add encryption key to `.env`:
```bash
openssl rand -hex 32
# Copy output to .env
MCP_TOKEN_ENCRYPTION_KEY=<output>
```

### "OAuth connection failed: Connection not found"

1. Verify connection exists in database
2. Check connection hasn't been revoked
3. Create new connection via web UI

### "Failed to refresh access token"

1. Refresh token may be invalid or expired
2. Create new OAuth connection
3. Update MCP client config with new connection ID

### Migration Script Issues

If migrations fail to apply:
1. Check Supabase connection
2. Apply migrations manually via Supabase dashboard
3. Run: `npm run migrate`

## Related Documentation

- `docs/subsystems/auth.md` - Authentication architecture
- `docs/specs/MCP_SPEC.md` - MCP specification
- `docs/api/rest_api.md` - REST API endpoints
- `docs/developer/mcp_cursor_setup.md` - Cursor setup
- `docs/developer/mcp_claude_code_setup.md` - Claude Code setup
