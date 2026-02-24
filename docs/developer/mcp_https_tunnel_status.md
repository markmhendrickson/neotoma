# MCP HTTPS Tunnel Status

**Date:** 2026-01-27  

**Full reference:** For provider selection, scripts, env vars, install, and troubleshooting, see [tunnels.md](tunnels.md).

**Example URLs:** ngrok free tier `https://<random>.ngrok-free.dev` (new URL each run). Cloudflare quick tunnel `https://<random>.trycloudflare.com`. Both write the current URL to `/tmp/ngrok-mcp-url.txt`.

## Current Status

### When the tunnel is running

1. **Tunnel (Cloudflare or ngrok):** PID in `/tmp/ngrok-mcp.pid`, forwards HTTPS to `http://localhost:8080` (or 8180 for prod). ngrok only: UI at `http://localhost:4040`.
2. **Local MCP server:** Port 8080 (or 8180), `/mcp` returns 401 when unauthenticated, discovery at `/.well-known/oauth-authorization-server`.
3. **Config:** `NEOTOMA_HOST_URL` set to the **current** tunnel URL (or server auto-discovers from `/tmp/ngrok-mcp-url.txt`). Cursor / `.cursor/mcp.json` use `https://<tunnel>/mcp`.

### "Connection refused" or "refuses to connect"

**Symptom:** `https://...ngrok-free.dev/mcp` (or the tunnel URL) refuses to connect (browser ERR_CONNECTION_REFUSED, Cursor fetch failed, `curl` HTTP 000).

**Most likely cause: tunnel not running.** The tunnel URL only works while the tunnel is active. Free-tier URLs (ngrok, Cloudflare quick tunnel) change every run.

**Causes and fixes:**

1. **Tunnel not running** – You stopped the terminal running `npm run tunnel:https` or ngrok died. **Fix:** Start the tunnel again and use the **new** URL it prints.
2. **Stale URL** – You’re still using an old URL from a previous run. **Fix:** Run `npm run tunnel:https`, copy the current HTTPS URL, update `NEOTOMA_HOST_URL` (and Cursor).
3. **ngrok free-tier warning** – Open the tunnel URL in a browser, accept "Visit Site" if shown, then retry.
4. **Network/firewall** – VPN or firewall blocking ngrok.
5. **Tunnel still starting** – Wait 10–30 seconds after starting ngrok.
6. **ngrok domain resolves to 127.0.0.1** – `curl -v` shows `IPv4: 127.0.0.1` and connection refused to localhost:443. A local DNS override (AdGuard, Pi-hole, NextDNS app, VPN, etc.) or stale cache is mapping the ngrok host to localhost. **Fix:** Flush DNS (`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`), then check for apps that override DNS and disable or exclude `*.ngrok-free.dev`. Confirm with `dscacheutil -q host -a name <tunnel-host>`; IPv4 should be a public IP (e.g. 3.125.x.x), not 127.0.0.1.

## Troubleshooting Steps

### Step 0: Start the tunnel

The tunnel must be running for the HTTPS URL to work. **`npm run dev:api` starts both the server and the tunnel** in one terminal (tunnel and API/MCP run together; Ctrl+C stops both).

```bash
npm run dev:api
```

Use the URL the tunnel script prints (or `cat /tmp/ngrok-mcp-url.txt`). The server auto-discovers it from that file, or set `NEOTOMA_HOST_URL` to it; then update Cursor config. For server-only (no tunnel), use `npm run dev:server`. For tunnel-only (e.g. server already running elsewhere), use `npm run tunnel:https` in a separate terminal.

### Step 1: Verify tunnel is active

```bash
# Tunnel URL (both providers)
cat /tmp/ngrok-mcp-url.txt

# ngrok only: API and web UI
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool
open http://localhost:4040

# Cloudflare only: log
tail -f /tmp/cloudflared-tunnel.log
```

### Step 2: Test local server

```bash
# Verify local server responds
curl http://localhost:8080/.well-known/oauth-authorization-server

# Should return JSON with OAuth endpoints
```

### Step 3: Accept ngrok warning page (free tier)

1. Open the **current** tunnel URL in a browser (from `npm run tunnel:https` or `cat /tmp/ngrok-mcp-url.txt`).
2. Accept "Visit Site" if shown.
3. Retry Cursor or `curl` to the tunnel URL.

### Step 4: ngrok resolves to 127.0.0.1

If `curl -v` shows `IPv4: 127.0.0.1` for the tunnel host:

```bash
# Flush DNS cache
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

# Check resolution (IPv4 should be a public IP, not 127.0.0.1)
dscacheutil -q host -a name melissia-introrse-correspondently.ngrok-free.dev
```

If IPv4 is still 127.0.0.1, a local DNS override (AdGuard, Pi-hole, VPN, etc.) is redirecting the ngrok domain. Disable or exclude `*.ngrok-free.dev` in that app. As a quick check, force the real IP:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -4 \
  --resolve "melissia-introrse-correspondently.ngrok-free.dev:443:3.125.223.134" \
  -H "ngrok-skip-browser-warning: 1" \
  "https://melissia-introrse-correspondently.ngrok-free.dev/mcp"
```

Expect 401. Use your tunnel's actual IP from `nslookup <tunnel-host>` if different.

### Step 5: Check ngrok logs

```bash
tail -f /tmp/ngrok.log
grep -i error /tmp/ngrok.log
```

## Provider options

- **Cloudflare:** Preferred when `cloudflared` is installed. No account required for quick tunnels. Install: `brew install cloudflare/cloudflare/cloudflared`. Force: `NEOTOMA_TUNNEL_PROVIDER=cloudflare`.
- **ngrok:** Used when Cloudflare is not installed and ngrok is installed and authenticated. Free tier: new URL each run, possible "Visit Site" page. Paid: static domains. Force: `NEOTOMA_TUNNEL_PROVIDER=ngrok`.

See [tunnels.md](tunnels.md) for full provider selection, install, and verification.

## Configuration (use current tunnel URL)

- **Tunnel URL:** From `npm run tunnel:https` output or `cat /tmp/ngrok-mcp-url.txt`
- **MCP endpoint:** `https://<your-tunnel-url>/mcp`
- **Local server:** `http://localhost:8080`
- **Env:** `NEOTOMA_HOST_URL` set to tunnel URL (or rely on auto-discovery)
- **Cursor:** `url` in config = `https://<your-tunnel-url>/mcp`

## Next steps

1. **Start tunnel** → copy URL → set `NEOTOMA_HOST_URL` (or let server auto-discover) → restart MCP server.
2. **Visit tunnel URL in browser** to accept warning page (free tier) if needed.
3. **Restart Cursor** and test Connect.

## Verification commands

```bash
# Tunnel URL (both providers)
cat /tmp/ngrok-mcp-url.txt

# ngrok only: tunnel status
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool

# Local server
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp   # expect 401

# Through tunnel (replace with your current URL; ngrok free tier may need header)
curl -s -H "ngrok-skip-browser-warning: 1" "https://YOUR-TUNNEL-URL/.well-known/oauth-authorization-server"

# Processes
lsof -i :8080
ps aux | grep "[n]grok http"
ps aux | grep "[c]loudflared"
```

## Related

- [tunnels.md](tunnels.md) — Full tunnel documentation (providers, scripts, env, troubleshooting)
