# Neotoma Privacy — PII Handling and Data Protection
*(PII Categories, Logging Restrictions, Retention, and Erasure)*

---

## Purpose

Defines privacy requirements for handling Personally Identifiable Information (PII) in Neotoma.

---

## PII Categories

| Category | Examples | Handling |
|----------|----------|----------|
| **Identity** | Name, SSN, passport number | Store in `properties`, RLS protected |
| **Financial** | Bank account, credit card | Store in `properties`, RLS protected |
| **Contact** | Email, phone, address | Store in `properties`, RLS protected |
| **Biometric** | Photo, fingerprint | Not supported in MVP |

---

## Logging Restrictions

### MUST NOT Log

❌ PII fields from `properties`
❌ Auth tokens or credentials
❌ Full raw_text (may contain PII)

### MAY Log

✅ Record IDs (UUIDs)
✅ Schema types
✅ Error codes and messages (sanitized)
✅ Performance metrics

```typescript
// ❌ Bad
logger.info('Processing invoice', { vendorName: record.properties.vendor_name });

// ✅ Good
logger.info('Processing invoice', { recordId: record.id, type: record.type });
```

---

## Retention and Deletion

**MVP:** No automatic deletion (user controls via MCP).

**Future:** User-triggered deletion via `delete_record` action.

```typescript
// Future deletion
async function deleteRecord(recordId: string) {
  await db.transaction(async (tx) => {
    await tx.delete('record_entity_edges', { record_id: recordId });
    await tx.delete('record_event_edges', { record_id: recordId });
    await tx.delete('records', { id: recordId });
  });
}
```

---

## Agent Instructions

Load when handling user data, logging, or implementing deletion.

Required co-loaded: `docs/subsystems/auth.md`, `docs/observability/logging.md`

Constraints:
- MUST NOT log PII
- MUST protect PII with RLS (future)
- MUST provide deletion mechanism (future)
- MUST sanitize error messages



















