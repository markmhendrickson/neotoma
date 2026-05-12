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

For source iteration with an installed local MCP server, use the stable dev shim instead of `tsx watch` as the client-facing stdio command. The shim keeps Cursor connected, restarts a worker behind the stdio stream, and keeps diagnostics on stderr.

**Launcher matrix:** which `scripts/run_neotoma_mcp_*.sh` to use (stdio vs proxy, prod vs dev, reload model) is summarized in **[`mcp/proxy.md` § Repo launcher scripts](mcp/proxy.md#repo-launcher-scripts)**.

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

**Dev shim for source iteration:**

```json
{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_dev_shim.sh"
    }
  }
}
```

Use this only when you want the MCP client connection to survive local source reloads. Keep `run_neotoma_mcp_stdio.sh` as the stable default for ordinary local MCP usage. Do not use `run_neotoma_mcp_stdio_dev_watch.sh` as an installed MCP command; watch-mode stdout and process restarts share the JSON-RPC channel and can break stdio MCP.

**Signed dev shim (HTTP `/mcp` + AAuth + same reload model):** when the dev API is up (`neotoma api start --env dev`, default `:3080`) and you have run `neotoma auth keygen`, point `neotoma-dev` at `scripts/run_neotoma_mcp_signed_stdio_dev_shim.sh`. Cursor still speaks stdio MCP; the shim restarts the identity-proxy worker on source changes; the proxy signs requests to `http://127.0.0.1:3080/mcp` when `MCP_PROXY_DOWNSTREAM_URL` is unset. Set `MCP_PROXY_DOWNSTREAM_URL=http://127.0.0.1:3180/mcp` for a signed prod slot. See `docs/developer/mcp/proxy.md` (Dev: stdio + live reload + AAuth).

**Unsigned stdio dev shim (HTTP `/mcp`, no `mcp_dev_shim.ts` wrapper):** when you want stdio Cursor (or another harness) to talk to the local HTTP `/mcp` API **without** the signed shim’s live-reload worker, point `command` at `scripts/run_neotoma_mcp_unsigned_stdio_dev_shim.sh`. It uses the same **port file** / **TCP probe** resolution as the signed shim, then runs `mcp proxy` directly (set `MCP_PROXY_AAUTH=1` in `env` if you opt into signing on that path). The legacy filename `run_neotoma_mcp_unsigned_stdio_proxy.sh` is a one-line `exec` forwarder to this script.

```json
{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_unsigned_stdio_dev_shim.sh",
      "env": {
        "NEOTOMA_MCP_USE_LOCAL_PORT_FILE": "1",
        "NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE": "dev"
      }
    }
  }
}
```

**Dynamic local API port (optional):** when `npm run dev:server:prod` (or `pick-port`) binds a port other than the one in `mcp.json`, set **`NEOTOMA_MCP_USE_LOCAL_PORT_FILE=1`** on the signed shim and **omit `MCP_PROXY_DOWNSTREAM_URL`** (or keep it only as a fallback when the port file is missing). On each successful HTTP bind, Neotoma writes **`.dev-serve/local_http_port_dev`** or **`local_http_port_prod`** from `NEOTOMA_ENV` (dev also mirrors legacy **`local_http_port`**). Set **`NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE`** to **`dev`** or **`prod`** so each MCP entry reads the right file when **dev and prod HTTP APIs run in parallel**; preset **A** sets this automatically on `neotoma-dev` / `neotoma`. The shim TCP-probes before use and falls back to `MCP_PROXY_DOWNSTREAM_URL` or default `:3080` / `:3180` (prod profile). Increase **`NEOTOMA_MCP_PORT_PROBE_MS`** (default 1200, max 5000) if your API is slow to bind.

```json
{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_signed_stdio_dev_shim.sh",
      "env": {
        "NEOTOMA_MCP_USE_LOCAL_PORT_FILE": "1",
        "NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE": "dev"
      }
    },
    "neotoma": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_signed_stdio_dev_shim.sh",
      "env": {
        "NEOTOMA_MCP_USE_LOCAL_PORT_FILE": "1",
        "NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE": "prod",
        "MCP_PROXY_DOWNSTREAM_URL": "http://127.0.0.1:3180/mcp"
      }
    }
  }
}
```

`neotoma setup --tool cursor --yes` and `neotoma mcp config` both use the same MCP installer. Transport presets: **`b`** (default) local stdio for low-friction npm onboarding; **`a`** signed shim + AAuth — `neotoma-dev` → dev `/mcp` (default `:3080`), `neotoma` → prod `/mcp` (default `:3180`); **`c`** direct stdio; **`d`** signed shim with **both** slots → prod `/mcp` (default `http://127.0.0.1:3180/mcp`). Pass `--rewrite-neotoma-mcp` to refresh existing Neotoma entries to a different preset.

### AAuth attribution: HTTP URL vs signed proxy

Cursor's native HTTP MCP configuration (`"url": "http://127.0.0.1:3180/mcp"` or a tunnel URL) does not add RFC 9421 / AAuth signature headers. Those requests can authenticate with OAuth or Bearer tokens, but Neotoma's `attribution_decision.signature_present` remains `false` because the HTTP request has no `Signature`, `Signature-Input`, or `Signature-Key` headers.

Use stdio plus the signed shim when you need verified agent attribution. The shim runs `neotoma mcp proxy --aauth`; the proxy signs the HTTP request before it reaches `/mcp`.

| Cursor MCP shape | `signature_present` | Typical Inspector tier |
| --- | --- | --- |
| Direct `"url"` to `/mcp` | `false` | `unverified_client` or `anonymous` |
| `command` → `run_neotoma_mcp_signed_stdio_dev_shim.sh` → `/mcp` | `true` when keys and authority match | `software` or higher |

Runtime code changes can reload behind the shim. Tool interface changes are different: new tools, removed tools, changed descriptions, schemas, annotations, or `_meta` require client rediscovery. The shim emits `notifications/tools/list_changed` when it detects a changed `tools/list` hash; if Cursor does not refresh its cached tool list, reconnect or reinitialize the MCP server.

### MCP `initialize` and Cursor tool discovery

Neotoma’s custom `initialize` handler **must** echo the same **`capabilities`** object the MCP `Server` was constructed with (`tools: { listChanged: true }`, `resources`, plus OAuth fields when unauthenticated). If `initialize` advertises a bare `tools: {}`, some clients show **resources** but not **tools** even when `tools/list` works. Implementation: **`NEOTOMA_MCP_DECLARED_CAPABILITIES`** in `src/server.ts`; spec note: **`docs/specs/MCP_SPEC.md` § 1.1**. Full proxy/shim/env reference: **`docs/developer/mcp/proxy.md`**.

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

1. Neotoma server running with tunnel: `npm run dev:server:tunnel` (starts server + tunnel)
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
npm run dev:server:tunnel # starts server + tunnel
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

- Reconnect the MCP server or restart Cursor so it re-runs `tools/list`.
- After upgrading Neotoma, reconnect MCP so the host picks up fresh `listTools` input schemas (for example `add_issue_message` / `get_issue_status` accept **`entity_id`** or **`issue_number`**). Stale cached tool shapes can make the IDE reject `entity_id`-only calls for private issues.
- Tool definitions should appear before authentication; if they do not, inspect MCP logs for `listTools` errors.
- Verify authentication succeeded before executing tools that read or write user data (check MCP status in Cursor settings).
- Restart Cursor completely.
- Check server logs for errors.

### Signed shim configured but Inspector still shows self-reported

- Filter API logs to `POST /mcp` after a tool call. Neotoma runs the AAuth middleware on every HTTP route, so unrelated Inspector and REST requests such as `GET /session` or `POST /entities/query` normally log `signature_present: false`.
- Confirm Cursor is using the intended MCP server entry. A workspace can expose both `neotoma-dev` (`:3080`) and `neotoma` (`:3180`), and old sessions may survive until you reconnect the MCP server.
- Check the MCP subprocess stderr for `[neotoma-mcp-proxy] AAuth signing enabled`. If keys cannot load, the proxy logs `continuing unsigned (unverified_client tier)` unless `MCP_PROXY_FAIL_CLOSED=1` is set.
- Check authority alignment. The server verifies signatures against `NEOTOMA_AAUTH_AUTHORITY` (or the API base host), while the proxy signs for the downstream URL unless `NEOTOMA_AAUTH_AUTHORITY_OVERRIDE` is set. Mismatches such as `localhost:3180` versus `127.0.0.1:3180` can make verification fail.
- Treat existing rows as historical. Only new writes after a verified proxy path will show `software` or higher provenance in the Inspector.

---

## Related Documents

- [tunnels.md](tunnels.md) — HTTPS tunnel setup (ngrok, Cloudflare)
- [mcp_oauth_implementation.md](mcp_oauth_implementation.md) — OAuth flow details
- [mcp_oauth_troubleshooting.md](mcp_oauth_troubleshooting.md) — OAuth troubleshooting
- [mcp_claude_code_setup.md](mcp_claude_code_setup.md) — Claude Code setup
- [mcp_chatgpt_setup.md](mcp_chatgpt_setup.md) — ChatGPT setup
- [agent_cli_configuration.md](agent_cli_configuration.md) — Unified MCP config for Cursor, Claude Code, Codex
