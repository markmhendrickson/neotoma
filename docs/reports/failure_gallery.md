# Failure gallery
## Scope
This document catalogs deterministic failure modes for ingestion, MCP actions, and reducers. It does not define remediation playbooks or release processes.

## Purpose
Provide a single reference for common failure modes, expected error envelopes, and diagnostics.

## Invariants
1. Failure cases must map to canonical error codes.
2. Errors must not include PII.
3. Idempotent operations must not create duplicates.
4. Observations remain immutable even after failures.

## Definitions
- **Failure case**: A deterministic scenario that produces a known error envelope.
- **Error envelope**: Structured error response with `error_code`, `message`, and `timestamp`.
- **Replay**: Re running the same input and verifying identical failure output.

## Failure cases
### Missing authentication
**Scenario:** MCP or REST call without valid authentication.
**Expected error_code:** `AUTH_REQUIRED`
**Notes:** Rejects before any data access.

### Idempotency key reuse with conflicting payload
**Scenario:** Reuse `idempotency_key` with a different structured payload.
**Expected error_code:** `DB_CONSTRAINT_VIOLATION` or `VALIDATION_INVALID_FORMAT`
**Notes:** Must return existing source or reject with conflict.

### Invalid schema update
**Scenario:** `update_schema_incremental` includes invalid field definition.
**Expected error_code:** `VALIDATION_INVALID_FORMAT`
**Notes:** No schema version is created.

### Source not found
**Scenario:** Fetch source by ID that does not exist.
**Expected error_code:** `RESOURCE_NOT_FOUND`
**Notes:** 404 response, no side effects.

### Relationship key mismatch
**Scenario:** Get relationship snapshot for a non existent key.
**Expected error_code:** `RESOURCE_NOT_FOUND`
**Notes:** No relationship snapshot returned.

### Timeline query with invalid date
**Scenario:** Timeline filter uses invalid date format.
**Expected error_code:** `VALIDATION_INVALID_FORMAT`
**Notes:** No events returned.

### Observation creation with user mismatch
**Scenario:** Provided `user_id` does not match authenticated user.
**Expected error_code:** `FORBIDDEN`
**Notes:** No observation created.

## Examples
### Error envelope
```json
{
  "error_code": "RESOURCE_NOT_FOUND",
  "message": "Source not found",
  "details": {
    "resource": "source",
    "id": "src_missing"
  },
  "timestamp": "2024-01-10T00:00:00.000Z"
}
```

## Testing requirements
1. Add regression tests when a new failure case is discovered.
2. Validate error envelopes in integration tests.
3. Use deterministic fixtures for replay tests.

## Agent Instructions
### When to Load This Document
Load when adding new error codes, adjusting error responses, or writing failure regression tests.

### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md`
- `docs/subsystems/errors.md`
- `docs/reference/error_codes.md`
- `docs/testing/testing_standard.md`

### Constraints Agents Must Enforce
1. Every failure case maps to a canonical error code.
2. Error messages do not include PII.
3. Failures do not mutate observations or sources.

### Forbidden Patterns
- Returning raw stack traces to clients
- Using non canonical error codes
- Recording PII in error messages

### Validation Checklist
- [ ] Failure case uses canonical error code
- [ ] Error envelope is structured and deterministic
- [ ] Tests added for new failure cases
