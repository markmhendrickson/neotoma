# Vocabulary Conformance Review

**Date:** 2025-01-27  
**Scope:** Review of `docs/` and `src/services/schema_definitions.ts` against `docs/vocabulary/canonical_terms.md`

## Summary

This review identifies terminology inconsistencies across documentation and code that need to be updated to align with canonical vocabulary.

## ✅ Fixed Issues

### 1. `src/services/schema_definitions.ts`
**Status:** ✅ **FIXED**

**Changes Made:**
- `RecordTypeSchema` → `EntitySchema`
- `RECORD_TYPE_SCHEMAS` → `ENTITY_SCHEMAS`
- `EXPANDED_RECORD_TYPE_SCHEMAS` → `EXPANDED_ENTITY_SCHEMAS`
- Updated comments: "Record Types" → "Entity Types", "schema" → "entity schema" when referring to definitions
- Updated function parameter names: `recordType` → `entityType`
- Added note about default schemas and fallback behavior

**Impact:** Low - function signatures unchanged, only internal names updated

### 2. `docs/architecture/schema_handling.md`
**Status:** ✅ **FIXED**

**Changes Made:**
- Updated all terminology to use canonical terms with markdown links
- "record" → "[source](#source)" or "[entity](#entity)"
- "record type" → "[entity type](#entity-type)"
- "schema" → "[entity schema](#entity-schema)"
- "ingestion" → "[storing](#storing)"
- "parsing/analysis" → "[extraction](#extraction)"
- Updated SQL examples to use `observations` and `raw_fragments` tables
- Updated references to point to correct documentation

### 3. `docs/subsystems/ingestion/ingestion.md`
**Status:** ✅ **PARTIALLY FIXED**

**Changes Made:**
- Updated title: "Ingestion" → "[Storing](#storing)"
- Updated "interpretation runs" → "[interpretations](#interpretation)"
- Added canonical term markdown links throughout
- Updated pipeline diagram labels
- Updated scope and path descriptions

**Remaining:** Some internal references may still use "ingestion" in less critical sections

### 4. `docs/subsystems/schema.md`
**Status:** ✅ **PARTIALLY FIXED**

**Changes Made:**
- Updated Section 3: "properties" → "fields" (observations)
- Updated all SQL query examples to use `observations` table
- Updated references from `records.type` to `entity_type`
- Updated extraction metadata section to reference `raw_fragments`
- Added notes about legacy architecture for historical reference
- Updated index examples to use observations table

**Remaining:** Some examples in Section 3 still reference legacy structure (may be intentional for examples)

## ⚠️ Critical Issues Requiring Updates

### 2. `docs/subsystems/record_types.md`
**Status:** ⚠️ **NEEDS MAJOR UPDATE**

**Issues:**
- Entire document uses "record types" terminology (deprecated)
- References `records.type` column (legacy table)
- References `src/config/record_types.ts` (may not exist or need update)
- Should be renamed/updated to use "entity types" terminology

**Recommendation:**
- Rename to `entity_types.md` or `docs/subsystems/entity_types.md`
- Update all references from "record type" to "[entity type](#entity-type)"
- Update references from `records.type` to entity type classification
- Verify `src/config/record_types.ts` exists and update if needed

### 3. `docs/subsystems/ingestion/ingestion.md`
**Status:** ⚠️ **NEEDS UPDATE**

**Issues:**
- Uses "ingestion" terminology (should be "[storing](#storing)")
- References "interpretation runs" (should be "[interpretation](#interpretation)")
- May reference deprecated record-based architecture

**Recommendation:**
- Update "ingestion" → "[storing](#storing)" throughout
- Update "interpretation run" → "[interpretation](#interpretation)"
- Verify alignment with sources-first architecture

### 4. `docs/subsystems/schema.md`
**Status:** ⚠️ **NEEDS UPDATE**

**Issues:**
- Section 3.11 references `records` table and `properties` JSONB field
- References `record_types.md` (legacy document)
- Uses "record type" terminology in some places

**Recommendation:**
- Update references to use observations/sources architecture
- Update `properties` references to observation `fields`
- Update links to point to entity types documentation

## 📋 Files Requiring Review (295 files found)

The following files contain potential deprecated terms. Priority review needed for:

### High Priority (Core Documentation)
1. `docs/subsystems/record_types.md` - Entire document needs rewrite
2. `docs/subsystems/ingestion/ingestion.md` - Core ingestion documentation
3. `docs/subsystems/schema.md` - Core schema documentation
4. `docs/architecture/source_material_model.md` - Should be canonical
5. `docs/specs/DATA_MODELS.md` - Data model specifications

### Medium Priority (Subsystem Docs)
6. `docs/subsystems/sources.md` - Sources architecture
7. `docs/subsystems/observation_architecture.md` - Observation architecture
8. `docs/subsystems/relationships.md` - Relationships
9. `docs/subsystems/reducer.md` - Reducer documentation
10. `docs/subsystems/events.md` - Events documentation

### Lower Priority (Release/Historical Docs)
- Release documentation (v0.1.0, v0.2.0, etc.) - May be historical
- Implementation logs - Historical records
- Compliance reports - Historical records

## 🔍 Common Issues Found

### Deprecated Terms to Replace
1. **"record"** → "[source](#source)" or "[entity](#entity)" (context-dependent)
2. **"record type"** → "[entity type](#entity-type)"
3. **"capability"** → "[entity schema](#entity-schema)"
4. **"ingestion"** → "[storing](#storing)"
5. **"interpretation run"** → "[interpretation](#interpretation)"
6. **"parsing"** → "[extraction](#extraction)"
7. **"analysis"** → "[extraction](#extraction)" (when referring to deterministic extraction)

### Forbidden Terms to Remove
- "smart" (marketing language)
- "intelligent" (implies non-determinism)
- "learn" (Neotoma doesn't learn)
- "understand" (Neotoma doesn't understand)

## 📝 Recommended Action Plan

### Phase 1: Critical Core Documentation (Immediate)
1. ✅ Fix `src/services/schema_definitions.ts` - **DONE**
2. ✅ Update `docs/architecture/schema_handling.md` - **DONE**
3. ✅ Update `docs/subsystems/ingestion/ingestion.md` terminology - **PARTIALLY DONE**
4. ✅ Update `docs/subsystems/schema.md` references - **PARTIALLY DONE**
5. ⚠️ Update `docs/subsystems/record_types.md` → `entity_types.md` - **PENDING**

### Phase 2: Architecture Documentation (High Priority)
5. Review and update `docs/architecture/` files
6. Review and update `docs/specs/` files
7. Review and update `docs/subsystems/` files

### Phase 3: Historical Documentation (Lower Priority)
8. Review release documentation (may leave as historical)
9. Review implementation logs (may leave as historical)

## 🎯 Success Criteria

Documentation is conformant when:
- ✅ No use of deprecated terms ("record", "record type", "capability") in active documentation
- ✅ All references use canonical terms with proper markdown links
- ✅ Code comments and variable names use canonical terminology
- ✅ Examples demonstrate correct usage
- ✅ Historical documents are clearly marked or updated

## Notes

- Historical release documentation (v0.1.0, v0.2.0) may intentionally preserve legacy terminology for historical accuracy
- Implementation logs may preserve original terminology for audit trail
- Focus updates on active, current documentation that guides development
