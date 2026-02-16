# MCP OAuth Redirect URI Configuration

**Date:** 2026-01-27  
**Issue:** OAuth redirect URI must match Supabase registration exactly, independent of `API_BASE_URL`

## Problem

When using ngrok or other proxies for HTTPS testing:
- `API_BASE_URL` is set to the public HTTPS URL (e.g., `https://abc123.ngrok-free.dev`)
- Discovery endpoints (`.well-known/oauth-authorization-server`) must return HTTPS URLs
- **But** OAuth redirect URI must match what's registered in Supabase exactly

If Supabase has registered `http://localhost:8080/api/mcp/oauth/callback`, but we use `https://abc123.ngrok-free.dev/api/mcp/oauth/callback`, OAuth will fail with redirect URI mismatch.

## Solution

OAuth redirect URI now defaults to `HOST_URL` (or auto-discovered tunnel URL):

1. **Default Behavior:**
   - `OAUTH_REDIRECT_BASE_URL` defaults to `config.apiBase` (which is `HOST_URL` or auto-discovered tunnel URL)
   - This makes OAuth callbacks reachable from the internet automatically when using tunnels
   - No manual configuration needed for most use cases

2. **Implementation:**
   ```typescript
   // OAuth redirect URI - defaults to HOST_URL or discovered tunnel URL
   const oauthRedirectBase = process.env.OAUTH_REDIRECT_BASE_URL || config.apiBase;
   const supabaseRedirectUri = `${oauthRedirectBase}/api/mcp/oauth/callback`;
   
   // config.apiBase priority:
   // 1. HOST_URL (explicit)
   // 2. API_BASE_URL (deprecated)
   // 3. Auto-discovered from /tmp/ngrok-mcp-url.txt
   // 4. http://localhost:${httpPort}
   ```

## Configuration

### For Local Development (Default)

No configuration needed:
```bash
# .env (optional)
# HOST_URL not set → defaults to http://localhost:8080
# OAUTH_REDIRECT_BASE_URL not set → defaults to HOST_URL
```

### For Tunnel Testing (Auto-Discovery)

**No configuration needed** - server auto-discovers tunnel URL:
```bash
# Start tunnel + server (auto-discovery works)
npm run watch:dev:tunnel
```

Server reads tunnel URL from `/tmp/ngrok-mcp-url.txt` and uses it for OAuth callbacks automatically.

### For Tunnel Testing (Explicit HOST_URL)

Set `HOST_URL` to your tunnel:
```bash
# .env
HOST_URL="https://abc123.ngrok-free.dev"
# OAUTH_REDIRECT_BASE_URL not set → defaults to HOST_URL
```

OAuth callback will be `https://abc123.ngrok-free.dev/api/mcp/oauth/callback`.

### Edge Case: OAuth Callback Different from HOST_URL

If Supabase is registered with `localhost` callback but you want public discovery URLs:
```bash
# .env
HOST_URL="https://abc123.ngrok-free.dev"  # For discovery endpoints
OAUTH_REDIRECT_BASE_URL="http://localhost:8080"  # For OAuth callback (if Supabase registered with localhost)
```

**Why:** This is rare. Most users should rely on auto-discovery or set `HOST_URL` only.

### For Production

Set `HOST_URL` to production domain:
```bash
# .env.production
HOST_URL="https://neotoma.fly.dev"
# OAUTH_REDIRECT_BASE_URL not set → defaults to HOST_URL
```

**Note:** In production, Supabase OAuth client must be registered with the production callback URL.

## Supabase OAuth Client Registration

The OAuth redirect URI used in code **must exactly match** what's registered in Supabase:

1. **Check Supabase Dashboard:**
   - Authentication → OAuth Server → Clients
   - Find the client used by Neotoma
   - Verify redirect URI: `http://localhost:8080/api/mcp/oauth/callback` (dev) or `https://neotoma.fly.dev/api/mcp/oauth/callback` (prod)

2. **If using dynamic registration:**
   - The first OAuth flow will register the client with the redirect URI used
   - Subsequent flows must use the same redirect URI
   - Check `oauth_clients` table in Supabase to see registered redirect URIs

## Current Configuration (After Auto-Discovery Update)

**Development (with tunnel auto-discovery):**
- `HOST_URL`: Not set (auto-discovered from `/tmp/ngrok-mcp-url.txt`)
- `OAUTH_REDIRECT_BASE_URL`: Not set (defaults to `HOST_URL`)
- OAuth redirect URI: `https://melissia-introrse-correspondently.ngrok-free.dev/api/mcp/oauth/callback` (auto-discovered)
- Discovery issuer: `https://melissia-introrse-correspondently.ngrok-free.dev` (auto-discovered)

This allows:
- Discovery endpoints to return tunnel HTTPS URLs automatically
- OAuth redirects to use tunnel URL (reachable from internet for Claude.ai, ChatGPT)
- No manual configuration needed

## Verification

Check what redirect URI is being used:

1. **Check logs:**
   - Instrumentation logs redirect URI construction
   - Look for `mcp_oauth.ts:initiateOAuthFlow:redirectUri` log entries

2. **Check Supabase:**
   - Verify registered redirect URI matches what code uses
   - If mismatch, update Supabase registration or code

3. **Test OAuth flow:**
   - Initiate OAuth flow
   - Check browser redirect URL matches Supabase registration

## Related Files

- `src/services/mcp_oauth.ts`: OAuth redirect URI construction (line ~692)
- `src/config.ts`: `API_BASE_URL` configuration (line ~66)
- `.env`: Environment variable configuration
