# Neotoma Logging Standard
*(Log Levels, Schema, and PII Restrictions)*

---

## Purpose

Defines logging standards and PII protection rules.

---

## Log Levels

| Level | When to Use |
|-------|-------------|
| `error` | Failures requiring attention |
| `warn` | Degraded state, retry attempted |
| `info` | Normal operations (ingestion, search) |
| `debug` | Detailed debugging (dev only) |

---

## Log Schema

```typescript
interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;                   // ISO 8601
  trace_id?: string;
  fields: Record<string, any>;         // NO PII
}
```

**Example:**
```json
{
  "level": "info",
  "message": "Record uploaded",
  "timestamp": "2024-01-15T10:30:00Z",
  "trace_id": "abc123",
  "fields": {
    "record_id": "rec_xyz",
    "type": "FinancialRecord",
    "file_size_bytes": 1048576
  }
}
```

---

## PII Restrictions

**MUST NOT Log:**
- PII from `properties` (names, SSN, addresses)
- Full `raw_text`
- Auth tokens

**MAY Log:**
- Record IDs
- Schema types
- Error codes
- Performance metrics

---

## Agent Instructions

Load when adding logging or debugging.

Required co-loaded: `docs/subsystems/privacy.md`

Constraints:
- MUST NOT log PII
- MUST include trace_id
- MUST use structured logging








