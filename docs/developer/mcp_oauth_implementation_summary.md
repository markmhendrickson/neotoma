# MCP OAuth Implementation Summary

## Overview

Replaced session token-based MCP authentication with OAuth 2.0 Authorization Code flow with PKCE. This provides secure, long-lived connections with automatic token refresh.

## Implementation Date

2025-01-21

## Changes Made

### Backend Changes

#### 1. Database Schema

**Files Created:**
- `supabase/migrations/20250121000001_add_mcp_oauth_connections.sql`
- `supabase/migrations/20250121000002_add_mcp_oauth_state.sql`

**Tables Added:**

1. **`mcp_oauth_connections`**:
   - Stores OAuth connections with encrypted refresh tokens
   - Fields: user_id, connection_id, refresh_token, access_token, client_name, timestamps
   - RLS policies for user-scoped access

2. **`mcp_oauth_state`**:
   - Temporary storage for PKCE state (10 minute TTL)
   - Fields: state, connection_id, code_verifier, redirect_uri, timestamps
   - Auto-cleanup function for expired states

#### 2. OAuth Service

**File Created:** `src/services/mcp_oauth.ts`

**Functions:**
- `generatePKCE()` - Generate PKCE challenge and verifier
- `createAuthUrl()` - Create Supabase OAuth authorization URL
- `initiateOAuthFlow()` - Start OAuth flow, store state
- `handleOAuthCallback()` - Exchange code for tokens, store connection
- `getAccessTokenForConnection()` - Get valid access token (auto-refresh)
- `getConnectionStatus()` - Check connection status
- `listConnections()` - List user's connections
- `revokeConnection()` - Revoke connection

**Security Features:**
- Refresh tokens encrypted with AES-256-GCM
- PKCE prevents code interception
- State tokens expire after 10 minutes
- Automatic token refresh before expiration

#### 3. REST API Endpoints

**File Modified:** `src/actions.ts`

**Endpoints Added:**
- `POST /api/mcp/oauth/initiate` - Start OAuth flow
- `GET /api/mcp/oauth/callback` - Handle OAuth redirect
- `GET /api/mcp/oauth/status` - Poll connection status
- `GET /api/mcp/oauth/connections` - List connections (authenticated)
- `DELETE /api/mcp/oauth/connections/:connection_id` - Revoke connection (authenticated)

#### 4. MCP Server Updates

**File Modified:** `src/server.ts`

**Changes:**
- Updated `setupInitializeHandler()` to support both OAuth and session tokens
- Reads `NEOTOMA_CONNECTION_ID` environment variable (preferred)
- Falls back to `NEOTOMA_SESSION_TOKEN` (deprecated)
- Logs deprecation warnings for session token usage
- Uses OAuth service to get access tokens from connections

#### 5. Configuration

**File Modified:** `src/config.ts`

**Added:**
- `apiBase` - API base URL for OAuth callbacks
- `mcpTokenEncryptionKey` - Encryption key for refresh tokens

**Environment Variables:**
- `API_BASE_URL` - API base URL (defaults based on environment)
- `MCP_TOKEN_ENCRYPTION_KEY` - Required for token encryption

### Frontend Changes

#### 1. OAuth Connection UI

**File Modified:** `frontend/src/components/MCPConfigurationPage.tsx`

**Changes:**
- Added "OAuth Connection" tab (now default)
- OAuth flow UI (initiate, authorize, status polling)
- Auto-generate connection IDs
- Updated config generators to use connection IDs
- Added MCPConnectionsList integration

#### 2. Connections Management

**File Created:** `frontend/src/components/MCPConnectionsList.tsx`

**Features:**
- Lists all active OAuth connections
- Shows connection details (ID, client name, timestamps)
- Revoke connections button
- Refresh connections list

#### 3. Setup Dialog Updates

**File Modified:** `frontend/src/components/MCPSetupDialog.tsx`

**Changes:**
- Added deprecation notice for session tokens
- Updated tab labels to show "Session Token (Deprecated)"
- Added link to OAuth setup

### Documentation Updates

#### 1. Authentication Documentation

**File Modified:** `docs/subsystems/auth.md`

**Changes:**
- Added OAuth authentication flow section (primary)
- Moved session token flow to "Deprecated" section
- Updated security considerations
- Added OAuth endpoints table

#### 2. MCP Specification

**File Modified:** `docs/specs/MCP_SPEC.md`

**Changes:**
- Updated authentication section to prioritize OAuth
- Added OAuth flow documentation
- Updated initialization examples
- Updated error codes for OAuth
- Marked session token as deprecated

#### 3. Setup Guides

**Files Modified:**
- `docs/developer/mcp_cursor_setup.md`
- `docs/developer/mcp_claude_code_setup.md`

**Changes:**
- Replaced "Get Session Token" with "Set Up OAuth Connection"
- Added OAuth setup instructions
- Updated config examples to use connection IDs
- Added OAuth troubleshooting
- Marked session token sections as deprecated

#### 4. API Documentation

**File Modified:** `docs/api/rest_api.md`

**Changes:**
- Added "MCP OAuth Endpoints" section
- Documented all 5 OAuth endpoints
- Added request/response examples
- Added error documentation

#### 5. New Documentation

**Files Created:**
- `docs/developer/mcp_oauth_implementation.md` - Complete OAuth implementation details
- `docs/developer/mcp_oauth_migration_guide.md` - Step-by-step migration guide

**Files Modified:**
- `docs/developer/mcp_authentication_summary.md` - Updated to note OAuth is now implemented
- `docs/developer/mcp_auth_implementation_complete.md` - Marked session tokens as historical

#### 6. Environment Variables

**File Modified:** `env.example`

**Changes:**
- Added `NEOTOMA_CONNECTION_ID` (recommended)
- Added `MCP_TOKEN_ENCRYPTION_KEY` (required for OAuth)
- Added `API_BASE_URL` configuration
- Marked `NEOTOMA_SESSION_TOKEN` as deprecated

#### 7. README

**File Modified:** `README.md`

**Changes:**
- Added note about OAuth authentication
- Updated MCP setup guide links
- Added OAuth implementation guide link

#### 8. Scripts

**File Modified:** `scripts/get_mcp_token.sh`

**Changes:**
- Added deprecation warning
- Added OAuth recommendation at top
- Kept session token instructions for backward compatibility

### Testing

#### Unit Tests

**File Created:** `src/services/__tests__/mcp_oauth.test.ts`

**Tests:**
- PKCE generation validation
- Auth URL creation
- Configuration validation
- All tests passing

#### Integration Tests

**File Created:** `tests/integration/mcp_oauth_flow.test.ts`

**Tests:**
- OAuth state creation
- Connection status queries
- List connections
- Revoke connections
- Note: Require database tables to be created

## Migration Status

### Completed

- ✅ Database schema designed
- ✅ OAuth service implemented
- ✅ REST endpoints added
- ✅ MCP server updated (backward compatible)
- ✅ Frontend UI updated
- ✅ Documentation updated
- ✅ Unit tests written and passing
- ✅ Integration tests written
- ✅ Migration guide created
- ✅ TypeScript compilation passing
- ✅ Build successful

### Pending

- ⏳ Database migrations need to be applied (manual step)
- ⏳ Integration tests pass after migrations applied
- ⏳ Manual testing with real OAuth flow
- ⏳ Session token deprecation timeline (remove in future release)

## Database Migrations

The database migrations need to be applied manually or via Supabase CLI:

```bash
# Apply all migrations
npm run migrate

# Or via Supabase CLI
npx supabase db push --include-all
```

**Note:** If migrations fail due to schema issues, they can be applied manually via Supabase dashboard SQL editor.

## Backward Compatibility

### Supported (Current)

Both authentication methods work:
- OAuth connections (recommended)
- Session tokens (deprecated, with warnings)

### Transition Period

- All existing session token configs continue to work
- Users can migrate at their own pace
- Deprecation warnings logged for session token usage

### Future

Session token support will be removed in a future major version (e.g., v2.0.0):
- Only OAuth will be supported
- All users must migrate before upgrade

## Security Improvements

1. **PKCE Flow**: Prevents authorization code interception attacks
2. **Encrypted Storage**: Refresh tokens encrypted at rest (AES-256-GCM)
3. **Automatic Refresh**: Access tokens refreshed before expiration
4. **User Control**: Users can list and revoke connections anytime
5. **State Validation**: OAuth state tokens prevent CSRF attacks
6. **Connection Isolation**: Each connection has unique ID and can be managed independently

## Configuration Requirements

### Required Environment Variables

```bash
# Encryption key for refresh tokens (generate with: openssl rand -hex 32)
MCP_TOKEN_ENCRYPTION_KEY=your-32-byte-hex-key-here
```

### Optional Environment Variables

```bash
# API base URL (defaults intelligently based on environment)
API_BASE_URL=http://localhost:8080

# Frontend URL for redirects (defaults based on environment)
FRONTEND_URL=http://localhost:5195

# OAuth connection ID (for MCP clients)
NEOTOMA_CONNECTION_ID=your-connection-id-here

# Session token (deprecated - for backward compatibility)
# NEOTOMA_SESSION_TOKEN=your-session-token-here
```

## User Experience

### OAuth Flow

1. **One-time setup** (5 minutes):
   - Create connection via web UI
   - Approve in browser
   - Update MCP config with connection ID

2. **Long-lived connection**:
   - Works across browser sessions
   - No manual token updates
   - Automatic refresh

3. **Easy management**:
   - List all connections
   - Revoke anytime
   - Create multiple connections

### Session Token (Deprecated)

1. **Manual setup** (every session):
   - Sign in to web UI
   - Copy session token
   - Update MCP config
   - Restart AI assistant

2. **Frequent updates**:
   - Update token when it expires
   - Update token after sign out
   - Manual refresh required

## Next Steps

1. **Apply database migrations** (if not already done)
2. **Generate encryption key** and add to `.env`
3. **Test OAuth flow** via web UI
4. **Update MCP configs** to use OAuth
5. **Test MCP connections** with Cursor/Claude
6. **Monitor deprecation warnings** for session token usage
7. **Plan session token removal** for future major version

## Related Documentation

- `docs/developer/mcp_oauth_migration_guide.md` - Step-by-step migration guide
- `docs/developer/mcp_oauth_implementation.md` - Technical implementation details
- `docs/subsystems/auth.md` - Authentication architecture
- `docs/specs/MCP_SPEC.md` - MCP specification
- `docs/api/rest_api.md` - REST API endpoints
