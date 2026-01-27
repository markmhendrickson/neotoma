# Claude Code MCP Setup Guide

This guide explains how to connect the Neotoma MCP server to Claude Code for localhost agent integration.

For other integrations, see:
- [`mcp_cursor_setup.md`](mcp_cursor_setup.md) - Cursor integration
- [`mcp_chatgpt_setup.md`](mcp_chatgpt_setup.md) - ChatGPT Custom GPT setup

## Why Claude Code + Neotoma

Claude Code represents a new paradigm of localhost AI agents that run on your computer with private environment, data, and context, as [Karpathy describes](https://x.com/karpathy/status/2002118205729562949). Neotoma aligns perfectly with this architecture:

- **Privacy-First:** Both Claude Code and Neotoma prioritize user-controlled, private data
- **Localhost Architecture:** Agents access structured memory locally, not through cloud APIs
- **Cross-Platform:** Neotoma's MCP integration works seamlessly with Claude Code's localhost approach
- **Structured Memory:** Claude Code can leverage Neotoma's deterministic extraction and entity resolution for reliable context

This integration validates the localhost agent paradigm: agents running on your computer, hand-in-hand with your private data substrate.

## Prerequisites

1. **Claude Code installed** - Desktop application with MCP support
2. **Node.js** v18.x or v20.x installed
3. **Supabase project** set up with schema applied (see `docs/developer/getting_started.md`)
4. **Environment variables** configured in `.env`

## Step 1: Build the MCP Server

The MCP server needs to be built before Claude Code can use it:

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

**Note:** For active development, use `npm run dev:mcp` to auto-rebuild on changes.

## Step 2: Configure Environment Variables

Create `.env` in the project root with your Supabase credentials:

```bash
# Supabase Configuration (preferred: use Project ID)
DEV_SUPABASE_PROJECT_ID=your-project-id
DEV_SUPABASE_SERVICE_KEY=your-service-role-key-here

# Alternative: Full URL (also supported)
# DEV_SUPABASE_URL=https://your-project-id.supabase.co
# DEV_SUPABASE_SERVICE_KEY=your-service-role-key-here
```

**Where to find credentials:**
- **Project ID**: Supabase Dashboard → Settings → General → Project ID (preferred)
- **Service Role Key**: Supabase Dashboard → Settings → API → service_role key (NOT anon key)

**Security Note:** Never commit `.env` to git. It's already in `.gitignore`.

## Step 3: Set Up OAuth Connection

**IMPORTANT: Authentication is required.** MCP connections must authenticate using OAuth (recommended) or session tokens (deprecated).

### OAuth Setup (Recommended)

1. **Sign in** to the Neotoma web UI (http://localhost:5195)
2. **Navigate** to MCP Setup page
3. **Go to** "OAuth Connection" tab
4. **Enter a connection ID** (or click "Generate"):
   - Example: `claude-2025-01-21-abc123`
5. **Click** "Start OAuth Flow"
6. **Click** "Open Authorization Page" to open browser
7. **Approve** the connection in your browser
8. **Wait** for confirmation that connection is active
9. **Copy** your `connection_id` for use in MCP configuration

**Benefits:**
- Tokens automatically refresh (no manual updates)
- More secure than session tokens
- Connections persist until revoked

### Session Token Setup (Deprecated)

**Will be removed in a future version. Use OAuth instead.**

1. Sign in to the Neotoma web UI (http://localhost:5195)
2. Click "MCP Setup" button
3. Go to "Session Token (Deprecated)" tab
4. Copy your session token

## Step 4: Configure Claude Code MCP Settings

Claude Code uses a configuration file to connect to MCP servers.

### Locate Claude Code Config

The configuration file location depends on your OS:

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

**Windows:**
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

### Add Neotoma MCP Server

Edit the config file and add the Neotoma server:

**With OAuth (Recommended):**

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/neotoma/dist/index.js"],
      "cwd": "/absolute/path/to/neotoma",
      "env": {
        "NEOTOMA_CONNECTION_ID": "claude-2025-01-21-abc123"
      }
    }
  }
}
```

**With Session Token (Deprecated):**

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/neotoma/dist/index.js"],
      "cwd": "/absolute/path/to/neotoma",
      "env": {
        "NEOTOMA_SESSION_TOKEN": "your-session-token-here"
      }
    }
  }
}
```

**Configuration fields:**
- `command`: Absolute path to node executable (get via `which node`)
- `args`: Absolute path to built MCP server (dist/index.js)
- `cwd`: Absolute path to Neotoma project root
- `env.NEOTOMA_CONNECTION_ID`: Your OAuth connection ID (recommended)
- `env.NEOTOMA_SESSION_TOKEN`: Your Supabase session token (deprecated)

**Example OAuth configuration:**

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "/Users/username/.nvm/versions/node/v20.10.0/bin/node",
      "args": ["/Users/username/Projects/neotoma/dist/index.js"],
      "cwd": "/Users/username/Projects/neotoma",
      "env": {
        "NEOTOMA_CONNECTION_ID": "claude-2025-01-21-abc123"
      }
    }
  }
}
```

**Note:** OAuth connections automatically refresh tokens and persist until revoked.

## Step 4: Restart Claude Code

After configuring the MCP server:

1. **Quit Claude Code completely** (not just close the window)
2. **Restart Claude Code**
3. **Verify connection** in a new conversation

## Step 5: Test the Integration

Once connected, test the available Neotoma actions:

### Available Actions

1. **`submit_payload`** - Store structured data from conversations
2. **`retrieve_records`** - Query records with filters
3. **`retrieve_entities`** - Find entities (companies, people, locations)
4. **`get_entity_snapshot`** - Get current state of an entity
5. **`list_timeline_events`** - Get chronological events
6. **`get_graph_neighborhood`** - Explore relationships
7. **`upload_file`** - Upload and extract data from files
8. **`get_file_url`** - Get signed URL for a file

### Example Test Commands

**Store contextual data:**
```
Remember that I met with Acme Corp today to discuss the Q4 budget. The meeting was productive and we agreed on $50,000 allocation.
```

**Query records:**
```
What companies have I mentioned in my records?
```

**Retrieve entities:**
```
Show me all the people I've referenced recently.
```

**Upload a file:**
```
Can you upload this invoice PDF and extract the structured data?
```

## Localhost Agent Architecture

Claude Code's localhost architecture aligns perfectly with Neotoma's privacy-first design:

**Privacy-First Integration:**
- All data stays on your computer
- No cloud intermediary for memory access
- User-controlled memory with end-to-end encryption
- Never used for training or provider access

**Deterministic Context:**
- Claude Code accesses Neotoma's deterministic extraction
- Same queries return consistent, reproducible results
- Verifiable domain for personal data
- Compensates for LLM "jagged intelligence"

**Cross-Platform Memory:**
- Same Neotoma memory works with Cursor, ChatGPT, and Claude Code
- No platform lock-in
- Memory persists across all AI tools

This represents a new paradigm: localhost agents with private data substrates, not cloud deployments with platform-locked memory.

## Troubleshooting

### Issue: "Not authenticated" or "Authentication required"

This error means the MCP server didn't receive valid authentication during initialization.

**Solutions (OAuth - Recommended):**

1. **Verify connection is active:**
   - Sign in to Neotoma web UI (http://localhost:5195)
   - Go to MCP Setup → OAuth Connection tab
   - Check that your connection ID shows "active" status
   - If not active, create a new connection (see Step 3 above)

2. **Check environment variable in config:**
   ```bash
   # macOS
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | grep NEOTOMA_CONNECTION_ID
   # Linux
   cat ~/.config/Claude/claude_desktop_config.json | grep NEOTOMA_CONNECTION_ID
   ```
   Should show: `"NEOTOMA_CONNECTION_ID": "your-connection-id"`

3. **Verify connection ID matches:**
   - Connection ID in config must match the active connection in web UI
   - Connection IDs are case-sensitive

4. **Create new connection if needed:**
   - If connection was revoked or expired, create a new one via web UI
   - Update config file with the new connection ID

5. **Restart Claude Code** completely (quit and reopen, not just reload)

**If using Session Token (Deprecated - Not Recommended):**
1. **Switch to OAuth** (strongly recommended) - more reliable and secure
2. Or **get a fresh session token:**
   - Sign in to the Neotoma web UI
   - Click "MCP Setup" → "Session Token (Deprecated)" tab
   - Copy your session token
   - Update `NEOTOMA_SESSION_TOKEN` in config file
   - Restart Claude Code

### Issue: "OAuth connection failed" or "Connection not found"

The OAuth connection doesn't exist, was revoked, or the connection ID is incorrect.

**Solutions:**
1. **Verify connection exists:**
   - Sign in to Neotoma web UI (http://localhost:5195)
   - Go to MCP Setup → OAuth Connection tab
   - Check if your connection ID appears in the list
   - Status should be "active" (not "pending" or "expired")

2. **If connection doesn't exist or was revoked:**
   - Create a new connection via web UI (MCP Setup → OAuth Connection tab)
   - Follow OAuth flow: enter connection ID → Start OAuth Flow → Approve in browser
   - Wait for "active" status confirmation

3. **Update config file** with the correct connection ID

4. **Restart Claude Code** completely

### Issue: "Invalid session token" or "Token validation failed" (Deprecated)

The session token is invalid or expired. **OAuth is recommended** to avoid this issue.

**Solutions:**
1. **Switch to OAuth** (strongly recommended):
   - Follow Step 3 above to create an OAuth connection
   - Update config to use `NEOTOMA_CONNECTION_ID` instead of `NEOTOMA_SESSION_TOKEN`
   - OAuth tokens automatically refresh and don't expire
   - Restart Claude Code

2. **If you must use session token** (deprecated):
   - Sign out and sign back in to the Neotoma web UI to get a fresh token
   - Copy the new token from the MCP Setup → "Session Token (Deprecated)" tab
   - Update config file with the new token
   - Restart Claude Code
   - **Note:** Session tokens expire when you sign out or after inactivity

### Issue: "MCP server not found" or "Command failed"

**Solutions:**
1. Ensure `npm run build` completed successfully
2. Verify `dist/index.js` exists
3. Use absolute paths in config (not `~` or relative paths)
4. Check node executable: `which node`
5. Verify `cwd` points to Neotoma project root

### Issue: "Invalid supabaseUrl" or "Missing SUPABASE_URL"

**Solutions:**
1. Verify `.env` file exists in project root (not in `dist/`)
2. Check `cwd` in config points to project root (where `.env` is)
3. Verify credentials in `.env` are correct
4. Test database connection: `npm test`

### Issue: "Database connection failed"

**Solutions:**
1. Verify Supabase project is active (not paused)
2. Check that `supabase/schema.sql` has been applied
3. Verify service_role key (not anon key)
4. Test connection manually: `npm test`

### Issue: MCP actions not appearing in Claude Code

**Solutions:**
1. Completely quit and restart Claude Code (not just reload)
2. Check config file syntax (valid JSON)
3. Verify MCP server is running in background
4. Try rebuilding: `npm run build`
5. Check Claude Code logs for errors

### Issue: "spawn node ENOENT" error

This means Claude Code can't find the node executable.

**Solutions:**
1. Use absolute path to node: `which node` (macOS/Linux)
2. If using nvm, use the full nvm path (e.g., `/Users/username/.nvm/versions/node/v20.10.0/bin/node`)
3. Avoid shell aliases or symbolic links

### Issue: "Cannot find module" errors

**Solutions:**
1. Ensure dependencies installed: `npm install`
2. Rebuild: `npm run build`
3. Check `dist/` directory contains all necessary files

## Development Workflow

### For Active Development

If you're actively developing the MCP server:

1. **Run automatic rebuild in watch mode:**
   ```bash
   npm run dev:mcp
   ```
   This runs `tsc --watch` and automatically rebuilds `dist/` on file changes.

2. **Restart Claude Code** after code changes to reload the MCP server

### Alternative: Manual Rebuild

1. **Make code changes**
2. **Rebuild:** `npm run build`
3. **Restart Claude Code** to pick up changes

## Using Neotoma from Multiple Claude Code Instances

If you use Claude Code from different machines or profiles:

1. **Build once** in the Neotoma project:
   ```bash
   cd /path/to/neotoma
   npm run build
   ```

2. **Configure each Claude Code instance** with the same MCP server path

3. **For auto-rebuild** (development):
   ```bash
   npm run dev:mcp
   ```
   Keep this running to watch for changes.

All instances will share the same Neotoma database via Supabase.

## Privacy and Security Notes

**Localhost Advantages:**
- All MCP communication happens locally via stdin/stdout
- No network requests for memory access
- User-controlled memory with encryption
- Data never leaves your computer except for Supabase sync

**Security Best Practices:**
- Never share your service_role key
- Use environment variables for credentials
- Keep `.env` out of version control
- Use row-level security in Supabase for multi-user scenarios

## Additional Resources

- **MCP Specification:** `docs/specs/MCP_SPEC.md`
- **Getting Started Guide:** `docs/developer/getting_started.md`
- **Cursor MCP Setup:** `docs/developer/mcp_cursor_setup.md`
- **ChatGPT Setup:** `docs/developer/mcp_chatgpt_setup.md`
- **Claude Code Documentation:** https://docs.anthropic.com/claude-code

## Quick Reference

```bash
# Build MCP server (one-time)
npm run build

# Auto-rebuild on code changes (for development)
npm run dev:mcp

# Get node path
which node  # macOS/Linux
where node  # Windows

# Verify build
ls -la dist/index.js

# Test database connection
npm test
```

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Note:** Claude Code runs the MCP server as a child process, communicating via stdin/stdout using the Model Context Protocol JSON-RPC format. This localhost architecture ensures privacy and user control.

