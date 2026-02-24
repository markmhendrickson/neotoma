# MCP HTTPS Testing Guide

**Purpose:** Test Neotoma MCP server with HTTPS to verify Connect button appears in Cursor.

**Context:** Notion MCP uses HTTPS production URL (`https://mcp.notion.com/mcp`) and successfully shows Connect button. Testing with HTTPS may be required for Connect button to appear.

**Tunnel setup:** For full tunnel documentation (Cloudflare and ngrok, scripts, env vars, troubleshooting), see [tunnels.md](tunnels.md).

---

## Prerequisites

1. **Tunnel provider:** Either Cloudflare (`cloudflared`) or ngrok. The script prefers Cloudflare when `cloudflared` is installed; otherwise ngrok (must be installed and authenticated). See [tunnels.md](tunnels.md).

2. **ngrok (if using ngrok):**
   ```bash
   brew install ngrok/ngrok/ngrok
   ngrok config add-authtoken YOUR_AUTHTOKEN   # from https://dashboard.ngrok.com/get-started/your-authtoken
   ```

3. **Cloudflare (if using Cloudflare):**
   ```bash
   brew install cloudflare/cloudflare/cloudflared
   ```

4. **MCP server with tunnel:**
   ```bash
   npm run dev:api
   ```

---

## Step 1: Start HTTPS Tunnel

Run the tunnel script (or use a combined command that starts server and tunnel):

```bash
npm run tunnel:https
# Or: npm run dev:api   (tunnel + server together)
```

This will:
- Start the tunnel (Cloudflare or ngrok, see [tunnels.md](tunnels.md)) on port 8080
- Display the HTTPS URL (e.g. `https://<random>.trycloudflare.com` or `https://<random>.ngrok-free.app`)
- Write the URL to `/tmp/ngrok-mcp-url.txt`

**Keep this terminal open** so the tunnel stays active.

---

## Step 2: Configure Server with HTTPS URL

The server needs to know its public HTTPS URL for OAuth redirects and discovery endpoints.

### Option A: Environment Variable (Recommended)

In a **new terminal**, set the API base URL and restart the server:

```bash
# Get the HTTPS URL from the tunnel script output
export NEOTOMA_HOST_URL=https://abc123.ngrok-free.app

# Restart the MCP server with HTTPS URL
npm run dev:api
```

### Option B: Update .env File

Add to `.env`:

```bash
NEOTOMA_HOST_URL=https://abc123.ngrok-free.app
```

Then restart the server.

---

## Step 3: Update Cursor Configuration

Update `.cursor/mcp.json` to use the HTTPS URL:

```json
{
  "mcpServers": {
    "neotoma": {
      "url": "https://abc123.ngrok-free.app/mcp"
    }
  }
}
```

**Important:** Replace `abc123.ngrok-free.app` with your actual ngrok URL from Step 1.

---

## Step 4: Restart Cursor

1. **Quit Cursor completely** (Cmd+Q on Mac)
2. **Reopen Cursor** to load the new MCP configuration
3. **Check MCP status** - should show "Authentication needed" with Connect button

---

## Step 5: Test Connect Button

1. **Open Cursor MCP settings** (or check MCP status)
2. **Verify** "Authentication needed" message appears
3. **Click Connect button** (should appear with HTTPS URL)
4. **Complete OAuth flow** in browser
5. **Verify** connection is established

---

## Troubleshooting

### ngrok URL Changes on Restart

**Issue:** ngrok free tier assigns new URLs on each restart.

**Solution:** 
- Use ngrok paid plan for static domains, OR
- Update `.cursor/mcp.json` and `NEOTOMA_HOST_URL` each time you restart ngrok

### OAuth Redirect URI Mismatch

**Issue:** OAuth redirect fails because `NEOTOMA_HOST_URL` doesn't match ngrok URL.

**Solution:**
- Ensure `NEOTOMA_HOST_URL` environment variable matches the ngrok HTTPS URL exactly
- Restart the MCP server after setting `NEOTOMA_HOST_URL`
- Check server logs to verify discovery endpoints use HTTPS URL

### Connect Button Still Not Appearing

**Check:**
1. ✅ HTTPS URL is correct in `.cursor/mcp.json`
2. ✅ `NEOTOMA_HOST_URL` is set and server restarted (or server auto-discovers from tunnel file)
3. ✅ Tunnel is active (ngrok terminal still running)
4. ✅ Server is running on port 8080
5. ✅ Cursor was restarted after config change
6. ✅ Clear Cursor's MCP cache (remove and re-add server)

**If still not working:**
- Compare discovery endpoint responses with Notion MCP
- Check server logs for 401 responses
- Verify `WWW-Authenticate` header format
- Test discovery endpoints directly: `curl https://your-ngrok-url/.well-known/oauth-authorization-server`

---

## Alternative: Use Cloudflare as tunnel provider

If cloudflared is installed, the script uses Cloudflare by default. To force Cloudflare: `NEOTOMA_TUNNEL_PROVIDER=cloudflare`. Install: `brew install cloudflare/cloudflare/cloudflared`. No Cloudflare account required for quick tunnels. See [tunnels.md](tunnels.md). The script writes the tunnel URL to the same file so the server and Cursor config flow are unchanged.

---

## Cleanup

To stop the tunnel:

1. **In the tunnel terminal:** Press Ctrl+C
2. **Or kill the process:**
   ```bash
   kill $(cat /tmp/ngrok-mcp.pid 2>/dev/null) 2>/dev/null || true
   rm -f /tmp/ngrok-mcp.pid /tmp/ngrok-mcp-url.txt
   ```

---

## References

- [tunnels.md](tunnels.md) — Full tunnel documentation (Cloudflare, ngrok, scripts, env, troubleshooting)
- [mcp_https_tunnel_status.md](mcp_https_tunnel_status.md) — Tunnel status and quick fixes
- [mcp_connect_button_troubleshooting.md](mcp_connect_button_troubleshooting.md) — Connect button troubleshooting
- ngrok: https://ngrok.com/
- Cloudflare: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- Notion MCP: https://mcp.notion.com/mcp (production HTTPS example)
