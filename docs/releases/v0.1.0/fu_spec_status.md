---
title: Feature Unit Specification Status for v0.1.0
summary: "**Total:** 22 FUs had specs only in the archived MVP planning inventory (20 P0 + 2 optional P1). ## Recommendation ### Option 1: Use Archived MVP Planning as Source of Truth (Recommended for v0.1.0) **Rationale:** - Archived MVP planning..."
---

# Feature Unit Specification Status for v0.1.0
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
### ⚠️ FUs with Specs in Archived MVP Planning Only
These FUs had specifications only in the historical MVP planning inventory, now archived at `docs/releases/archived/mvp_planning/MVP_FEATURE_UNITS.md`.

**Total:** 22 FUs had specs only in the archived MVP planning inventory (20 P0 + 2 optional P1).
## Recommendation
### Option 1: Use Archived MVP Planning as Source of Truth (Recommended for v0.1.0)
**Rationale:**
- Archived MVP planning already contains detailed specifications for all FUs
- Creating standalone specs would duplicate content
- Standalone specs can be created later if needed for detailed implementation work
- Archived MVP planning is sufficient for release planning and tracking
**Action:** No changes needed. Use archived MVP planning as the specification source for this historical release.
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
## Decision
**For v0.1.0:** Use archived MVP planning as the source of truth. Standalone specs are not required for release planning, but can be created during implementation if needed for detailed work.
**Future:** Consider creating standalone specs for FUs that require significant implementation work or have complex requirements.
## Spec Template Reference
When creating standalone specs, use:
- Template: `docs/feature_units/standards/feature_unit_spec.md`
- Manifest template: `docs/feature_units/standards/manifest_template.yaml`
- Workflow: `docs/feature_units/standards/creating_feature_units.md`
## Summary
- **5 FUs** have standalone specs (FU-050 through FU-054)
- **20 FUs** have specs in archived MVP planning only
- **Recommendation:** Use archived MVP planning as source of truth for v0.1.0
- **Optional:** Create standalone specs during implementation if needed for detailed work
