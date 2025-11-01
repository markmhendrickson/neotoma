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
- Run it to create the `records` table, GIN indexes, and triggers

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

Quick checks:
```
curl -sS http://localhost:8080/health
curl -sS http://localhost:8080/openapi.yaml | head -n 5
TOKEN=<your token from .env>
curl -sS -X POST http://localhost:8080/store_record \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"note","properties":{"content":"hello"}}'
```

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
- POST `/upload_file` (multipart/form-data)
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

| Tool Name | Purpose | Key Parameters | Returns |
|-----------|---------|----------------|---------|
| `store_record` | Create new record with properties and optional files | `type`, `properties`, `file_urls`, `embedding?` | Created record with ID |
| `store_records` | Create multiple records in bulk (1-100) | `records` (array) | Array of created records |
| `update_record` | Update existing record properties/files/embedding | `id`, `properties`, `file_urls`, `embedding?` | Updated record |
| `retrieve_records` | Query records by type, property filters, or semantic search | `type`, `properties`, `limit`, `search?`, `search_mode?`, `query_embedding?`, `similarity_threshold?` | Array of matching records |
| `delete_record` | Remove record and associated files | `id` | Success confirmation |
| `delete_records` | Remove multiple records in bulk (1-100) | `ids` (array) | Success confirmation with deleted IDs |
| `upload_file` | Upload and associate file with record | `record_id`, `file` (multipart), `bucket?` | Updated record |
| `get_file_url` | Get signed URL for file access | `file_path`, `expires_in?` | Signed URL |

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

ISC

