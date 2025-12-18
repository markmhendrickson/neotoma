## Release v0.3.0 — Operational Hardening

_(Post-Ingestion Validation: Add Safety Nets Once Core Loop is Proven)_

---

### 1. Release Overview

- **Release ID**: `v0.3.0`
- **Name**: Operational Hardening
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Add operational resilience and quota enforcement after validating the core ingestion + correction loop in v0.2.0. This includes async upload retry, stale interpretation cleanup, and strict quota enforcement.
- **Priority**: P1 (operational robustness)
- **Target Ship Date**: After v0.2.0 (Minimal Ingestion + Correction Loop) is validated with real usage
- **Marketing Required**: No (not marketed release)
- **Deployment**: Production (neotoma.io)

#### 1.0 Guiding Principle

> Don't optimize throughput and robustness before confirming adoption and core flows.

This release is gated on v0.2.0 validation: real users/agents must have successfully used ingest, reinterpret, correct, and merge before investing in async resilience.

---

### 2. Scope

#### 2.1 Included Feature Units (Deferred from v0.2.0)

**Storage Infrastructure**

- `FU-112`: Storage Infrastructure
  - `upload_queue` table for async retry
  - `storage_usage` table for per-user tracking
  - Quota enforcement with per-plan tiers

**Background Workers**

- `FU-130`: Upload Queue Processor (async retry for failed uploads)
- `FU-131`: Stale Interpretation Cleanup (timeout handling for hung jobs)

**Interpretation Enhancements**

- `interpretation_runs` timeout/heartbeat columns (deferred from v0.2.0)
- Strict quota enforcement with billing month reset

#### 2.2 Explicitly Deferred

| Item | Deferred To | Reason |
|------|-------------|--------|
| `FU-132`: Archival Job | v0.4.0 | Only valuable with volume/diversity of data |
| `FU-133`: Duplicate Detection Worker | v0.4.0 | Heuristics need data to justify |
| Schema discovery/promotion | v0.4.0 | Requires analytics pipeline |

#### 2.3 Explicitly Excluded

- Semantic search integration (v1.x)
- Model-selection UI (v1.x)
- Multi-user organization features (v1.x)

---

### 3. Release-Level Acceptance Criteria

#### 3.1 Product

- Storage uploads that fail are retried automatically
- Long-running interpretations are cleaned up
- Quota limits are enforced with clear error messages
- Users understand their usage via storage_usage tracking

#### 3.2 Technical

**Implementation Requirements:**

- `upload_queue` table with retry logic
- `storage_usage` table with per-user bytes + interpretation counts
- `interpretation_runs` extended with `timeout_at`, `heartbeat_at` columns
- Upload Queue Processor worker (every 5 min)
- Stale Interpretation Cleanup worker (every 5 min)
- Quota enforcement with rejection on limit exceeded
- Billing month reset automation

**Technical Specifications:**

- **Upload Queue Retry**: Max 5 retries with exponential backoff
- **Interpretation Timeout**: 10 minutes with heartbeat monitoring
- **Interpretation Quota**: Strict enforcement (reject on exceed)
- **Storage Quota**: Per-plan limits (free: 1GB, pro: 100GB)

#### 3.3 Business

- Operational reliability enables production-grade usage
- Clear quota feedback improves user experience
- Resilience reduces support burden

---

### 4. Data Model

#### 4.1 New Tables

| Table | Purpose |
|-------|---------|
| `upload_queue` | Async retry for failed storage uploads |
| `storage_usage` | Per-user storage and interpretation quotas |

#### 4.2 Extended Tables

| Table | Extensions |
|-------|------------|
| `interpretation_runs` | `timeout_at`, `heartbeat_at` columns |

---

### 5. Background Workers

| Worker | Trigger | Purpose |
|--------|---------|---------|
| Upload Queue Processor | Cron 5 min | Retry failed storage uploads |
| Stale Interpretation Cleanup | Cron 5 min | Mark timed-out runs as failed |

All deployed as Supabase Edge Functions with cron triggers.

---

### 6. Success Criteria

**Release is Complete When:**

1. ✅ `upload_queue` table created with retry logic
2. ✅ `storage_usage` table created with quota tracking
3. ✅ `interpretation_runs` extended with timeout columns
4. ✅ Upload Queue Processor worker functional
5. ✅ Stale Interpretation Cleanup worker functional
6. ✅ Quota enforcement tested (reject on exceed)
7. ✅ Integration tests for async retry scenarios
8. ✅ Monitoring metrics for queue depth, timeouts

---

### 7. Release Spacing Context

| Release | Focus | Status |
|---------|-------|--------|
| **v0.2.0** | Minimal ingestion + correction loop | Prerequisite |
| **v0.3.0** | Operational hardening | This release |
| **v0.4.0** | Intelligence + housekeeping | Next |
| **v1.x** | Experience + growth | Future |

---

### 8. Status

- **Current Status**: `planning`
- **Owner**: Mark Hendrickson
- **Gate**: v0.2.0 must be validated with real usage before starting v0.3.0
- **Notes**:
  - Operational resilience layer
  - All deferred items from v0.2.0
  - Background workers require v0.2.0 schema foundation

---
