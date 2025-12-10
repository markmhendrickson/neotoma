# MCP Server Setup and Cursor Connection Guide

This guide explains how to run the Neotoma MCP server and connect it to Cursor for testing and development.

---

## Prerequisites

1. **Node.js** v18.x or v20.x installed
2. **Supabase project** set up with schema applied (see `docs/developer/getting_started.md`)
3. **Environment variables** configured in `.env.development`

---

## Step 1: Build the MCP Server

The MCP server needs to be built before Cursor can use it:

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory. The `.mcp.json` configuration file references `dist/index.js`.

**Note:** If you're actively developing, you can use `npm run dev` for development mode (stdio), but Cursor needs the built version.

---

## Step 2: Configure Environment Variables

Cursor will need access to Supabase credentials. The `.mcp.json` file references these environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

You have two options:

### Option A: Use Generic Environment Variables (Recommended for Cursor)

Set these in your shell environment or Cursor's environment:

```bash
export SUPABASE_URL="https://your-project-id.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key-here"
```

**For macOS/Linux:** Add these to your `~/.zshrc` or `~/.bashrc`:

```bash
# Add to ~/.zshrc or ~/.bashrc
export SUPABASE_URL="https://your-project-id.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key-here"
```

Then reload your shell:
```bash
source ~/.zshrc  # or source ~/.bashrc
```

**For Cursor:** Cursor should inherit environment variables from your shell. If it doesn't, you may need to restart Cursor after setting the variables.

### Option B: Update `.mcp.json` to Use DEV_* Variables

If you prefer to use `DEV_SUPABASE_URL` and `DEV_SUPABASE_SERVICE_KEY` from `.env.development`, you can update `.mcp.json`:

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "SUPABASE_URL": "${DEV_SUPABASE_URL}",
        "SUPABASE_SERVICE_KEY": "${DEV_SUPABASE_SERVICE_KEY}"
      }
    }
  }
}
```

**Note:** Cursor may not automatically load `.env.development`, so Option A is more reliable.

---

## Step 3: Configure Cursor to Use the MCP Server

### Method 1: Use `.mcp.json` in Project Root (Recommended)

Cursor should automatically detect the `.mcp.json` file in your project root. The file is already configured:

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "SUPABASE_URL": "${SUPABASE_URL}",
        "SUPABASE_SERVICE_KEY": "${SUPABASE_SERVICE_KEY}"
      }
    }
  }
}
```

### Method 2: Configure via Cursor Settings

If automatic detection doesn't work:

1. Open Cursor Settings (Cmd+, on macOS, Ctrl+, on Windows/Linux)
2. Search for "MCP" or "Model Context Protocol"
3. Add a new MCP server configuration:
   - **Name:** `neotoma`
   - **Command:** `node`
   - **Args:** `["dist/index.js"]` (use absolute path if needed)
   - **Working Directory:** `/Users/markmhendrickson/Projects/neotoma/neotoma` (your project root)
   - **Environment Variables:**
     - `SUPABASE_URL`: `https://your-project-id.supabase.co`
     - `SUPABASE_SERVICE_KEY`: `your-service-role-key-here`

---

## Step 4: Verify the Connection

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

---

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

---

## Troubleshooting

### Issue: "MCP server not found" or "Command failed"

**Solutions:**
1. Ensure `npm run build` completed successfully
2. Verify `dist/index.js` exists
3. Check that Node.js is in your PATH: `which node`
4. Try using absolute path in `.mcp.json`:
   ```json
   "args": ["/absolute/path/to/neotoma/dist/index.js"]
   ```

### Issue: "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"

**Solutions:**
1. Verify environment variables are set: `echo $SUPABASE_URL`
2. Restart Cursor after setting environment variables
3. Check that `.env.development` has the correct values (if using Option B)
4. Ensure Cursor has access to your shell environment variables

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

### Issue: "Cannot find module" errors

**Solutions:**
1. Ensure dependencies are installed: `npm install`
2. Rebuild: `npm run build`
3. Check that `dist/` directory contains all necessary files

---

## Development Workflow

### For Active Development

If you're actively developing the MCP server:

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

---

## Additional Resources

- **MCP Specification:** `docs/specs/MCP_SPEC.md`
- **Getting Started Guide:** `docs/developer/getting_started.md`
- **Release Report:** `docs/releases/in_progress/v0.1.0/release_report.md` (Section 9 for manual test cases)

---

## Quick Reference

```bash
# Build MCP server
npm run build

# Run in development mode (stdio)
npm run dev

# Set environment variables (macOS/Linux)
export SUPABASE_URL="https://your-project-id.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key-here"

# Verify build
ls -la dist/index.js

# Test database connection
npm test
```

---

**Note:** The MCP server runs in stdio mode when used with Cursor. The server communicates via stdin/stdout using the Model Context Protocol JSON-RPC format. Cursor handles the protocol communication automatically.

