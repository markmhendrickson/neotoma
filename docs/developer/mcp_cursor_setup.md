# MCP Server Setup and Cursor Connection Guide

This guide explains how to run the Neotoma MCP server and connect it to Cursor for testing and development.

For other integrations, see:

- [`mcp_chatgpt_setup.md`](mcp_chatgpt_setup.md) - ChatGPT Custom GPT setup
- [`mcp_claude_code_setup.md`](mcp_claude_code_setup.md) - Claude Code localhost agent setup

## Prerequisites

1. **Node.js** v18.x or v20.x installed
2. **Supabase project** set up with schema applied (see `docs/developer/getting_started.md`)
3. **Environment variables** configured in `.env`

## Step 1: Build the MCP Server

The MCP server needs to be built before Cursor can use it:

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory. The `.cursor/mcp.json` configuration file references `dist/index.js`.
**Running MCP in development:**

- **HTTP with tunnel (remote access):**  
  `npm run dev:api` or `npm run dev:mcp` — starts the API/MCP server and an HTTPS tunnel (ngrok) so the server is reachable remotely. Use the printed tunnel URL for `MCP_PROXY_URL`, `API_BASE_URL`, and Cursor. Ctrl+C stops both.
- **HTTP server only (no tunnel):**  
  `npm run dev:server` — starts the API server only (no UI; serves `/mcp` and REST API) with hot reload (default port 8080).
- **Stdio (for `command` + `args` in mcp.json):**  
  `npm run dev:mcp:stdio` — runs the stdio MCP server with hot reload.
- **Compile only (watch):**  
  `npm run dev:mcp:watch` — runs `tsc --watch`; use if another process runs the server.

## Step 2: Configure Environment Variables

The MCP server automatically loads Supabase credentials from `.env`. Create this file in the project root:

```bash
# Supabase Configuration (preferred: use Project ID)
DEV_SUPABASE_PROJECT_ID=your-project-id
DEV_SUPABASE_SERVICE_KEY=your-service-role-key-here
# Alternative: Full URL (also supported)
# DEV_SUPABASE_URL=https://your-project-id.supabase.co
# DEV_SUPABASE_SERVICE_KEY=your-service-role-key-here
```

**Where to find Supabase credentials:**

- **Project ID**: Settings → General → Project ID (preferred)
- **Project URL**: Settings → API → Project URL (alternative - extract ID from URL)
- **Service Role Key**: Settings → API → service_role key (NOT anon key)
  **Security Note:** Never commit `.env` to git. It's already in `.gitignore`.
  The `.cursor/mcp.json` file doesn't need environment variables because the server loads them automatically from `.env` when it starts.

## Step 3: Set Up OAuth Connection

**IMPORTANT: Authentication is required.** MCP connections must authenticate using OAuth (recommended) or session tokens (deprecated).

### OAuth Setup (Recommended)

1. **Sign in** to the Neotoma web UI (http://localhost:5195)
2. **Navigate** to MCP Setup page or click "MCP Setup" button
3. **Go to** "OAuth Connection" tab
4. **Enter a connection ID** (or click "Generate"):
   - Example: `cursor-2025-01-21-abc123`
5. **Click** "Start OAuth Flow"
6. **Click** "Open Authorization Page" to open browser
7. **Approve** the connection in your browser
8. **Wait** for confirmation that connection is active
9. **Copy** your `connection_id` for use in MCP configuration

**Benefits:**

- Tokens automatically refresh (no manual updates)
- More secure than session tokens
- Connections persist until revoked
- Can manage multiple connections

### Session Token Setup (Deprecated)

**Will be removed in a future version. Use OAuth instead.**

1. Sign in to the Neotoma web UI (http://localhost:5195)
2. Click "MCP Setup" button
3. Go to "Session Token (Deprecated)" tab
4. Copy your session token

**Limitations:**

- Tokens expire when you sign out
- Requires manual updates
- No automatic refresh

## Step 4: Configure Cursor to Use the MCP Server

### Method 1: Use "Add to Cursor" Widget or Connect button (Easiest)

1. **Go to** the Neotoma web UI MCP Setup page (http://localhost:5195)
2. **Navigate to** "Cursor Setup" tab
3. **Click** the "Add to Cursor" button (or add the server URL in Cursor and use **Connect**)
4. **Cursor opens** and shows the neotoma MCP server
5. **Click "Connect"** in Cursor to start OAuth (server shows "Authentication needed" until then)
6. **Approve** the connection in your browser
7. **Done** - MCP server is now connected and authenticated

**Benefits:**

- One-click installation
- RFC 8414 discovery: Cursor uses `/.well-known/oauth-authorization-server` for OAuth endpoints and scopes
- Cursor's fixed redirect URI (`cursor://anysphere.cursor-mcp/oauth/callback`) is supported; no Supabase redirect change needed (we receive the callback and redirect to Cursor)
- No manual configuration needed when using Connect

**Using a tunnel or proxy (ngrok, cloudflared):**

When exposing the API via a tunnel, set `MCP_PROXY_URL` so the "Add to Cursor" button uses the proxy URL instead of localhost:

```bash
# .env
MCP_PROXY_URL="https://your-tunnel.ngrok-free.dev"
```

The `/api/server-info` endpoint returns `mcpUrl` from `MCP_PROXY_URL` when set; the Add to Cursor widget uses that. Cursor then connects to `https://your-tunnel.ngrok-free.dev/mcp` instead of `http://localhost:8080/mcp`, which avoids ECONNREFUSED when Cursor expects HTTPS. See [`mcp_oauth_redirect_uri_config.md`](mcp_oauth_redirect_uri_config.md) for OAuth redirect vs API base URL.

### Method 2: Manual Configuration via `.cursor/mcp.json`

Cursor should automatically detect the `mcp.json` file at `.cursor/mcp.json` in your project root. Create or update this file:

**HTTP Transport with connection ID (recommended when there is no Connect button):**

Cursor does not always show a "Connect" button for URL-based MCP servers. Use a pre-created OAuth connection and pass its ID in headers:

1. In the Neotoma web UI, go to **MCP Setup → OAuth Connection**, create a connection (or use an existing one), and copy the **connection ID**.
2. In `.cursor/mcp.json` set the `X-Connection-Id` header to that value:

```json
{
  "mcpServers": {
    "neotoma": {
      "url": "http://localhost:8080/mcp",
      "headers": {
        "X-Connection-Id": "your-connection-id-from-web-ui"
      }
    }
  }
}
```

**For production:**

```json
{
  "mcpServers": {
    "neotoma": {
      "url": "https://neotoma.fly.dev/mcp",
      "headers": {
        "X-Connection-Id": "your-connection-id-from-web-ui"
      }
    }
  }
}
```

**Configuration fields:**

- `url`: HTTP endpoint for MCP server (local or production).
- `headers`: Optional. Set `X-Connection-Id` to your OAuth connection ID from the Neotoma web UI so the server can authenticate without a Connect button.

**If Cursor shows a "Connect" button:** You can omit `headers` and complete OAuth through that flow instead. If you do not see Connect, use the `X-Connection-Id` header as above.

**Stdio (command) and working directory:** If you use stdio with `command` + `args` (e.g. `npm run watch:mcp:stdio`) and see `ENOENT: no such file or directory, open '.../package.json'`, Cursor may be spawning the process without applying `cwd` (for example when using a global MCP config). Use the repo wrapper scripts so the process runs from the repo root regardless of Cursor's cwd:

```json
"neotoma-dev": {
  "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh"
},
"neotoma-prod": {
  "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
}
```

Replace `/absolute/path/to/neotoma` with your repo path (e.g. `/Users/you/repos/neotoma`). No `cwd` or `args` needed. **neotoma-prod** runs the built server (`dist/index.js`); run `npm run build` after code changes so prod uses the latest code.

**Stdio shows "No tools, prompts, or resources":** When **encryption is off** (default), the server uses the local dev user automatically for stdio; no connection ID or login is required. If you still see 0 tools, ensure `NEOTOMA_ENCRYPTION_ENABLED` is not set (or is false) and restart the MCP server. When **encryption is on**, the server needs a connection ID: in `.env` set `NEOTOMA_CONNECTION_ID=your-connection-id` from the Neotoma web UI (MCP Setup → OAuth Connection), or use the key-derived token (see auth docs).

## Step 5: Verify the Connection

1. **Restart Cursor** after configuring the MCP server
2. **Open a chat** in Cursor
3. **Test the connection** by asking Cursor to use Neotoma actions:
   ```
   Can you upload a file to Neotoma using the upload_file action?
   ```
   Or:
   ```
   List all available Neotoma MCP actions
   ```
4. **Check Cursor's MCP status:**
   - Look for MCP server status indicators in Cursor's UI
   - Check for any error messages about MCP connection failures

## Step 5: Test MCP Actions

Once connected, you can test the available MCP actions:

### Available Actions (v0.1.0)

1. **`store_record`** - Create a new record
2. **`retrieve_records`** - Query records with filters
3. **`update_record`** - Update an existing record
4. **`delete_record`** - Delete a record
5. **`upload_file`** - Upload and extract data from a file
6. **`get_file_url`** - Get a signed URL for a file

### Example Test Commands

**Store a record:**

```
Use the store_record action to create a test invoice record with type "invoice" and properties: invoice_number: "INV-001", amount: 1000, vendor: "Acme Corp"
```

**Retrieve records:**

```
Use retrieve_records to find all records of type "invoice"
```

**Upload a file:**

```
Use upload_file to upload the file at /path/to/invoice.pdf
```

## Troubleshooting

### Issue: "Authentication needed" or "No tools, prompts, or resources"

The Neotoma server requires OAuth before it exposes tools. When unauthenticated, the server reports **"Authentication needed"** (with a Connect action) so clients can show that message and a **Connect** button. If Cursor instead shows "No tools, prompts, or resources", click **Connect** if present, or for URL-based setups use the `X-Connection-Id` header (see below).

**If you see a Connect button:** Click it and complete the OAuth flow in the browser.

**If you do not see a Connect button (URL-based server):** Pass your OAuth connection ID in `mcp.json`:

1. In Neotoma web UI go to **MCP Setup → OAuth Connection**, create or copy a connection ID.
2. In `.cursor/mcp.json` add it under headers:
   ```json
   "neotoma": {
     "url": "http://localhost:8080/mcp",
     "headers": { "X-Connection-Id": "your-connection-id" }
   }
   ```
3. Restart Cursor. Tools and resources should appear once the connection ID is valid and active.

### Issue: "Not authenticated" or "Authentication required"

This error means the MCP server didn't receive valid authentication during initialization.

**Solutions (OAuth - Recommended):**

1. **Verify connection is active:**
   - Sign in to Neotoma web UI (http://localhost:5195)
   - Go to MCP Setup → OAuth Connection tab
   - Check that your connection ID shows "active" status
   - If not active, create a new connection (see Step 3 above)
2. **Check environment variable in `.cursor/mcp.json`:**

   ```bash
   cat .cursor/mcp.json | grep NEOTOMA_CONNECTION_ID
   ```

   Should show: `"NEOTOMA_CONNECTION_ID": "your-connection-id"`

3. **Verify connection ID matches:**
   - Connection ID in `.cursor/mcp.json` must match the active connection in web UI
   - Connection IDs are case-sensitive

4. **Create new connection if needed:**
   - If connection was revoked or expired, create a new one via web UI
   - Update `.cursor/mcp.json` with the new connection ID

5. **Restart Cursor** completely after updating configuration

**If using Session Token (Deprecated - Not Recommended):**

1. **Switch to OAuth** (recommended) - more reliable and secure
2. Or **get a fresh session token:**
   - Sign in to the Neotoma web UI
   - Click "MCP Setup" → "Session Token (Deprecated)" tab
   - Copy your session token
   - Update `NEOTOMA_SESSION_TOKEN` in `.cursor/mcp.json`
   - Restart Cursor

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

3. **Update `.cursor/mcp.json`** with the correct connection ID:

   ```json
   {
     "mcpServers": {
       "neotoma": {
         "env": {
           "NEOTOMA_CONNECTION_ID": "cursor-2025-01-21-abc123"
         }
       }
     }
   }
   ```

4. **Restart Cursor** completely (quit and reopen, not just reload)

### Issue: "Invalid session token" or "Token validation failed" (Deprecated)

The session token is invalid or expired. **OAuth is recommended** to avoid this issue.

**Solutions:**

1. **Switch to OAuth** (strongly recommended):
   - Follow Step 3 above to create an OAuth connection
   - Update `.cursor/mcp.json` to use `NEOTOMA_CONNECTION_ID` instead of `NEOTOMA_SESSION_TOKEN`
   - OAuth tokens automatically refresh and don't expire
   - Restart Cursor

2. **If you must use session token** (deprecated):
   - Sign out and sign back in to Neotoma web UI
   - Go to MCP Setup → "Session Token (Deprecated)" tab
   - Copy new token from MCP Setup dialog
   - Update `NEOTOMA_SESSION_TOKEN` in `.cursor/mcp.json`
   - Restart Cursor
   - **Note:** Session tokens expire when you sign out or after inactivity

### Issue: "MCP server not found" or "Command failed"

**Solutions:**

1. Ensure `npm run build` completed successfully
2. Verify `dist/index.js` exists
3. Check that Node.js is in your PATH: `which node`
4. Try using absolute path in `.cursor/mcp.json`:
   ```json
   "args": ["/absolute/path/to/neotoma/dist/index.js"]
   ```

### Issue: "Invalid supabaseUrl" or "Missing SUPABASE_URL"

This error means the environment variables aren't being passed to the MCP server process. Cursor's `${VAR}` syntax may not work for environment variable substitution.
**Solutions:**

1. **Set environment variables in your shell and restart Cursor** (recommended):
   ```bash
   export SUPABASE_URL="https://your-project-id.supabase.co"
   export SUPABASE_SERVICE_KEY="your-service-role-key-here"
   ```
   Then completely quit and restart Cursor (not just reload) so it inherits the environment.
2. **Hardcode values in `.cursor/mcp.json`** (for testing only):
   ```json
   {
     "mcpServers": {
       "neotoma": {
         "command": "/full/path/to/node",
         "args": ["dist/index.js"],
         "cwd": "/full/path/to/project",
         "env": {
           "SUPABASE_URL": "https://your-project-id.supabase.co",
           "SUPABASE_SERVICE_KEY": "your-service-role-key-here"
         }
       }
     }
   }
   ```
   **Security Note:** This exposes credentials in the config file. Only use for local development.
3. **Use a wrapper script** that loads from `.env`:
   Create a script that loads env vars and then runs the server.

### Issue: "Database connection failed"

**Solutions:**

1. Verify Supabase project is active (not paused)
2. Check that `supabase/schema.sql` has been applied
3. Verify credentials are correct (service_role key, not anon key)
4. Test database connection manually:
   ```bash
   npm test
   ```

### Issue: MCP actions not appearing in Cursor

**Solutions:**

1. Restart Cursor completely
2. Check Cursor's MCP server logs/status
3. Verify the MCP server is running (check process: `ps aux | grep "node.*dist/index.js"`)
4. Try rebuilding: `npm run build`

### Issue: "spawn node ENOENT" error

This means Cursor can't find the `node` executable. This often happens when Node.js is installed via nvm or other version managers.
**Solutions:**

1. **Use absolute path to node** (recommended): Update `.cursor/mcp.json` to use the full path:
   ```bash
   which node  # Get your node path
   ```
   Then update `mcp.json`:
   ```json
   {
     "mcpServers": {
       "neotoma": {
         "command": "/full/path/to/node",
         "args": ["dist/index.js"],
         "cwd": "/full/path/to/project"
       }
     }
   }
   ```
2. **Or ensure node is in system PATH:** Add nvm initialization to your shell profile so Cursor inherits it

### Issue: "Cannot find module" errors

**Solutions:**

1. Ensure dependencies are installed: `npm install`
2. Rebuild: `npm run build`
3. Check that `dist/` directory contains all necessary files

## Development Workflow

### For Active Development

If you're actively developing the MCP server:

1. **Run automatic rebuild in watch mode** (recommended for Cursor integration):
   ```bash
   npm run dev:mcp
   ```
   This runs `tsc --watch` which automatically rebuilds `dist/` whenever you save TypeScript files. Keep this running in a terminal while developing.
2. **Restart Cursor** after code changes to pick up the rebuilt version
   **Note:** Cursor needs to restart to reload the MCP server, but the build happens automatically in the background.

### Alternative: Manual Rebuild

If you prefer manual control:

1. **Run in development mode** (stdio, for testing):
   ```bash
   npm run dev
   ```
2. **Rebuild after changes** before testing in Cursor:
   ```bash
   npm run build
   ```
3. **Restart Cursor** after rebuilding to pick up changes

### For Testing Manual Test Cases

When running manual test cases from `docs/releases/in_progress/v0.1.0/release_report.md`:

1. Ensure MCP server is built and configured
2. Connect Cursor to the MCP server (follow steps above)
3. Execute test cases one by one via Cursor chat
4. Document results (Pass/Fail) for each test case

## Using Neotoma MCP in Another Workspace

To use the Neotoma MCP server from a different workspace/repository:

1. **For auto-rebuild on code changes** (recommended for active development):
   ```bash
   cd /path/to/neotoma
   npm run dev:mcp
   ```
   Keep this running in a terminal - it watches for TypeScript changes and automatically rebuilds `dist/`.
2. **Or build once** (if not actively developing):
   ```bash
   cd /path/to/neotoma
   npm run build
   ```
3. **Create `.cursor/mcp.json` in your other workspace:**

   **For development environment:**

   ```json
   {
     "mcpServers": {
       "neotoma": {
         "command": "/path/to/node",
         "args": ["/absolute/path/to/neotoma/dist/index.js"],
         "cwd": "/absolute/path/to/neotoma",
         "env": {
           "NEOTOMA_ENV": "development"
         }
       }
     }
   }
   ```

   **For production environment:**

   ```json
   {
     "mcpServers": {
       "neotoma": {
         "command": "/path/to/node",
         "args": ["/absolute/path/to/neotoma/dist/index.js"],
         "cwd": "/absolute/path/to/neotoma",
         "env": {
           "NEOTOMA_ENV": "production",
           "PROD_SUPABASE_PROJECT_ID": "your-prod-project-id",
           "PROD_SUPABASE_SERVICE_KEY": "your-prod-service-role-key-here"
         }
       }
     }
   }
   ```

   **Important:**
   - Use `NEOTOMA_ENV` (not `NODE_ENV`) to avoid conflicts with the host workspace
   - Use absolute paths for both `command` (node executable) and `args` (dist/index.js)
   - Set `cwd` to the Neotoma project root (required for `.env` loading)
   - The server will load credentials from Neotoma's `.env` file automatically if not specified in the config
   - **For auto-rebuild:** Run `npm run dev:mcp` in the Neotoma repo to watch for changes
   - **After code changes:** Restart Cursor to reload the MCP server with the new build

   **Note:** `NEOTOMA_ENV` takes precedence over `NODE_ENV`. This prevents conflicts when the host workspace has its own `NODE_ENV` setting.

4. **Restart Cursor** to detect the new MCP server configuration.

## Additional Resources

- **MCP Specification:** `docs/specs/MCP_SPEC.md`
- **Getting Started Guide:** `docs/developer/getting_started.md`
- **ChatGPT Custom GPT Setup:** `docs/developer/mcp_chatgpt_setup.md`
- **Release Report:** `docs/releases/in_progress/v0.1.0/release_report.md` (Section 9 for manual test cases)

## Quick Reference

```bash
# Build MCP server (one-time)
npm run build
# Auto-rebuild on code changes (for Cursor integration)
npm run dev:mcp
# Run in development mode (stdio, for testing)
npm run dev
# Set environment variables (macOS/Linux)
export SUPABASE_URL="https://your-project-id.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key-here"
# Verify build
ls -la dist/index.js
# Test database connection
npm test
```

**Note:** The MCP server runs in stdio mode when used with Cursor. The server communicates via stdin/stdout using the Model Context Protocol JSON-RPC format. Cursor handles the protocol communication automatically.
