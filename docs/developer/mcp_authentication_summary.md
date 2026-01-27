# MCP Authentication Implementation Summary

## Overview

MCP authentication has been upgraded from session tokens to OAuth 2.0 Authorization Code flow with PKCE. All MCP connections require authentication, with OAuth as the recommended method and session tokens deprecated.

## What Was Implemented

### Backend Changes

1. **Authentication Service** (`src/services/mcp_auth.ts`):
   - New service to validate Supabase JWT tokens
   - Extracts `user_id` from validated tokens
   - Returns user information (userId, email)

2. **MCP Server Authentication** (`src/server.ts`):
   - Added authentication context (authenticatedUserId, sessionToken)
   - Added initialize handler that validates session token from env var
   - Added helper method `getAuthenticatedUserId()` to validate user_id params
   - Updated all MCP actions to use authenticated user_id

3. **Updated MCP Actions**:
   - `store()` - Uses authenticated user_id (validates if provided)
   - `correct()` - Uses authenticated user_id (validates if provided)
   - `merge_entities()` - Uses authenticated user_id (validates if provided)
   - `create_relationship()` - Uses authenticated user_id
   - `retrieve_entities()` - Uses authenticated user_id (validates if provided)
   - `analyze_schema_candidates()` - Uses authenticated user_id (validates if provided)
   - `get_schema_recommendations()` - Uses authenticated user_id (validates if provided)

### Frontend Changes

1. **AuthContext Enhancement** (`frontend/src/contexts/AuthContext.tsx`):
   - Added `sessionToken` field to context
   - Extracts `access_token` from Supabase session
   - Makes session token available to all components

2. **MCP Setup Dialog** (`frontend/src/components/MCPSetupDialog.tsx`):
   - New component with three tabs: Session Token, Cursor Setup, Claude Code Setup
   - Displays user's session token with copy-to-clipboard
   - Shows step-by-step installation instructions
   - Generates dynamic configuration examples
   - Includes troubleshooting tips

3. **UI Integration** (`frontend/src/components/MainApp.tsx`):
   - Added "MCP Setup" button in header next to "Sign Out"
   - Opens MCPSetupDialog when clicked

### Documentation Updates

1. **MCP Setup Guides**:
   - `docs/developer/mcp_cursor_setup.md` - Added authentication section and updated config examples
   - `docs/developer/mcp_claude_code_setup.md` - Added authentication section and updated config examples

2. **Authentication Documentation**:
   - `docs/subsystems/auth.md` - Updated MCP authentication section with flow diagram
   - `docs/specs/MCP_SPEC.md` - Added authentication specification section

3. **Environment Variables**:
   - `env.example` - Added `NEOTOMA_SESSION_TOKEN` documentation

## How It Works

### Authentication Flow

```
User → Signs in to Neotoma Web UI
  ↓
Frontend → Gets access_token from Supabase session
  ↓
User → Opens MCP Setup dialog, copies session token
  ↓
User → Adds NEOTOMA_SESSION_TOKEN to .cursor/mcp.json (or claude_desktop_config.json)
  ↓
MCP Client (Cursor/Claude) → Starts MCP server with env var
  ↓
MCP Server → Reads NEOTOMA_SESSION_TOKEN from process.env
  ↓
MCP Server → Validates token via Supabase Auth
  ↓
MCP Server → Extracts and stores user_id
  ↓
MCP Server → Uses authenticated user_id for all actions
```

### Security Benefits

1. **No User ID Spoofing**: Users cannot pass arbitrary user_id values to access other users' data
2. **Token Validation**: Every MCP connection validates the token via Supabase Auth
3. **User Context**: All operations automatically use the authenticated user's ID
4. **Parameter Validation**: If user_id is provided in actions, it's validated against authenticated user

## Testing Instructions

### 1. Test Backend Authentication

**Start MCP server with valid token:**
```bash
# Get session token from web UI (sign in, click MCP Setup, copy token)
export NEOTOMA_SESSION_TOKEN="your-session-token-here"
npm run dev
```

**Expected:** Server starts and logs "Initialized with authenticated user: {uuid}"

**Start MCP server without token:**
```bash
unset NEOTOMA_SESSION_TOKEN
npm run dev
```

**Expected:** Initialization fails with "NEOTOMA_SESSION_TOKEN environment variable required"

### 2. Test Frontend UI

**Start development servers:**
```bash
npm run dev:full
```

**Test MCP Setup Dialog:**
1. Navigate to http://localhost:5195
2. Sign in with your account
3. Click "MCP Setup" button in header
4. Verify session token is displayed
5. Test copy-to-clipboard functionality
6. Check Cursor Setup tab for configuration example
7. Check Claude Code tab for configuration example

### 3. Test MCP Connection

**Update `.cursor/mcp.json`:**
```json
{
  "mcpServers": {
    "neotoma": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/neotoma",
      "env": {
        "NEOTOMA_SESSION_TOKEN": "your-session-token-from-ui"
      }
    }
  }
}
```

**Test in Cursor:**
1. Restart Cursor
2. Open Cursor chat
3. Ask: "Can you list my Neotoma entities via mcp"
4. Verify MCP connection works and returns data

### 4. Test Authentication Validation

**Test with expired token:**
1. Use an old/expired session token in mcp.json
2. Try to use MCP actions
3. Should get "Invalid session token" error

**Test with missing token:**
1. Remove NEOTOMA_SESSION_TOKEN from mcp.json
2. Try to use MCP actions
3. Should get "NEOTOMA_SESSION_TOKEN environment variable required" error

## Migration Guide for Existing Users

If you were using Neotoma MCP before this change:

1. **Get your session token:**
   - Sign in to the Neotoma web UI
   - Click "MCP Setup" in the header
   - Copy your session token from the "Session Token" tab

2. **Update your MCP configuration:**
   - **Cursor:** Add `NEOTOMA_SESSION_TOKEN` to `.cursor/mcp.json` env section
   - **Claude Code:** Add `NEOTOMA_SESSION_TOKEN` to `claude_desktop_config.json` env section

3. **Restart your AI assistant** (Cursor or Claude Code)

4. **Test the connection** with a simple MCP action

## Known Limitations

1. **Token Expiration**: Session tokens expire after sign-out or inactivity. Users need to manually update their MCP configuration with a fresh token.

2. **Manual Configuration**: Users must copy the session token from the web UI and paste it into their MCP config file.

3. **No Automatic Refresh**: MCP server doesn't automatically refresh expired tokens (users must update config manually).

## OAuth Implementation (Current)

OAuth 2.0 Authorization Code flow with PKCE is now the recommended authentication method:

1. **Automatic Token Refresh**: Refresh tokens stored encrypted in database, access tokens auto-refreshed
2. **Long-Lived Connections**: Connections persist until explicitly revoked
3. **User-Approved**: Users approve connections via web browser OAuth flow
4. **Secure**: PKCE prevents authorization code interception
5. **Manageable**: Users can list and revoke connections via UI

### OAuth Benefits Over Session Tokens

- No manual token copying or updating
- Tokens automatically refresh before expiration
- Connections persist across browser sessions
- User can manage multiple MCP connections
- More secure with PKCE flow
- Better user experience

## Session Tokens (Deprecated)

Session token authentication is deprecated and will be removed in a future version. All users should migrate to OAuth.
