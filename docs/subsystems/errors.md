# Neotoma Error Handling — Error Codes and Propagation
*(Structured Error Envelope and Canonical Error Codes)*

---

## Purpose

Defines structured error handling, canonical error codes, and error propagation rules.

---

## Error Envelope

```typescript
interface ErrorEnvelope {
  error_code: string;              // e.g., 'INGESTION_INVALID_FILE'
  message: string;                 // Human-readable description
  details?: Record<string, any>;   // Additional context (no PII)
  trace_id?: string;               // Distributed tracing ID
  timestamp: string;               // ISO 8601
}
```

---

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

---

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

---

## Agent Instructions

Load when implementing error handling, defining new error types, or debugging failures.

Required co-loaded: `docs/architecture/architecture.md`, `docs/subsystems/privacy.md`

Constraints:
- MUST use ErrorEnvelope structure
- MUST NOT include PII in error messages
- MUST distinguish transient vs permanent errors
- MUST include trace_id for debugging





