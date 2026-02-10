# Neotoma Privacy — PII Handling and Data Protection
*(PII Categories, Logging Restrictions, Retention, and Erasure)*
## PII Categories
| Category | Examples | Handling |
|----------|----------|----------|
| **Identity** | Name, SSN, passport number | Store in `properties`, RLS protected |
| **Financial** | Bank account, credit card | Store in `properties`, RLS protected |
| **Contact** | Email, phone, address | Store in `properties`, RLS protected |
| **Biometric** | Photo, fingerprint | Not supported in MVP |
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
## Encryption at Rest (Local Backend)

When `NEOTOMA_ENCRYPTION_ENABLED=true`, sensitive data columns are encrypted with AES-256-GCM before storage in SQLite. The encryption key is derived from the user's private key file or BIP-39 mnemonic using HKDF.

**Encrypted columns:**

| Table | Columns |
|-------|---------|
| observations | `fields` |
| entity_snapshots | `snapshot`, `provenance` |
| relationship_snapshots | `snapshot`, `provenance` |
| raw_fragments | `fragment_value`, `fragment_envelope` |
| schema_recommendations | `fields_to_add`, `fields_to_remove`, `fields_to_modify`, `converters_to_add` |
| auto_enhancement_queue | `payload` |

**Not encrypted:** IDs, timestamps, entity types, user_id, hash chain fields, signatures. These stay plaintext for querying, provenance tracking, and future blockchain compatibility.

**Log encryption:** When `NEOTOMA_LOG_ENCRYPTION_ENABLED=true`, persistent log entries are encrypted with a separate Log Key (also derived from the same root secret). Runtime logs to stdout/stderr are not affected.

**Backward compatibility:** Existing plaintext databases continue to work. The system auto-detects encrypted vs plaintext values on read. Migration to encrypted storage requires re-inserting data with encryption enabled.

**Key loss:** Without the key file or mnemonic phrase, encrypted data is unrecoverable.

See `docs/subsystems/auth.md` for key derivation details.

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
## Agent Instructions
Load when handling user data, logging, or implementing deletion.
Required co-loaded: `docs/subsystems/auth.md`, `docs/observability/logging.md`
Constraints:
- MUST NOT log PII
- MUST protect PII with RLS (future)
- MUST provide deletion mechanism (future)
- MUST sanitize error messages
