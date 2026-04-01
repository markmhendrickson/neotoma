# Cursor MCP Setup Guide

This guide covers connecting the Neotoma MCP server to Cursor IDE.

For other integrations, see:
- [mcp_chatgpt_setup.md](mcp_chatgpt_setup.md) — ChatGPT Custom GPT setup
- [mcp_claude_code_setup.md](mcp_claude_code_setup.md) — Claude Code integration

## Choose Your Transport: Stdio (Local) vs HTTP (Remote)

| Criterion | Stdio | HTTP |
|-----------|-------|------|
| **Use case** | Cursor on same machine as Neotoma repo | Remote access, tunnel, deployed server |
| **Auth** | Encryption off: none needed. Encryption on: key-derived token. | OAuth (Connect button) or `Authorization: Bearer <NEOTOMA_BEARER_TOKEN>` |
| **After sleep** | Toggle off/on in MCP settings; Cursor re-spawns the server | Restart HTTP server, then toggle |
| **Config file** | `.cursor/mcp.json` in project | `.cursor/mcp.json` in project |

**Recommendation:** Use stdio for local Cursor. Use HTTP only when Cursor is on a different machine or you need tunnel access. See [agent_cli_configuration.md](agent_cli_configuration.md) for the unified config approach.

---

## Option A: Stdio (Local — Recommended)

### Prerequisites

1. Node.js v18+ installed
2. Neotoma repo cloned and built: `npm run build:server`
3. Environment configured (`.env` in project root)

### Configuration

Create or edit `.cursor/mcp.json` in the Neotoma project directory:

**Using wrapper scripts (recommended):**

```json
{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh"
    },
    "neotoma": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
    }
  }
}
```

Replace `/absolute/path/to/neotoma` with your actual repo path. No `cwd` or `args` needed; the scripts handle everything.

**Alternative (command + args):**

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/neotoma",
      "env": {
        "NEOTOMA_CONNECTION_ID": "cursor-local"
      }
    }
  }
}
```

### Restart Cursor

After editing `.cursor/mcp.json`, quit Cursor completely (Cmd+Q) and reopen it.

---

## Option B: HTTP (Remote via Tunnel)

Use when Cursor runs on a different machine or you want OAuth/Connect-button flow.

### Prerequisites

1. Neotoma server running with tunnel: `npm run dev:api` (starts API + tunnel)
2. Tunnel URL available: `cat /tmp/ngrok-mcp-url.txt`
3. Authentication configured (see below)

### Authentication Methods

**OAuth (Connect button — recommended for remote):**

1. Set the tunnel URL in `.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "neotoma": {
         "url": "https://your-tunnel-url/mcp"
       }
     }
   }
   ```
2. Restart Cursor. The MCP status will show "Authentication needed" with a **Connect** button.
3. Click **Connect**. Complete key-auth in the browser (provide private key hex or mnemonic).
4. Approve the connection.
5. Cursor stores the connection and refreshes tokens automatically.

**Bearer token (simpler, for scripts or single-user):**

1. Set `NEOTOMA_BEARER_TOKEN=your-secret-token` in `.env` on the server.
2. Configure Cursor:
   ```json
   {
     "mcpServers": {
       "neotoma": {
         "url": "https://your-tunnel-url/mcp",
         "headers": {
           "Authorization": "Bearer your-secret-token"
         }
       }
     }
   }
   ```
3. Restart Cursor.

**Key-derived MCP token (encryption enabled):**

1. Run `neotoma auth mcp-token` to get the token.
2. Configure Cursor with the token in `Authorization: Bearer <token>` header.

### Tunnel Setup

See [tunnels.md](tunnels.md) for full tunnel documentation. Quick start:

```bash
npm run dev:api          # starts server + tunnel
cat /tmp/ngrok-mcp-url.txt  # get tunnel URL
```

---

## Troubleshooting

### "Authentication needed" but no Connect button

- Ensure the URL uses HTTPS (not HTTP).
- Verify discovery endpoint works: `curl https://your-tunnel-url/.well-known/oauth-authorization-server`
- Restart Cursor after config changes (Cmd+Q, not just reload).

### "Connection refused" to tunnel URL

- Check tunnel is running: `cat /tmp/ngrok-mcp-url.txt`
- Free-tier tunnel URLs change on restart — update config with the new URL.
- See [tunnels.md](tunnels.md#troubleshooting) for full troubleshooting.

### OAuth redirect fails

- Ensure `NEOTOMA_HOST_URL` matches the tunnel URL, or rely on auto-discovery.
- See [mcp_oauth_troubleshooting.md](mcp_oauth_troubleshooting.md) for OAuth-specific issues.

### MCP tools not appearing

- Verify authentication succeeded (check MCP status in Cursor settings).
- Restart Cursor completely.
- Check server logs for errors.

---

## Related Documents

- [tunnels.md](tunnels.md) — HTTPS tunnel setup (ngrok, Cloudflare)
- [mcp_oauth_implementation.md](mcp_oauth_implementation.md) — OAuth flow details
- [mcp_oauth_troubleshooting.md](mcp_oauth_troubleshooting.md) — OAuth troubleshooting
- [mcp_claude_code_setup.md](mcp_claude_code_setup.md) — Claude Code setup
- [mcp_chatgpt_setup.md](mcp_chatgpt_setup.md) — ChatGPT setup
- [agent_cli_configuration.md](agent_cli_configuration.md) — Unified MCP config for Cursor, Claude Code, Codex
