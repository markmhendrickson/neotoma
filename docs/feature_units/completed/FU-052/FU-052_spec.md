# Feature Unit: FU-052 Reducer Versioning

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
Implement reducer versioning system with reducer registry, version metadata in events, and version-aware reducer application. Enables future reducer upgrades and migrations without breaking existing event log.

**User Value:**
Enables reducer upgrades and migrations without breaking historical events. Foundation for long-term event log compatibility as reducers evolve.

**Technical Approach:**
- Add `reducer_version` metadata to events (already in schema from FU-050)
- Create reducer registry with version mapping
- Implement version-aware reducer application
- Create migration path utilities (stub for future migrations)
- Reducer registry maps version → reducer function

---

## Requirements

### Functional Requirements

1. **Reducer Version Metadata:**
   - Events include `reducer_version` field (default: "1.0")
   - Version stored with each event
   - Version determines which reducer function to use

2. **Reducer Registry:**
   - Registry maps `reducer_version` → reducer function
   - Supports multiple reducer versions simultaneously
   - Default reducer version: "1.0"

3. **Version-Aware Reducer Application:**
   - Apply reducer based on event's `reducer_version`
   - Use correct reducer version for each event
   - Support multiple reducer versions in same replay

4. **Migration Path Utilities:**
   - Stub utilities for future reducer migrations
   - `migrateEventToVersion()` utility (stub)
   - `getReducerVersion()` utility

5. **Backward Compatibility:**
   - Events without version default to "1.0"
   - Old events replayable with version "1.0" reducer
   - New events use latest reducer version

### Non-Functional Requirements

1. **Performance:**
   - Version lookup: <1ms overhead
   - Reducer registry: O(1) lookup time
   - No performance degradation vs single reducer

2. **Determinism:**
   - Same event + same version → same reducer → same state
   - Version-aware application is deterministic
   - Migration utilities are deterministic (when implemented)

3. **Consistency:**
   - Strong consistency: Version applied atomically with reducer
   - Version registry immutable (no runtime changes)

4. **Accessibility:** N/A (backend only)

5. **Internationalization:** N/A (backend only)

### Invariants

**MUST:**
- Events MUST include `reducer_version` metadata
- Reducer registry MUST map version → reducer function
- Reducer application MUST use correct version for each event
- Old events MUST be replayable with version "1.0" reducer

**MUST NOT:**
- MUST NOT break backward compatibility (old events must work)
- MUST NOT allow runtime reducer registry changes
- MUST NOT skip version checking

---

## Affected Subsystems

**Primary Subsystems:**
- **Reducers:** Reducer registry, version-aware application
- **Events:** Version metadata already in schema (FU-050)

**Dependencies:**
- Requires FU-050 (Event-Sourcing) — needs event schema with `reducer_version` field
- Blocks nothing (foundational, enables future migrations)

**Documentation to Load:**
- `docs/NEOTOMA_MANIFEST.md`
- `docs/architecture/blockchain_readiness_assessment.md`
- `docs/subsystems/event_sourcing.md` (if exists)

---

## Schema Changes

**Tables Affected:**
- None (`reducer_version` already in `state_events` schema from FU-050)

**JSONB Schema Changes:**
- None

**Migration Required:** No

---

## API/MCP Changes

**API Changes:** None (internal implementation)

**MCP Changes:** None (internal implementation)

---

## UI Changes

**UI Changes:** N/A (Internal MCP Release, backend only)

---

## Observability

**Metrics:**
- `reducer_version_usage_total`: Counter (labels: `reducer_version`)
- `reducer_version_mismatch_total`: Counter (tracks version mismatches)
- `reducer_registry_lookup_duration_ms`: Histogram (measures registry lookup time)

**Logs:**
- Level `info`: "Reducer version applied" (fields: `event_id`, `reducer_version`, `event_type`)
- Level `warn`: "Reducer version mismatch" (fields: `event_id`, `expected_version`, `actual_version`)
- Level `error`: "Reducer version not found" (fields: `reducer_version`, `event_id`, `trace_id`)

**Events:**
- `reducer.version_applied`: Emitted when reducer version applied (payload: `event_id`, `reducer_version`)

**Traces:**
- Span name: `apply_reducer_with_version` (attributes: `reducer_version`, `event_type`)

---

## Testing Strategy

**Unit Tests:**
- `ReducerRegistry.getReducer()`: Verify correct reducer returned for version
- `ReducerRegistry.getReducer()`: Verify default version "1.0" works
- `applyReducerWithVersion()`: Verify version-aware application
- `applyReducerWithVersion()`: Verify old events default to "1.0"

**Integration Tests:**
- `Replay events with multiple versions → correct reducers applied`: Verify version-aware replay
- `Old events without version → default to "1.0"`: Verify backward compatibility

**Property-Based Tests:**
- Property: Same event + same version → same reducer → same state (100 runs)
- Property: Version-aware application is deterministic (100 runs)

**Test Fixtures:**
- `fixtures/reducers/event_v1.0.json`: Event with version "1.0"
- `fixtures/reducers/event_v1.1.json`: Event with version "1.1" (future)

**Expected Coverage:**
- Lines: >85%
- Branches: >80%
- Critical paths (version lookup, reducer application): 100%

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
|----------|------------|---------|----------|
| Reducer version not found | `REDUCER_VERSION_NOT_FOUND` | "Reducer version {version} not found" | Add reducer version to registry |
| Version mismatch | `REDUCER_VERSION_MISMATCH` | "Version mismatch: expected {expected}, got {actual}" | Use correct reducer version |
| Invalid reducer version | `INVALID_REDUCER_VERSION` | "Invalid reducer version format: {version}" | Fix version format |

---

## Rollout and Deployment

**Feature Flags:** No

**Rollback Plan:**
- Revert to single reducer (ignore version)
- Keep version metadata in events (no data loss)
- Can re-enable versioning later

**Monitoring:**
- Watch `reducer_version_usage_total` for version distribution
- Watch `reducer_version_mismatch_total` for version errors
- Watch `reducer_registry_lookup_duration_ms` P95 <1ms

---

## Implementation Notes

**File Structure:**
```
src/
  reducers/
    reducer_registry.ts        # Reducer registry with version mapping
    reducer_versioning.ts      # Version-aware reducer application
    migrations/
      migration_utils.ts      # Migration utilities (stub)
```

**Key Implementation Details:**
- Reducer registry: Map<string, ReducerFunction>
- Default version: "1.0"
- Version lookup: O(1) hash map lookup
- Migration utilities: Stub for future migrations

**Dependencies:**
- Requires FU-050 (Event-Sourcing) — needs `reducer_version` field in events

---

## Documentation Updates

**Files Created:**
- `docs/architecture/reducer_versioning.md`: Reducer versioning documentation

**Files Updated:**
- `docs/subsystems/event_sourcing.md`: Add reducer versioning section










