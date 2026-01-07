# Release v0.2.0 — Status
**Release**: Sources-First Ingestion Architecture  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)  
**Status**: `planning`  
**Last Updated**: 2024-12-18
## Phase Status
| Phase                          | Status      | Progress |
| ------------------------------ | ----------- | -------- |
| Phase 1: Schema + Storage      | Not Started | 0/7 FUs  |
| Phase 2: MCP Tools + Services  | Not Started | 0/7 FUs  |
| Phase 3: Workers + Integration | Not Started | 0/5 FUs  |
## Feature Unit Status
### Phase 1: Schema + Storage Foundation
| Feature Unit                      | Status      | Notes                    |
| --------------------------------- | ----------- | ------------------------ |
| FU-110: Sources Table Migration   | Not Started | Core table               |
| FU-111: Interpretation Runs Table | Not Started | Depends on FU-110        |
| FU-112: Storage Infrastructure    | Not Started | Queue + usage tracking   |
| FU-113: Entity Extensions         | Not Started | user_id + merge tracking |
| FU-114: Observation Extensions    | Not Started | source_id linkage        |
| FU-115: Raw Fragments Extensions  | Not Started | Unknown field storage    |
| FU-116: Entity Merges Table       | Not Started | Audit log                |
### Phase 2: MCP Tools + Services
| Feature Unit                         | Status      | Notes                                |
| ------------------------------------ | ----------- | ------------------------------------ |
| FU-120: Raw Storage Service          | Not Started | SHA-256, storage, queue              |
| FU-121: Interpretation Service       | Not Started | Schema validation, entity resolution |
| FU-122: MCP ingest() Tool            | Not Started | Core ingestion                       |
| FU-123: MCP ingest_structured() Tool | Not Started | Pre-structured data                  |
| FU-124: MCP reinterpret() Tool       | Not Started | Re-interpretation                    |
| FU-125: MCP correct() Tool           | Not Started | Corrections                          |
| FU-126: MCP merge_entities() Tool    | Not Started | Entity deduplication                 |
### Phase 3: Background Workers + Integration
| Feature Unit                         | Status      | Notes                       |
| ------------------------------------ | ----------- | --------------------------- |
| FU-130: Upload Queue Processor       | Not Started | Retry failed uploads        |
| FU-131: Stale Interpretation Cleanup | Not Started | Timeout handling            |
| FU-132: Archival Job                 | Not Started | Old run archival            |
| FU-133: Duplicate Detection Worker   | Not Started | Heuristic flagging          |
| FU-134: Query Updates                | Not Started | Provenance, merge exclusion |
**Status Legend:**
- Completed
- In Progress
- Not Started
- Blocked
## Progress Summary
- **Total Feature Units**: 19
- **Completed**: 0
- **In Progress**: 0
- **Not Started**: 19
- **Blocked**: 0
## Checkpoints
| Checkpoint                        | Status  | Target               |
| --------------------------------- | ------- | -------------------- |
| Checkpoint 0.5 (Phase 1 Complete) | Pending | Migrations + RLS     |
| Checkpoint 1 (Phase 2 Complete)   | Pending | MCP tools functional |
| Checkpoint 2 (Phase 3 Complete)   | Pending | Workers + tests      |
## Integration Tests
| Test ID | Name                             | Status  |
| ------- | -------------------------------- | ------- |
| IT-001  | Raw File Ingestion Flow          | Not Run |
| IT-002  | Content Deduplication            | Not Run |
| IT-003  | Reinterpretation Immutability    | Not Run |
| IT-004  | Correction Override              | Not Run |
| IT-005  | Entity Merge Flow                | Not Run |
| IT-006  | Cross-User Isolation             | Not Run |
| IT-007  | Upload Queue Retry               | Not Run |
| IT-008  | Interpretation Timeout           | Not Run |
| IT-009  | Unknown Field Routing            | Not Run |
| IT-010  | Interpretation Quota Enforcement | Not Run |
## Next Steps
1. **Begin Phase 1 migrations** (Batch 1.1: FU-110, FU-112, FU-113 in parallel)
2. Create FU specs for each Feature Unit
3. Set up storage bucket with user-prefix structure
4. Seed schema registry with base types + generic fallback
## Blockers
None currently.
## Decision Log
| Date       | Decision                  | Rationale                                                                                                   |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2024-12-18 | Release created as v0.2.0 | Foundational ingestion infrastructure should precede Chat Transcript CLI (shifted to post-hardening v0.4.0) |
| 2024-12-18 | Entity IDs remain TEXT    | Consistency with baseline schema; avoids migration complexity                                               |
| 2024-12-18 | Greenfield implementation | Pre-release, no existing user data to migrate                                                               |
## Notes
- Pre-MVP release (not marketed)
- Foundational infrastructure for v0.3.0 (Operational Hardening), v0.4.0 (Intelligence + Housekeeping, including Chat Transcript CLI), and v1.0.0 (MVP)
- AI agent execution assumed for all development
- Human review at checkpoints only
- Architecture plan: `.cursor/plans/sources_first_ingestion_v12_final.plan.md`
