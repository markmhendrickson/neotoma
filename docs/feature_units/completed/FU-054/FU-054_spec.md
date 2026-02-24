# Feature Unit: FU-054 Hash Chaining Schema Fields
**Status:** Draft
**Priority:** P0 (Critical)
**Risk Level:** Low
**Target Release:** v0.1.0
**Owner:** Engineering Team
**Reviewers:** Tech Lead
**Created:** 2025-01-XX
**Last Updated:** 2025-01-XX
## Overview
**Brief Description:**
Add hash chaining schema fields (`previous_event_hash`, `event_hash`) to `state_events` table and create hash computation utilities (stub). Schema supports future Merkle root computation and blockchain anchoring, but Merkle logic is deferred to post-MVP.
**User Value:**
Enables future hash chaining and Merkle root computation for blockchain anchoring. Foundation for cryptographically linked event log required for blockchain integration.
**Technical Approach:**
- Add `previous_event_hash` and `event_hash` fields to `state_events` table
- Create hash computation utilities (stub)
- Schema supports chaining, but Merkle logic deferred
- Fields nullable (no breaking changes)
## Requirements
### Functional Requirements
1. **Schema Fields:**
   - `previous_event_hash TEXT` — Hash of previous event in chain (nullable)
   - `event_hash TEXT` — Computed hash of current event (nullable)
   - Both fields nullable (events can exist without hashes)
2. **Hash Computation Utilities:**
   - `computeEventHash()` utility (stub)
   - `computePreviousEventHash()` utility (stub)
   - Hash utilities ready for future implementation
3. **Schema Support:**
   - Events can include hash fields
   - Fields stored but not computed (computation deferred)
   - Schema ready for future Merkle implementation
### Non-Functional Requirements
1. **Performance:**
   - Schema fields add minimal overhead (<1ms per event)
   - Nullable fields don't affect existing events
   - Hash computation utilities are stubs (no overhead)
2. **Determinism:**
   - Schema changes are deterministic
   - Hash computation utilities will be deterministic (when implemented)
3. **Consistency:**
   - Strong consistency: Fields stored atomically with event
   - Nullable fields don't break existing queries
4. **Accessibility:** N/A (backend only)
5. **Internationalization:** N/A (backend only)
### Invariants
**MUST:**
- Schema fields MUST be nullable (no breaking changes)
- Hash computation utilities MUST exist (even if stub)
- Schema MUST support future Merkle implementation
**MUST NOT:**
- MUST NOT break existing events (fields nullable)
- MUST NOT implement Merkle root computation yet (deferred)
- MUST NOT require hashes for events (optional)
## Affected Subsystems
**Primary Subsystems:**
- **Schema:** Add hash fields to `state_events` table
- **Hashing:** Hash computation utilities (stub)
**Dependencies:**
- Requires FU-050 (Event-Sourcing) — needs `state_events` table
- Blocks nothing (additive, no breaking changes)
**Documentation to Load:**
- `docs/NEOTOMA_MANIFEST.md`
- `docs/architecture/blockchain_readiness_assessment.md`
- `docs/subsystems/schema.md`
## Schema Changes
**Tables Affected:**
- **MODIFY TABLE:** `state_events`
  ```sql
  ALTER TABLE state_events
    ADD COLUMN IF NOT EXISTS previous_event_hash TEXT,
    ADD COLUMN IF NOT EXISTS event_hash TEXT;
  ```
**JSONB Schema Changes:**
- None
**Migration Required:** Yes
**Migration File:** `migrations/YYYYMMDDHHMMSS_add_hash_fields_to_state_events.sql`
**Migration Description:**
- Add `previous_event_hash` and `event_hash` columns (nullable)
- No data migration needed (new columns, nullable)
## API/MCP Changes
**API Changes:** None (schema only, no API changes)
**MCP Changes:** None (schema only, no MCP changes)
## UI Changes
**UI Changes:** N/A (Internal MCP Release, backend only)
## Observability
**Metrics:**
- `event_with_hash_total`: Counter (tracks events with hashes)
- `hash_computation_total`: Counter (tracks hash computations, future)
**Logs:**
- Level `debug`: "Event includes hash" (fields: `event_id`, `event_hash`)
**Events:**
- None (schema change only)
**Traces:**
- None (schema change only)
## Testing Strategy
**Unit Tests:**
- `computeEventHash()`: Verify hash computation utility (stub)
- `computePreviousEventHash()`: Verify previous hash utility (stub)
- Schema migration: Verify columns added correctly
**Integration Tests:**
- `Event with hash fields → stored correctly`: Verify schema accepts hash fields
- `Event without hash fields → stored correctly`: Verify nullable fields work
**Property-Based Tests:**
- None (schema change only)
**Test Fixtures:**
- `fixtures/hashing/sample_event_with_hash.json`: Sample event with hash fields
**Expected Coverage:**
- Lines: >80%
- Branches: >75%
- Critical paths (schema migration): 100%
## Error Scenarios
| Scenario | Error Code | Message | Recovery |
|----------|------------|---------|----------|
| Migration fails | `MIGRATION_FAILED` | "Failed to add hash fields: {error}" | Rollback migration, investigate |
| Invalid hash format | `INVALID_HASH_FORMAT` | "Invalid hash format" | Fix hash format (future) |
## Rollout and Deployment
**Feature Flags:** No
**Rollback Plan:**
- Rollback migration (remove columns)
- No data loss (columns nullable, no existing data)
**Monitoring:**
- Watch migration success
- Watch for events with hashes (should be 0 initially)
## Implementation Notes
**File Structure:**
```
src/
  hashing/
    hash_chain.ts             # Hash chaining utilities (stub)
    merkle.ts                 # Merkle root computation (stub, future)
```
**Key Implementation Details:**
- Schema fields nullable (no breaking changes)
- Hash computation utilities are stubs (no real computation yet)
- Fields stored but not computed (computation deferred)
**Dependencies:**
- Requires FU-050 (Event-Sourcing) — needs `state_events` table
## Documentation Updates
**Files Created:**
- `docs/architecture/hash_chaining.md`: Hash chaining documentation (stub)
**Files Updated:**
- `docs/subsystems/schema.md`: Document hash fields in `state_events` table
