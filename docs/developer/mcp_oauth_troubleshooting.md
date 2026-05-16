---
title: MCP OAuth Troubleshooting
summary: Common issues when connecting MCP clients (Cursor, Claude Code) to Neotoma via OAuth.
---

# MCP OAuth Troubleshooting

Common issues when connecting MCP clients (Cursor, Claude Code) to Neotoma via OAuth.

## Quick Diagnostic Checklist

1. **Is the server running?** `curl http://localhost:8080/health`
2. **Is the tunnel running?** `cat /tmp/ngrok-mcp-url.txt` (should be a valid HTTPS URL)
3. **Does discovery work?** `curl https://<tunnel-url>/.well-known/oauth-authorization-server`
4. **Is key-auth required?** Check `NEOTOMA_REQUIRE_KEY_FOR_OAUTH` in `.env`
5. **Check server logs:** `neotoma api logs --env dev` or check terminal output

---

## Connect Button Issues

### "Connect" button doesn't appear in Cursor

**Possible causes:**
- URL in `.cursor/mcp.json` uses HTTP instead of HTTPS
- Discovery endpoint not responding
- Cursor needs restart after config change (Cmd+Q, not just reload)

**Fix:**
1. Ensure `"url"` starts with `https://`
2. Verify: `curl -s https://<tunnel-url>/.well-known/oauth-authorization-server | jq .`
3. Quit and reopen Cursor

### "Connect" button appears but OAuth fails

**Possible causes:**
- Tunnel URL changed (free tier); config has old URL
- Key-auth not completed
- Server returned 500 during OAuth

**Fix:**
1. Check current tunnel URL: `cat /tmp/ngrok-mcp-url.txt`
2. Update `.cursor/mcp.json` if URL changed
3. Check server logs for `[MCP OAuth]` entries

---

## OAuth Flow Failures

### "redirect_uri is not allowed when connecting via a tunnel"

The `redirect_uri` passed by the client is not in the allow-list for tunnel requests.

**Allowed redirect URIs for tunnel:**
- `cursor://...` (Cursor deeplink)
- `vscode://...`
- `app://...`
- `http://localhost:*` (any port)
- `http://127.0.0.1:*` (any port)
- `https://localhost:*`

**Not allowed:**
- Any third-party HTTPS domain
- The tunnel URL itself as redirect

This is a security measure to prevent authorization code theft.

### "state is required" or "redirect_uri is required"

The OAuth authorize request is missing required parameters. This usually means the client is sending a malformed request.

**Fix:** Ensure the client uses the `auth_url` returned by `POST /mcp/oauth/initiate` exactly as-is, or that Cursor's Connect flow is using the correct authorization endpoint from discovery.

### "code_challenge and code_challenge_method=S256 are required"

PKCE is mandatory for all OAuth clients except OpenAI Custom GPTs.

**Fix:** Ensure the MCP client sends `code_challenge` and `code_challenge_method=S256` in the authorize request.

---

## Key-Auth Gate Issues

### Redirected to key-auth page unexpectedly

When `NEOTOMA_REQUIRE_KEY_FOR_OAUTH=true` (default), all OAuth requests redirect to `/mcp/oauth/key-auth` first.

**Options:**
1. Complete key-auth by entering your private key hex or mnemonic in the browser
2. Set `NEOTOMA_REQUIRE_KEY_FOR_OAUTH=false` in `.env` to disable (less secure)

### Key-auth cookie expired

The key-auth session lasts 15 minutes. If you take too long, the session expires.

**Fix:** Re-attempt the OAuth flow. Complete key-auth within 15 minutes.

---

## Token Issues

### "Missing Bearer token" (401)

The request has no `Authorization` header.

**Context matters:**
- **Local requests** (Host: localhost): No bearer required (auto-auth)
- **Tunnel requests** (Host: *.ngrok-free.dev): Bearer token required

**Fix for tunnel:** Ensure MCP config has OAuth completed or Bearer token configured.

### Access token expired, no refresh

The access token has expired and there's no valid refresh token.

**Fix:** Re-initiate the OAuth flow (click Connect again).

---

## Tunnel-Specific Issues

### "Tunnel request detected but config.apiBase is localhost"

Warning in server logs. The server received a tunnel request but `config.apiBase` still points to localhost. OAuth callbacks may fail.

**Fix:**
1. Set `NEOTOMA_HOST_URL` to the tunnel URL in `.env`
2. Or restart the server after the tunnel starts (auto-discovery reads `/tmp/ngrok-mcp-url.txt`)
3. Check: `curl http://localhost:8080/health` should show the server is running

### Tunnel URL changed after restart

Free-tier ngrok/Cloudflare tunnels get new URLs each time.

**Fix:**
1. Use a fixed domain: `NEOTOMA_HOST_URL=https://your.fixed.domain` in `.env`
2. Or update `.cursor/mcp.json` each time the URL changes
3. Or use `HOST_URL=your.fixed.domain` for ngrok reserved domains

---

## Server Log Messages

| Log message | Meaning |
|------------|---------|
| `[MCP OAuth] Starting background state cleanup job` | Normal — state cleanup runs every 5 minutes |
| `[MCP OAuth] Authorize rejected: redirect_uri not allowed for tunnel` | Redirect URI not in allow-list |
| `[MCP OAuth] Tunnel request detected but config.apiBase is localhost` | Server needs `NEOTOMA_HOST_URL` or restart |
| `[Auth] ... auth_method=bearer_env` | Bearer token matched `NEOTOMA_BEARER_TOKEN` |
| `[Auth] ... auth_method=local_no_bearer` | Local request auto-authenticated |

---

## Related Documents

- [tunnels.md](tunnels.md) — Tunnel setup and security
- [mcp_cursor_setup.md](mcp_cursor_setup.md) — Cursor MCP config
- [mcp_oauth_implementation.md](mcp_oauth_implementation.md) — OAuth flow details
- [auth.md](../subsystems/auth.md) — Authentication overview
