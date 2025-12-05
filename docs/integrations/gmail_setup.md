# Gmail Integration Setup Guide
*(OAuth Configuration and Attachment Import)*

---

## Purpose

This document provides step-by-step instructions for setting up Gmail integration in Neotoma, including OAuth configuration, attachment import flow, and troubleshooting.

---

## Scope

This document covers:
- Gmail OAuth app creation and configuration
- Environment variable setup
- Attachment import workflow
- Error handling and troubleshooting

This document does NOT cover:
- Gmail API implementation details (see `src/integrations/providers/gmail/`)
- External provider architecture (see `docs/subsystems/ingestion/ingestion.md`)
- Connector registration API (see `docs/specs/MCP_SPEC.md`)

---

## Prerequisites

- Google Cloud Platform account
- Gmail account with API access
- Neotoma development environment set up (see `docs/developer/getting_started.md`)

---

## Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click **"Select a project"** → **"New Project"**
3. Name: `neotoma-gmail` (or your preferred name)
4. Click **"Create"**
5. Wait for project creation (~30 seconds)

---

## Step 2: Enable Gmail API

1. In Google Cloud Console, go to **"APIs & Services"** → **"Library"**
2. Search for **"Gmail API"**
3. Click **"Gmail API"** → **"Enable"**
4. Wait for enablement (~10 seconds)

---

## Step 3: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. If prompted, configure OAuth consent screen first:
   - **User Type**: External
   - **App name**: Neotoma
   - **User support email**: Your email
   - **Developer contact**: Your email
   - **Scopes**: Add `https://www.googleapis.com/auth/gmail.readonly`
   - **Test users**: Add your Gmail address (for testing)
   - Click **"Save and Continue"** through all steps

4. **Create OAuth Client ID:**
   - **Application type**: Web application
   - **Name**: Neotoma Gmail Integration
   - **Authorized JavaScript origins**: 
     - `http://localhost:8080` (for local dev)
     - `https://your-production-domain.com` (for production)
   - **Authorized redirect URIs**:
     - `http://localhost:8080/import/gmail/callback` (for local dev)
     - `https://your-production-domain.com/import/gmail/callback` (for production)
   - Click **"Create"**

5. **Save credentials:**
   - Copy **Client ID**
   - Copy **Client Secret**
   - Store securely (you'll add these to `.env.development`)

---

## Step 4: Configure Environment Variables

Add to `.env.development`:

```bash
# Gmail OAuth Configuration
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret

# Optional: Custom redirect URI (defaults to /import/gmail/callback)
GMAIL_REDIRECT_URI=http://localhost:8080/import/gmail/callback
```

**Security Note:** Never commit these values to git. They're already in `.gitignore`.

---

## Step 5: Register Gmail Connector

### Via HTTP API

```bash
TOKEN=<your-bearer-token>
curl -X POST http://localhost:8080/import/gmail/link \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "label_filters": ["Receipts", "Travel", "Finance"]
  }'
```

**Response:**
```json
{
  "connector_id": "uuid-here",
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "expires_at": "2024-01-01T12:00:00Z"
}
```

### Via MCP Tool

```json
{
  "tool": "sync_provider_imports",
  "arguments": {
    "provider": "gmail",
    "sync_type": "link"
  }
}
```

---

## Step 6: Complete OAuth Flow

1. **Open auth URL** from Step 5 response
2. **Sign in** to Google account
3. **Grant permissions** (Gmail read-only access)
4. **Redirect** to callback URL with `code` parameter
5. **Backend exchanges code** for access token automatically
6. **Connector registered** with encrypted credentials

**What Neotoma Stores:**
- Encrypted OAuth access token (AES-256-GCM)
- Encrypted refresh token
- Connector metadata (user_id, label_filters, cursor)
- **Never stores**: Email passwords, email body content

---

## Step 7: Trigger Initial Sync

### Via HTTP API

```bash
curl -X POST http://localhost:8080/import/gmail/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connector_id": "uuid-from-step-5",
    "max_pages": 10
  }'
```

**Response:**
```json
{
  "connector_id": "uuid-here",
  "sync_id": "sync-uuid",
  "status": "completed",
  "records_created": 25,
  "attachments_processed": 25,
  "errors": []
}
```

### Via MCP Tool

```json
{
  "tool": "sync_provider_imports",
  "arguments": {
    "provider": "gmail",
    "connector_id": "uuid-here",
    "sync_type": "full",
    "max_pages": 10
  }
}
```

---

## How Gmail Import Works

### Attachment-Only Ingestion

Neotoma **only ingests attachments**, never email bodies:

1. **Query Gmail API** for messages matching label filters
2. **Extract attachments** (PDFs, images, documents)
3. **Download attachments** to temporary storage
4. **Ingest each attachment** through normal ingestion pipeline:
   - Normalize format
   - Extract raw text (OCR if needed)
   - Detect schema
   - Extract fields
   - Resolve entities
   - Generate events
   - Insert into graph
5. **Store provenance**: `external_source: "gmail"`, `external_id: "message-id"`

### Label Filters

Only messages with specified labels are processed:
- `label_filters: ["Receipts"]` → Only messages labeled "Receipts"
- `label_filters: []` → All messages (not recommended)

**Best Practice:** Use specific labels to limit scope and respect user privacy.

---

## Troubleshooting

### Issue: "OAuth consent screen not configured"

**Solution:**
- Complete OAuth consent screen setup (Step 3)
- Add test users if app is in testing mode
- Wait 5-10 minutes for changes to propagate

### Issue: "redirect_uri_mismatch"

**Solution:**
- Verify redirect URI in Google Cloud Console matches exactly
- Check for trailing slashes, http vs https
- Ensure port matches (8080 for local dev)

### Issue: "invalid_grant" when refreshing token

**Solution:**
- Token may have been revoked by user
- Re-run OAuth flow to get new tokens
- Check token expiration in database

### Issue: "insufficient permissions"

**Solution:**
- Verify Gmail API is enabled in Google Cloud Console
- Check OAuth scopes include `gmail.readonly`
- Ensure user granted permissions during OAuth flow

### Issue: "No attachments found"

**Solution:**
- Verify label filters match actual Gmail labels
- Check messages have attachments (not just inline images)
- Verify Gmail API quota not exceeded (250 quota units per user per second)

### Issue: "Rate limit exceeded"

**Solution:**
- Gmail API has strict rate limits
- Implement exponential backoff in sync logic
- Reduce `max_pages` parameter
- Wait before retrying

---

## Security Considerations

### OAuth Token Storage

- **Access tokens**: Encrypted with `CONNECTOR_SECRET_KEY` (AES-256-GCM)
- **Refresh tokens**: Encrypted with `CONNECTOR_SECRET_KEY`
- **Never logged**: Tokens never appear in logs (redacted)

### Scope Limitations

- **Read-only**: Neotoma only requests `gmail.readonly` scope
- **No email sending**: Cannot send emails or modify messages
- **No body access**: Only attachments are downloaded

### Privacy

- **User control**: User explicitly grants permissions
- **Label filtering**: User controls which messages are processed
- **No background scanning**: Syncs only when explicitly triggered

---

## Testing

### Sandbox/Test Mode

1. **Use test Gmail account** (not production)
2. **Create test labels**: "Test-Receipts", "Test-Travel"
3. **Send test emails** with attachments
4. **Label messages** appropriately
5. **Run sync** and verify records created

### Verification Checklist

- [ ] OAuth flow completes successfully
- [ ] Connector registered in database
- [ ] Initial sync processes attachments
- [ ] Records created with correct `external_source`
- [ ] No email bodies in database
- [ ] Label filters respected
- [ ] Error handling works (invalid labels, no attachments)

---

## Agent Instructions

### When to Load This Document

Load when:
- Setting up Gmail integration for development
- Troubleshooting Gmail OAuth issues
- Implementing Gmail provider features
- Debugging attachment import failures

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` — Privacy and explicit control principles
- `docs/subsystems/ingestion/ingestion.md` — Ingestion pipeline
- `docs/subsystems/privacy.md` — PII handling rules

### Constraints Agents Must Enforce

1. **Never ingest email bodies** — Only attachments
2. **Always encrypt OAuth tokens** — Use `CONNECTOR_SECRET_KEY`
3. **Respect user control** — Syncs only when explicitly triggered
4. **Never log tokens** — Redact in all logs
5. **Verify label filters** — Don't process all messages by default

### Forbidden Patterns

- Storing OAuth tokens unencrypted
- Ingesting email body content
- Automatic background syncing without user trigger
- Logging OAuth tokens or credentials
- Requesting write permissions (send, modify)




