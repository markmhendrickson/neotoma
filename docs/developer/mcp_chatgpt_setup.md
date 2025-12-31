# ChatGPT Custom GPT Setup Guide

This guide explains how to configure Neotoma as a Custom GPT Action in ChatGPT using the HTTP Actions API (OpenAPI schema).

For other integrations, see:
- [`mcp_cursor_setup.md`](mcp_cursor_setup.md) - Cursor integration
- [`mcp_claude_code_setup.md`](mcp_claude_code_setup.md) - Claude Code localhost agent setup
## Prerequisites
1. **ChatGPT Plus/Pro/Team/Enterprise account** (required for Custom GPT creation)
2. **Deployed Neotoma HTTP server** (local development or production)
3. **OpenAPI schema** (`openapi.yaml`) available via URL or file
## Step 1: Start the HTTP Actions Server
The Neotoma HTTP server exposes REST endpoints that ChatGPT can call as Actions.
### Option A: Local Development (using ngrok or similar tunnel)
1. **Build the project:**
   ```bash
   npm run build
   ```
2. **Start the HTTP server:**
   ```bash
   npm run dev:http
   ```
   Should see: `HTTP Actions listening on :8080`
3. **Create a tunnel** to expose localhost (required for ChatGPT to access):
   **Using ngrok:**
   ```bash
   ngrok http 8080
   ```
   Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
### Option B: Production Deployment
Deploy the HTTP server to a cloud provider (see `docs/infrastructure/deployment.md`). Ensure:
- Server is accessible via HTTPS
- Environment variables are configured (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, etc.)
- Server is running on the configured port
## Step 2: Configure Authentication
Neotoma uses bearer token authentication. You have two options:
### Option A: Simple Bearer Token (Development)
1. **Set a bearer token** in your environment:
   ```bash
   export ACTIONS_BEARER_TOKEN=your-secret-token-here
   ```
2. **Use this token** as the API key in Custom GPT configuration
### Option B: Ed25519 Public Key (Production)
Neotoma supports encrypted responses using Ed25519 key pairs:
1. **Generate keys** (if not already present, server generates on startup)
2. **Get the public key** from server logs or `/keys/public` endpoint
3. **Base64url-encode the public key** for use as bearer token
## Step 3: Create Custom GPT
1. **Go to ChatGPT** and click "Explore GPTs" → "Create"
2. **Configure Basic Settings:**
   - **Name:** "Neotoma Memory Assistant" (or your preference)
   - **Description:** "Interact with your personal Neotoma memory graph"
   - **Instructions:** Add guidance like:
     ```
     You are a Neotoma memory assistant. Help users store, retrieve, and query their personal data using Neotoma actions.
     - Use store_record to save structured data from conversations
     - Use retrieve_records to search and filter records
     - Use retrieve_entities to find entities (companies, people, etc.)
     - Use get_graph_neighborhood to explore relationships
     ```
3. **Add Actions:**
   - Click "Create new action"
   - Click "Import from URL" or "Upload file"
   - **Option 1:** Import from URL (Recommended):
     - URL: `https://your-server-url/openapi.yaml`
     - The server serves the OpenAPI schema at `/openapi.yaml` endpoint
     - Example: If using ngrok with URL `https://abc123.ngrok.io`, use `https://abc123.ngrok.io/openapi.yaml`
     - Must be publicly accessible via HTTPS
   - **Option 2:** Upload file:
     - Upload `openapi.yaml` from the project root (`/path/to/neotoma/openapi.yaml`)
4. **Configure Authentication:**
   - **Type:** API Key
   - **Name:** `Authorization`
   - **Location:** Header
   - **Prefix:** `Bearer `
   - **Value:** Your bearer token (from Step 2)
5. **Save the Custom GPT**
## Step 4: Test the Integration
1. **Open your Custom GPT** in ChatGPT
2. **Test storing a record:**
   ```
   Store a note about our meeting today: "Reviewed Q4 budget with team"
   ```
3. **Test retrieving records:**
   ```
   Show me all notes from the past week
   ```
4. **Test entity queries:**
   ```
   Find all companies mentioned in my records
   ```
## Available Actions for Custom GPT
The OpenAPI schema includes these actions:
- **Record Operations:** `store_record`, `retrieve_records`, `update_record`, `delete_record`
- **File Operations:** `upload_file`, `get_file_url`
- **Entity Operations:** `retrieve_entities`, `get_entity_by_identifier`, `get_entity_snapshot`, `list_observations`
- **Relationship Operations:** `create_relationship`, `list_relationships`, `get_related_entities`
- **Timeline Operations:** `list_timeline_events`
- **Graph Operations:** `get_graph_neighborhood`
## Troubleshooting
### Issue: "Failed to import schema" or "Invalid OpenAPI schema"
**Solutions:**
- Ensure `openapi.yaml` is valid OpenAPI 3.1.0
- Check that the schema URL is publicly accessible
- Verify HTTPS is enabled (ChatGPT requires HTTPS)
- Try uploading the file directly instead of using URL import
### Issue: "Authentication failed" or "401 Unauthorized"
**Solutions:**
- Verify bearer token matches server configuration
- Check that `ACTIONS_BEARER_TOKEN` is set on the server (or use Ed25519 keys)
- Ensure token is prefixed with "Bearer " in Custom GPT settings
- Verify server is running and accessible
### Issue: "Connection refused" or "Cannot reach server"
**Solutions:**
- Verify server is running: `curl http://localhost:8080/health`
- Check firewall rules allow incoming connections
- For local development, ensure tunnel (ngrok) is running
- Verify HTTPS endpoint is accessible from the internet
### Issue: Actions appear but don't work
**Solutions:**
- Check server logs for errors
- Verify Supabase credentials are configured
- Test endpoints directly: `curl -H "Authorization: Bearer YOUR_TOKEN" https://your-server/store_record`
- Review OpenAPI schema matches server implementation
## Differences: Cursor vs ChatGPT
| Feature        | Cursor (MCP)                 | ChatGPT (HTTP Actions) |
| -------------- | ---------------------------- | ---------------------- |
| Protocol       | stdio (JSON-RPC)             | HTTP REST (OpenAPI)    |
| Transport      | stdin/stdout                 | HTTPS                  |
| Server mode    | `npm run dev` or `npm start` | `npm run dev:http`     |
| Schema         | MCP tool definitions         | OpenAPI 3.1.0          |
| Authentication | N/A (local process)          | Bearer token required  |
| Deployment     | Local only                   | Local or production    |
For other MCP integrations, see:
- [`mcp_cursor_setup.md`](mcp_cursor_setup.md) - Cursor integration
- [`mcp_claude_code_setup.md`](mcp_claude_code_setup.md) - Claude Code localhost agent setup
## Quick Reference
```bash
# Build server
npm run build
# Start HTTP server
npm run dev:http
# Set environment variables
export SUPABASE_URL="https://your-project-id.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key-here"
export ACTIONS_BEARER_TOKEN=your-token-here
# Create tunnel (local development)
ngrok http 8080
# Test health endpoint
curl http://localhost:8080/health
# Test with authentication
curl -H "Authorization: Bearer your-token" http://localhost:8080/health
# Access OpenAPI schema (for Custom GPT import)
curl http://localhost:8080/openapi.yaml
```
## Additional Resources
- **MCP Specification:** `docs/specs/MCP_SPEC.md`
- **OpenAPI Schema:** `openapi.yaml` in project root
- **HTTP Actions Server:** `src/actions.ts`
- **Getting Started Guide:** `docs/developer/getting_started.md`
- **Cursor MCP Setup:** `docs/developer/mcp_cursor_setup.md`
