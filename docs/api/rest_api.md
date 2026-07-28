# REST API Reference

_(HTTP Endpoints for Frontend and External Clients)_

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

## Base URL

**Development:**

```
http://localhost:3080
```

**Production:**

```
https://neotoma.fly.dev
```

## Authentication

All endpoints (except `/health`, `/openapi.yaml`, and MCP OAuth public endpoints) require Bearer token authentication:

```http
Authorization: Bearer <NEOTOMA_BEARER_TOKEN>
```

**Token Configuration:**

- Set via `NEOTOMA_BEARER_TOKEN` environment variable (preferred) or legacy `ACTIONS_BEARER_TOKEN`
- Use strong random token in production
- Never commit tokens to git
- When encryption is enabled (`NEOTOMA_ENCRYPTION_ENABLED=true`), use the key-derived MCP token instead: `neotoma auth mcp-token`

## MCP OAuth Endpoints

OAuth endpoints for MCP client authentication (no bearer token required for public endpoints).

### Initiate OAuth Flow

Start OAuth authorization flow for MCP client.

**Endpoint:** `POST /mcp/oauth/initiate`

**Request:**

```json
{
  "connection_id": "cursor-2025-01-21-abc123",
  "client_name": "Cursor"
}
```

**Parameters:**

- `connection_id`: Unique identifier for this connection (required)
- `client_name`: Name of MCP client (optional, e.g., "Cursor", "Claude Code")

**Response:** `200 OK`

```json
{
  "auth_url": "https://your-server/mcp/oauth/authorize?...",
  "connection_id": "cursor-2025-01-21-abc123",
  "expires_at": "2025-01-21T10:10:00Z"
}
```

**Errors:**

- `400`: Missing or invalid connection_id
- `500`: Failed to create OAuth state

### OAuth Callback

Handles OAuth authorization callback.

**Endpoint:** `GET /mcp/oauth/callback`

**Query Parameters:**

- `code`: Authorization code from OAuth provider (required)
- `state`: OAuth state token (required)

**Response:** Redirects to frontend with connection status

- Success: `{FRONTEND_URL}/mcp-setup?connection_id={id}&status=success`
- Error: `{FRONTEND_URL}/mcp-setup?status=error&error={message}`

**Errors:**

- `400`: Missing code or state
- `500`: Token exchange or storage failed

### Get Connection Status

Check status of MCP OAuth connection.

**Endpoint:** `GET /mcp/oauth/status`

**Query Parameters:**

- `connection_id`: Connection identifier (required)

**Response:** `200 OK`

```json
{
  "status": "active",
  "connection_id": "cursor-2025-01-21-abc123"
}
```

**Status Values:**

- `pending`: OAuth flow initiated but not completed
- `active`: Connection active and ready to use
- `expired`: Connection revoked or OAuth flow timed out

**Errors:**

- `400`: Missing connection_id
- `500`: Failed to query status

### List MCP Connections

List user's active MCP OAuth connections (authenticated).

**Endpoint:** `GET /mcp/oauth/connections`

**Headers:**

```http
Authorization: Bearer <SESSION_TOKEN>
```

**Response:** `200 OK`

```json
{
  "connections": [
    {
      "connectionId": "cursor-2025-01-21-abc123",
      "clientName": "Cursor",
      "createdAt": "2025-01-21T10:00:00Z",
      "lastUsedAt": "2025-01-21T11:30:00Z"
    }
  ]
}
```

**Errors:**

- `401`: Missing or invalid bearer token
- `500`: Failed to fetch connections

### Revoke MCP Connection

Revoke an OAuth connection (authenticated).

**Endpoint:** `DELETE /mcp/oauth/connections/:connection_id`

**Headers:**

```http
Authorization: Bearer <SESSION_TOKEN>
```

**Response:** `200 OK`

```json
{
  "success": true
}
```

**Errors:**

- `401`: Missing or invalid bearer token
- `500`: Failed to revoke connection

## Core Record Operations

**Use MCP actions instead:**

- `store()` - For [storing](#storing) [source](#source) (unstructured files or structured data)
- `correct()` - For corrections
- `merge_entities()` - For entity merging
- `retrieve_entities()` - For querying entities
- See `docs/specs/MCP_SPEC.md` for complete MCP action reference

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
      "properties": { "text": "Meeting notes", "tags": ["important"] }
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
curl -X POST http://localhost:3080/upload_file \
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
  "file_urls": ["/api/files/uuid/document.pdf"],
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
  "url": "/api/files/uuid/document.pdf?token=...",
  "expires_at": "2024-01-01T14:00:00Z"
}
```

**Errors:**

- `400`: Invalid request (missing `file_path`)
- `404`: File not found
- `401`: Missing or invalid bearer token

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

### Usage Statistics

Get aggregate usage statistics for the authenticated user. Powers the Neotoma Inspector dashboard summary tiles. Figures are computed on each request from live data — no server-side cache.

**Endpoint:** `GET /usage`

**Authentication:** Required — Bearer token, AAuth grant, or MCP OAuth token. Guest principals are rejected with `401`.

**Query parameters:**

| Parameter | Type        | Required | Description                                                                            |
| --------- | ----------- | -------- | -------------------------------------------------------------------------------------- |
| `user_id` | UUID string | No       | Must match authenticated user if supplied. AAuth-admitted agents cannot override this. |

**Request:**

```http
GET /usage HTTP/1.1
Authorization: Bearer <NEOTOMA_BEARER_TOKEN>
```

**curl example:**

```bash
curl -s \
  -H "Authorization: Bearer $NEOTOMA_BEARER_TOKEN" \
  http://localhost:3080/usage | jq .
```

**Response:** `200 OK`

```json
{
  "entities_by_type": {
    "conversation": 214,
    "task": 156,
    "contact": 88
  },
  "total_entities": 500,
  "observations_by_source": {
    "human": 310,
    "llm_summary": 140,
    "sensor": 50
  },
  "total_observations": 500,
  "entities_created_last_7_days": 34,
  "entities_created_last_30_days": 112,
  "entity_types_with_schema": 6,
  "entity_types_total": 10,
  "last_updated": "2026-06-19T09:00:00.000Z"
}
```

**Response fields:**

| Field                           | Type                     | Description                                                                                   |
| ------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `entities_by_type`              | `Record<string, number>` | Active entity counts per type, sorted by count descending.                                    |
| `total_entities`                | `number`                 | Total active (non-merged) entities.                                                           |
| `observations_by_source`        | `Record<string, number>` | Observation counts per `observation_source`; unsourced rows appear as `"unclassified"`.       |
| `total_observations`            | `number`                 | Total observations.                                                                           |
| `entities_created_last_7_days`  | `number`                 | Entities created within the last 7 days.                                                      |
| `entities_created_last_30_days` | `number`                 | Entities created within the last 30 days.                                                     |
| `entity_types_with_schema`      | `number`                 | Distinct entity types present in the data that also have an active registered schema.         |
| `entity_types_total`            | `number`                 | Total distinct entity types present across all active entities.                               |
| `last_updated`                  | `string` (ISO-8601)      | Timestamp when these aggregates were computed (reflects request time, not a cache watermark). |

**Error responses:**

| Status | `error_code`      | Cause                                                    |
| ------ | ----------------- | -------------------------------------------------------- |
| `401`  | `AUTH_REQUIRED`   | Missing or invalid token; guest principal.               |
| `403`  | `FORBIDDEN`       | `user_id` query param does not match authenticated user. |
| `500`  | `DB_QUERY_FAILED` | Database query failure.                                  |

**OpenAPI:** `operationId: getUsage` — see `openapi.yaml` and `src/shared/openapi_types.ts` (`UsageStats` schema).

**CLI equivalent:** `neotoma request --operation getUsage`

**See also:** [`docs/subsystems/usage_digest.md`](../subsystems/usage_digest.md#usage-http-api-endpoint) for the full endpoint reference including the distinction between `/usage` HTTP aggregates and `usage_digest` telemetry entities.

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

## Rate Limiting

**Current Limits (MVP):**

- No explicit rate limiting (post-MVP feature)
- Recommended: <100 requests/second per client
  **Future Limits:**
- Per-user rate limits
- Per-endpoint rate limits
- Rate limit headers in responses

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
