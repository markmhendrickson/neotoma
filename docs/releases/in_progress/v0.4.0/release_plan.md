## Release v0.4.0 — Intelligence + Housekeeping

_(Post-Hardening: Add Intelligence Once Operations are Stable)_

---

### 1. Release Overview

- **Release ID**: `v0.4.0`
- **Name**: Intelligence + Housekeeping
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Add intelligent features (duplicate detection, schema discovery) and housekeeping (archival) after operational hardening in v0.3.0 has proven stable.
- **Priority**: P2 (intelligence and maintenance)
- **Target Ship Date**: After v0.3.0 (Operational Hardening) is stable
- **Marketing Required**: No (not marketed release)
- **Deployment**: Production (neotoma.io)

#### 1.0 Guiding Principle

> These features are only valuable with volume/diversity of data.

This release is gated on v0.3.0 stability: operational hardening must be proven before investing in intelligence and long-term maintenance features.

---

### 2. Scope

#### 2.1 Included Feature Units (Deferred from v0.3.0)

**Intelligence Workers**

- `FU-133`: Duplicate Detection Worker (heuristic duplicate flagging)
- Early schema promotion from `raw_fragments` (analytics on unknown fields)

**Housekeeping Workers**

- `FU-132`: Archival Job (old interpretation run archival)

**Utility Tools**

- Chat Transcript Extraction CLI (FU-106) — may be included or sequenced separately

#### 2.2 Explicitly Deferred

| Item | Deferred To | Reason |
|------|-------------|--------|
| Automated merge suggestions | v1.x | Requires mature duplicate detection |
| Semantic search integration | v1.x | Leverage feature for proven core |
| Model-selection UI | v1.x | Use config/env until validated |
| Multi-user organization features | v1.x | Should not block Tier 1 ICP validation |

---

### 3. Success Criteria

**Release is Complete When:**

1. ✅ Duplicate Detection Worker functional (weekly cron)
2. ✅ Archival Job functional (180-day archival)
3. ✅ Schema analytics on `raw_fragments` available
4. ✅ Chat Transcript CLI functional (if included)
5. ✅ Integration tests for intelligence features

---

### 4. Release Spacing Context

| Release | Focus | Status |
|---------|-------|--------|
| **v0.2.0** | Minimal ingestion + correction loop | Foundation |
| **v0.3.0** | Operational hardening | Prerequisite |
| **v0.4.0** | Intelligence + housekeeping | This release |
| **v1.x** | Experience + growth | Future |

---

### 5. Status

- **Current Status**: `planning`
- **Owner**: Mark Hendrickson
- **Gate**: v0.3.0 must be stable before starting v0.4.0
- **Notes**:
  - Intelligence and long-term maintenance layer
  - Requires data volume to justify heuristics
  - Chat Transcript CLI may be included or separate

---

