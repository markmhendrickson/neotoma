# MCP HTTPS Testing Guide

**Purpose:** Test Neotoma MCP server with HTTPS to verify Connect button appears in Cursor.

**Context:** Notion MCP uses HTTPS production URL (`https://mcp.notion.com/mcp`) and successfully shows Connect button. Testing with HTTPS may be required for Connect button to appear.

---

## Prerequisites

1. **ngrok installed:**
   ```bash
   # Homebrew
   brew install ngrok/ngrok/ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **ngrok authenticated:**
   ```bash
   # Sign up at https://dashboard.ngrok.com/signup (free account)
   # Get authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```

3. **MCP server running:**
   ```bash
   npm run dev:mcp
   ```

---

## Step 1: Start HTTPS Tunnel

Run the tunnel script:

```bash
npm run tunnel:https
```

This will:
- Start ngrok tunnel on port 8080
- Display the HTTPS URL (e.g., `https://abc123.ngrok-free.app`)
- Show configuration instructions

**Keep this terminal open** - the tunnel must remain active.

---

## Step 2: Configure Server with HTTPS URL

The server needs to know its public HTTPS URL for OAuth redirects and discovery endpoints.

### Option A: Environment Variable (Recommended)

In a **new terminal**, set the API base URL and restart the server:

```bash
# Get the HTTPS URL from the tunnel script output
export API_BASE_URL=https://abc123.ngrok-free.app

# Restart the MCP server with HTTPS URL
npm run dev:mcp
```

### Option B: Update .env File

Add to `.env`:

```bash
API_BASE_URL=https://abc123.ngrok-free.app
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
- Update `.cursor/mcp.json` and `API_BASE_URL` each time you restart ngrok

### OAuth Redirect URI Mismatch

**Issue:** OAuth redirect fails because `API_BASE_URL` doesn't match ngrok URL.

**Solution:**
- Ensure `API_BASE_URL` environment variable matches the ngrok HTTPS URL exactly
- Restart the MCP server after setting `API_BASE_URL`
- Check server logs to verify discovery endpoints use HTTPS URL

### Connect Button Still Not Appearing

**Check:**
1. ✅ HTTPS URL is correct in `.cursor/mcp.json`
2. ✅ `API_BASE_URL` is set and server restarted
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

## Alternative: Use Cloudflare Tunnel

If ngrok doesn't work, try Cloudflare Tunnel:

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Create tunnel
cloudflared tunnel --url http://localhost:8080
```

Update `API_BASE_URL` and `.cursor/mcp.json` with the Cloudflare tunnel URL.

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

- ngrok: https://ngrok.com/
- Notion MCP: https://mcp.notion.com/mcp (production HTTPS example)
- Troubleshooting guide: `docs/developer/mcp_connect_button_troubleshooting.md`
