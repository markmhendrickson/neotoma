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

Separate OAuth redirect URI from `API_BASE_URL`:

1. **New Environment Variable:** `OAUTH_REDIRECT_BASE_URL`
   - Defaults to `http://localhost:${HTTP_PORT}` if not set
   - Used only for OAuth redirect URI construction
   - Independent of `API_BASE_URL`

2. **Implementation:**
   ```typescript
   // OAuth redirect URI (must match Supabase registration)
   const oauthRedirectBase = process.env.OAUTH_REDIRECT_BASE_URL || `http://localhost:${config.httpPort}`;
   const supabaseRedirectUri = `${oauthRedirectBase}/api/mcp/oauth/callback`;
   
   // API base URL (used for discovery endpoints, can be ngrok/proxy)
   const apiBase = process.env.API_BASE_URL || `http://localhost:${config.httpPort}`;
   ```

## Configuration

### For Local Development (Default)

No configuration needed - defaults to `http://localhost:8080`:
```bash
# .env (optional - defaults work)
# API_BASE_URL not set (or set to http://localhost:8080)
# OAUTH_REDIRECT_BASE_URL not set (defaults to http://localhost:8080)
```

### For HTTPS Testing with ngrok

Set `API_BASE_URL` to ngrok URL, but keep OAuth redirect as localhost:
```bash
# .env
API_BASE_URL="https://abc123.ngrok-free.dev"
# OAUTH_REDIRECT_BASE_URL not set (defaults to http://localhost:8080)
# OR explicitly set:
OAUTH_REDIRECT_BASE_URL="http://localhost:8080"
```

**Why:** Supabase OAuth client is registered with `http://localhost:8080/api/mcp/oauth/callback`, so we must use that exact URL for redirects, even when `API_BASE_URL` points to ngrok.

### For Production

Both should point to production domain:
```bash
# .env.production
API_BASE_URL="https://neotoma.fly.dev"
OAUTH_REDIRECT_BASE_URL="https://neotoma.fly.dev"
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

## Current Configuration

**Development (with ngrok):**
- `API_BASE_URL`: `https://melissia-introrse-correspondently.ngrok-free.dev`
- `OAUTH_REDIRECT_BASE_URL`: Not set (defaults to `http://localhost:8080`)
- OAuth redirect URI: `http://localhost:8080/api/mcp/oauth/callback`
- Discovery issuer: `https://melissia-introrse-correspondently.ngrok-free.dev`

This allows:
- Discovery endpoints to return HTTPS URLs (for Cursor Connect button)
- OAuth redirects to use localhost (matching Supabase registration)

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
