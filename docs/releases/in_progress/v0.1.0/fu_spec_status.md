# Feature Unit Specification Status for v0.1.0

_(Tracking which FUs have standalone specs vs specs in MVP_FEATURE_UNITS.md)_

---

## Purpose

This document tracks which Feature Units included in v0.1.0 have standalone specification files (`docs/feature_units/completed/FU-XXX/FU-XXX_spec.md`) versus those that only have specifications in `docs/specs/MVP_FEATURE_UNITS.md`.

---

## Specification Status

### ✅ FUs with Standalone Specs

| FU ID | Name | Spec Location | Status |
|-------|------|---------------|--------|
| FU-050 | Event-Sourcing Foundation | `docs/feature_units/completed/FU-050/FU-050_spec.md` | ✅ Complete |
| FU-051 | Repository Abstractions | `docs/feature_units/completed/FU-051/FU-051_spec.md` | ✅ Complete |
| FU-052 | Reducer Versioning | `docs/feature_units/completed/FU-052/FU-052_spec.md` | ✅ Complete |
| FU-053 | Cryptographic Schema Fields | `docs/feature_units/completed/FU-053/FU-053_spec.md` | ✅ Complete |
| FU-054 | Hash Chaining Schema Fields | `docs/feature_units/completed/FU-054/FU-054_spec.md` | ✅ Complete |

**Total:** 5 FUs with standalone specs

---

### ⚠️ FUs with Specs in MVP_FEATURE_UNITS.md Only

These FUs have specifications in `docs/specs/MVP_FEATURE_UNITS.md` but do not have standalone spec files:

| FU ID | Name | Spec Location | Status in MVP_FEATURE_UNITS.md |
|-------|------|---------------|-------------------------------|
| FU-000 | Database Schema v1.0 | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-000) | ✅ Complete |
| FU-002 | Configuration Management | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-002) | ✅ Complete |
| FU-055 | Observation Storage Layer | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-055) | ⏳ Not Started |
| FU-056 | Enhanced Reducer Engine for Observations | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-056) | ⏳ Not Started |
| FU-057 | Schema Registry Service | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-057) | ⏳ Not Started |
| FU-058 | Observation-Aware Ingestion Pipeline | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-058) | ⏳ Not Started |
| FU-059 | Relationship Types | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-059) | ⏳ Not Started |
| FU-061 | MCP Actions for Observation Architecture | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-061) | ⏳ Not Started |
| FU-104 | Embedding Service (Optional) | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-104) | ✅ Complete |
| FU-208 | MCP Provider Integrations (Optional) | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-208) | ⏳ Not Started |
| FU-100 | File Analysis Service | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-100) | 🔨 Partial |
| FU-101 | Entity Resolution Service | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-101) | 🔨 Partial |
| FU-102 | Event Generation Service | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-102) | 🔨 Partial |
| FU-103 | Graph Builder Service | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-103) | 🔨 Partial |
| FU-105 | Search Service | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-105) | 🔨 Partial |
| FU-200 | MCP Server Core | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-200) | ✅ Complete |
| FU-201 | MCP Action — store_record | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-201) | ✅ Complete |
| FU-202 | MCP Action — retrieve_records | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-202) | ✅ Complete |
| FU-203 | MCP Action — update_record | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-203) | ✅ Complete |
| FU-204 | MCP Action — delete_record | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-204) | ✅ Complete |
| FU-205 | MCP Action — upload_file | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-205) | ✅ Complete |
| FU-206 | MCP Action — get_file_url | `docs/specs/MVP_FEATURE_UNITS.md` (Section: FU-206) | ✅ Complete |

**Total:** 22 FUs with specs in MVP_FEATURE_UNITS.md only (20 P0 + 2 optional P1)

---

## Recommendation

### Option 1: Use MVP_FEATURE_UNITS.md as Source of Truth (Recommended for v0.1.0)

**Rationale:**
- MVP_FEATURE_UNITS.md already contains detailed specifications for all FUs
- Creating standalone specs would duplicate content
- Standalone specs can be created later if needed for detailed implementation work
- MVP_FEATURE_UNITS.md is sufficient for release planning and tracking

**Action:** No changes needed. Use MVP_FEATURE_UNITS.md as the specification source.

---

### Option 2: Create Standalone Specs for Critical FUs

**Rationale:**
- Standalone specs provide better isolation and reviewability
- Easier to track individual FU progress
- Aligns with Feature Unit workflow standards

**Priority Order for Creating Standalone Specs:**

**High Priority (Core Services):**
1. FU-100: File Analysis Service (includes type detection analytics)
2. FU-101: Entity Resolution Service
3. FU-102: Event Generation Service
4. FU-103: Graph Builder Service
5. FU-105: Search Service

**Medium Priority (Observation Architecture):**
6. FU-055: Observation Storage Layer
7. FU-056: Enhanced Reducer Engine for Observations
8. FU-057: Schema Registry Service
9. FU-058: Observation-Aware Ingestion Pipeline
10. FU-059: Relationship Types
11. FU-061: MCP Actions for Observation Architecture

**Lower Priority (Infrastructure - already complete):**
12. FU-000: Database Schema v1.0 (already complete, spec optional)
13. FU-002: Configuration Management (already complete, spec optional)

**Lowest Priority (MCP Actions - already complete):**
14. FU-200 through FU-206 (already complete, specs optional)

---

## Decision

**For v0.1.0:** Use MVP_FEATURE_UNITS.md as the source of truth. Standalone specs are not required for release planning, but can be created during implementation if needed for detailed work.

**Future:** Consider creating standalone specs for FUs that require significant implementation work or have complex requirements.

---

## Spec Template Reference

When creating standalone specs, use:
- Template: `docs/feature_units/standards/feature_unit_spec.md`
- Manifest template: `docs/feature_units/standards/manifest_template.yaml`
- Workflow: `docs/feature_units/standards/creating_feature_units.md`

---

## Summary

- **5 FUs** have standalone specs (FU-050 through FU-054)
- **20 FUs** have specs in MVP_FEATURE_UNITS.md only
- **Recommendation:** Use MVP_FEATURE_UNITS.md as source of truth for v0.1.0
- **Optional:** Create standalone specs during implementation if needed for detailed work

