# MCP OAuth Migration Guide

## Overview

This guide helps you migrate from session token authentication (deprecated) to OAuth 2.0 for MCP connections.

## Why Migrate?

**OAuth Benefits:**
- No manual token copying or updating
- Tokens automatically refresh (no expiration interruptions)
- More secure (PKCE prevents code interception)
- Better user experience
- Manage multiple MCP connections
- Revoke connections anytime

**Session Token Limitations:**
- Tokens expire when you sign out
- Requires manual copying from web UI
- Must update MCP config when token expires
- No automatic refresh
- Less secure for long-lived connections

## Migration Steps

### Step 1: Create OAuth Connection

1. **Sign in** to Neotoma web UI (http://localhost:5195)
2. **Navigate** to MCP Setup page (click "MCP Setup" button or go to `/mcp-setup`)
3. **Click** "OAuth Connection" tab
4. **Generate** or enter a connection ID:
   - Click "Generate" for auto-generated ID
   - Or enter your own (e.g., `cursor-2025-01-21-abc123`)
5. **Click** "Start OAuth Flow"
6. **Click** "Open Authorization Page" button
7. **Approve** the connection in your browser
8. **Wait** for confirmation (page will show "Connection active")
9. **Copy** your connection ID (you'll need this for Step 2)

### Step 2: Update MCP Client Configuration

#### For Cursor

Edit `.cursor/mcp.json`:

**Before (Session Token):**
```json
{
  "mcpServers": {
    "neotoma": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/neotoma",
      "env": {
        "NEOTOMA_SESSION_TOKEN": "eyJhbGci..."
      }
    }
  }
}
```

**After (OAuth):**
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

#### For Claude Code

Edit `claude_desktop_config.json`:

**Before (Session Token):**
```json
{
  "mcpServers": {
    "neotoma": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/neotoma/dist/index.js"],
      "env": {
        "NEOTOMA_SESSION_TOKEN": "eyJhbGci..."
      }
    }
  }
}
```

**After (OAuth):**
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

### Step 3: Restart Your AI Assistant

- **Cursor**: Quit and restart completely
- **Claude Code**: Quit and restart completely

### Step 4: Test the Connection

Try using an MCP action in your AI assistant:
```
Can you list my Neotoma entities via MCP?
```

If successful, the migration is complete.

### Step 5: Remove Old Session Token (Optional)

Once OAuth is working, you can remove the `NEOTOMA_SESSION_TOKEN` line from your MCP config.

## Troubleshooting

### "OAuth connection failed: Connection not found"

**Solution:**
1. Verify connection exists in web UI (MCP Setup → OAuth Connection tab)
2. Check connection status is "active"
3. Verify connection ID matches exactly (case-sensitive)

### "Authentication required"

**Solution:**
1. Verify `NEOTOMA_CONNECTION_ID` is set in MCP config
2. Check connection hasn't been revoked
3. Restart AI assistant after updating config

### "Failed to refresh access token"

**Solution:**
1. Create new OAuth connection via web UI
2. Update MCP config with new connection ID
3. Old connection may have expired or been revoked

### MCP Server Not Starting

**Solution:**
1. Check that `MCP_TOKEN_ENCRYPTION_KEY` is set in `.env`
2. Generate key with: `openssl rand -hex 32`
3. Add to `.env`: `MCP_TOKEN_ENCRYPTION_KEY=<output>`

## Managing Connections

### List Your Connections

1. Go to Neotoma web UI → MCP Setup
2. Scroll to "MCP Connections" section
3. View all active connections with details

### Revoke a Connection

1. Go to MCP Setup → MCP Connections section
2. Find the connection you want to revoke
3. Click "Revoke" button
4. Confirm revocation
5. Create new connection if needed

### Multiple Connections

You can have multiple OAuth connections (e.g., one for Cursor, one for Claude):
- Create separate connections with different IDs
- Use appropriate connection ID in each MCP client
- All connections work independently

## Backward Compatibility

Session tokens are still supported but deprecated:
- Existing session token configs will continue to work
- Deprecation warnings appear in logs
- Session tokens will be removed in a future major version
- Migrate to OAuth at your convenience

## Need Help?

- **Setup Issues**: See `docs/developer/mcp_cursor_setup.md` or `docs/developer/mcp_claude_code_setup.md`
- **OAuth Details**: See `docs/developer/mcp_oauth_implementation.md`
- **Authentication Spec**: See `docs/subsystems/auth.md`
- **API Reference**: See `docs/api/rest_api.md`
