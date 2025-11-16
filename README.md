# Neotoma

Model Context Protocol server for extensible object storage and file management with ChatGPT Actions integration.

## Overview

This MCP server extends ChatGPT's contextual memory by providing flexible storage for any data type with extensible properties. It uses Supabase (PostgreSQL + Storage) for fast CRUD operations and supports:

- **Extensible object types**: transactions, exercise sets, notes, messages, photos, videos, etc.
- **Unstructured properties**: JSONB storage for any key-value pairs
- **File/blob storage**: Associated files with each object
- **Flexible querying**: Filter by type and any property value
- **Sub-200ms operations**: Fast responses for ChatGPT Actions

## Architecture

**Tech Stack**:
- TypeScript/Node.js with MCP SDK
- Supabase (PostgreSQL with JSONB + Storage)
- Indexed queries for performance

**Database Schema**:
- Single `records` table with `id`, `type`, `properties` (JSONB), `file_urls`, `created_at`, `updated_at`
- GIN indexes on `type` and `properties` for fast filtering

---

## End-to-end Setup

### 1) Create Supabase Project
- Go to https://supabase.com and sign in
- Click "New Project"
- Name it (e.g., `neotoma`), choose a region close to you
- Save the database password; wait ~2 minutes for provisioning

### 2) Run Database Schema
- In the project dashboard, open "SQL Editor"
- Create a new query and paste the contents of `supabase/schema.sql`
- Run it to create the `records` table, indexes, triggers, enable extensions, and apply RLS policies

### 3) Create Storage Bucket
- In Supabase → Storage, click "New bucket"
- Name: `files`
- Public bucket: YES

### 4) Environment Variables

#### Option A: Separate Environment Files (Recommended)

Create separate `.env` files for each environment:

**`.env.development`** (for local development and automated tests):
```bash
DEV_SUPABASE_URL=your_dev_supabase_project_url
DEV_SUPABASE_SERVICE_KEY=your_dev_supabase_service_role_key
ACTIONS_BEARER_TOKEN=your_bearer_token_for_chatgpt_actions
# Plaid sandbox / production credentials
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
```

**`.env.production`** (for production):
```bash
PROD_SUPABASE_URL=your_prod_supabase_project_url
PROD_SUPABASE_SERVICE_KEY=your_prod_supabase_service_role_key
ACTIONS_BEARER_TOKEN=your_production_bearer_token
```

#### Option B: Single `.env` File with Prefixes

Alternatively, use a single `.env` file with environment-specific prefixes:

```bash
# Development/Testing (same environment)
DEV_SUPABASE_URL=your_dev_supabase_project_url
DEV_SUPABASE_SERVICE_KEY=your_dev_supabase_service_role_key

# Production
PROD_SUPABASE_URL=your_prod_supabase_project_url
PROD_SUPABASE_SERVICE_KEY=your_prod_supabase_service_role_key

ACTIONS_BEARER_TOKEN=your_bearer_token_for_chatgpt_actions
```

#### Option C: Generic Configuration (Backward Compatible)

For backward compatibility, you can still use generic variables (applies to all environments):

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
ACTIONS_BEARER_TOKEN=your_bearer_token_for_chatgpt_actions
# Plaid (used for all environments when prefixed values are absent)
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
```

**Priority:** Environment-specific files (e.g., `.env.development`) load first, then `.env` as fallback. Within each file, prefixed variables (e.g., `DEV_SUPABASE_URL`) take precedence over generic ones (`SUPABASE_URL`).

**Environment Detection:**
- `NODE_ENV=production` → Loads `.env.production` then `.env` (uses `PROD_*` variables)
- Otherwise (including `NODE_ENV=test`) → Loads `.env.development` then `.env` (uses `DEV_*` or generic variables)

**Optional Variables:**
```bash
PORT=3000                 # MCP stdio server port (default: 3000)
HTTP_PORT=8080           # HTTP Actions server port (default: 8080)
ACTIONS_BEARER_TOKEN=dev-token-or-random
PLAID_PRODUCTS=transactions,balance
PLAID_COUNTRY_CODES=US,CA
PLAID_WEBHOOK_URL=https://example.com/plaid/webhook
```

### 5) Install Dependencies and Verify
```
npm install
npm test   # runs live queries against Supabase
```

---

## Running Locally

### MCP (stdio) for MCP clients (e.g., ChatGPT Atlas)
- Export env (macOS): `export SUPABASE_URL=...; export SUPABASE_SERVICE_KEY=...`
- Ensure `.mcp.json` exists with the `neotoma` server entry
- Start MCP server: `npm run dev`
- Your MCP client will launch the server via stdio and expose its tools

### HTTP Actions server (for ChatGPT Actions / HTTP clients)
- Start: `npm run dev:http`
- Logs: `HTTP Actions listening on :<HTTP_PORT>`
- Public unauthenticated routes for convenience:
  - `GET /openapi.yaml` (serves the spec)
  - `GET /health` (simple readiness check)
- Auth: all other routes require `Authorization: Bearer <ACTIONS_BEARER_TOKEN>`

### CSV Uploader UI

- Visit `http://localhost:8080/`.
- Set API base and bearer token in the header.
- Workflow: Select CSV → Parse → Normalize Preview → Finalize (chunked saves).
- Endpoints used: `GET /types`, `POST /groom/preview`, `POST /groom/finalize`.

### API Sandbox UI

- Visit `http://localhost:8080/sandbox`.
- Set API base and bearer token in the header.
- Select any endpoint from the dropdown to view dynamically generated form fields based on the OpenAPI spec.
- Fill in parameters and request body fields, then execute requests to test endpoints.
- View formatted request and response payloads with syntax highlighting.

#### Expose the API via Cloudflare Tunnel (optional)

Need to call the API from external clients (ChatGPT, mobile device)? Start the server then tunnel it:

```bash
npm run dev:http
cloudflared tunnel --url http://localhost:8080
```

Use the tunnel URL as your API base. Update the sandbox UI, Plaid demo link (`https://<tunnel>/import/plaid/link_demo?token=${ACTIONS_BEARER_TOKEN}`), or any remote client accordingly.

##### Custom domain via Cloudflare

If you own a domain managed by Cloudflare:

1. Create a named tunnel: `cloudflared tunnel create neotoma`
2. Route your domain/subdomain: `cloudflared tunnel route dns neotoma dev.neotoma.io`
3. Create `~/.cloudflared/neotoma.yml` containing:
   ```yaml
   url: http://localhost:8080
   tunnel: neotoma
   credentials-file: ~/.cloudflared/<tunnel-id>.json
   ```
4. Run the tunnel: `cloudflared tunnel run neotoma`

Now your API is reachable at `https://dev.neotoma.io`, so update the sandbox UI and Plaid demo link to `https://dev.neotoma.io/import/plaid/link_demo?token=${ACTIONS_BEARER_TOKEN}`.

### Plaid Integration

Neotoma can sync bank accounts and transactions from Plaid into standardized `account` and `transaction` records.

- **Environment**: Only runs when Plaid credentials are configured. Sandbox support is built-in; set `PLAID_ENV=sandbox` for local development.
- **Storage**: Access tokens, metadata, and sync cursors live in `plaid_items`. Sync executions are tracked in `plaid_sync_runs`.
- **Normalization**: Records created via Plaid include canonical identifiers (`external_id`), institution metadata, and denormalized balances for downstream consumers.

### Walkthrough: Connecting a Bank Account and Syncing Data

#### Prerequisites

Ensure Plaid credentials are configured in your environment:
```bash
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox  # or 'production'
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
```

#### Step 1: Create a Link Token

Create a Plaid Link token for your user. This token is used by Plaid Link (client-side) to initiate the bank connection flow.

```bash
TOKEN=<your_bearer_token>
curl -X POST http://localhost:8080/plaid/link_token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "client_name": "My App"
  }'
```

Response:
```json
{
  "link_token": "link-sandbox-abc123...",
  "expiration": "2024-01-01T12:00:00Z",
  "request_id": "req_xyz"
}
```

#### Step 2: Initialize Plaid Link (Client-Side)

Use the `link_token` with Plaid Link in your frontend application. Plaid Link is a JavaScript library that provides a secure UI for users to select and connect their bank accounts.

**Note**: You'll need to integrate Plaid Link in your frontend. See [Plaid Link documentation](https://plaid.com/docs/link/) for details. The basic flow:

1. Load Plaid Link script: `<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>`
2. Initialize Link with your `link_token`
3. When user successfully connects, Plaid Link will call your `onSuccess` callback with a `public_token`

Example client-side code:
```javascript
const handler = Plaid.create({
  token: linkToken, // from Step 1
  onSuccess: (publicToken, metadata) => {
    // Send publicToken to your backend (Step 3)
    fetch('/plaid/exchange_public_token', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ public_token: publicToken })
    });
  }
});
handler.open();
```

#### Step 3: Exchange Public Token

Exchange the `public_token` from Plaid Link for an access token and persist the Plaid item. Optionally trigger an initial sync.

```bash
curl -X POST http://localhost:8080/plaid/exchange_public_token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "public_token": "public-sandbox-abc123...",
    "trigger_initial_sync": true
  }'
```

Response includes:
- `item`: Stored Plaid item metadata (without access token)
- `institution`: Bank/institution information
- `accounts`: List of connected accounts with balances
- `initial_sync`: Sync summary if `trigger_initial_sync` was true

Example response:
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

#### Step 4: Sync Data (Manual)

If you didn't trigger initial sync in Step 3, or to sync updates later, manually trigger a sync:

```bash
# Sync a specific item by plaid_item_id
curl -X POST http://localhost:8080/plaid/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plaid_item_id": "uuid-from-step-3",
    "force_full_sync": false
  }'

# Or sync all items
curl -X POST http://localhost:8080/plaid/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sync_all": true
  }'
```

#### Step 5: Retrieve Synced Records

Query the synced `account` and `transaction` records:

```bash
# Get all accounts
curl -X POST http://localhost:8080/retrieve_records \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "account",
    "limit": 100
  }'

# Get transactions for a specific account
curl -X POST http://localhost:8080/retrieve_records \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "transaction",
    "properties": {
      "account_id": "acc_xyz"
    },
    "limit": 100
  }'
```

#### Step 6: List Connected Items

View all stored Plaid items (metadata only, no access tokens):

```bash
curl -X GET "http://localhost:8080/plaid/items?plaid_item_id=uuid-here" \
  -H "Authorization: Bearer $TOKEN"

# Or list all items
curl -X GET http://localhost:8080/plaid/items \
  -H "Authorization: Bearer $TOKEN"
```

#### Using the Sandbox UI

You can also use the API Sandbox UI (`http://localhost:8080/sandbox`) to test these endpoints interactively:
1. Set your API base URL and bearer token
2. Select a Plaid endpoint from the dropdown
3. Fill in the form fields (dynamically generated from OpenAPI spec)
4. Execute and view the response

### MCP tools

- `plaid_create_link_token` → Create a Plaid Link token without exposing secrets.
- `plaid_exchange_public_token` → Exchange link tokens, persist `plaid_items`, optionally start a full sync.
- `plaid_sync` → Trigger manual syncs (single item or all).
- `plaid_list_items` → Inspect stored Plaid items (metadata only—no access tokens).

### HTTP endpoints

| Method | Path | Purpose | Tests |
|--------|------|---------|-------|
| `POST` | `/import/plaid/link_token` | Create link tokens for Plaid Link | `src/integrations/plaid/plaid.integration.test.ts` (token exchange) |
| `POST` | `/import/plaid/exchange_public_token` | Persist Plaid items and (optionally) run initial sync | `src/integrations/plaid/plaid.integration.test.ts`, `src/services/plaid_sync.test.ts` |
| `POST` | `/import/plaid/sync` | Manually trigger Plaid sync | `src/integrations/plaid/plaid.integration.test.ts`, `src/services/plaid_sync.test.ts` |
| `POST` | `/import/plaid/preview_sync` | Preview upcoming sync counts for one or all items | — |
| `GET` | `/import/plaid/items` | Retrieve stored Plaid items | `src/services/plaid_sync.test.ts` |
| `GET` | `/import/plaid/link_demo` – Serve Plaid Link sandbox demo (append `?token=<ACTIONS_BEARER_TOKEN>` to auto-exchange the public_token and enable cached preview/sync actions) | — |

All responses omit Plaid access tokens. Errors from Plaid are normalized for safe logging.

### Running Plaid tests

The Vitest suite includes:

- `src/integrations/plaid/normalizers.test.ts` – unit coverage for normalization logic.
- `src/services/plaid_sync.test.ts` – helper coverage (redaction, metadata handling).
- `src/integrations/plaid/plaid.integration.test.ts` – live sandbox flow (skipped automatically unless Plaid sandbox credentials are configured).

Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV=sandbox` to exercise integration tests.

---

## ChatGPT Actions (chat.openai.com)

1. Host `openapi.yaml` over HTTPS (deploy or tunnel). The server also serves it at `/openapi.yaml`.
2. In GPT Builder → Actions → Import from URL, paste the OpenAPI URL.
3. Set auth to Bearer and supply `ACTIONS_BEARER_TOKEN`.

Endpoints exposed:
- POST `/store_record`
- POST `/store_records` (bulk)
- POST `/update_record`
- POST `/retrieve_records`
- POST `/delete_record`
- POST `/delete_records` (bulk)
- POST `/upload_file` (multipart/form-data; omit `record_id` to auto-create analyzed record)
- GET  `/get_file_url`

---

## Deployment (Fly.io)

Files included: `Dockerfile`, `fly.toml`.

Steps:
- Install Fly CLI: `brew install flyctl`; `fly auth login`
- Create app (one-time): `fly launch --no-deploy --name neotoma --region <closest-to-supabase>`
- Set secrets (never commit keys):
```
fly secrets set SUPABASE_URL="https://<project>.supabase.co"
fly secrets set SUPABASE_SERVICE_KEY="<service-role-key>"
fly secrets set ACTIONS_BEARER_TOKEN="<strong-random-token>"
```
- Deploy (multi-stage Dockerfile):
```
fly deploy --remote-only
```
- Verify:
```
fly status
fly logs --since 10m
curl -sS https://neotoma.fly.dev/health
curl -sS https://neotoma.fly.dev/openapi.yaml | head -n 5
```
- Update `openapi.yaml` → `servers[0].url: https://neotoma.fly.dev` and redeploy if needed

---

## API Specification (MCP tools parity)

| Tool / Endpoint | Purpose | Key Parameters | Returns | Tests |
|-----------------|---------|----------------|---------|-------|
| `store_record` | Create new record with properties and optional files | `type`, `properties`, `file_urls`, `embedding?` | Created record with ID | `src/index.test.ts` |
| `store_records` | Create multiple records in bulk (1-100) | `records` (array) | Array of created records | `src/index.test.ts` |
| `update_record` | Update existing record properties/files/embedding | `id`, `properties`, `file_urls`, `embedding?` | Updated record | `src/index.test.ts` |
| `retrieve_records` | Query records by type, property filters, or semantic search | `type`, `properties`, `limit`, `search?`, `search_mode?`, `query_embedding?`, `similarity_threshold?` | Array of matching records | `src/index.test.ts` |
| `delete_record` | Remove record and associated files | `id` | Success confirmation | `src/index.test.ts` |
| `delete_records` | Remove multiple records in bulk (1-100) | `ids` (array) | Success confirmation with deleted IDs | `src/index.test.ts` |
| `upload_file` | Upload file, attach to record, or auto-create analyzed record | `file` (multipart), `record_id?`, `properties?`, `bucket?` | Updated or newly created record | `src/index.test.ts` |
| `get_file_url` | Get signed URL for file access | `file_path`, `expires_in?` | Signed URL | `src/index.test.ts` |
| `plaid_create_link_token` | Create Plaid Link token for client-side flows | `user_id`, `client_name?`, `access_token?`, `products?`, `redirect_uri?` | Plaid link token payload | `src/integrations/plaid/plaid.integration.test.ts` |
| `plaid_exchange_public_token` | Exchange Plaid public token, persist item, optionally sync | `public_token`, `trigger_initial_sync?` | Stored item metadata + optional sync summary | `src/integrations/plaid/plaid.integration.test.ts`, `src/services/plaid_sync.test.ts` |
| `plaid_sync` | Trigger Plaid sync for one/all items | `plaid_item_id?`, `item_id?`, `sync_all?`, `force_full_sync?` | Sync summaries per item | `src/integrations/plaid/plaid.integration.test.ts`, `src/services/plaid_sync.test.ts` |
| `plaid_list_items` | List stored Plaid items (metadata only) | `plaid_item_id?`, `item_id?` | Array of Plaid items without access tokens | `src/services/plaid_sync.test.ts` |
| `plaid_preview_sync` | Preview Plaid item change counts without persisting | `plaid_item_id?`, `item_id?`, `all?` | Preview summary per item | — |
| `plaid_link_demo` | Serve Plaid Link sandbox demo page | `token` query (bearer token) | HTML page response | — |
| `chat` | Conversational interface with OpenAI function calling to query records | `messages` (array), `model?`, `temperature?` | Assistant message with optional records_queried and function_calls | — |

---

## Atlas (ChatGPT Atlas) usage

- Open Atlas at this project directory.
- Atlas reads `.mcp.json` and launches the `neotoma` server via stdio.
- Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are present in your environment before opening Atlas.
- If the GUI doesn’t inherit env on macOS, load it via:
```
set -a; source .env; set +a; open -a "ChatGPT Atlas" "$(pwd)"
# or persist for GUI apps
while IFS= read -r l; do [[ "$l" =~ ^#|^$ ]] && continue; k="${l%%=*}"; v="${l#*=}"; launchctl setenv "$k" "$v"; done < .env
open -a "ChatGPT Atlas" "$(pwd)"
```

---

## Security

- Do not commit secrets. Use `.env` locally and Fly secrets in production.
- Use a long random `ACTIONS_BEARER_TOKEN` in production.
- Supabase Storage bucket `files` is public for simple access; signed URLs via `get_file_url` are supported.

---

## Troubleshooting

- Missing env → server exits with: `Missing SUPABASE_URL or SUPABASE_SERVICE_KEY`
- 401/403 on HTTP → ensure `Authorization: Bearer <ACTIONS_BEARER_TOKEN>` header
- `npm ci` fails in Docker → lockfile mismatch; run `npm install` locally to sync and redeploy
- Port mismatch on Fly → ensure `HTTP_PORT=8080`, Dockerfile `EXPOSE 8080`, and `fly.toml` `internal_port=8080`
- Large file uploads on serverless hosts → prefer always-on Fly machine

---

## Semantic Search with Embeddings

Neotoma supports fuzzy/semantic search across record `properties` and `type` fields using vector embeddings.

### How It Works

1. **Automatic embedding generation**: If `OPENAI_API_KEY` is configured, embeddings are automatically generated for all records when storing/updating (unless explicitly provided). Embeddings are also automatically generated from search terms when using semantic search.
2. **Manual embedding**: You can optionally provide an `embedding` field (1536-dimensional array) when calling `/store_record` or `/store_records` to override automatic generation.
3. **Search with embeddings**: Use `/retrieve_records` with `search` (array of terms). If `OPENAI_API_KEY` is configured, `query_embedding` is automatically generated from search terms. Otherwise, provide `query_embedding` manually.

**Example: Storing a record (embedding auto-generated)**
```json
{
  "type": "exercise",
  "properties": { "name": "Push-ups", "sets": 3, "reps": 10 }
}
```
With `OPENAI_API_KEY` configured, the embedding is automatically generated from `type` + `properties`.

**Example: Semantic search (query_embedding auto-generated)**
```json
{
  "search": ["workout", "exercise"],
  "search_mode": "semantic",
  "similarity_threshold": 0.7,
  "limit": 10
}
```
With `OPENAI_API_KEY` configured, the `query_embedding` is automatically generated from the `search` terms.

### Search Modes

- **`semantic`**: Uses cosine similarity between embeddings (requires `query_embedding`)
- **`keyword`**: Text matching using `ILIKE` on properties and type fields
- **`both`** (default): Combines semantic and keyword results, deduplicates

### Database Setup

The schema includes pgvector support. Run the updated `supabase/schema.sql` to:
- Enable `vector` extension
- Add `embedding` column (vector(1536))
- Create vector index for fast similarity search

**Note**: For better performance at scale, consider creating a PostgreSQL function using native pgvector operators. The current implementation uses client-side cosine similarity calculation.

### Environment Variables

Add to your `.env` or `.env.development` file:
```bash
OPENAI_API_KEY=sk-your-api-key-here
```

**Why OpenAI?** The current implementation uses OpenAI's `text-embedding-3-small` model (1536 dimensions) for embeddings. This could be extended to support:
- Other cloud APIs (Cohere, Hugging Face, Anthropic, Google Vertex AI)
- Local models (Ollama, Sentence Transformers, ONNX)
- Self-hosted embedding services

Without this variable (or other provider configuration), clients must provide embeddings manually.

---

## License

MIT

