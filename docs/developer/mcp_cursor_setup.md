# MCP Server Setup and Cursor Connection Guide

This guide explains how to run the Neotoma MCP server and connect it to Cursor for testing and development.

For other integrations, see:

- [`mcp_chatgpt_setup.md`](mcp_chatgpt_setup.md) - ChatGPT Custom GPT setup
- [`mcp_claude_code_setup.md`](mcp_claude_code_setup.md) - Claude Code localhost agent setup

## Choose Your Transport: Stdio (Local) vs HTTP (Remote)

Neotoma supports two MCP transports. Choose based on where Cursor runs relative to the Neotoma server:

| Criterion | Stdio | HTTP (URL-based) |
|-----------|-------|------------------|
| **Use case** | Cursor on same machine as Neotoma repo | Remote clients (ChatGPT, Claude Code on another machine), tunnel, deployed server |
| **Who spawns the server** | Cursor spawns the process | You run the HTTP server (e.g. `npm run watch:prod`) |
| **After sleep** | Toggle off/on; Cursor re-spawns automatically | Restart HTTP server in terminal, then toggle MCP |
| **OAuth** | Not needed (encryption off) or connection ID in `.env` | OAuth via Connect button or `X-Connection-Id` header |
| **Dev and prod in parallel** | Yes: `neotoma-dev` and `neotoma-prod` in config | Yes: dev on 8080, prod on 8180 |

**Recommendation:** Use **stdio** for local Cursor usage. Use **HTTP** for remote access (tunnel, ChatGPT, deployed `neotoma.fly.dev`).

## Prerequisites

1. **Node.js** v18.x or v20.x installed
2. **Supabase project** set up with schema applied (see `docs/developer/getting_started.md`)
3. **Environment variables** configured in `.env`

## Step 1: Build the MCP Server

The MCP server needs to be built before Cursor can use it:

```bash
npm run build:server
```

This compiles TypeScript to JavaScript in the `dist/` directory. The `.cursor/mcp.json` configuration file references `dist/index.js`.
**Running MCP in development:**

- **HTTP with tunnel (remote access):**  
  `npm run dev:api` — starts the API/MCP server and an HTTPS tunnel so the server is reachable remotely. Set `API_BASE_URL` to the printed tunnel URL (or rely on the script to set it); use that URL in Cursor. Ctrl+C stops both.
- **Production mode with tunnel (local backend, remote access):**  
  `npm run watch:prod:tunnel` — same as above but with `NEOTOMA_ENV=production` and port 8180. Use for local storage with production behavior and remote access.
- **HTTP server only (no tunnel):**  
  `npm run dev:server` — starts the API server only (no UI; serves `/mcp` and REST API) with hot reload (default port 8080).
- **Stdio (for `command` + `args` in mcp.json):**  
  `npm run dev:api:stdio` — runs the stdio MCP server with hot reload.
- **Compile only (watch):**  
  `npm run dev:api:watch` — runs `tsc --watch`; use if another process runs the server.

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

### Option A: Stdio (Recommended for Local)

Use stdio when Cursor runs on the same machine as the Neotoma repo. Cursor spawns the server; no separate HTTP process. Run `npm run build:server` first, then add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh"
    },
    "neotoma-prod": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
    }
  }
}
```

Replace `/absolute/path/to/neotoma` with your repo path (e.g. `/Users/you/repos/neotoma`). No `cwd` or `args` needed. Run `npm run build:server` after code changes so prod uses the latest code.

When both dev (8080) and prod (8180) APIs are running, each MCP process picks the correct server by `NEOTOMA_ENV` (prod script sets production), so you do not need `NEOTOMA_SESSION_DEV_PORT` or `NEOTOMA_SESSION_PROD_PORT` in `mcp.json`.

**Auth:** When encryption is off (default), stdio uses the local dev user automatically. When encryption is on, set `NEOTOMA_CONNECTION_ID` in `.env` from MCP Setup → OAuth Connection.

**Stdio shows "No tools, prompts, or resources":** Ensure `NEOTOMA_ENCRYPTION_ENABLED` is not set (or is false). If encryption is on, set `NEOTOMA_CONNECTION_ID` in `.env`.

**ENOENT / cwd:** If you see `ENOENT: no such file or directory, open '.../package.json'`, Cursor may not apply `cwd`. Use the wrapper scripts above; they `cd` to the repo root before running.

### Option B: HTTP (Remote, Tunnel, Deployed)

Use HTTP for remote access, ChatGPT, or when connecting to a deployed server.

#### B1: Add to Cursor (Easiest for Tunnel)

1. **Go to** the Neotoma web UI MCP Setup page (http://localhost:5195)
2. **Navigate to** "Cursor Setup" tab
3. **Click** the "Add to Cursor" button (or add the server URL in Cursor and use **Connect**)
4. **Cursor opens** and shows the neotoma MCP server
5. **Click "Connect"** in Cursor to start OAuth
6. **Approve** the connection in your browser

**Using a tunnel:** Set `HOST_URL` (or `API_BASE_URL`) to your tunnel URL in `.env`. Full tunnel docs: [tunnels.md](tunnels.md).

#### B2: Manual URL Config in `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "neotoma-dev": {
      "url": "http://localhost:8080/mcp",
      "headers": { "X-Connection-Id": "your-connection-id-from-web-ui" }
    },
    "neotoma-prod": {
      "url": "http://localhost:8180/mcp",
      "headers": { "X-Connection-Id": "your-connection-id-from-web-ui" }
    }
  }
}
```

**Production (deployed):** Use `"url": "https://neotoma.fly.dev/mcp"` with the same `X-Connection-Id` header.

Create the connection in Neotoma web UI (MCP Setup → OAuth Connection) and copy the connection ID. If Cursor shows a Connect button, you can omit `headers` and complete OAuth there.

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

1. Ensure `npm run build:server` completed successfully
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
4. Try rebuilding: `npm run build:server`

### Issue: MCP server shows "Error" after sleep or long idle

Cursor does not retry failed connections. When the machine sleeps, the connection breaks and Cursor marks the server as Error. Behavior differs by transport:

**URL-based (HTTP/SSE):** Cursor connects to `http://localhost:8180/mcp` (or similar). When the machine sleeps, the HTTP server process is suspended or killed. On wake, Cursor gets `ECONNREFUSED` and stops trying.

**Stdio:** Cursor spawns the server process. When the machine sleeps, the stdin/stdout pipe breaks. Cursor marks the server as Error but can reconnect by spawning a new process.

**Recommended: Use stdio for local development** so Cursor owns the process lifecycle. Toggling off/on after wake spawns a fresh process and reconnects.

**What to do after sleep:**

1. In Cursor, open MCP settings (the MCP panel where servers are listed).
2. Turn the affected server **off** (toggle), then turn it **on** again.

**If using stdio:** Cursor spawns a new process. Reconnects immediately.

**If using URL-based:** You must also restart the HTTP server in a terminal (e.g. `npm run watch:prod`) before toggling. Otherwise Cursor will fail again with `ECONNREFUSED`.

**Alternative:** Reload the window: Command Palette → "Developer: Reload Window".

**To switch from URL-based to stdio:** Remove the URL-based server from Cursor MCP settings and add the stdio config (Option A above) to `.cursor/mcp.json`.

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
2. Rebuild: `npm run build:server`
3. Check that `dist/` directory contains all necessary files

## Development Workflow

### For Active Development

If you're actively developing the MCP server:

1. **Run automatic rebuild in watch mode** (recommended for Cursor integration):
   ```bash
   npm run dev:api
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
   npm run build:server
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
   npm run dev:api
   ```
   Keep this running in a terminal - it watches for TypeScript changes and automatically rebuilds `dist/`.
2. **Or build once** (if not actively developing):
   ```bash
   cd /path/to/neotoma
   npm run build:server
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
   - **For auto-rebuild:** Run `npm run dev:api` in the Neotoma repo to watch for changes
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
npm run build:server
# Auto-rebuild on code changes (for Cursor integration)
npm run dev:api
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
