# External Provider Integration Guide
*(Post-MVP Provider Setup)*

---

## Purpose

This document provides setup instructions for external provider integrations in Neotoma, including X (Twitter), Instagram, and other post-MVP providers. It covers OAuth configuration, connector registration, and sync workflows.

**Note:** Gmail is the only external provider included in MVP scope. X (Twitter) and Instagram are post-MVP features. See [`docs/integrations/gmail_setup.md`](./gmail_setup.md) for Gmail setup.

---

## Scope

This document covers:
- Supported external providers and their capabilities
- OAuth app creation for each provider
- Environment variable configuration
- Connector registration and sync workflows
- Provider-specific considerations

This document does NOT cover:
- Gmail setup (see `docs/integrations/gmail_setup.md`)
- Plaid setup (see `docs/integrations/plaid_setup.md`)
- Provider implementation details (see `src/integrations/providers/`)

---

## Supported Providers

### MVP Providers

| Provider | Capabilities | Record Types | Status |
|----------|-------------|-------------|--------|
| **Gmail** | Attachment import | FinancialRecord, TravelDocument, etc. | ✅ MVP |

**Note:** Gmail is the only external provider in MVP scope. It aligns with Tier 1 ICP needs (document import from email attachments). See [`docs/integrations/gmail_setup.md`](./gmail_setup.md) for setup instructions.

### Post-MVP Providers

| Provider | Capabilities | Record Types | Status |
|----------|-------------|-------------|--------|
| **X (Twitter)** | Media import | ImageContext, Note | ⏳ Post-MVP |
| **Instagram** | Photo import | ImageContext | ⏳ Post-MVP |
| **Plaid** | Bank transactions | transaction, account | ⏳ Post-MVP (Tier 3+ use case) |

**Rationale:** X and Instagram integrations provide media/photo import capabilities but don't align with Tier 1 ICP primary use cases (document management, financial records, travel documents). These integrations are deferred to post-MVP to focus MVP scope on core document ingestion workflows.

### Provider Capabilities

Each provider supports different capabilities:
- **Import**: Can import data from provider
- **Media**: Can import photos/videos
- **Text**: Can import text content
- **Metadata**: Can import timestamps, locations, etc.

---

## Post-MVP Provider Integrations

The following provider integrations are post-MVP and documented here for future implementation:

---

## X (Twitter) Integration (Post-MVP)

### Step 1: Create Twitter Developer Account

1. Go to https://developer.twitter.com
2. Sign in with Twitter account
3. Apply for developer access (free tier available)
4. Create a new app

### Step 2: Create Twitter App

1. In Twitter Developer Portal, go to **"Projects & Apps"** → **"Create App"**
2. **App name**: Neotoma
3. **App environment**: Development (free tier)
4. **Permissions**: Read-only (no write access needed)

### Step 3: Configure OAuth

1. Go to **"Keys and tokens"** tab
2. **OAuth 2.0 Settings**:
   - **Callback URL**: `http://localhost:8080/import/x/callback` (dev)
   - **Website URL**: `https://your-domain.com` (production)
   - **App permissions**: Read
3. **Generate keys**:
   - Copy **API Key**
   - Copy **API Secret**
   - Copy **Bearer Token** (optional, for app-only auth)

### Step 4: Environment Variables

Add to `.env.development`:

```bash
# X (Twitter) OAuth Configuration
TWITTER_CLIENT_ID=your_api_key
TWITTER_CLIENT_SECRET=your_api_secret
TWITTER_BEARER_TOKEN=your_bearer_token  # Optional
```

### Step 5: Register Connector

```bash
TOKEN=<your-bearer-token>
curl -X POST http://localhost:8080/import/x/link \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "sync_media": true,
    "max_items": 100
  }'
```

**Response:**
```json
{
  "connector_id": "uuid-here",
  "auth_url": "https://twitter.com/i/oauth2/authorize?...",
  "expires_at": "2024-01-01T12:00:00Z"
}
```

### Step 6: Complete OAuth Flow

1. Open `auth_url` from response
2. Authorize Neotoma to access Twitter account
3. Redirect to callback with authorization code
4. Backend exchanges code for access token
5. Connector registered

### Step 7: Sync Media

```bash
curl -X POST http://localhost:8080/import/x/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connector_id": "uuid-here",
    "max_items": 50
  }'
```

**What Neotoma Imports:**
- Photos from tweets (if `sync_media: true`)
- Tweet text as `Note` records (optional)
- Timestamps and metadata
- **Never imports**: DMs, private content, retweets (unless user's own)

---

## Instagram Integration (Post-MVP)

### Step 1: Create Facebook Developer Account

Instagram uses Facebook's OAuth system:

1. Go to https://developers.facebook.com
2. Sign in with Facebook account
3. Create a new app
4. Add **Instagram Basic Display** product

### Step 2: Configure Instagram App

1. **App Settings**:
   - **App name**: Neotoma
   - **App type**: Consumer
   - **Privacy Policy URL**: Required (can be placeholder for dev)
   - **Terms of Service URL**: Required (can be placeholder for dev)

2. **Instagram Basic Display**:
   - **Valid OAuth Redirect URIs**: 
     - `http://localhost:8080/import/instagram/callback` (dev)
     - `https://your-domain.com/import/instagram/callback` (production)
   - **Deauthorize Callback URL**: Same as redirect URI
   - **Data Deletion Request URL**: Optional

### Step 3: Get App Credentials

1. Go to **"Settings"** → **"Basic"**
2. Copy **App ID**
3. Copy **App Secret**
4. **Note**: App must be in "Development" mode for testing

### Step 4: Environment Variables

Add to `.env.development`:

```bash
# Instagram OAuth Configuration
INSTAGRAM_CLIENT_ID=your_app_id
INSTAGRAM_CLIENT_SECRET=your_app_secret
```

### Step 5: Register Connector

```bash
TOKEN=<your-bearer-token>
curl -X POST http://localhost:8080/import/instagram/link \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "sync_media": true,
    "max_items": 100
  }'
```

### Step 6: Complete OAuth Flow

1. Open `auth_url` from response
2. Authorize Neotoma to access Instagram account
3. Grant permissions (read media, profile)
4. Redirect to callback with authorization code
5. Backend exchanges code for access token
6. Connector registered

### Step 7: Sync Photos

```bash
curl -X POST http://localhost:8080/import/instagram/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connector_id": "uuid-here",
    "max_items": 50
  }'
```

**What Neotoma Imports:**
- User's photos (if `sync_media: true`)
- Photo metadata (captions, timestamps, locations)
- **Never imports**: Stories, reels, private content, other users' content

---

## Provider-Specific Considerations

### Rate Limits

Each provider has different rate limits:

| Provider | Rate Limit | Notes |
|----------|------------|-------|
| **Gmail** | 250 quota units/user/sec | Attachment downloads count |
| **Plaid** | 500 requests/minute | Sandbox only |
| **X (Twitter)** | 300 requests/15min | Varies by endpoint |
| **Instagram** | 200 requests/hour | Per access token |

**Best Practices:**
- Implement exponential backoff
- Cache responses when possible
- Respect rate limit headers
- Use incremental syncs (not full)

### Token Refresh

Most providers require token refresh:

- **Gmail**: Refresh tokens valid indefinitely (until revoked)
- **X (Twitter)**: Access tokens expire, refresh required
- **Instagram**: Access tokens expire after 60 days

**Neotoma Handles:**
- Automatic token refresh
- Encrypted token storage
- Error handling for expired tokens

### Privacy and Permissions

**Neotoma Requests:**
- **Read-only** permissions (never write)
- **User-specific** data only (never other users' content)
- **Explicit consent** required (OAuth flow)

**User Control:**
- User can revoke access via provider settings
- User controls what data is synced (filters, limits)
- User can delete connectors at any time

---

## Troubleshooting

### Issue: "OAuth app not approved" (Instagram)

**Solution:**
- Instagram apps start in "Development" mode
- Only app admins/test users can authenticate
- Add test users in Facebook Developer Portal
- For production, submit for app review

### Issue: "Rate limit exceeded"

**Solution:**
- Check provider's rate limit documentation
- Implement exponential backoff
- Reduce `max_items` parameter
- Increase time between syncs

### Issue: "Invalid redirect URI"

**Solution:**
- Verify redirect URI matches exactly (no trailing slashes)
- Check http vs https
- Ensure port matches (8080 for local dev)
- Update provider app settings if needed

### Issue: "Token expired"

**Solution:**
- Neotoma should auto-refresh tokens
- If refresh fails, re-run OAuth flow
- Check token expiration in database
- Verify refresh token is valid

### Issue: "No data imported"

**Solution:**
- Verify OAuth permissions granted
- Check `sync_media` or other flags are set
- Verify user has content to import
- Check provider API status
- Review sync logs for errors

---

## Testing

### Sandbox/Test Mode

**X (Twitter):**
- Use development environment (free tier)
- Test with your own account
- Limited API access in free tier

**Instagram:**
- Use development mode
- Add test users in Facebook Developer Portal
- Test with test user accounts

### Verification Checklist

- [ ] OAuth flow completes successfully
- [ ] Connector registered in database
- [ ] Initial sync processes data
- [ ] Records created with correct `external_source`
- [ ] Media files downloaded (if applicable)
- [ ] Metadata preserved (timestamps, locations)
- [ ] Error handling works (rate limits, expired tokens)

---

## Agent Instructions

### When to Load This Document

Load when:
- Setting up external provider integrations
- Troubleshooting OAuth issues
- Implementing new provider support
- Debugging sync failures

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` — Privacy and explicit control principles
- `docs/integrations/gmail_setup.md` — Gmail-specific setup
- `docs/integrations/plaid_setup.md` — Plaid-specific setup
- `docs/subsystems/ingestion/ingestion.md` — Ingestion pipeline

### Constraints Agents Must Enforce

1. **Never request write permissions** — Read-only only
2. **Always encrypt OAuth tokens** — Use `CONNECTOR_SECRET_KEY`
3. **Respect user control** — Syncs only when explicitly triggered
4. **Handle rate limits** — Implement exponential backoff
5. **Never log tokens** — Redact in all logs

### Forbidden Patterns

- Storing OAuth tokens unencrypted
- Requesting write permissions
- Automatic background syncing without user trigger
- Logging OAuth tokens or credentials
- Importing other users' content
- Bypassing rate limits

