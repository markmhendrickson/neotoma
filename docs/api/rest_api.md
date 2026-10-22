# REST API reference

How to call Neotoma's HTTP API: base URL, authentication, the MCP OAuth endpoints, a few utility routes, and where the full route list lives.

Applies to v0.25.0 and main. The full route list is [`openapi.yaml`](../../openapi.yaml): 112 paths on main and 109 in v0.25.0 (main adds `/corrections/transaction`, `/entities/{id}/batch_correct`, and `/patch_array_item`).

## Scope

This document covers:

- Base URL and authentication
- The MCP OAuth endpoints and discovery documents
- File URLs, health, usage, and the OpenAPI document
- The error format, rate limits, and pagination

It does not cover:

- Every route and schema (see [`openapi.yaml`](../../openapi.yaml))
- MCP tools (see [`docs/developer/mcp_overview.md`](../developer/mcp_overview.md) and `docs/specs/MCP_SPEC.md`)
- WebSocket connections
- Internal service-to-service communication

## The full route list

The REST API covers the same record operations as the MCP tools: storing, correcting, querying, merging, relationships, timeline, schemas, subscriptions, and peer sync. [`openapi.yaml`](../../openapi.yaml) is the reference for every route, parameter, and response. A few common ones:

| Route | Operation ID | MCP tool |
| --- | --- | --- |
| `POST /store` | `store` | `store` |
| `POST /correct` | `correct` | `correct` |
| `POST /entities/query` | `queryEntities` | `retrieve_entities` |
| `POST /get_entity_snapshot` | `getEntitySnapshot` | `retrieve_entity_snapshot` |
| `POST /entities/merge` | `mergeEntities` | `merge_entities` |

Call any operation by its ID from the CLI with `neotoma request --operation <operationId>` (see the [CLI reference](../developer/cli_reference.md#openapi-request)).

## Base URL

A local install listens on port 3080 for the development API and 3180 for the production API:

```text
http://localhost:3080
http://localhost:3180
```

A remote or hosted instance uses its own host:

```text
https://<your-instance-host>
```

## Authentication

Most routes need a credential, sent as a bearer token:

```http
Authorization: Bearer <NEOTOMA_BEARER_TOKEN>
```

- Set the server's token with the `NEOTOMA_BEARER_TOKEN` environment variable. Use a strong random value and never commit it.
- When encryption is enabled (`NEOTOMA_ENCRYPTION_ENABLED=true`), use the key-derived token printed by `neotoma auth mcp-token`.
- MCP OAuth access tokens and AAuth-signed requests are also accepted.

### Routes that answer without a credential

Routes registered in `src/actions.ts` before the authentication middleware, and the middleware's own exemptions, answer without a credential. The list below is that set, checked by calling each route with no credential on a scratch server built from main and run with `NEOTOMA_ENV=production`; v0.25.0 registers the same routes in the same order.

- Discovery and server information: `GET /`, `GET /robots.txt`, `GET /favicon.ico`, `GET /health`, `GET /ready`, `GET /openapi.yaml`, `GET /openapi_actions.yaml`, `GET /server-info`, `GET /mcp-interaction-instructions`, `GET /.well-known/mcp/server-card.json`, `GET /.well-known/aauth-resource.json`, `GET /.well-known/oauth-authorization-server`, and `GET /.well-known/oauth-protected-resource` (also with the `/mcp` suffix). `GET /.well-known/openid-configuration` returns 404.
- Pages: the bundled docs at `GET /docs` and `GET /docs/*`, and the Inspector page shell at `/inspector`. The Inspector's data calls still need a credential.
- The MCP OAuth flow: `POST /mcp/oauth/initiate`, `GET /mcp/oauth/callback`, `GET /mcp/oauth/key-auth`, `POST /mcp/oauth/key-auth` (which checks the key it is given), `GET /mcp/oauth/authorize`, `GET /mcp/oauth/local-login`, `POST /mcp/oauth/token`, `POST /mcp/oauth/register`, `GET /mcp/oauth/status`, and `GET /mcp/oauth/google/start` and `/google/callback` (404 unless Google sign-in is configured).
- Sandbox forms: `GET /sandbox/terms`, `POST /sandbox/report`, and `GET /sandbox/report/status`.
- `POST /auth/dev-signin`, which always answers 403.
- `OPTIONS` preflight requests.

Some routes registered before the middleware check a credential themselves and answer 401 without one: `/mcp`, `GET /mcp/oauth/connections`, `DELETE /mcp/oauth/connections/{connection_id}`, and `GET /mcp/oauth/authorization-details`.

Every other route goes through the middleware, which also admits a request without a bearer token in these cases:

- **Local requests.** On a local install, a request from the same machine with no `Authorization` header acts as the local user. In production (`NEOTOMA_ENV=production`) a loopback request counts as local only when `NEOTOMA_TRUST_PROD_LOOPBACK=1` is set and no `X-Forwarded-For` entry is an untrusted address, or when the nearest `X-Forwarded-For` hop is listed in `NEOTOMA_TRUSTED_PROXY_IPS` (see `isLocalRequest` in `src/actions.ts`).
- **Sandbox mode.** With `NEOTOMA_SANDBOX_MODE` set, a request with no bearer token acts as its sandbox session user, or as the shared public sandbox user, and the `/sandbox/session` routes are registered.
- **Guest access tokens.** An entity-scoped guest token is accepted on the guest-capable routes: `POST /issues/submit`, `/issues/status`, and `/issues/add_message`; `POST /subscribe`, `/unsubscribe`, `/list_subscriptions`, and `/get_subscription_status`; `GET /events/stream`; and `GET /entities/{id}` with its `/observations`, `/relationships`, and `/html` subpaths (`routeAcceptsGuestPrincipal` in `src/actions.ts`).

## MCP OAuth endpoints

OAuth endpoints for MCP client authentication. The public ones need no bearer token.

### Discovery bootstrap (unauthenticated)

A client with no credentials reaches an authenticated session in four requests. Step 2 returns 200 with no credential, as RFC 9728 §3 requires: the discovery documents tell a caller holding nothing where to authenticate, so gating them would deadlock the handshake. The `WWW-Authenticate` challenge in step 1 points at the step-2 document.

1. `POST /mcp` with no credential returns 401 with `WWW-Authenticate: Bearer resource_metadata="<base>/.well-known/oauth-protected-resource"`.
2. `GET` that URL with no `Authorization` and no `X-Connection-Id` returns 200 with `resource` and a non-empty `authorization_servers`.
3. `GET /.well-known/oauth-authorization-server` returns 200 with the authorization and token endpoints.
4. Complete the OAuth flow against those endpoints, then retry `/mcp` with `Authorization: Bearer <token>`.

Check the public documents:

```bash
curl -sI https://<your-instance-host>/.well-known/oauth-protected-resource
curl -sI https://<your-instance-host>/.well-known/oauth-protected-resource/mcp
curl -sI https://<your-instance-host>/.well-known/oauth-authorization-server
curl -sI https://<your-instance-host>/.well-known/openid-configuration
```

The first three return 200 and the last returns 404.

`/.well-known/oauth-protected-resource/mcp` is the RFC 9728 §3.1 resource-suffixed form, served identically. A client whose resource is `/mcp` probes that path rather than the bare one, and either probe order works.

`/.well-known/openid-configuration` returns 404: this server does not implement OIDC discovery, and a 404 makes an OIDC-first client fall back to the RFC 8414 document. It is deliberately not a 401, which would claim the endpoint exists, and not a synthetic 200 alias, which would advertise a discovery contract the server does not implement.

One 401 remains on the protected-resource paths: a request carrying a stale or unrecognized `X-Connection-Id` gets `401 invalid_token`, because that caller asserted a credential. Any `resource_metadata` URL named in that response still returns 200 unauthenticated.

### Initiate OAuth flow

**Endpoint:** `POST /mcp/oauth/initiate` (rate-limited to 5 requests a minute)

**Request:**

```json
{
  "connection_id": "cursor-2025-01-21-abc123",
  "client_name": "Cursor"
}
```

- `connection_id`: unique identifier for this connection (required)
- `client_name`: name of the MCP client (optional)
- `redirect_uri`: optional. It must parse as a URL with an `http`, `https`, `cursor`, `vscode`, or `app` scheme. When omitted, a local install uses `<frontend>/oauth`, where `<frontend>` is `NEOTOMA_FRONTEND_URL` (or `FRONTEND_URL`, default `http://localhost:5195`)

**Response:** `200 OK`

```json
{
  "authUrl": "https://<your-instance-host>/mcp/oauth/authorize?...",
  "connectionId": "cursor-2025-01-21-abc123",
  "expiresAt": "2025-01-21T10:10:00Z"
}
```

**Errors:** `400` when `connection_id` is missing or invalid; `500` when the OAuth state cannot be created.

### OAuth callback

**Endpoint:** `GET /mcp/oauth/callback`

Every current build answers this route with `400` and `Local OAuth callback is disabled. Use /mcp/oauth/local-login.`, because the storage backend is always local (`storageBackend` in `src/config.ts`), in v0.25.0 and on main. MCP clients complete sign-in through `/mcp/oauth/authorize` and `/mcp/oauth/local-login` instead.

### Authorize (MCP clients)

**Endpoint:** `GET /mcp/oauth/authorize` (RFC 8414 authorization endpoint)

- `redirect_uri` and `state` are required.
- PKCE is required (`code_challenge` with `code_challenge_method=S256`), except for OpenAI Custom GPT callbacks on `https://chatgpt.com/aip/g-<id>/oauth/callback` or `https://chat.openai.com/aip/g-<id>/oauth/callback`.
- Unless `NEOTOMA_REQUIRE_KEY_FOR_OAUTH=false`, a browser without a key session is redirected to `/mcp/oauth/key-auth` first.

When the request does not come from the same machine (for example through a tunnel), `redirect_uri` must be one of these, or the route answers `400` and names the value it compared (`isRedirectUriAllowedForTunnel` in `src/services/mcp_oauth.ts`):

- A `cursor:`, `vscode:`, or `app:` URL
- `http` or `https` on `localhost`, `127.0.0.1`, or `[::1]`
- `https` on this instance's own host (from `X-Forwarded-Host`, or `Host`)
- `https` on `chatgpt.com` or `chat.openai.com`
- `https://claude.ai` (or `www.claude.ai`) with the path `/api/mcp/auth_callback` or `/api/mcp/oauth/callback`
- An exact URL listed in `NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS`. Matching ignores the query, fragment, and a trailing slash; plain `http` is accepted only for loopback hosts, and an entry with a user name or password never matches. A malformed entry stops the server at startup.

From the same machine, any `redirect_uri` that passes the scheme check above is accepted.

### Get connection status

**Endpoint:** `GET /mcp/oauth/status?connection_id=<id>`

**Response:** `200 OK`

```json
{
  "status": "active",
  "connection_id": "cursor-2025-01-21-abc123"
}
```

Status values:

- `pending`: the flow started and has not completed
- `active`: the connection is ready to use
- `expired`: the connection was revoked or the flow timed out

### List MCP connections

**Endpoint:** `GET /mcp/oauth/connections` (authenticated)

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

### Revoke an MCP connection

**Endpoint:** `DELETE /mcp/oauth/connections/{connection_id}` (authenticated)

**Response:** `200 OK` with `{"success": true}`.

## Files

### Storing a file

Files are stored through `POST /store`: send `file_content` (base64) with `mime_type`, or `file_path`, which the server reads from its own filesystem and so works only when the client runs on the same machine. File sources are deduplicated per user by SHA-256 content hash. Neotoma does not extract fields from a stored file; send the extracted entities in `entities`, with an `interpretation` block to link them to the file's source. The server caps JSON bodies at 10 MB.

### Get a file URL

**Endpoint:** `GET /get_file_url?file_path=<path>&expires_in=<seconds>`

Returns a signed URL for one of the caller's own sources. `expires_in` defaults to 3600 seconds. A path that belongs to another user gets the same 404 as a path that does not exist.

**Response:** `200 OK` with `{"url": "..."}`.

## Quick check with curl

Read the health endpoint, then make one authenticated read, with the token taken from your environment:

```bash
curl -s http://localhost:3080/health
curl -s -H "Authorization: Bearer $NEOTOMA_BEARER_TOKEN" "http://localhost:3080/entities?limit=1"
```

Export `NEOTOMA_BEARER_TOKEN` with the server's token first. On a local development install you can drop the header, because local requests act as the local user. Use port 3180 for a local production API, or `https://<your-instance-host>` for a remote one.

## Utility endpoints

### Health check

**Endpoint:** `GET /health` (no authentication)

**Response:** `200 OK`

```json
{
  "ok": true,
  "version": "0.25.0"
}
```

`/health` reports that the process is up. `GET /ready` also queries the database and returns 503 when it is unreachable, erroring, or too slow.

### Usage statistics

**Endpoint:** `GET /usage`

Aggregate usage statistics for the authenticated user, computed from live data on each request. They power the Inspector dashboard tiles.

**Authentication:** a bearer token, an AAuth grant, or an MCP OAuth token. Guest principals get `401`.

**Query parameter:** `user_id` (optional). It must match the authenticated user; the local development user on a local install may pass any `user_id`.

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

Response fields:

- `entities_by_type`: active entity counts per type, sorted by count descending
- `total_entities`: total active (non-merged) entities
- `observations_by_source`: observation counts per `observation_source`; rows with none appear as `"unclassified"`
- `total_observations`: total observations
- `entities_created_last_7_days` and `entities_created_last_30_days`: entities created in those windows
- `entity_types_with_schema`: distinct entity types in the data that have an active registered schema
- `entity_types_total`: distinct entity types across all active entities
- `last_updated`: when these figures were computed (the request time)

Errors:

| Status | `error_code` | Cause |
| --- | --- | --- |
| `401` | `AUTH_REQUIRED` | Missing or invalid token, or a guest principal |
| `403` | `FORBIDDEN` | `user_id` does not match the authenticated user |
| `500` | `DB_QUERY_FAILED` | Database query failure |

OpenAPI operation `getUsage`; the CLI equivalent is `neotoma request --operation getUsage`. See [`docs/subsystems/usage_digest.md`](../subsystems/usage_digest.md#usage-http-api-endpoint) for how `/usage` differs from `usage_digest` entities.

### OpenAPI document

**Endpoint:** `GET /openapi.yaml` (no authentication) returns [`openapi.yaml`](../../openapi.yaml), with its `servers` list adjusted to the host that served the request.

## Error format

Errors use one envelope:

```json
{
  "error_code": "VALIDATION_MISSING_FIELD",
  "message": "connection_id is required",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

`details` (an object) and `trace_id` appear when the handler supplies them. Status codes in use include `400` (bad request), `401` (missing or invalid credential), `403` (forbidden), `404` (not found), `409` (conflict), `413` (payload too large), `429` (rate limited), `500` (server error), and `503` (not ready). See `docs/reference/error_codes.md` for the error codes.

## Rate limits

- Writes through `POST /store` and `POST /patch_array_item` (main only) are limited per authenticated user, or per IP address without one, to `NEOTOMA_WRITE_RATE_LIMIT_PER_MIN` requests a minute (default 120).
- The MCP OAuth endpoints have their own per-minute limits; `POST /mcp/oauth/initiate` allows 5.
- Sandbox deployments apply a tighter write limit (`NEOTOMA_SANDBOX_WRITE_RATE_LIMIT_PER_MIN`, default 30).

A limited request gets `429`.

## Pagination

List and query routes take `limit` and `offset`. `GET /entities` also accepts an opaque `cursor` from a previous response's `next_cursor`, which is the preferred way to page through entities; `offset` there is deprecated and bounded. Each operation's parameters are in [`openapi.yaml`](../../openapi.yaml).

## Agent Instructions

### When to Load This Document

Load when:

- Implementing frontend API calls
- Integrating external clients
- Debugging API issues
- Understanding request and response formats

### Required Co-Loaded Documents

- [`openapi.yaml`](../../openapi.yaml): every route and schema
- `docs/developer/mcp_overview.md`: MCP tool equivalents
- `docs/reference/error_codes.md`: error code reference
- `docs/subsystems/errors.md`: error handling patterns

### Constraints Agents Must Enforce

1. Send a credential on every route except those listed under [Routes that answer without a credential](#routes-that-answer-without-a-credential).
2. Check required fields against `openapi.yaml` before calling.
3. Handle errors by `error_code`, not only the HTTP status.
4. Back off on `429`.
5. Page through results instead of fetching everything at once.

### Forbidden Patterns

- Calling authenticated routes without a credential
- Ignoring error responses
- Fetching unbounded result sets
- Hardcoding bearer tokens in frontend code
- Presenting any single host as the production base URL
