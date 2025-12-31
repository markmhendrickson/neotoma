# Feature Unit: FU-050 Event-Sourcing Foundation
**Status:** Draft
**Priority:** P0 (Critical)
**Risk Level:** High
**Target Release:** v0.1.0
**Owner:** Engineering Team
**Reviewers:** Tech Lead
**Created:** 2025-01-XX
**Last Updated:** 2025-01-XX
## Overview
**Brief Description:**
Implement event-sourcing architecture foundation with append-only event log, canonical event schema, pure reducer functions, event validation pipeline, and historical replay functionality. Establishes blockchain-ready foundation for future decentralization.
**User Value:**
Enables complete audit trail of all record changes, time-travel queries (view record state at any point in time), and foundation for future blockchain/decentralization. Historical replay allows users to see how records evolved over time.
**Technical Approach:**
- Create `state_events` table (append-only) with canonical schema including crypto/hash fields
- Refactor MCP actions (`store_record`, `update_record`, `delete_record`) to emit events + apply reducers
- Implement pure reducer functions for state computation
- Add event validation pipeline
- Implement historical replay functionality
- Materialized view strategy: `records` table becomes materialized view computed from events (single source of truth)
## Requirements
### Functional Requirements
1. **Event Schema:**
   - `state_events` table with canonical schema (`id`, `event_type`, `payload`, `timestamp`, `record_id`, `previous_event_hash`, `event_hash`, `signer_public_key`, `signature`, `reducer_version`)
   - All fields nullable except `id`, `event_type`, `payload`, `timestamp`, `reducer_version`
   - Indexes on `record_id`, `timestamp`, `event_type`, `previous_event_hash`
2. **Event Emission:**
   - `store_record` emits `RecordCreated` event
   - `update_record` emits `RecordUpdated` event
   - `delete_record` emits `RecordDeleted` event
   - Events include full payload (record data)
3. **Reducer Functions:**
   - Pure reducer functions (`src/reducers/record_reducer.ts`)
   - `reduceRecordCreated(event)` → new record state
   - `reduceRecordUpdated(event)` → updated record state
   - `reduceRecordDeleted(event)` → deleted record state
   - Reducers are deterministic (same event → same state)
4. **Event Validation:**
   - Validate event schema before storage
   - Validate event type exists
   - Validate payload structure matches event type
   - Reject invalid events with clear error messages
5. **Historical Replay:**
   - `replayEvents(recordId, upToTimestamp?)` — Replay events to reconstruct state
   - `getRecordAtTimestamp(recordId, timestamp)` — Get record state at specific time
   - Events replayed in chronological order
   - Deterministic replay (same events → same state)
6. **Historical API Endpoints:**
   - `GET /api/records/:id/history` — Get all events for a record (chronological)
   - `GET /api/records/:id?at=2024-01-15T10:00:00Z` — Get record state at timestamp
7. **Materialized View Strategy:**
   - `records` table becomes PostgreSQL materialized view computed from `state_events`
   - View refreshed synchronously after event emission (via trigger or application call)
   - Single source of truth: events are authoritative, records are derived
   - Current state reads: query materialized view (<100ms performance requirement)
   - Historical state reads: replay events (<500ms acceptable for historical queries)
### Non-Functional Requirements
1. **Performance:**
   - Event emission: <10ms overhead per MCP action
   - Historical replay: <500ms for records with <100 events
   - Historical API: <500ms P95 latency
2. **Determinism:**
   - Reducers MUST be pure functions (no side effects)
   - Same events → same state (100% deterministic)
   - Replay MUST produce identical state to direct DB read
3. **Consistency:**
   - Strong consistency: Events written atomically, materialized view refreshed synchronously
   - Event log append-only (no updates/deletes)
   - State computed from events (single source of truth)
   - Materialized view ensures current state queries meet <100ms requirement
4. **Accessibility:**
   - Historical API endpoints follow REST conventions
   - Error responses include clear error codes
5. **Internationalization:**
   - Timestamps in ISO 8601 format (UTC)
   - No locale-specific formatting in event payloads
### Invariants
**MUST:**
- Events MUST be append-only (never updated or deleted)
- Reducers MUST be pure functions (no side effects, no I/O)
- Event schema MUST include all future fields (crypto, hash) even if unused
- Historical replay MUST be deterministic (same events → same state)
- Event validation MUST reject invalid events before storage
**MUST NOT:**
- MUST NOT mutate existing events
- MUST NOT delete events
- MUST NOT have side effects in reducers
- MUST NOT skip event validation
- MUST NOT write directly to `records` table (only via materialized view refresh)
## Affected Subsystems
**Primary Subsystems:**
- **Events:** New `state_events` table, event log, event validation
- **Reducers:** Pure reducer functions for state computation
- **MCP Actions:** Refactor to emit events + apply reducers
- **API:** New historical endpoints
**Dependencies:**
- Requires FU-000 (Database Schema) — needs `state_events` table
- Blocks FU-201, FU-203, FU-204 (MCP actions must use event-sourcing)
**Documentation to Load:**
- `docs/NEOTOMA_MANIFEST.md`
- `docs/architecture/blockchain_readiness_assessment.md`
- `docs/subsystems/events.md`
- `docs/architecture/architecture.md`
## Schema Changes
**Tables Affected:**
- **NEW TABLE:** `state_events`
  ```sql
  CREATE TABLE state_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    record_id TEXT,                        -- For filtering events by record
    previous_event_hash TEXT,              -- For hash chaining (nullable)
    event_hash TEXT,                       -- Computed hash of event (nullable)
    signer_public_key TEXT,                -- For future crypto (nullable)
    signature TEXT,                        -- For future crypto (nullable)
    reducer_version TEXT DEFAULT '1.0',    -- For versioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  
  CREATE INDEX idx_state_events_record_id ON state_events(record_id);
  CREATE INDEX idx_state_events_timestamp ON state_events(timestamp);
  CREATE INDEX idx_state_events_type ON state_events(event_type);
  CREATE INDEX idx_state_events_previous_hash ON state_events(previous_event_hash) WHERE previous_event_hash IS NOT NULL;
  ```
- **MATERIALIZED VIEW:** `records` (converted from table)
  ```sql
  -- PostgreSQL function to replay events and compute state
  CREATE OR REPLACE FUNCTION replay_events_to_state(p_record_id TEXT)
  RETURNS JSONB AS $$
  DECLARE
    v_state JSONB := '{}';
    v_event RECORD;
  BEGIN
    -- Replay events chronologically
    FOR v_event IN 
      SELECT * FROM state_events 
      WHERE record_id = p_record_id 
      ORDER BY timestamp ASC
    LOOP
      -- Apply reducer based on event type
      CASE v_event.event_type
        WHEN 'RecordCreated' THEN
          v_state := v_event.payload;
        WHEN 'RecordUpdated' THEN
          v_state := v_state || v_event.payload; -- Merge properties
        WHEN 'RecordDeleted' THEN
          v_state := v_state || jsonb_build_object('deleted_at', v_event.timestamp);
      END CASE;
    END LOOP;
    RETURN v_state;
  END;
  $$ LANGUAGE plpgsql;
  -- Convert records table to materialized view
  DROP TABLE IF EXISTS records CASCADE;
  CREATE MATERIALIZED VIEW records AS
  SELECT DISTINCT ON (record_id)
    record_id as id,
    replay_events_to_state(record_id) as properties,
    -- Extract other fields from computed state
    (replay_events_to_state(record_id)->>'type')::TEXT as type,
    (replay_events_to_state(record_id)->>'created_at')::TIMESTAMP WITH TIME ZONE as created_at,
    (replay_events_to_state(record_id)->>'updated_at')::TIMESTAMP WITH TIME ZONE as updated_at
  FROM state_events
  WHERE record_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM state_events e2 
      WHERE e2.record_id = state_events.record_id 
      AND e2.event_type = 'RecordDeleted'
      AND e2.timestamp > state_events.timestamp
    )
  ORDER BY record_id, timestamp DESC;
  CREATE UNIQUE INDEX ON records(id);
  
  -- Refresh function (called after event emission)
  CREATE OR REPLACE FUNCTION refresh_records_view()
  RETURNS void AS $$
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY records;
  END;
  $$ LANGUAGE plpgsql;
  ```
**Note:** The materialized view implementation may use application-level reducer functions (TypeScript) instead of PostgreSQL functions for better maintainability. The view refresh can be triggered:
- Option A: PostgreSQL trigger after event insert (automatic)
- Option B: Application-level refresh call after event emission (explicit control)
**JSONB Schema Changes:**
- None (events use `payload` JSONB, no schema versioning needed)
**Migration Required:** Yes
**Migration File:** `supabase/migrations/YYYYMMDDHHMMSS_add_state_events_table_and_materialized_view.sql`
**Migration Description:**
- Create `state_events` table with all fields (crypto/hash fields nullable)
- Create indexes for efficient querying
- Convert `records` table to materialized view (computed from events via reducer replay)
- Create PostgreSQL function to replay events and compute state
- Create trigger or application-level refresh mechanism for materialized view
- No data migration needed (new table, view computed from events)
## API/MCP Changes
**Modified MCP Actions:**
- `store_record(params)`: Emits `RecordCreated` event → refreshes materialized view → returns record
- `update_record(params)`: Emits `RecordUpdated` event → refreshes materialized view → returns record
- `delete_record(params)`: Emits `RecordDeleted` event → refreshes materialized view → returns confirmation
- All actions read current state from materialized view (not direct event replay for performance)
**New API Endpoints:**
- `GET /api/records/:id/history`: Get all events for a record
- `GET /api/records/:id?at=ISO_TIMESTAMP`: Get record state at timestamp
**API Contract:**
```typescript
// GET /api/records/:id/history
// Response (200 OK)
interface EventHistoryResponse {
  events: Array<{
    id: string;
    event_type: string;
    payload: Record<string, any>;
    timestamp: string;
    record_id: string;
    reducer_version: string;
    created_at: string;
  }>;
}
// GET /api/records/:id?at=2024-01-15T10:00:00Z
// Response (200 OK)
interface RecordAtTimestampResponse {
  id: string;
  type: string;
  properties: Record<string, any>;
  file_urls: string[];
  created_at: string;
  updated_at: string;
  // ... other record fields as they existed at timestamp
}
// Errors
const POSSIBLE_ERRORS = [
  'RECORD_NOT_FOUND',
  'INVALID_TIMESTAMP',
  'EVENT_REPLAY_FAILED',
  'EVENT_VALIDATION_FAILED'
];
```
## UI Changes
**Components Affected:**
- None (v0.1.0 is MCP-only, no UI)
**UI Changes:** N/A (Internal MCP Release)
## Observability
**Metrics:**
- `state_event_emitted_total`: Counter (labels: `event_type`, `status=success|failed`)
- `state_event_replay_duration_ms`: Histogram (measures historical replay latency)
- `state_event_validation_failures_total`: Counter (labels: `error_code`)
- `reducer_application_duration_ms`: Histogram (measures reducer execution time)
**Logs:**
- Level `info`: "Event emitted" (fields: `event_id`, `event_type`, `record_id`, `timestamp`)
- Level `info`: "Historical replay completed" (fields: `record_id`, `event_count`, `duration_ms`)
- Level `error`: "Event validation failed" (fields: `event_type`, `error_code`, `trace_id`)
- Level `error`: "Reducer application failed" (fields: `event_id`, `reducer_version`, `error_code`, `trace_id`)
**Events:**
- `state_event.emitted`: Emitted when event successfully stored (payload: `event_id`, `event_type`, `record_id`)
- `state_event.validation_failed`: Emitted when event validation fails (payload: `event_type`, `error_code`)
**Traces:**
- Span name: `emit_event` (attributes: `event_type`, `record_id`)
- Span name: `replay_events` (attributes: `record_id`, `event_count`, `up_to_timestamp`)
## Testing Strategy
**Unit Tests:**
- `eventSchema.validate()`: Verify event schema validation
- `reduceRecordCreated()`: Verify reducer produces correct state
- `reduceRecordUpdated()`: Verify reducer merges updates correctly
- `reduceRecordDeleted()`: Verify reducer marks record as deleted
- `replayEvents()`: Verify replay produces correct state
- `getRecordAtTimestamp()`: Verify timestamp filtering works
**Integration Tests:**
- `store_record → event emitted → reducer applied → state matches`: Verify end-to-end flow
- `update_record → event emitted → reducer applied → state updated`: Verify update flow
- `delete_record → event emitted → reducer applied → state deleted`: Verify delete flow
- `replay_events → state matches direct DB read`: Verify replay correctness
- `historical_api → returns correct events`: Verify API endpoints
**Property-Based Tests:**
- Property: Same events → same state (100 runs, deterministic)
- Property: Replay events → state matches direct DB read (100 runs)
- Property: Event emission + reducer application → state consistent (100 runs)
**Test Fixtures:**
- `fixtures/events/record_created_event.json`: Sample `RecordCreated` event
- `fixtures/events/record_updated_event.json`: Sample `RecordUpdated` event
- `fixtures/events/record_deleted_event.json`: Sample `RecordDeleted` event
- `fixtures/records/sample_record.json`: Sample record for state comparison
**Expected Coverage:**
- Lines: >90%
- Branches: >85%
- Critical paths (event emission, reducers, replay): 100%
## Error Scenarios
| Scenario | Error Code | Message | Recovery |
|----------|------------|---------|----------|
| Invalid event schema | `EVENT_VALIDATION_FAILED` | "Event schema validation failed: {details}" | Fix event payload, retry |
| Reducer application failed | `REDUCER_APPLICATION_FAILED` | "Reducer failed: {error}" | Check reducer version, fix reducer |
| Record not found for replay | `RECORD_NOT_FOUND` | "Record {id} not found" | Verify record ID |
| Invalid timestamp format | `INVALID_TIMESTAMP` | "Invalid timestamp format: {timestamp}" | Use ISO 8601 format |
| Event replay timeout | `REPLAY_TIMEOUT` | "Event replay exceeded timeout" | Optimize replay or reduce event count |
## Rollout and Deployment
**Feature Flags:** No
**Rollback Plan:**
- Revert MCP action changes (remove event emission)
- Keep `state_events` table (no data loss)
- Convert materialized view back to regular table (if needed)
- Replay events to populate `records` table from `state_events` if needed
**Monitoring:**
- Watch `state_event_emitted_total` for emission success rate >99%
- Watch `state_event_replay_duration_ms` P95 <500ms
- Watch `state_event_validation_failures_total` for validation errors
- Watch `reducer_application_duration_ms` P95 <50ms
## Implementation Notes
**File Structure:**
```
src/
  events/
    event_log.ts              # Append-only event log operations
    event_schema.ts           # Canonical event schema definition
    event_validator.ts         # Event validation pipeline
    replay.ts                 # Historical replay functionality
  reducers/
    record_reducer.ts         # Pure reducer functions for records
    reducer_registry.ts       # Reducer registry (for versioning)
```
**Key Implementation Details:**
- Events stored with `record_id` for efficient filtering
- Reducers are pure functions (no side effects, deterministic)
- Materialized view: `records` computed from events via reducer replay
- View refresh: Synchronous refresh after event emission (via trigger or application call)
- Historical replay queries events by `record_id`, orders by `timestamp`
- Event validation happens before storage (reject invalid events early)
- Current state: Read from materialized view (<100ms)
- Historical state: Replay events (<500ms acceptable)
**Dependencies:**
- Requires FU-000 (Database Schema) — `state_events` table
- Blocks FU-201, FU-203, FU-204 (MCP actions must use event-sourcing)
## Documentation Updates
**Files Created:**
- `docs/subsystems/event_sourcing.md`: Event-sourcing architecture documentation
- `docs/architecture/historical_replay.md`: Historical replay usage guide
**Files Updated:**
- `docs/subsystems/events.md`: Update to include state events (not just observability events)
- `docs/architecture/architecture.md`: Add event-sourcing layer to architecture diagram
