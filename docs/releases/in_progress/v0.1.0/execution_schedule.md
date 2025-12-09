## Release v0.1.0 — Execution Schedule

_(Generated from dependency analysis and topological sort)_

---

### 1. Batch Overview

| Batch ID | Feature Units                  | Dependencies           | Can Parallelize? | Estimated Effort |
| -------- | ------------------------------ | ---------------------- | ---------------- | ---------------- |
| 0        | FU-000, FU-002                 | None                   | Yes              | Low              |
| 0.5      | FU-050, FU-051                 | FU-000                 | Yes              | Medium           |
| 0.6      | FU-052, FU-053, FU-054         | FU-050                 | Yes              | Low              |
| 1        | FU-200, FU-100                 | FU-000                 | Yes              | High             |
| 2        | FU-101, FU-102                 | FU-100                 | Yes              | Medium           |
| 3        | FU-103                         | FU-101, FU-102         | No               | Medium           |
| 4        | FU-105                         | FU-103                 | No               | Medium           |
| 5        | FU-201, FU-203, FU-204, FU-206 | FU-200, FU-050, FU-051 | Yes              | Low              |
| 6        | FU-202, FU-205                 | FU-200, FU-105, FU-100 | Yes              | Medium           |
| 7        | FU-104, FU-208                 | FU-100, FU-200         | Yes              | Low (Optional)   |

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

- All estimates assume Cursor agent execution (not human developers)
- Cloud agents execute in parallel via Cursor Background Agents API (see `docs/feature_units/standards/multi_agent_orchestration.md`)
- Execution limits: `max_parallel_fus: 3`, `max_high_risk_in_parallel: 1`
- Estimates follow methodology from `docs/specs/MVP_FEATURE_UNITS.md`: spec (1-3h) + implementation (2-8h) + testing (1-4h) + docs (0.5-1h) + 20% review overhead
- FU-000: 0.5 days (already complete)
- FU-002: 0.25 days (already complete)
- FU-050: 2 days (event-sourcing foundation, high complexity)
- FU-051: 1.5 days (repository abstractions, medium-high complexity)
- FU-052: 0.5 days (reducer versioning, low-medium complexity)
- FU-053: 0.5 days (crypto schema fields, low complexity)
- FU-054: 0.5 days (hash chaining schema fields, low complexity)
- FU-200: 1.5 days (MCP server core, medium complexity)
- FU-100: 2.5 days (high-risk, rule-based extraction, high complexity)
- FU-101: 1 day (entity resolution, 6-8 hours per MVP_FEATURE_UNITS.md)
- FU-102: 0.75 days (event generation, 5-7 hours per MVP_FEATURE_UNITS.md)
- FU-103: 0.5 days (graph builder hardening, 3-4 hours per MVP_FEATURE_UNITS.md)
- FU-105: 0.5 days (deterministic search, 2-3 hours per MVP_FEATURE_UNITS.md)
- FU-201-206: 0.5 days each (3 days total, low-medium complexity MCP actions)
- FU-104: 1 day (optional, embedding service)
- FU-208: 1 day (optional, provider integrations)

**Sequential Timeline:** ~15 days (required FUs only)

**With Cloud Agent Parallelization (max 3 agents):**

- Batch 0: max(0.5, 0.25) = 0.5 days
- Batch 0.5: max(2, 1.5) = 2 days
- Batch 0.6: max(0.5, 0.5, 0.5) = 0.5 days (3 FUs in parallel)
- Batch 1: max(1.5, 2.5) = 2.5 days (FU-100 high-risk, but only 1 high-risk allowed)
- Batch 2: max(1, 0.75) = 1 day
- Batch 3: 0.5 days (sequential)
- Batch 4: 0.5 days (sequential)
- Batch 5: 1 day (4 FUs, max 3 in parallel: first 3 FUs = 0.5 days, then 1 FU = 0.5 days)
- Batch 6: max(0.5, 0.5) = 0.5 days

**Total with Cloud Agents:** ~9 days (40% reduction from sequential)

**Note:** Estimates based on agent-hour methodology (spec + impl + test + docs + review overhead). Cloud agent parallelization reduces calendar time by 25-35% compared to sequential execution per multi-agent orchestration standards.

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
