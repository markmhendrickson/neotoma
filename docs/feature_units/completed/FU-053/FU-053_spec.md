# Feature Unit: FU-053 Cryptographic Schema Fields

**Status:** Draft
**Priority:** P0 (Critical)
**Risk Level:** Low
**Target Release:** v0.1.0
**Owner:** Engineering Team
**Reviewers:** Tech Lead
**Created:** 2025-01-XX
**Last Updated:** 2025-01-XX

---

## Overview

**Brief Description:**
Add cryptographic schema fields (`signer_public_key`, `signature`) to `state_events` table and create agent identity abstraction. Schema supports future cryptographic signature verification, but verification logic is deferred to post-MVP.

**User Value:**
Enables future cryptographic event signing and agent identity verification. Foundation for blockchain-ready architecture where events can be cryptographically verified.

**Technical Approach:**
- Add `signer_public_key` and `signature` fields to `state_events` table (nullable)
- Create agent identity abstraction (`src/crypto/agent_identity.ts`)
- Schema supports crypto, but verification logic deferred
- Fields nullable (no breaking changes)

---

## Requirements

### Functional Requirements

1. **Schema Fields:**
   - `signer_public_key TEXT` — Public key of event signer (nullable)
   - `signature TEXT` — Cryptographic signature of event (nullable)
   - Both fields nullable (events can exist without signatures)

2. **Agent Identity Abstraction:**
   - `AgentIdentity` interface: Represents agent as public key
   - `getAgentPublicKey()` utility
   - `createAgentIdentity()` utility (stub)

3. **Schema Support:**
   - Events can include `signer_public_key` and `signature` fields
   - Fields stored but not validated (verification deferred)
   - Schema ready for future crypto implementation

### Non-Functional Requirements

1. **Performance:**
   - Schema fields add minimal overhead (<1ms per event)
   - Nullable fields don't affect existing events

2. **Determinism:**
   - Schema changes are deterministic
   - No impact on existing event processing

3. **Consistency:**
   - Strong consistency: Fields stored atomically with event
   - Nullable fields don't break existing queries

4. **Accessibility:** N/A (backend only)

5. **Internationalization:** N/A (backend only)

### Invariants

**MUST:**
- Schema fields MUST be nullable (no breaking changes)
- Agent identity abstraction MUST exist (even if stub)
- Schema MUST support future crypto implementation

**MUST NOT:**
- MUST NOT break existing events (fields nullable)
- MUST NOT implement signature verification yet (deferred)
- MUST NOT require signatures for events (optional)

---

## Affected Subsystems

**Primary Subsystems:**
- **Schema:** Add crypto fields to `state_events` table
- **Crypto:** Agent identity abstraction

**Dependencies:**
- Requires FU-050 (Event-Sourcing) — needs `state_events` table
- Blocks nothing (additive, no breaking changes)

**Documentation to Load:**
- `docs/NEOTOMA_MANIFEST.md`
- `docs/architecture/blockchain_readiness_assessment.md`
- `docs/subsystems/schema.md`

---

## Schema Changes

**Tables Affected:**
- **MODIFY TABLE:** `state_events`
  ```sql
  ALTER TABLE state_events
    ADD COLUMN IF NOT EXISTS signer_public_key TEXT,
    ADD COLUMN IF NOT EXISTS signature TEXT;
  ```

**JSONB Schema Changes:**
- None

**Migration Required:** Yes

**Migration File:** `supabase/migrations/YYYYMMDDHHMMSS_add_crypto_fields_to_state_events.sql`

**Migration Description:**
- Add `signer_public_key` and `signature` columns (nullable)
- No data migration needed (new columns, nullable)

---

## API/MCP Changes

**API Changes:** None (schema only, no API changes)

**MCP Changes:** None (schema only, no MCP changes)

---

## UI Changes

**UI Changes:** N/A (Internal MCP Release, backend only)

---

## Observability

**Metrics:**
- `event_with_signature_total`: Counter (tracks events with signatures)
- `agent_identity_created_total`: Counter (tracks agent identity creation)

**Logs:**
- Level `info`: "Agent identity created" (fields: `agent_id`, `public_key`)
- Level `debug`: "Event includes signature" (fields: `event_id`, `signer_public_key`)

**Events:**
- None (schema change only)

**Traces:**
- None (schema change only)

---

## Testing Strategy

**Unit Tests:**
- `AgentIdentity.createAgentIdentity()`: Verify agent identity creation (stub)
- `AgentIdentity.getAgentPublicKey()`: Verify public key retrieval
- Schema migration: Verify columns added correctly

**Integration Tests:**
- `Event with signature fields → stored correctly`: Verify schema accepts crypto fields
- `Event without signature fields → stored correctly`: Verify nullable fields work

**Property-Based Tests:**
- None (schema change only)

**Test Fixtures:**
- `fixtures/crypto/sample_agent_identity.json`: Sample agent identity

**Expected Coverage:**
- Lines: >80%
- Branches: >75%
- Critical paths (schema migration): 100%

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
|----------|------------|---------|----------|
| Migration fails | `MIGRATION_FAILED` | "Failed to add crypto fields: {error}" | Rollback migration, investigate |
| Invalid public key format | `INVALID_PUBLIC_KEY` | "Invalid public key format" | Fix public key format (future) |

---

## Rollout and Deployment

**Feature Flags:** No

**Rollback Plan:**
- Rollback migration (remove columns)
- No data loss (columns nullable, no existing data)

**Monitoring:**
- Watch migration success
- Watch for events with signatures (should be 0 initially)

---

## Implementation Notes

**File Structure:**
```
src/
  crypto/
    agent_identity.ts         # Agent identity abstraction
    event_signing.ts           # Event signature utilities (stub, future)
```

**Key Implementation Details:**
- Schema fields nullable (no breaking changes)
- Agent identity abstraction is stub (no real crypto yet)
- Fields stored but not validated (verification deferred)

**Dependencies:**
- Requires FU-050 (Event-Sourcing) — needs `state_events` table

---

## Documentation Updates

**Files Created:**
- `docs/architecture/agent_identity.md`: Agent identity documentation (stub)

**Files Updated:**
- `docs/subsystems/schema.md`: Document crypto fields in `state_events` table







