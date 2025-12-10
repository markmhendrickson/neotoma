# Plaid Integration Setup Guide
*(Bank Account Connection and Transaction Sync)*

---

## Purpose

This document provides step-by-step instructions for setting up Plaid integration in Neotoma, including sandbox configuration, Link token creation, and transaction synchronization.

---

## Scope

This document covers:
- Plaid account creation and sandbox setup
- Environment variable configuration
- Link token creation and exchange flow
- Transaction sync workflow
- Sandbox testing procedures

This document does NOT cover:
- Plaid API implementation details (see `src/integrations/plaid/`)
- Transaction normalization logic (see `src/integrations/plaid/normalizers.ts`)
- Sync service architecture (see `src/services/plaid_sync.ts`)

---

## Prerequisites

- Plaid account (free sandbox available)
- Neotoma development environment set up (see `docs/developer/getting_started.md`)
- Supabase database configured (see `docs/developer/getting_started.md`)

---

## Step 1: Create Plaid Account

1. Go to https://dashboard.plaid.com/signup
2. Sign up for free account
3. Verify email address
4. Complete onboarding (choose "Sandbox" environment)

---

## Step 2: Create Plaid Application

1. In Plaid Dashboard, go to **"Team Settings"** → **"Keys"**
2. Note your **Client ID** and **Secret** (you'll add these to `.env.development`)
3. **Environment**: Select **"Sandbox"** for development

**Sandbox Features:**
- Free, unlimited API calls
- Pre-configured test institutions
- No real bank connections
- Perfect for development and testing

---

## Step 3: Configure Environment Variables

Add to `.env.development`:

```bash
# Plaid Configuration
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=sandbox  # or 'production' for live
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US

# Optional: Webhook URL (for production)
PLAID_WEBHOOK_URL=https://your-domain.com/import/plaid/webhook
```

**Environment Options:**
- **`sandbox`**: Free testing environment (recommended for MVP development)
- **`development`**: Requires Plaid development access
- **`production`**: Live bank connections (requires production approval)

**Product Options:**
- **`transactions`**: Transaction history (required for Neotoma)
- **`balance`**: Account balances (optional)
- **`identity`**: Account holder identity (optional)

**Country Codes:**
- **`US`**: United States
- **`CA`**: Canada
- **`GB`**: United Kingdom
- Multiple: `US,CA,GB`

---

## Step 4: Verify Plaid Connection

### Test API Connection

```bash
# Using curl (replace with your credentials)
curl -X POST https://sandbox.plaid.com/link/token/create \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "your_client_id",
    "secret": "your_secret",
    "client_name": "Neotoma Test",
    "user": {"client_user_id": "test_user"},
    "products": ["transactions"],
    "country_codes": ["US"]
  }'
```

**Expected Response:**
```json
{
  "link_token": "link-sandbox-...",
  "expiration": "2024-01-01T12:00:00Z",
  "request_id": "req_..."
}
```

If you get a `link_token`, Plaid credentials are valid.

---

## Step 5: Create Link Token (Neotoma API)

### Via HTTP API

```bash
TOKEN=<your-bearer-token>
curl -X POST http://localhost:8080/import/plaid/link_token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "client_name": "Neotoma"
  }'
```

**Response:**
```json
{
  "link_token": "link-sandbox-abc123...",
  "expiration": "2024-01-01T12:00:00Z",
  "request_id": "req_xyz"
}
```

### Via MCP Tool

```json
{
  "tool": "plaid_create_link_token",
  "arguments": {
    "user_id": "user_123",
    "client_name": "Neotoma"
  }
}
```

---

## Step 6: Initialize Plaid Link (Frontend)

Plaid Link is a JavaScript library that provides the bank connection UI.

### Install Plaid Link

```html
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
```

### Initialize Link

```javascript
const handler = Plaid.create({
  token: linkToken, // from Step 5
  onSuccess: (publicToken, metadata) => {
    // Send publicToken to backend (Step 7)
    fetch('/import/plaid/exchange_public_token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        public_token: publicToken,
        trigger_initial_sync: true
      })
    })
    .then(res => res.json())
    .then(data => {
      console.log('Connected:', data.item.institution_name);
      console.log('Accounts:', data.accounts);
    });
  },
  onExit: (err, metadata) => {
    if (err) {
      console.error('Plaid Link error:', err);
    }
  }
});

// Open Plaid Link
handler.open();
```

**Sandbox Test Credentials:**
- **Username**: `user_good`
- **Password**: `pass_good`
- **Institution**: Select any test bank (e.g., "First Platypus Bank")

---

## Step 7: Exchange Public Token

After user connects via Plaid Link, exchange the `public_token` for an access token.

### Via HTTP API

```bash
curl -X POST http://localhost:8080/import/plaid/exchange_public_token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "public_token": "public-sandbox-abc123...",
    "trigger_initial_sync": true
  }'
```

**Response:**
```json
{
  "item": {
    "id": "uuid-here",
    "item_id": "item_abc123",
    "institution_id": "ins_123",
    "institution_name": "First Platypus Bank",
    "environment": "sandbox",
    "products": ["transactions"],
    "last_successful_sync": "2024-01-01T12:00:00Z"
  },
  "institution": {
    "id": "ins_123",
    "name": "First Platypus Bank"
  },
  "accounts": [
    {
      "account_id": "acc_xyz",
      "name": "Checking",
      "type": "depository",
      "balances": {
        "available": 1000.00,
        "current": 1000.00
      }
    }
  ],
  "initial_sync": {
    "plaidItemId": "uuid-here",
    "addedTransactions": 50,
    "createdRecords": 50,
    "nextCursor": "cursor_abc..."
  }
}
```

**What Neotoma Stores:**
- Plaid item metadata (institution, products, environment)
- Encrypted access token (never returned in API responses)
- Sync cursor (for incremental syncs)
- **Never stores**: Bank passwords, account numbers (Plaid handles these)

---

## Step 8: Sync Transactions

### Manual Sync

```bash
# Sync specific item
curl -X POST http://localhost:8080/import/plaid/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plaid_item_id": "uuid-from-step-7",
    "force_full_sync": false
  }'

# Sync all items
curl -X POST http://localhost:8080/import/plaid/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sync_all": true
  }'
```

### Via MCP Tool

```json
{
  "tool": "plaid_sync",
  "arguments": {
    "plaid_item_id": "uuid-here",
    "force_full_sync": false
  }
}
```

**Sync Behavior:**
- **Incremental**: Only fetches new/updated transactions (uses cursor)
- **Full**: Fetches all transactions (ignores cursor)
- **Deduplication**: Uses `external_id` to prevent duplicate records

---

## How Plaid Sync Works

### Transaction Normalization

1. **Fetch transactions** from Plaid API
2. **Normalize to Neotoma records**:
   - `type: "transaction"`
   - `properties.account_id`: Plaid account ID
   - `properties.amount`: Transaction amount (negative for debits)
   - `properties.date`: Transaction date (ISO 8601)
   - `properties.merchant`: Merchant name (if available)
   - `properties.category`: Transaction category
   - `external_source: "plaid"`
   - `external_id`: Plaid transaction ID
3. **Create account records** (if not exists):
   - `type: "account"`
   - `properties.account_id`: Plaid account ID
   - `properties.name`: Account name
   - `properties.type`: Account type (checking, savings, etc.)
   - `properties.balance`: Current balance
4. **Insert into graph** with entity resolution (merchants → entities)

### Incremental Sync

- **Cursor-based**: Plaid provides `next_cursor` for pagination
- **Stored in database**: `plaid_items.cursor` field
- **Resume capability**: Can resume from last cursor if sync interrupted

---

## Sandbox Testing

### Test Institutions

Plaid Sandbox provides pre-configured test banks:
- **First Platypus Bank** (recommended)
- **First Gringotts Bank**
- **BofA (Bank of America)**
- Many others

### Test Credentials

**Standard Test User:**
- Username: `user_good`
- Password: `pass_good`
- Result: Success, multiple accounts

**Error Scenarios:**
- Username: `user_good`, Password: `pass_bad` → Invalid credentials
- Username: `user_locked`, Password: `pass_good` → Account locked

### Test Transactions

Sandbox institutions have pre-populated transactions:
- Various amounts and dates
- Different merchants and categories
- Mix of debits and credits

**View Test Data:**
- Go to Plaid Dashboard → **"Sandbox"** → **"Test Data"**
- See all test transactions for sandbox institutions

---

## Troubleshooting

### Issue: "invalid_client_id" or "invalid_secret"

**Solution:**
- Verify `PLAID_CLIENT_ID` and `PLAID_SECRET` in `.env.development`
- Check for extra spaces or quotes
- Ensure using sandbox credentials (not production)

### Issue: "link_token expired"

**Solution:**
- Link tokens expire after 4 hours
- Create new link token before each Plaid Link session
- Don't reuse link tokens

### Issue: "item_not_found" when syncing

**Solution:**
- Verify `plaid_item_id` exists in database
- Check `plaid_items` table: `SELECT * FROM plaid_items WHERE id = 'uuid'`
- Ensure item wasn't deleted or revoked

### Issue: "transactions not syncing"

**Solution:**
- Verify `PLAID_PRODUCTS` includes `transactions`
- Check Plaid Dashboard for API errors
- Verify access token hasn't expired (refresh if needed)
- Check sync cursor (may need full sync)

### Issue: "rate limit exceeded"

**Solution:**
- Plaid Sandbox: 500 requests/minute
- Implement exponential backoff
- Reduce sync frequency
- Use incremental syncs (not full)

### Issue: "institution not available"

**Solution:**
- Sandbox: Only test institutions available
- Production: Institution must support Plaid
- Check `PLAID_COUNTRY_CODES` matches institution country

---

## Security Considerations

### Access Token Storage

- **Encrypted**: Access tokens stored encrypted in database
- **Never returned**: API responses never include access tokens
- **Automatic refresh**: Neotoma handles token refresh automatically

### Data Privacy

- **No passwords stored**: Plaid handles authentication
- **No account numbers**: Plaid provides account IDs only
- **User control**: User explicitly connects accounts
- **Revocable**: User can disconnect via Plaid Dashboard

---

## Production Migration

### Moving from Sandbox to Production

1. **Request Production Access:**
   - Go to Plaid Dashboard → **"Access"**
   - Submit production access request
   - Wait for approval (typically 1-2 business days)

2. **Update Environment Variables:**
   ```bash
   PLAID_ENV=production
   PLAID_CLIENT_ID=<production-client-id>
   PLAID_SECRET=<production-secret>
   ```

3. **Update Redirect URIs:**
   - Add production redirect URI in Plaid Dashboard
   - Update `PLAID_WEBHOOK_URL` if using webhooks

4. **Test with Real Bank:**
   - Use your own bank account for testing
   - Verify transactions sync correctly
   - Check error handling

---

## Agent Instructions

### When to Load This Document

Load when:
- Setting up Plaid integration for development
- Troubleshooting Plaid connection issues
- Implementing Plaid sync features
- Testing transaction normalization

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` — Privacy and explicit control principles
- `docs/subsystems/ingestion/ingestion.md` — Ingestion pipeline
- `README.md` — Additional Plaid walkthrough details

### Constraints Agents Must Enforce

1. **Never store access tokens unencrypted** — Always encrypt
2. **Never return access tokens in API responses** — Redact completely
3. **Respect user control** — Syncs only when explicitly triggered
4. **Handle token refresh** — Automatic refresh when expired
5. **Deduplicate transactions** — Use `external_id` to prevent duplicates

### Forbidden Patterns

- Storing Plaid access tokens in plain text
- Returning access tokens in API responses
- Automatic background syncing without user trigger
- Logging access tokens or credentials
- Creating duplicate transaction records







