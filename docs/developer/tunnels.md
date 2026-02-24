# HTTPS Tunnels for MCP Remote Access

## Scope

This document is the canonical reference for using HTTPS tunnels with the Neotoma MCP server. It covers:

- When and why to use tunnels
- Supported providers (Cloudflare, ngrok)
- Provider selection and override
- npm scripts and ports
- Environment variables
- Installation and setup per provider
- Configuration and verification
- Troubleshooting

It does not cover: MCP protocol details, OAuth flows (see [mcp_oauth_implementation.md](mcp_oauth_implementation.md)), or production deployment without tunnels.

---

## Purpose

Tunnels expose your local MCP/API server over HTTPS so that:

- Remote clients (e.g. Cursor on another machine, ChatGPT) can connect to `https://<tunnel-host>/mcp`
- OAuth and "Add to Cursor" flows use a public HTTPS URL
- The Connect button and discovery endpoints work as expected

Without a tunnel, only clients on the same host can use `http://localhost:PORT/mcp`.

---

## When to Use a Tunnel

Use a tunnel when:

- You want **remote MCP access** (Cursor or other IDEs connecting from another machine or over the internet)
- You need **HTTPS** for OAuth or discovery (e.g. Cursor Connect)
- You are testing **production-like** behavior with a local server (e.g. `watch:prod:tunnel`)

Do not use a tunnel when:

- You only use MCP over stdio or localhost
- You deploy to a host that already has a public HTTPS URL

---

## Supported Providers

| Provider    | Binary      | Auto-selected when        | Override                    |
|------------|-------------|----------------------------|-----------------------------|
| Cloudflare | `cloudflared` | Installed (preferred)      | `NEOTOMA_TUNNEL_PROVIDER=cloudflare` |
| ngrok      | `ngrok`     | Cloudflare not installed, ngrok installed and authenticated | `NEOTOMA_TUNNEL_PROVIDER=ngrok` |

**Selection order (when `NEOTOMA_TUNNEL_PROVIDER` is not set):**

1. If `cloudflared` is installed → **Cloudflare**
2. Else if `ngrok` is installed and authenticated → **ngrok**
3. Else → **ngrok** (script will error if ngrok is not usable)

To force a provider, set in `.env` or export before running:

```bash
NEOTOMA_TUNNEL_PROVIDER=cloudflare   # use cloudflared
NEOTOMA_TUNNEL_PROVIDER=ngrok        # use ngrok
```

---

## npm Scripts and Ports

| Script                 | Port | What runs                          | Use case                          |
|------------------------|------|------------------------------------|-----------------------------------|
| `npm run tunnel:https` | 8080 | Tunnel only                        | Server already running elsewhere  |
| `npm run watch:dev:tunnel` / `npm run dev:api` | 8080 | Tunnel + API (dev)                 | Dev + remote MCP                 |
| `npm run watch:server+api` | 8080 | Tunnel + API + `tsc --watch`       | Dev + tunnel + rebuild            |
| `npm run watch:prod:tunnel` | 8180 | Tunnel + API + `tsc --watch` (prod) | Prod env + remote MCP             |

Port is controlled by `NEOTOMA_HTTP_PORT` or `HTTP_PORT` (default 8080 for dev, 8180 for prod scripts). The tunnel forwards HTTPS to `http://localhost:${HTTP_PORT}`. Prefer `NEOTOMA_HTTP_PORT` when running Neotoma as MCP inside a host workspace to avoid port conflicts.

**Combined commands** (e.g. `dev:api`, `watch:prod:tunnel`) start both tunnel and server in one terminal; the tunnel script writes the URL to `/tmp/ngrok-mcp-url.txt` and the server reads it for auto-discovery or explicit `NEOTOMA_HOST_URL`. Ctrl+C stops both.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEOTOMA_HOST_URL` | Base URL for API and MCP (OAuth, discovery, "Add to Cursor"). If unset, server auto-discovers from `/tmp/ngrok-mcp-url.txt`. |
| `NEOTOMA_TUNNEL_PROVIDER` | Force provider: `cloudflare` or `ngrok`. |
| `NEOTOMA_HTTP_PORT` | Port the server listens on; prefer when running inside a host workspace (avoids conflicts). |
| `HTTP_PORT` | Legacy; tunnel forwards to this (default 8080; prod scripts use 8180). |
| `TUNNEL_NONINTERACTIVE=1` | Used by npm scripts to skip "port not in use" prompt. |
| `NEOTOMA_MCP_PROXY_URL` | Override MCP URL only when it must differ from host (rare). Prefer when running inside a host workspace. |
| `MCP_PROXY_URL` | Legacy alias for `NEOTOMA_MCP_PROXY_URL`. |
| `TUNNEL_TOKEN` or `CLOUDFLARE_TUNNEL_TOKEN` | Optional; for Cloudflare named tunnels. Not required for quick tunnels. |
| `NEOTOMA_OAUTH_REDIRECT_BASE_URL` | **Advanced.** Override OAuth callback base (defaults to `NEOTOMA_HOST_URL`). Prefer when running inside a host workspace. |
| `OAUTH_REDIRECT_BASE_URL` | Legacy alias for `NEOTOMA_OAUTH_REDIRECT_BASE_URL`. |

---

## Cloudflare (cloudflared)

**Install:**

```bash
brew install cloudflare/cloudflare/cloudflared
# Or: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

No Cloudflare account is required for **quick tunnels** (ephemeral URL).

**Behavior:**

- Quick tunnel runs: `cloudflared tunnel --url "http://localhost:${HTTP_PORT}"`
- URL pattern: `https://<random>.trycloudflare.com`
- Log file: `/tmp/cloudflared-tunnel.log`
- Tunnel URL is written to `/tmp/ngrok-mcp-url.txt` (same as ngrok so server and Cursor config flow are unchanged)
- PID is stored in `/tmp/ngrok-mcp.pid` (same file name for both providers)

**Verification:**

```bash
# Tunnel URL
cat /tmp/ngrok-mcp-url.txt

# Cloudflare log
tail -f /tmp/cloudflared-tunnel.log
```

---

## ngrok

**Install:**

```bash
brew install ngrok/ngrok/ngrok
# Or: https://ngrok.com/download
```

**Authenticate (required):**

```bash
# Sign up: https://dashboard.ngrok.com/signup
# Get authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
ngrok config add-authtoken YOUR_AUTHTOKEN
```

**Behavior:**

- Free tier: new URL each run (e.g. `https://<random>.ngrok-free.dev`); may show a "Visit Site" warning in the browser.
- PID: `/tmp/ngrok-mcp.pid`
- URL: `/tmp/ngrok-mcp-url.txt`
- Web UI: `http://localhost:4040` (when ngrok is running)
- Optional fixed domain: if `NEOTOMA_HOST_URL` in `.env` contains a hostname, the script uses it for `ngrok http --domain=...` (requires ngrok reserved/custom domain).

**Verification:**

```bash
# Tunnel URL
cat /tmp/ngrok-mcp-url.txt

# ngrok API (tunnel status)
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool

# Logs
tail -f /tmp/ngrok.log
```

---

## Tunnel URL Auto-Discovery

**The server automatically discovers the tunnel URL** when `NEOTOMA_HOST_URL` is not set:

1. **Tunnel script** (`setup-https-tunnel.sh`) writes URL to `/tmp/ngrok-mcp-url.txt`
2. **Server** (`src/config.ts`) reads this file on startup if `NEOTOMA_HOST_URL` not in environment
3. **OAuth and discovery** automatically use the tunnel URL

**Priority order for `config.apiBase`:**
1. `NEOTOMA_HOST_URL` (explicit environment variable)
2. Auto-discovered from `/tmp/ngrok-mcp-url.txt`
3. `http://localhost:${httpPort}` (fallback)

**This means:**
- Combined scripts (`dev:api`, `watch:prod:tunnel`) work without manual URL configuration
- Starting tunnel first, then server separately works automatically
- No `.env` changes needed for most tunnel use cases

**To use a fixed domain:** Set `NEOTOMA_HOST_URL` in `.env` to your reserved ngrok domain or custom URL.

---

## Configuration After Tunnel Starts

1. **Tunnel URL**  
   From script output or `cat /tmp/ngrok-mcp-url.txt`.

2. **Server base URL**  
   **Auto-discovery (no action needed):** Combined scripts (`dev:api`, `watch:prod:tunnel`) write the tunnel URL to a file; the server auto-discovers from `/tmp/ngrok-mcp-url.txt`. If you start server separately, it reads that file on startup.  
   **Manual:** Set `NEOTOMA_HOST_URL` to the tunnel URL and restart the server.

3. **Cursor / MCP client**  
   Use `https://<tunnel-url>/mcp` in `.cursor/mcp.json` or the Neotoma UI "Add to Cursor" flow.

4. **Optional**  
   Visit the tunnel URL in a browser once; ngrok free tier may require accepting the "Visit Site" page.

---

## Stopping the Tunnel

- **Combined command (e.g. dev:api, watch:prod:tunnel):** Ctrl+C in the terminal stops both tunnel and server.
- **Tunnel-only (`tunnel:https`):** Ctrl+C in the tunnel terminal.
- **Manual kill (either provider):**
  ```bash
  kill $(cat /tmp/ngrok-mcp.pid 2>/dev/null) 2>/dev/null || true
  rm -f /tmp/ngrok-mcp.pid /tmp/ngrok-mcp-url.txt
  ```

---

## Troubleshooting

### Connection refused to tunnel URL

- **Tunnel not running:** Start it again (`npm run tunnel:https` or a combined command). Use the **current** URL from the script or `cat /tmp/ngrok-mcp-url.txt`.
- **Stale URL:** Free-tier URLs change each run. Update `NEOTOMA_HOST_URL` (if set explicitly in .env) and Cursor config with the new URL. If using auto-discovery, restart the server to pick up the new URL.
- **ngrok free-tier:** Open the tunnel URL in a browser and accept "Visit Site" if shown, then retry.
- **Port:** Ensure the server is listening on the port the tunnel uses (8080 or 8180). Check with `lsof -i :8080` (or 8180).

### ngrok: domain resolves to 127.0.0.1

If `curl -v` shows the tunnel host resolving to `127.0.0.1`, a local DNS override (AdGuard, Pi-hole, VPN, etc.) may be mapping the host to localhost.

- Flush DNS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
- Exclude `*.ngrok-free.dev` (or the tunnel host) in the DNS app.
- Confirm: `dscacheutil -q host -a name <tunnel-host>`; IPv4 should be a public IP, not 127.0.0.1.

### Cloudflare: no URL in log

- Wait a few seconds; the script retries for the URL in `/tmp/cloudflared-tunnel.log`.
- Check: `tail -f /tmp/cloudflared-tunnel.log` for errors.

### OAuth / discovery issues

- Server auto-discovers tunnel URL from `/tmp/ngrok-mcp-url.txt`. If using explicit `NEOTOMA_HOST_URL` in `.env`, ensure it matches the tunnel URL exactly and restart the server after changing it.
- See [mcp_oauth_implementation.md](mcp_oauth_implementation.md) and [mcp_oauth_troubleshooting.md](mcp_oauth_troubleshooting.md).

### Verification commands (summary)

```bash
# Tunnel URL (both providers)
cat /tmp/ngrok-mcp-url.txt

# ngrok only: tunnel status
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool

# Local server
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp   # expect 401

# Through tunnel (replace with your URL; ngrok free tier may need header)
curl -s -H "ngrok-skip-browser-warning: 1" "https://YOUR-TUNNEL-URL/.well-known/oauth-authorization-server"
```

---

## Related Documents

- [mcp_https_tunnel_status.md](mcp_https_tunnel_status.md) — Current status and quick troubleshooting
- [mcp_https_testing.md](mcp_https_testing.md) — HTTPS testing for MCP/Cursor Connect
- [mcp_cursor_setup.md](mcp_cursor_setup.md) — Cursor MCP setup and tunnel usage
- [mcp_oauth_implementation.md](mcp_oauth_implementation.md) — OAuth redirect and base URL
- [getting_started.md](getting_started.md) — Server and tunnel commands overview
- [cli_reference.md](cli_reference.md) — npm scripts summary

---

## Agent Instructions

### When to Load This Document

Load when adding or changing tunnel behavior, documenting tunnel scripts or env vars, or troubleshooting remote MCP/HTTPS access.

### Required Co-Loaded Documents

- [getting_started.md](getting_started.md) for server/tunnel command context
- [mcp_oauth_implementation.md](mcp_oauth_implementation.md) when editing OAuth or base URL behavior

### Constraints Agents Must Enforce

1. Tunnel provider selection must match `scripts/setup-https-tunnel.sh`: Cloudflare when cloudflared installed, else ngrok when installed and authenticated.
2. Document both Cloudflare and ngrok for install, verification, and troubleshooting.
3. Use `NEOTOMA_HOST_URL` as the base URL config.
4. Server auto-discovers tunnel URL from `/tmp/ngrok-mcp-url.txt` if `NEOTOMA_HOST_URL` not set.

### Forbidden Patterns

- Documenting only one provider without the other
- Requiring a Cloudflare token for quick tunnels
- Stating that ngrok is always preferred over Cloudflare (Cloudflare is preferred when cloudflared is installed)
