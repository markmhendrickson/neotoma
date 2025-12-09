## Release v0.1.0 — Execution Schedule

_(Generated from dependency analysis and topological sort)_

---

### 1. Batch Overview

| Batch ID | Feature Units | Dependencies | Can Parallelize? | Estimated Effort |
|----------|---------------|--------------|------------------|------------------|
| 0 | FU-000, FU-002 | None | Yes | Low |
| 0.5 | FU-050, FU-051 | FU-000 | Yes | Medium |
| 0.6 | FU-052, FU-053, FU-054 | FU-050 | Yes | Low |
| 1 | FU-200, FU-100 | FU-000 | Yes | High |
| 2 | FU-101, FU-102 | FU-100 | Yes | Medium |
| 3 | FU-103 | FU-101, FU-102 | No | Medium |
| 4 | FU-105 | FU-103 | No | Medium |
| 5 | FU-201, FU-203, FU-204, FU-206 | FU-200, FU-050, FU-051 | Yes | Low |
| 6 | FU-202, FU-205 | FU-200, FU-105, FU-100 | Yes | Medium |
| 7 | FU-104, FU-208 | FU-100, FU-200 | Yes | Low (Optional) |

**Total Batches:** 10 (9 required + 1 optional)

---

### 2. Detailed Batch Execution

#### Batch 0: Infrastructure (No Dependencies)

**Feature Units:**
- `FU-000`: Database Schema v1.0
- `FU-002`: Configuration Management

**Execution:** Can run in parallel

**Acceptance:** Schema created, configuration validated

---

#### Batch 0.5: Blockchain-Ready Architecture Foundation (Part 1)

**Feature Units:**
- `FU-050`: Event-Sourcing Foundation (append-only event log, reducers, historical replay)
- `FU-051`: Repository Abstractions (EventRepository, StateRepository interfaces)

**Dependencies:** FU-000

**Execution:** Can run in parallel (both depend only on FU-000)

**Acceptance:** Event-sourcing foundation operational, repository abstractions in place

**Checkpoint 0.5:** Review blockchain foundation before proceeding

---

#### Batch 0.6: Blockchain-Ready Architecture Foundation (Part 2)

**Feature Units:**
- `FU-052`: Reducer Versioning (version metadata, reducer registry)
- `FU-053`: Cryptographic Schema Fields (signer_public_key, signature fields)
- `FU-054`: Hash Chaining Schema Fields (previous_event_hash, event_hash fields)

**Dependencies:** FU-050

**Execution:** Can run in parallel (all depend only on FU-050)

**Acceptance:** Reducer versioning functional, crypto and hash fields in schema

---

#### Batch 1: MCP Core + File Analysis

**Feature Units:**
- `FU-200`: MCP Server Core
- `FU-100`: File Analysis Service (includes type detection analytics)

**Dependencies:** FU-000

**Execution:** Can run in parallel (both depend only on FU-000)

**Acceptance:** 
- MCP server starts, file analysis extracts text deterministically
- Type detection metadata stored in `extraction_metadata.type_detection`
- Telemetry events emitted for unknown schema types (forward-compatible with E2EE)
- See `type_detection_analytics.md` for implementation details

---

#### Batch 2: Entity and Event Services

**Feature Units:**
- `FU-101`: Entity Resolution Service
- `FU-102`: Event Generation Service

**Dependencies:** FU-100

**Execution:** Can run in parallel (both depend only on FU-100)

**Acceptance:** Entities resolved with canonical IDs, events generated from date fields

---

#### Batch 3: Graph Builder

**Feature Units:**
- `FU-103`: Graph Builder Service

**Dependencies:** FU-101, FU-102

**Execution:** Sequential (depends on both entity and event services)

**Acceptance:** Graph inserts transactional, 0 orphans, 0 cycles

---

#### Batch 4: Search Service

**Feature Units:**
- `FU-105`: Search Service

**Dependencies:** FU-103

**Execution:** Sequential

**Acceptance:** Structured search functional, deterministic ranking

**Checkpoint 1:** Mid-release review after Batch 4

---

#### Batch 5: Core MCP Actions

**Feature Units:**
- `FU-201`: MCP Action — `store_record` (emits events, applies reducers)
- `FU-203`: MCP Action — `update_record` (emits events, applies reducers)
- `FU-204`: MCP Action — `delete_record` (emits events, applies reducers)
- `FU-206`: MCP Action — `get_file_url`

**Dependencies:** FU-200, FU-050, FU-051

**Execution:** Can run in parallel (all depend on FU-200, FU-050, FU-051)

**Acceptance:** All 4 MCP actions functional and tested (using event-sourcing)

---

#### Batch 6: Service-Dependent MCP Actions

**Feature Units:**
- `FU-202`: MCP Action — `retrieve_records`
- `FU-205`: MCP Action — `upload_file`

**Dependencies:** FU-200, FU-105, FU-100

**Execution:** Can run in parallel (both have same dependencies)

**Acceptance:** Both MCP actions functional, upload triggers full pipeline

---

#### Batch 7: Optional Features

**Feature Units:**
- `FU-104`: Embedding Service (Optional)
- `FU-208`: MCP Provider Integrations (Optional)

**Dependencies:** FU-100, FU-200

**Execution:** Can run in parallel (optional, can be deferred)

**Acceptance:** Embeddings generated (if included), provider integrations functional (if included)

---

### 3. Parallelization Opportunities

**Maximum Parallelization:**
- Batch 0: 2 FUs in parallel
- Batch 0.5: 2 FUs in parallel
- Batch 0.6: 3 FUs in parallel
- Batch 1: 2 FUs in parallel
- Batch 2: 2 FUs in parallel
- Batch 5: 4 FUs in parallel
- Batch 6: 2 FUs in parallel
- Batch 7: 2 FUs in parallel (optional)

**WIP Limits:**
- `max_parallel_fus: 3` (enforced across all batches)
- `max_high_risk_in_parallel: 1` (FU-100 is high-risk, others are medium/low)

---

### 4. Estimated Timeline

**Assumptions:**
- FU-000: 1 day (already complete)
- FU-002: 0.5 days (already complete)
- FU-050: 3 days (event-sourcing foundation)
- FU-051: 2 days (repository abstractions)
- FU-052: 1 day (reducer versioning)
- FU-053: 1 day (crypto schema fields)
- FU-054: 1 day (hash chaining schema fields)
- FU-200: 2 days
- FU-100: 5 days (high-risk, rule-based extraction)
- FU-101: 3 days
- FU-102: 3 days
- FU-103: 3 days
- FU-105: 3 days
- FU-201-206: 1 day each (6 days total)
- FU-104: 2 days (optional)
- FU-208: 2 days (optional)

**Sequential Timeline:** ~36 days (required FUs only)

**With Parallelization (3 agents):** ~14-17 days

**Note:** Timeline estimates are rough and will be refined during execution.

---

### 5. Critical Path

The critical path for v0.1.0 is:

```
FU-000 → FU-050 → FU-051 → FU-200 → FU-201
```

For full workflow validation:
```
FU-000 → FU-100 → FU-101 → FU-103 → FU-105 → FU-202
```

Both paths must complete for core MCP validation to succeed.

---

### 6. Risk Mitigation

**High-Risk FUs:**
- `FU-050`: Event-Sourcing Foundation (architectural complexity)
  - Mitigation: Comprehensive test coverage, materialized view strategy ensures single source of truth
  - Early warning: Event emission tests fail, reducer tests fail
- `FU-100`: File Analysis Service (rule-based extraction complexity)
  - Mitigation: Comprehensive test coverage, property-based determinism tests
  - Early warning: Extraction tests fail, determinism violations

**Medium-Risk FUs:**
- `FU-103`: Graph Builder Service (data integrity)
  - Mitigation: Transactional inserts, orphan/cycle detection tests
  - Early warning: Graph integrity tests fail

**Dependency Risks:**
- If FU-050 slips, Batch 5 MCP actions (FU-201, FU-203, FU-204) are blocked
  - Mitigation: Prioritize FU-050 completion, early testing
- If FU-100 slips, all downstream FUs (FU-101, FU-102, FU-205) are blocked
  - Mitigation: Prioritize FU-100 completion, early testing

---

### 7. Integration Test Schedule

**After Batch 0.6:** Event-sourcing foundation tests (events emitted, reducers applied, historical replay)

**After Batch 1:** Smoke tests (MCP server, basic file upload)

**After Batch 4:** Graph integrity tests, search determinism tests

**After Batch 5:** Event-sourcing MCP action tests (store_record, update_record, delete_record emit events)

**After Batch 6:** Full MCP workflow tests (upload → extraction → query)

**Before Release:** Complete integration test suite (see `integration_tests.md`)

---

