# Neotoma Error Handling — Error Codes and Propagation
*(Structured Error Envelope and Canonical Error Codes)*

## Envelope Taxonomy

Two envelope shapes exist. Pick the right one and do not mix them.

### 1. Standard envelope

Emitted by `buildErrorEnvelope(code, message, details?)` in `src/actions.ts`. Used for most API errors.

```typescript
interface ErrorEnvelope {
  error_code: string;              // e.g., 'INGESTION_INVALID_FILE'
  message: string;                 // Human-readable description
  details?: Record<string, any>;   // Additional context (no PII)
  trace_id?: string;               // Distributed tracing ID
  timestamp: string;               // ISO 8601
}
```

Wire format: `{ error: ErrorEnvelope }`.

### 2. Resolution envelope (`ERR_STORE_RESOLUTION_FAILED`)

Emitted by the `/store` endpoint when one or more entities fail to resolve during a structured store. Carries per-entity `issues[]` so clients can show each row's failure independently.

```typescript
interface StoreResolutionErrorEnvelope {
  error: {
    code: "ERR_STORE_RESOLUTION_FAILED";
    message: string;
    issues: Array<{
      code: string;                // e.g., 'ERR_CANONICAL_NAME_UNRESOLVED'
      message: string;
      details?: Record<string, any>;
      hint?: string;               // Optional structured upgrade guidance
    }>;
  };
}
```

The `hint` field carries upgrade guidance that the client can surface verbatim (e.g., "Payload looks like the pre-0.5 `attributes`-nested shape; flatten fields to top level."). Do not concatenate upgrade text into `message`; use `hint`.

### Picking the right envelope

- Use the **standard envelope** for single-object failures (auth, validation, resource-not-found, DB, ingestion).
- Use the **resolution envelope** only when the error carries multiple per-row issues from a batch operation (currently only `/store`).

### Adding fields

Both envelopes are declared in `openapi.yaml` `components/schemas`. Any new field (including `hint`, `details` sub-keys, new issue codes) follows the OpenAPI contract flow: spec first, regenerate types, populate from server, test at contract level. See `docs/architecture/openapi_contract_flow.md`.


## Canonical Error Codes
### Ingestion Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `INGESTION_FILE_TOO_LARGE` | File exceeds size limit | 400 | No |
| `INGESTION_UNSUPPORTED_TYPE` | File type not supported | 400 | No |
| `INGESTION_OCR_FAILED` | OCR processing failed | 500 | Yes |
| `INGESTION_EXTRACTION_FAILED` | Field extraction failed | 500 | No |
### Auth Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `AUTH_REQUIRED` | No token provided | 401 | No |
| `AUTH_INVALID` | Invalid token | 401 | No |
| `AUTH_EXPIRED` | Token expired | 401 | No |
| `FORBIDDEN` | Insufficient permissions | 403 | No |
### Database Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `DB_CONNECTION_FAILED` | Cannot connect to DB | 503 | Yes |
| `DB_QUERY_FAILED` | Query execution failed | 500 | Yes |
| `DB_CONSTRAINT_VIOLATION` | Unique constraint violated | 409 | No |
### Validation Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `VALIDATION_MISSING_FIELD` | Required field missing | 400 | No |
| `VALIDATION_INVALID_FORMAT` | Invalid field format | 400 | No |
### Resource Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `RESOURCE_NOT_FOUND` | Resource not found | 404 | No |
## Error Propagation
Errors propagate **up** the layer stack:
```
Domain throws → Application catches → Application returns ErrorEnvelope → UI displays
```
```typescript
// Domain layer
async function extractFields(text: string): Promise<Fields> {
  if (!text) {
    throw new ExtractionError('EXTRACTION_FAILED', 'Empty text');
  }
  // ...
}
// Application layer
async function ingestFile(file: File): Promise<Result<Record, ErrorEnvelope>> {
  try {
    const fields = await extractFields(text);
    // ...
  } catch (error) {
    if (error instanceof ExtractionError) {
      return {
        error: {
          error_code: error.code,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      };
    }
    throw error; // Unexpected error
  }
}
```
## Agent Instructions
Load when implementing error handling, defining new error types, or debugging failures.
Required co-loaded: `docs/architecture/architecture.md`, `docs/subsystems/privacy.md`
Constraints:
- MUST use ErrorEnvelope structure
- MUST NOT include PII in error messages
- MUST distinguish transient vs permanent errors
- MUST include trace_id for debugging
