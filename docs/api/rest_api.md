# REST API Reference
*(HTTP Endpoints for Frontend and External Clients)*

---

## Purpose

This document provides a complete reference for Neotoma's REST API endpoints. It complements the MCP specification by documenting HTTP-based access for frontend applications and external integrations.

---

## Scope

This document covers:
- All HTTP endpoints and their parameters
- Request/response formats
- Authentication requirements
- Error handling
- Rate limiting

This document does NOT cover:
- MCP tools (see `docs/specs/MCP_SPEC.md`)
- WebSocket connections
- Internal service-to-service communication

---

## Base URL

**Development:**
```
http://localhost:8080
```

**Production:**
```
https://neotoma.fly.dev
```

---

## Authentication

All endpoints (except `/health` and `/openapi.yaml`) require Bearer token authentication:

```http
Authorization: Bearer <ACTIONS_BEARER_TOKEN>
```

**Token Configuration:**
- Set via `ACTIONS_BEARER_TOKEN` environment variable
- Use strong random token in production
- Never commit tokens to git

---

## Core Record Operations

### Store Record

Create a new record.

**Endpoint:** `POST /store_record`

**Request:**
```json
{
  "type": "note",
  "properties": {
    "text": "Hello, Neotoma!",
    "tags": ["important"]
  },
  "file_urls": ["https://example.com/file.pdf"],
  "embedding": [0.1, 0.2, ...]  // Optional, 1536 dimensions
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid-here",
  "type": "note",
  "properties": {
    "text": "Hello, Neotoma!",
    "tags": ["important"]
  },
  "file_urls": ["https://example.com/file.pdf"],
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

**Errors:**
- `400`: Invalid request (missing `type` or `properties`)
- `401`: Missing or invalid bearer token
- `500`: Server error

---

### Store Records (Bulk)

Create multiple records (1-100).

**Endpoint:** `POST /store_records`

**Request:**
```json
{
  "records": [
    {
      "type": "note",
      "properties": {"text": "Note 1"}
    },
    {
      "type": "note",
      "properties": {"text": "Note 2"}
    }
  ]
}
```

**Response:** `201 Created`
```json
[
  {
    "id": "uuid-1",
    "type": "note",
    "properties": {"text": "Note 1"},
    "created_at": "2024-01-01T12:00:00Z"
  },
  {
    "id": "uuid-2",
    "type": "note",
    "properties": {"text": "Note 2"},
    "created_at": "2024-01-01T12:00:00Z"
  }
]
```

**Errors:**
- `400`: Invalid request (empty array or >100 records)
- `401`: Missing or invalid bearer token

---

### Update Record

Update existing record properties or files.

**Endpoint:** `POST /update_record`

**Request:**
```json
{
  "id": "uuid-here",
  "properties": {
    "text": "Updated text",
    "tags": ["updated", "important"]
  },
  "file_urls": ["https://example.com/new-file.pdf"]
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid-here",
  "type": "note",
  "properties": {
    "text": "Updated text",
    "tags": ["updated", "important"]
  },
  "file_urls": ["https://example.com/new-file.pdf"],
  "updated_at": "2024-01-01T13:00:00Z"
}
```

**Note:** `type` and `raw_text` cannot be updated (immutable).

**Errors:**
- `400`: Invalid request (missing `id`)
- `404`: Record not found
- `401`: Missing or invalid bearer token

---

### Retrieve Records

Query records with filters and search.

**Endpoint:** `POST /retrieve_records`

**Request:**
```json
{
  "type": "note",
  "properties": {
    "tags": ["important"]
  },
  "search": ["meeting", "notes"],
  "search_mode": "both",
  "limit": 20,
  "offset": 0,
  "include_total_count": true
}
```

**Response:** `200 OK`
```json
{
  "records": [
    {
      "id": "uuid-1",
      "type": "note",
      "properties": {"text": "Meeting notes", "tags": ["important"]}
    }
  ],
  "total_count": 42
}
```

**Parameters:**
- `type`: Filter by record type (optional)
- `properties`: Filter by property values (optional, JSON object)
- `search`: Array of search terms (optional)
- `search_mode`: `"keyword"`, `"semantic"`, or `"both"` (default: `"both"`)
- `limit`: Maximum results (default: 100, max: 1000)
- `offset`: Pagination offset (default: 0)
- `include_total_count`: Include total count in response (default: false)

**Errors:**
- `400`: Invalid request (invalid search_mode)
- `401`: Missing or invalid bearer token

---

### Delete Record

Delete a single record.

**Endpoint:** `POST /delete_record`

**Request:**
```json
{
  "id": "uuid-here"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "id": "uuid-here"
}
```

**Errors:**
- `400`: Invalid request (missing `id`)
- `404`: Record not found
- `401`: Missing or invalid bearer token

---

### Delete Records (Bulk)

Delete multiple records (1-100).

**Endpoint:** `POST /delete_records`

**Request:**
```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "deleted_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "failed_ids": []
}
```

**Errors:**
- `400`: Invalid request (empty array or >100 IDs)
- `401`: Missing or invalid bearer token

---

## File Operations

### Upload File

Upload a file and optionally create/update a record.

**Endpoint:** `POST /upload_file`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file`: File to upload (required)
- `record_id`: Existing record ID to attach file to (optional)
- `properties`: JSON string of properties (optional)
- `bucket`: Storage bucket name (optional, default: `files`)

**Request Example:**
```bash
curl -X POST http://localhost:8080/upload_file \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf" \
  -F "properties={\"title\":\"My Document\"}"
```

**Response:** `201 Created` or `200 OK`
```json
{
  "id": "uuid-here",
  "type": "pdf_document",
  "properties": {
    "title": "My Document",
    "file_name": "document.pdf",
    "file_size": 102400
  },
  "file_urls": ["https://storage.supabase.co/files/uuid/document.pdf"],
  "created_at": "2024-01-01T12:00:00Z"
}
```

**Behavior:**
- If `record_id` provided: Attach file to existing record
- If `record_id` omitted: Auto-analyze file and create new record
- CSV files: Create one record per row

**Errors:**
- `400`: Invalid file (too large, unsupported type)
- `401`: Missing or invalid bearer token
- `413`: File too large (>50MB)

---

### Get File URL

Generate signed URL for file access.

**Endpoint:** `GET /get_file_url`

**Query Parameters:**
- `file_path`: Path to file in storage (required)
- `expires_in`: URL expiration in seconds (optional, default: 3600)

**Request:**
```http
GET /get_file_url?file_path=files/uuid/document.pdf&expires_in=7200
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "url": "https://storage.supabase.co/files/uuid/document.pdf?token=...",
  "expires_at": "2024-01-01T14:00:00Z"
}
```

**Errors:**
- `400`: Invalid request (missing `file_path`)
- `404`: File not found
- `401`: Missing or invalid bearer token

---

## Integration Endpoints

### Plaid Integration

See `docs/integrations/plaid_setup.md` for detailed setup.

**Endpoints:**
- `POST /import/plaid/link_token` - Create Link token
- `POST /import/plaid/exchange_public_token` - Exchange public token
- `POST /import/plaid/sync` - Trigger sync
- `GET /import/plaid/items` - List connected items
- `GET /import/plaid/link_demo` - Demo page

---

### External Provider Integration

**Endpoints:**
- `GET /import/providers` - List supported providers
- `POST /import/:provider/link` - Register connector
- `POST /import/:provider/sync` - Trigger sync
- `POST /import/:provider/webhook` - Receive webhooks
- `GET /connectors` - List registered connectors

See `docs/integrations/external_providers.md` for details.

---

## Utility Endpoints

### Health Check

Check if server is running.

**Endpoint:** `GET /health`

**Request:**
```http
GET /health
```

**Response:** `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**No authentication required.**

---

### OpenAPI Specification

Get OpenAPI spec for API documentation.

**Endpoint:** `GET /openapi.yaml`

**Request:**
```http
GET /openapi.yaml
```

**Response:** `200 OK`
```yaml
openapi: 3.0.0
info:
  title: Neotoma API
  version: 1.0.0
...
```

**No authentication required.**

---

## Error Responses

All errors follow this format:

```json
{
  "error_code": "INGESTION_FILE_TOO_LARGE",
  "message": "File exceeds maximum size of 50MB",
  "details": {
    "file_size": 52428800,
    "max_size": 52428800
  },
  "trace_id": "trace-uuid",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**HTTP Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad Request (client error)
- `401`: Unauthorized (missing/invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (duplicate record)
- `413`: Payload Too Large
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error
- `503`: Service Unavailable

See `docs/reference/error_codes.md` for complete error code reference.

---

## Rate Limiting

**Current Limits (MVP):**
- No explicit rate limiting (post-MVP feature)
- Recommended: <100 requests/second per client

**Future Limits:**
- Per-user rate limits
- Per-endpoint rate limits
- Rate limit headers in responses

---

## Pagination

Use `limit` and `offset` for pagination:

```json
{
  "limit": 20,
  "offset": 0
}
```

**Best Practices:**
- Use `limit` ≤ 100 for optimal performance
- Use `include_total_count: true` for UI pagination
- Implement cursor-based pagination (post-MVP)

---

## Agent Instructions

### When to Load This Document

Load when:
- Implementing frontend API calls
- Integrating external clients
- Debugging API issues
- Understanding request/response formats

### Required Co-Loaded Documents

- `docs/specs/MCP_SPEC.md` — MCP tool equivalents
- `docs/reference/error_codes.md` — Error code reference
- `docs/subsystems/errors.md` — Error handling patterns

### Constraints Agents Must Enforce

1. **Always include Authorization header** — Except `/health` and `/openapi.yaml`
2. **Validate request format** — Check required fields
3. **Handle errors gracefully** — Check error_code, not just HTTP status
4. **Respect rate limits** — Implement exponential backoff
5. **Use pagination** — Don't fetch all records at once

### Forbidden Patterns

- Calling endpoints without authentication (except health/openapi)
- Ignoring error responses
- Fetching unlimited records (use pagination)
- Hardcoding bearer tokens in frontend code
- Bypassing rate limits






