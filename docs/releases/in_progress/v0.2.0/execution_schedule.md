# Release v0.2.0 — Execution Schedule

**Release**: Sources-First Ingestion Architecture  
**Status**: `planning`  
**Last Updated**: 2024-12-18

---

## Execution Order

### Machine-Readable Batches (Orchestrator)

#### Batch 0: Core Tables (Phase 1.1)

**Feature Units:**

- `FU-110`
- `FU-113`

_Note: `FU-112` (Storage Infrastructure) was removed from Batch 0 as it is deferred to v0.3.0 per release_plan.md section 2.2._

---

#### Batch 1: Dependent Tables (Phase 1.2)

**Feature Units:**

- `FU-111`
- `FU-114`
- `FU-115`
- `FU-116`

---

#### Batch 2: Core Services (Phase 2.1)

**Feature Units:**

- `FU-120`
- `FU-121`

---

#### Batch 3: MCP Tools (Phase 2.2)

**Feature Units:**

- `FU-122`
- `FU-123`
- `FU-124`
- `FU-125`
- `FU-126`

---

#### Batch 4: Query Updates (Phase 3)

**Feature Units:**

- `FU-134`

---

### Phase 1: Schema + Storage Foundation (1-2 weeks)

**Batch 1.1: Core Tables (Parallel)**

| FU | Name | Dependencies | Est. Time |
|----|------|--------------|-----------|
| FU-110 | Sources Table Migration | None | 2-3h |
| FU-112 | Storage Infrastructure | None | 2-3h |
| FU-113 | Entity Extensions | None | 2-3h |

**Batch 1.2: Dependent Tables (Sequential after 1.1)**

| FU | Name | Dependencies | Est. Time |
|----|------|--------------|-----------|
| FU-111 | Interpretation Runs Table | FU-110 | 2-3h |
| FU-114 | Observation Extensions | FU-110, FU-111 | 1-2h |
| FU-115 | Raw Fragments Extensions | FU-110, FU-111 | 1-2h |
| FU-116 | Entity Merges Table | FU-113 | 1-2h |

**Batch 1.3: Schema Seeding**

- Seed base schema types (transaction, merchant, invoice, receipt)
- Seed generic fallback type
- Est. Time: 1-2h

**Phase 1 Subtotal**: 12-20h

---

### Phase 2: MCP Tools + Services (2-3 weeks)

**Batch 2.1: Core Services (Sequential)**

| FU | Name | Dependencies | Est. Time |
|----|------|--------------|-----------|
| FU-120 | Raw Storage Service | FU-110, FU-112 | 4-6h |
| FU-121 | Interpretation Service | FU-111, FU-114, FU-115 | 6-8h |

**Batch 2.2: MCP Tools (Parallel after 2.1)**

| FU | Name | Dependencies | Est. Time |
|----|------|--------------|-----------|
| FU-122 | MCP ingest() Tool | FU-120, FU-121 | 4-6h |
| FU-123 | MCP ingest_structured() Tool | FU-121 | 2-3h |
| FU-124 | MCP reinterpret() Tool | FU-121 | 2-3h |
| FU-125 | MCP correct() Tool | FU-121 | 2-3h |
| FU-126 | MCP merge_entities() Tool | FU-113, FU-116 | 3-4h |

**Phase 2 Subtotal**: 23-33h

---

### Phase 3: Background Workers + Integration (2 weeks)

**Batch 3.1: Background Workers (Parallel)**

| FU | Name | Dependencies | Est. Time |
|----|------|--------------|-----------|
| FU-130 | Upload Queue Processor | FU-112, FU-120 | 2-3h |
| FU-131 | Stale Interpretation Cleanup | FU-111 | 1-2h |
| FU-132 | Archival Job | FU-111 | 1-2h |
| FU-133 | Duplicate Detection Worker | FU-113 | 2-3h |

**Batch 3.2: Query Updates + Testing**

| FU | Name | Dependencies | Est. Time |
|----|------|--------------|-----------|
| FU-134 | Query Updates | FU-110, FU-113, FU-114 | 3-4h |

**Batch 3.3: Integration Testing**

- Unit tests: schema filtering, unknown routing, idempotent usage
- Integration tests: full ingest → query flow, reinterpret immutability
- Merge tests: cross-user prevention, redirect/exclusion
- Performance tests: concurrent uploads, large files
- Timeout tests: stale cleanup verification
- Est. Time: 8-12h

**Phase 3 Subtotal**: 17-26h

---

## Timeline Summary

| Phase | Duration | Estimated Hours |
|-------|----------|-----------------|
| Phase 1: Schema + Storage | 1-2 weeks | 12-20h |
| Phase 2: MCP Tools + Services | 2-3 weeks | 23-33h |
| Phase 3: Workers + Integration | 2 weeks | 17-26h |
| **Total** | **5-7 weeks** | **52-79h** |

**Assumption:** All development timeline estimates assume Cursor agent execution (not human developers). Human review time is separate.

---

## Parallelization Opportunities

### Phase 1

```
[FU-110] ─┬─> [FU-111] ──┬─> [FU-114]
          │              └─> [FU-115]
[FU-112] ─┘
[FU-113] ────────────────────> [FU-116]
```

- FU-110, FU-112, FU-113 can run in parallel
- FU-111 depends on FU-110
- FU-114, FU-115 depend on FU-110, FU-111
- FU-116 depends on FU-113

### Phase 2

```
[FU-120] ─┬─> [FU-122]
          │
[FU-121] ─┼─> [FU-123]
          ├─> [FU-124]
          └─> [FU-125]

[FU-113, FU-116] ─> [FU-126]
```

- FU-120 and FU-121 must complete before MCP tools
- FU-122, FU-123, FU-124, FU-125 can run in parallel
- FU-126 only depends on Phase 1 entities work

### Phase 3

```
[FU-130] ─┐
[FU-131] ─┼─> (parallel)
[FU-132] ─┤
[FU-133] ─┘

[FU-134] ─> Integration Testing
```

- All background workers can run in parallel
- FU-134 and testing after workers complete

---

## Critical Path

```
FU-110 → FU-111 → FU-121 → FU-122 → FU-134 → Integration Testing
```

The critical path is:
1. Sources table (FU-110)
2. Interpretation runs (FU-111)
3. Interpretation service (FU-121)
4. ingest() MCP tool (FU-122)
5. Query updates (FU-134)
6. Integration testing

---

## Checkpoints

### Checkpoint 0.5 (End of Phase 1)

- All migrations applied
- RLS policies in place
- Schema seeded
- Storage bucket created

### Checkpoint 1 (End of Phase 2)

- All MCP tools functional
- Basic ingest → query flow working
- Unit tests passing

### Checkpoint 2 (End of Phase 3)

- Background workers deployed
- Integration tests passing
- Performance benchmarks met
- Ready for release

---

## Dependencies

**External:**
- Supabase Storage bucket configuration
- Edge Function deployment capability
- Schema registry seeded

**Internal:**
- RLS implementation pattern from v0.1.0
- Existing schema_registry service
- Existing reducer infrastructure

---

## Notes

- Greenfield implementation (no migration complexity)
- AI agent execution assumed for all development
- Human review at checkpoints only
- Can be parallelized aggressively within phases
