# Error Codes Reference
*(Complete Catalog of Neotoma Error Codes)*

---

## Purpose

This document provides a complete reference for all error codes used in Neotoma. It complements `docs/subsystems/errors.md` with a comprehensive catalog organized by category.

---

## Scope

This document covers:
- All canonical error codes and their meanings
- HTTP status code mappings
- Retry eligibility
- Common causes and solutions

This document does NOT cover:
- Error handling implementation (see `docs/subsystems/errors.md`)
- Error propagation patterns (see `docs/architecture/architecture.md`)

---

## Error Envelope Format

All errors follow this structure:

```typescript
interface ErrorEnvelope {
  error_code: string;              // Canonical error code
  message: string;                 // Human-readable description
  details?: Record<string, any>;   // Additional context (no PII)
  trace_id?: string;               // Distributed tracing ID
  timestamp: string;               // ISO 8601
}
```

---

## Ingestion Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `INGESTION_FILE_TOO_LARGE` | 400 | No | File exceeds maximum size (50MB) |
| `INGESTION_UNSUPPORTED_TYPE` | 400 | No | File type not supported (PDF, JPG, PNG only) |
| `INGESTION_INVALID_FILE` | 400 | No | File is corrupted or invalid format |
| `INGESTION_OCR_FAILED` | 500 | Yes | OCR processing failed (Tesseract error) |
| `INGESTION_EXTRACTION_FAILED` | 500 | No | Field extraction failed (schema error) |
| `INGESTION_NORMALIZATION_FAILED` | 500 | Yes | File format conversion failed |
| `INGESTION_SCHEMA_DETECTION_FAILED` | 500 | No | Could not detect document schema |
| `INGESTION_STORAGE_FAILED` | 500 | Yes | Failed to store file in Supabase Storage |

**Common Causes:**
- `INGESTION_FILE_TOO_LARGE`: File >50MB
- `INGESTION_UNSUPPORTED_TYPE`: File is not PDF, JPG, or PNG
- `INGESTION_OCR_FAILED`: Image has no readable text or Tesseract error

---

## Authentication Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `AUTH_REQUIRED` | 401 | No | No bearer token provided |
| `AUTH_INVALID` | 401 | No | Bearer token is invalid |
| `AUTH_EXPIRED` | 401 | No | Bearer token has expired |
| `AUTH_MALFORMED` | 401 | No | Bearer token format is invalid |
| `FORBIDDEN` | 403 | No | Insufficient permissions (RLS policy violation) |

**Common Causes:**
- `AUTH_REQUIRED`: Missing `Authorization: Bearer <token>` header
- `AUTH_INVALID`: Token doesn't match `ACTIONS_BEARER_TOKEN`
- `FORBIDDEN`: User doesn't have access to requested resource (RLS)

---

## Database Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `DB_CONNECTION_FAILED` | 503 | Yes | Cannot connect to Supabase |
| `DB_QUERY_FAILED` | 500 | Yes | Query execution failed |
| `DB_CONSTRAINT_VIOLATION` | 409 | No | Unique constraint violated (duplicate record) |
| `DB_TRANSACTION_FAILED` | 500 | Yes | Transaction rollback failed |
| `DB_TIMEOUT` | 504 | Yes | Database query timed out |

**Common Causes:**
- `DB_CONNECTION_FAILED`: Supabase project paused or network issue
- `DB_CONSTRAINT_VIOLATION`: Attempting to create duplicate record
- `DB_TIMEOUT`: Query taking too long (large dataset or missing index)

---

## Entity Resolution Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `ENTITY_NORMALIZATION_FAILED` | 500 | No | Entity name normalization failed |
| `ENTITY_ID_GENERATION_FAILED` | 500 | No | Failed to generate canonical entity ID |
| `ENTITY_TYPE_INVALID` | 400 | No | Invalid entity type (must be person, company, location) |

**Common Causes:**
- `ENTITY_NORMALIZATION_FAILED`: Entity name is empty or invalid
- `ENTITY_TYPE_INVALID`: Entity type not in allowed set

---

## Search Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `SEARCH_QUERY_INVALID` | 400 | No | Search query is malformed |
| `SEARCH_INDEX_UNAVAILABLE` | 503 | Yes | Search index is not ready (eventual consistency) |
| `SEARCH_LIMIT_EXCEEDED` | 400 | No | Limit exceeds maximum (1000) |

**Common Causes:**
- `SEARCH_QUERY_INVALID`: Invalid search_mode or malformed query
- `SEARCH_INDEX_UNAVAILABLE`: Full-text index still building (max 5s delay)

---

## File Storage Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `STORAGE_BUCKET_NOT_FOUND` | 404 | No | Storage bucket doesn't exist |
| `STORAGE_UPLOAD_FAILED` | 500 | Yes | File upload to Supabase Storage failed |
| `STORAGE_DELETE_FAILED` | 500 | Yes | File deletion from storage failed |
| `STORAGE_SIGNED_URL_FAILED` | 500 | Yes | Failed to generate signed URL |

**Common Causes:**
- `STORAGE_BUCKET_NOT_FOUND`: Bucket `files` not created in Supabase
- `STORAGE_UPLOAD_FAILED`: Network issue or storage quota exceeded

---

## Integration Errors

### Plaid Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `PLAID_LINK_TOKEN_EXPIRED` | 400 | No | Link token has expired (4 hours) |
| `PLAID_ITEM_NOT_FOUND` | 404 | No | Plaid item doesn't exist |
| `PLAID_SYNC_FAILED` | 500 | Yes | Transaction sync failed |
| `PLAID_RATE_LIMIT_EXCEEDED` | 429 | Yes | Plaid API rate limit exceeded |
| `PLAID_INVALID_CREDENTIALS` | 401 | No | Plaid client_id or secret invalid |

**Common Causes:**
- `PLAID_LINK_TOKEN_EXPIRED`: Token older than 4 hours
- `PLAID_RATE_LIMIT_EXCEEDED`: Too many API calls (500/min sandbox)

### External Provider Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `PROVIDER_OAUTH_FAILED` | 500 | Yes | OAuth flow failed |
| `PROVIDER_TOKEN_EXPIRED` | 401 | No | OAuth token expired (refresh required) |
| `PROVIDER_RATE_LIMIT_EXCEEDED` | 429 | Yes | Provider API rate limit exceeded |
| `PROVIDER_CONNECTOR_NOT_FOUND` | 404 | No | Connector doesn't exist |
| `PROVIDER_SYNC_FAILED` | 500 | Yes | Provider sync failed |

**Common Causes:**
- `PROVIDER_TOKEN_EXPIRED`: OAuth token needs refresh
- `PROVIDER_RATE_LIMIT_EXCEEDED`: Exceeded provider's rate limits

---

## Validation Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `VALIDATION_MISSING_FIELD` | 400 | No | Required field is missing |
| `VALIDATION_INVALID_TYPE` | 400 | No | Field has invalid type |
| `VALIDATION_INVALID_FORMAT` | 400 | No | Field format is invalid (e.g., date) |
| `VALIDATION_OUT_OF_RANGE` | 400 | No | Field value out of allowed range |

**Common Causes:**
- `VALIDATION_MISSING_FIELD`: Missing required `type` or `properties`
- `VALIDATION_INVALID_FORMAT`: Invalid date format or JSON structure

---

## Graph Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `GRAPH_ORPHAN_NODE` | 500 | No | Attempted to create orphan node (violates integrity) |
| `GRAPH_CYCLE_DETECTED` | 500 | No | Graph cycle detected (should not occur) |
| `GRAPH_EDGE_INVALID` | 400 | No | Invalid edge type or source/target |

**Common Causes:**
- `GRAPH_ORPHAN_NODE`: Entity or event created without record link
- `GRAPH_EDGE_INVALID`: Invalid edge type (not in allowed set)

---

## Generic Errors

| Code | HTTP | Retry? | Description |
|------|------|--------|-------------|
| `INTERNAL_ERROR` | 500 | Yes | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Yes | Service temporarily unavailable |
| `TIMEOUT` | 504 | Yes | Request timed out |
| `NOT_IMPLEMENTED` | 501 | No | Feature not yet implemented |

**Common Causes:**
- `INTERNAL_ERROR`: Unexpected exception (check logs with trace_id)
- `SERVICE_UNAVAILABLE`: Supabase or external service down

---

## Retry Guidelines

### Retry Eligible (Yes)

- Network errors (`DB_CONNECTION_FAILED`, `TIMEOUT`)
- Transient errors (`SERVICE_UNAVAILABLE`, `SEARCH_INDEX_UNAVAILABLE`)
- Rate limits (`PLAID_RATE_LIMIT_EXCEEDED`, `PROVIDER_RATE_LIMIT_EXCEEDED`)

**Retry Strategy:**
- Exponential backoff: `delay = 2^attempt * 1000ms`
- Max retries: 3-5 attempts
- Jitter: Add random 0-1000ms to prevent thundering herd

### Not Retry Eligible (No)

- Client errors (4xx): Fix request before retrying
- Validation errors: Correct input format
- Authentication errors: Fix token/credentials
- Constraint violations: Handle duplicate/conflict

---

## Error Code Format

Error codes follow this pattern:

```
<CATEGORY>_<SPECIFIC_ERROR>
```

**Categories:**
- `INGESTION_*`: File upload and processing
- `AUTH_*`: Authentication and authorization
- `DB_*`: Database operations
- `ENTITY_*`: Entity resolution
- `SEARCH_*`: Search operations
- `STORAGE_*`: File storage
- `PLAID_*`: Plaid integration
- `PROVIDER_*`: External provider integrations
- `VALIDATION_*`: Input validation
- `GRAPH_*`: Graph operations

---

## Agent Instructions

### When to Load This Document

Load when:
- Implementing error handling
- Debugging API errors
- Adding new error codes
- Understanding error responses

### Required Co-Loaded Documents

- `docs/subsystems/errors.md` — Error handling patterns
- `docs/architecture/architecture.md` — Error propagation
- `docs/api/rest_api.md` — API error responses

### Constraints Agents Must Enforce

1. **Use canonical error codes** — Don't invent new codes without updating this doc
2. **Include trace_id** — For distributed tracing
3. **Never include PII** — In error details
4. **Follow retry guidelines** — Respect retry eligibility
5. **Update this doc** — When adding new error codes

### Forbidden Patterns

- Creating ad-hoc error codes without documentation
- Including PII in error details
- Retrying non-retryable errors
- Ignoring error codes in error handling
- Using generic errors when specific code exists







