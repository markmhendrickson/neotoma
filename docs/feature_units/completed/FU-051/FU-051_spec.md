# Feature Unit: FU-051 Repository Abstractions

**Status:** Draft
**Priority:** P0 (Critical)
**Risk Level:** Medium
**Target Release:** v0.1.0
**Owner:** Engineering Team
**Reviewers:** Tech Lead
**Created:** 2025-01-XX
**Last Updated:** 2025-01-XX

---

## Overview

**Brief Description:**
Create repository interfaces (`EventRepository`, `StateRepository`, `CapabilityRepository`) and file-based implementations to isolate domain logic from storage. Enables multi-backend support (file, DB, blockchain) required for future decentralization.

**User Value:**
Enables future multi-node, database, and blockchain backends without refactoring domain logic. Foundation for decentralized operation where storage backends can be swapped without changing business logic.

**Technical Approach:**
- Define repository interfaces (`src/repositories/interfaces.ts`)
- Implement file-based repositories (`src/repositories/file/`)
- Refactor domain services to use repositories via dependency injection
- Remove direct DB access from domain layer
- Keep DB repository as future implementation (stub)

---

## Requirements

### Functional Requirements

1. **Repository Interfaces:**
   - `EventRepository` interface: `appendEvent()`, `getEvents()`, `getEventsByRecordId()`, `getEventsByTimestampRange()`
   - `StateRepository` interface: `getState()`, `saveState()`, `getStateAtTimestamp()`
   - `CapabilityRepository` interface: `storeCapability()`, `getCapability()`, `validateCapability()` (stub for future)

2. **File-Based Implementations:**
   - `FileEventRepository`: Append-only event log stored in files
   - `FileStateRepository`: State snapshots stored in files
   - `FileCapabilityRepository`: Capabilities stored in files (stub)

3. **Dependency Injection:**
   - Domain services receive repositories via constructor injection
   - No direct DB access in domain layer
   - Repository implementations swappable

4. **Backward Compatibility:**
   - File repositories read/write same data format as DB
   - Can switch between file and DB repositories without data migration
   - Both implementations produce identical results

### Non-Functional Requirements

1. **Performance:**
   - Repository operations: <50ms P95 latency
   - File I/O: Efficient file operations (append-only for events)
   - No performance degradation vs direct DB access

2. **Determinism:**
   - Repository operations MUST be deterministic
   - Same inputs → same outputs (file or DB)
   - File repository produces identical results to DB repository

3. **Consistency:**
   - Strong consistency: Repository operations atomic
   - File operations: Atomic writes (fsync for durability)

4. **Accessibility:** N/A (backend only)

5. **Internationalization:** N/A (backend only)

### Invariants

**MUST:**
- Domain logic MUST use repository interfaces (no direct storage access)
- Repository implementations MUST be swappable (same interface, different backend)
- File repositories MUST produce identical results to DB repositories
- Repository operations MUST be deterministic

**MUST NOT:**
- MUST NOT have direct DB access in domain layer
- MUST NOT have file I/O in domain layer
- MUST NOT break backward compatibility (existing data readable)
- MUST NOT introduce non-determinism

---

## Affected Subsystems

**Primary Subsystems:**
- **Repositories:** New repository interfaces and implementations
- **Domain Services:** Refactor to use repositories (Entity Resolution, Graph Builder, Search)
- **MCP Actions:** Use repositories instead of direct DB access

**Dependencies:**
- Requires FU-000 (Database Schema) — needs to understand current schema
- Requires FU-050 (Event-Sourcing) — EventRepository depends on event schema
- Blocks FU-201, FU-203, FU-204 (MCP actions must use repositories)

**Documentation to Load:**
- `docs/NEOTOMA_MANIFEST.md`
- `docs/architecture/blockchain_readiness_assessment.md`
- `docs/architecture/architecture.md`
- `docs/subsystems/schema.md`

---

## Schema Changes

**Tables Affected:**
- None (repositories abstract storage, don't change schema)

**JSONB Schema Changes:**
- None

**Migration Required:** No

---

## API/MCP Changes

**Modified MCP Actions:**
- `store_record`: Uses `StateRepository` instead of direct DB
- `update_record`: Uses `StateRepository` instead of direct DB
- `delete_record`: Uses `StateRepository` instead of direct DB
- `retrieve_records`: Uses `StateRepository` instead of direct DB

**API Contract:** No changes (repositories are internal abstraction)

---

## UI Changes

**UI Changes:** N/A (Internal MCP Release, backend only)

---

## Observability

**Metrics:**
- `repository_operation_total`: Counter (labels: `repository_type`, `operation`, `status`)
- `repository_operation_duration_ms`: Histogram (labels: `repository_type`, `operation`)
- `repository_backend_switch_total`: Counter (tracks backend switches)

**Logs:**
- Level `info`: "Repository operation" (fields: `repository_type`, `operation`, `duration_ms`)
- Level `error`: "Repository operation failed" (fields: `repository_type`, `operation`, `error_code`, `trace_id`)

**Events:**
- `repository.backend_switched`: Emitted when repository backend changes (payload: `from_backend`, `to_backend`)

**Traces:**
- Span name: `repository_operation` (attributes: `repository_type`, `operation`)

---

## Testing Strategy

**Unit Tests:**
- `EventRepository.appendEvent()`: Verify event appended correctly
- `EventRepository.getEventsByRecordId()`: Verify events filtered by record
- `StateRepository.getState()`: Verify state retrieved correctly
- `StateRepository.saveState()`: Verify state saved correctly
- `FileEventRepository` vs `DbEventRepository`: Verify identical results
- `FileStateRepository` vs `DbStateRepository`: Verify identical results

**Integration Tests:**
- `Domain service uses repository → operations succeed`: Verify dependency injection
- `Switch repository backend → same results`: Verify backend swap works
- `File repository → DB repository → identical data`: Verify data compatibility

**Property-Based Tests:**
- Property: File repository operations → identical results as DB repository (100 runs)
- Property: Repository operations are deterministic (100 runs)

**Test Fixtures:**
- `fixtures/repositories/sample_events.json`: Sample events for repository tests
- `fixtures/repositories/sample_state.json`: Sample state for repository tests

**Expected Coverage:**
- Lines: >85%
- Branches: >80%
- Critical paths (repository operations): 100%

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
|----------|------------|---------|----------|
| Repository operation failed | `REPOSITORY_OPERATION_FAILED` | "Repository operation failed: {operation}" | Retry operation |
| File I/O error | `FILE_IO_ERROR` | "File operation failed: {path}" | Check file permissions, retry |
| Repository backend unavailable | `REPOSITORY_BACKEND_UNAVAILABLE` | "Repository backend unavailable: {backend}" | Switch to alternative backend |
| Invalid repository configuration | `INVALID_REPOSITORY_CONFIG` | "Invalid repository configuration" | Fix configuration, restart |

---

## Rollout and Deployment

**Feature Flags:** No

**Rollback Plan:**
- Revert domain service changes (restore direct DB access)
- Keep repository interfaces (no breaking changes)
- File repositories can be removed if needed

**Monitoring:**
- Watch `repository_operation_total` for success rate >99%
- Watch `repository_operation_duration_ms` P95 <50ms
- Watch for repository backend switches (should be rare)

---

## Implementation Notes

**File Structure:**
```
src/
  repositories/
    interfaces.ts              # EventRepository, StateRepository, CapabilityRepository interfaces
    file/
      event_repo.ts           # File-based event repository
      state_repo.ts           # File-based state repository
      capability_repo.ts      # File-based capability repository (stub)
    db/
      event_repo.ts           # DB-based event repository (future, stub)
      state_repo.ts            # DB-based state repository (future, stub)
```

**Key Implementation Details:**
- Repository interfaces define contracts (no implementation details)
- File repositories use append-only files for events
- State repositories use JSON files for snapshots
- Dependency injection via constructor parameters
- Domain services receive repositories, not DB clients

**Dependencies:**
- Requires FU-000 (Database Schema)
- Requires FU-050 (Event-Sourcing) — EventRepository depends on event schema
- Blocks FU-201, FU-203, FU-204 (MCP actions must use repositories)

---

## Documentation Updates

**Files Created:**
- `docs/architecture/repository_pattern.md`: Repository pattern documentation

**Files Updated:**
- `docs/architecture/architecture.md`: Add repository layer to architecture diagram
- `docs/subsystems/schema.md`: Document repository abstractions

