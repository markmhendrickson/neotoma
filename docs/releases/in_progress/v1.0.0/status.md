## Release v1.0.0 — Status

---

### 1. Summary

- **Release ID**: `v1.0.0`
- **Name**: MVP
- **Status**: `planning` <!-- planning | in_progress | ready_for_deployment | deployed | completed -->
- **Owner**: Mark Hendrickson
- **Target Date**: 2025-03-01

---

### 2. Batch Progress

| Batch ID | Feature Units          | Status      | Notes |
| -------- | ---------------------- | ----------- | ----- |
| 0        | FU-100, FU-300, FU-700 | not_started |       |
| 1        | FU-101, FU-102         | not_started |       |
| 2        | FU-103                 | not_started |       |
| 3        | FU-105, FU-701         | not_started |       |

---

### 3. Feature Unit Status

| FU ID  | Name                           | Status      | Notes |
| ------ | ------------------------------ | ----------- | ----- |
| FU-100 | File Analysis Service Update   | not_started |       |
| FU-101 | Entity Resolution Service      | not_started |       |
| FU-102 | Event Generation Service       | not_started |       |
| FU-103 | Graph Builder Service          | not_started |       |
| FU-105 | Search Service (Deterministic) | not_started |       |
| FU-300 | Design System Implementation   | not_started |       |
| FU-700 | Authentication UI              | not_started |       |
| FU-701 | RLS Implementation             | not_started |       |

_(Statuses mirror individual FU manifests / implementation reality; update as work proceeds.)_

---

### 4. Checkpoints

- **Checkpoint 0 — Release Planning**: `completed`
  - `release_plan.md` and `manifest.yaml` created.
  - Execution schedule defined in `execution_schedule.md`.
- **Checkpoint 1 — Mid-Release Review**: `pending`
  - Configured after Batch 1.
- **Checkpoint 2 — Pre-Release Sign-Off**: `pending`

---

### 5. Integration Test Status

| Test ID | Name                                  | Status  | Notes |
| ------- | ------------------------------------- | ------- | ----- |
| IT-001  | Financial Statement Ingestion Flow    | not_run |       |
| IT-002  | CSV/Spreadsheet Ingestion Flow        | not_run |       |
| IT-003  | Multi-Event Document to Timeline Flow | not_run |       |
| IT-004  | Auth + RLS Isolation Flow             | not_run |       |
| IT-005  | MCP AI Access Flow                    | not_run |       |

---

### 6. Decision Log

_(Timestamped record of scope changes, FU deferrals, priority shifts, and other mid-course corrections)_

| Date       | Decision                                                     | Rationale                                          |
| ---------- | ------------------------------------------------------------ | -------------------------------------------------- |
| 2025-02-10 | Release workflow pattern defined                             | Standardize multi-FU orchestration                 |
| 2025-02-10 | MVP specs remain in `docs/specs/`, referenced not duplicated | Avoid duplication, maintain single source of truth |

---

### 7. Notes

- Release workflow pattern defined in `docs/feature_units/standards/release_workflow.md`.
- MVP specs remain in `docs/specs/` and are referenced, not duplicated.
- This status file is the **single source of truth** for v1.0.0 release progress.
