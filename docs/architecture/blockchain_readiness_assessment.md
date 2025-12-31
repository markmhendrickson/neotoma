# Neotoma MVP Blockchain Readiness Assessment
## Executive Summary
Assessment of Neotoma MVP plans against blockchain-ready, decentralized architecture criteria. **Revised recommendation: Incorporate foundational patterns into MVP** to avoid expensive post-MVP refactoring.
**Key Finding:** Event-sourcing, repository abstractions, and cryptographic schema fields are **architectural foundations** that are expensive to retrofit. These should be included in MVP even if full implementation is deferred.
## Critical Decision: Foundational vs. Additive Patterns
### Foundational Patterns (MUST be in MVP)
These patterns are **architectural foundations** that are expensive or impossible to retrofit:
1. **Event-sourcing architecture** — Entire data layer rebuild required post-MVP
2. **Repository abstractions** — Domain logic tightly coupled to storage without this
3. **Event schema with crypto fields** — Schema changes are expensive; include fields now
4. **Hash chaining fields** — Schema changes are expensive; include fields now
5. **Reducer versioning** — Required for event-sourcing upgradability
### Additive Patterns (Can defer to post-MVP)
These can be layered on incrementally:
1. **Cryptographic signature verification** — Logic can be added to existing fields
2. **Merkle root computation** — Can use existing hash fields
3. **Capability token validation** — Can layer above RLS
## Revised Recommendations: Include All in v0.1.0
**Decision:** Include all foundational patterns in **v0.1.0 (Internal MCP Release)** to establish blockchain-ready architecture from the start, rather than retrofitting later.
### MUST Include in v0.1.0 (P0)
#### 1. Event-Sourcing Foundation (FU-050)
**Deliverables:**
- `state_events` table (append-only) with canonical schema:
  ```sql
  CREATE TABLE state_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    record_id TEXT,             -- For filtering events by record
    previous_event_hash TEXT,   -- For hash chaining
    event_hash TEXT,            -- Computed hash of event
    signer_public_key TEXT,     -- For future crypto (nullable)
    signature TEXT,             -- For future crypto (nullable)
    reducer_version TEXT DEFAULT '1.0',  -- For versioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE INDEX idx_state_events_record_id ON state_events(record_id);
  CREATE INDEX idx_state_events_timestamp ON state_events(timestamp);
  ```
- Refactor `src/actions.ts` to emit events + apply reducers
- Pure reducer functions (`src/reducers/`)
- Event validation pipeline
- **Event replay functionality** (`src/events/replay.ts`):
  - `replayEvents(recordId, upToTimestamp?)` — Replay events to reconstruct state
  - `getRecordAtTimestamp(recordId, timestamp)` — Get record state at specific time
- **Historical API endpoints**:
  - `GET /api/records/:id/history` — Get all events for a record
  - `GET /api/records/:id?at=2024-01-15T10:00:00Z` — Get record state at timestamp
- Keep current CRUD as adapter during transition
**Estimate:** 5-7 days (includes replay functionality, assumes Cursor agent execution)
**Rationale:** Rebuilding entire data layer post-MVP is expensive. Event schema should include all future fields (crypto, hashing) even if logic isn't implemented yet. **Historical replay is a core benefit of event-sourcing** and should be available in MVP.
#### 2. Repository Abstractions (FU-051)
**Deliverables:**
- `EventRepository` interface
- `StateRepository` interface
- `CapabilityRepository` interface (stub for future)
- File-based implementations (`src/repositories/file/`)
- Refactor domain services to use repositories (dependency injection)
- Remove direct DB access from domain layer
**Estimate:** 3-4 days (assumes Cursor agent execution)
**Rationale:** Domain logic touching storage directly prevents multi-backend support (file, DB, blockchain). This is foundational for future decentralization.
#### 3. Reducer Versioning (FU-052)
**Deliverables:**
- `reducer_version` metadata in events
- Reducer registry with version mapping
- Migration path utilities (stub for future migrations)
- Version-aware reducer application
**Estimate:** 1-2 days (assumes Cursor agent execution)
**Rationale:** Required for event-sourcing upgradability. If reducers exist, versioning must exist.
#### 4. Cryptographic Schema Fields (FU-053)
**Deliverables:**
- `signer_public_key` + `signature` fields in `state_events` table (nullable)
- Agent identity abstraction (`src/crypto/agent_identity.ts`)
- Schema supports crypto, but verification logic deferred
**Estimate:** 1 day (assumes Cursor agent execution)
**Rationale:** Schema changes are expensive. Include fields now, implement verification logic post-MVP.
#### 5. Hash Chaining Schema Fields (FU-054)
**Deliverables:**
- `previous_event_hash` + `event_hash` fields in `state_events` table
- Hash computation utilities (stub)
- Schema supports chaining, but Merkle logic deferred
**Estimate:** 1 day (assumes Cursor agent execution)
**Rationale:** Schema changes are expensive. Include fields now, implement Merkle root computation post-MVP.
### CAN Defer to Post-MVP (P1/P2)
1. **Cryptographic signature verification** — Add logic to existing `signature` field
2. **Merkle root computation** — Use existing `event_hash` fields
3. **Capability token validation** — Layer above existing RLS
4. **Blockchain anchoring** — Use existing event log structure
## Impact on MVP Timeline
**Assumption:** All timeline estimates assume Cursor agent execution (not human developers).
**New Feature Units:**
- FU-050: Event-Sourcing Foundation — 4-6 days
- FU-051: Repository Abstractions — 3-4 days
- FU-052: Reducer Versioning — 1-2 days
- FU-053: Cryptographic Schema Fields — 1 day
- FU-054: Hash Chaining Schema Fields — 1 day
**Total Addition:** 11-15 days (includes historical replay functionality, assumes Cursor agent execution)
**Release Target:** v0.1.0 (Internal MCP Release) - establishes foundation before MVP
**Modified Feature Units (v0.1.0):**
- FU-201 (store_record): Emit `RecordCreated` event + apply reducer
- FU-203 (update_record): Emit `RecordUpdated` event + apply reducer
- FU-204 (delete_record): Emit `RecordDeleted` event + apply reducer
**Impact on v1.0.0 (MVP):**
- v1.0.0 inherits event-sourcing foundation from v0.1.0
- No refactoring needed - foundation already established
- Can focus on UI, multi-user, and product features
**Total v0.1.0 Extension:** 11-15 days (includes historical replay functionality, assumes Cursor agent execution)
**Note:** These foundational patterns will be inherited by v1.0.0 (MVP), avoiding expensive refactoring.
## Architecture Changes Required
### New Folder Structure
```
src/
  events/
    event_log.ts              # Append-only event log
    event_schema.ts            # Canonical event schema (with crypto/hash fields)
    event_validator.ts         # Event validation pipeline
    replay.ts                  # Event replay functionality for historical state
  reducers/
    reducer.ts                 # Pure reducer functions
    reducer_registry.ts        # Version-aware reducer registry
    reducer_versioning.ts      # Version migration utilities
  repositories/
    interfaces.ts              # EventRepository, StateRepository, CapabilityRepository
    file/
      event_repo.ts           # File-based event repository
      state_repo.ts            # File-based state repository
    db/
      event_repo.ts           # DB-based event repository (future)
      state_repo.ts            # DB-based state repository (future)
  crypto/
    agent_identity.ts          # Agent public key abstraction
    event_signing.ts           # Event signature utilities (stub)
  hashing/
    hash_chain.ts             # Hash chaining utilities (stub)
    merkle.ts                  # Merkle root computation (stub)
```
### Database Schema Changes
**New Table: `state_events`**
```sql
CREATE TABLE state_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT,
  signer_public_key TEXT,
  signature TEXT,
  reducer_version TEXT DEFAULT '1.0',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_state_events_type ON state_events(event_type);
CREATE INDEX idx_state_events_timestamp ON state_events(timestamp);
CREATE INDEX idx_state_events_previous_hash ON state_events(previous_event_hash);
```
## Migration Strategy
### Phase 1: Materialized View (v0.1.0)
- Emit events to `state_events` table (single source of truth)
- Apply reducers to compute state
- `records` table is materialized view computed from events
- View refreshed synchronously after event emission
- Current state reads: query materialized view (<100ms)
- Historical state reads: replay events (<500ms)
**Rationale:** Implement the correct long-term architecture from the start. Materialized views provide single source of truth (events) with performance-optimized current state reads, avoiding dual-write complexity and consistency risks.
## Historical Playback Capabilities (MVP)
With event-sourcing foundation in place, MVP will support:
### Core Functionality
**Primary: Entity Historical State (Most Important)**
Entities are the primary unit of truth and evolve over time as new observations arrive. Historical entity state inspection enables understanding how entities changed across multiple sources:
```typescript
// Get entity snapshot at specific point in time
// Filters observations up to timestamp and recomputes snapshot
const entityAtTime = await getEntitySnapshotAtTimestamp(
  entityId,
  "2024-01-15T10:00:00Z"
);
// List observations up to timestamp to see what contributed to historical state
const observations = await listObservations(entityId, {
  upToTimestamp: "2024-01-15T10:00:00Z",
});
```
**Why Entity Historical State Matters:**
- Entities merge information from multiple documents over time
- Understanding entity evolution (how a company's address changed, how a person's role evolved) is core to reasoning
- Agents query entities, not individual records
- Entity-centric architecture means historical entity state is the primary use case
**Secondary: Record Historical State**
Records are mostly static once ingested (they're evidence nodes), but historical replay is available for audit:
```typescript
// Replay all events for a record to reconstruct current state
const record = await replayEvents(recordId);
// Replay events up to a specific timestamp
const recordAtTime = await replayEvents(recordId, "2024-01-15T10:00:00Z");
// Get record state at specific point in time
const record = await getRecordAtTimestamp(recordId, "2024-01-15T10:00:00Z");
```
**Event History API**
```typescript
// Get all events for a record (chronological)
GET /api/records/:id/history
// Returns: [{ event_type, timestamp, payload, ... }, ...]
// Get record state at specific timestamp
GET /api/records/:id?at=2024-01-15T10:00:00Z
// Returns: Record state as it existed at that time
```
### Use Cases Enabled
- **Entity Evolution**: See how entities changed over time as new observations arrived (primary use case)
- **Audit Trail**: See complete history of changes to any record or entity
- **Time Travel**: View entity state at any point in time to understand historical truth
- **Debugging**: Trace how entity truth evolved over time across multiple sources
- **Compliance**: Full audit log of all modifications
- **Undo/Redo**: Replay events to different states (foundation for undo)
### Implementation Notes
- Events are stored chronologically with `timestamp` and `record_id` indexes
- Reducers are pure functions, so replay is deterministic
- Historical queries may be slower than current state queries (acceptable for MVP)
- Materialized views provide fast current state reads (<100ms)
- Historical queries use event replay (<500ms acceptable)
## Benefits of This Approach
1. **Future-proof schema** — All fields needed for blockchain/decentralization included
2. **No expensive refactoring** — Event-sourcing foundation established from start
3. **Incremental implementation** — Crypto/hash logic can be added incrementally
4. **Single source of truth** — Events are authoritative, records are derived via materialized view
5. **Testable** — Reducers are pure functions, easy to test
6. **Full historical playback** — Replay events to view record state at any point in time (MVP feature)
7. **Audit trail** — Complete history of all changes to records
## Risks and Mitigations
**Risk:** Increased MVP complexity (+11-15 days)
**Mitigation:**
- Schema fields are nullable (no breaking changes)
- Crypto/hash logic is stubbed (minimal implementation)
- Materialized view provides single source of truth from the start
**Risk:** Over-engineering for MVP use case
**Mitigation:**
- Event-sourcing is foundational for blockchain-ready architecture
- Repository abstractions enable multi-backend support (required for decentralization)
- Schema fields are cheap to include, expensive to add later
## Conclusion
**Revised Recommendation:** Incorporate all foundational patterns (event-sourcing, repository abstractions, crypto/hash schema fields) into **v0.1.0 (Internal MCP Release)**. This adds 11-15 days to v0.1.0 but:
1. **Establishes blockchain-ready foundation from the start**
2. **Prevents expensive refactoring** before v1.0.0 (MVP)
3. **Enables historical replay** in v0.1.0 (core benefit of event-sourcing)
4. **v1.0.0 inherits foundation** - can focus on UI, multi-user, and product features
**Key Principle:** Schema changes are expensive. If creating event schema now, include all fields needed for future blockchain/decentralization, even if logic is deferred. Event-sourcing is foundational - better to establish it early than retrofit later.
**Impact:**
- **v0.1.0**: +11-15 days (establishes foundation)
- **v1.0.0**: No refactoring needed (inherits foundation from v0.1.0)
