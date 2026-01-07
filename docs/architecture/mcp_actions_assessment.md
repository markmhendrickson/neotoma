# MCP Actions Architecture Assessment

**Date:** 2026-01-01  
**Status:** Assessment Complete

## Executive Summary

Assessment of all current MCP actions against documented architecture (`docs/vocabulary/canonical_terms.md`, `docs/specs/MCP_SPEC.md`, `docs/architecture/source_material_model.md`). Identifies missing actions, terminology misalignments, and implementation gaps.

## Current Actions Inventory

**Total Actions Implemented:** 15

### ✅ Core Ingestion (1/1)
- `ingest` - Unified ingestion for structured and unstructured source material

### ⚠️ File Operations (1/2)
- `get_file_url` - Get signed URL for file access
- ❌ `upload_file` - **MISSING** (spec requires for MVP)

### ✅ Entity Operations (6/6)
- `get_entity_snapshot` - Get entity snapshot with provenance
- `retrieve_entities` - Query entities with filters
- `get_entity_by_identifier` - Find entity by identifier
- `get_related_entities` - Get entities via relationships (n-hop)
- `get_graph_neighborhood` - Get complete graph context around node
- `merge_entities` - Merge duplicate entities

### ✅ Observation & Relationship Operations (5/5)
- `list_observations` - Query observations for entity
- `get_field_provenance` - Trace field to source material
- `create_relationship` - Create typed relationship between entities
- `list_relationships` - Query entity relationships
- `list_timeline_events` - Query timeline events with filters

### ✅ Correction & Reinterpretation (2/2)
- `correct` - Create high-priority correction observation
- `reinterpret` - Re-run AI interpretation on existing source material

### ❌ Integration Operations (0/2)
- ❌ `list_provider_catalog` - **MISSING** (spec requires for MVP)
- ❌ `sync_provider_imports` - **MISSING** (spec requires for MVP)

## Architecture Alignment Issues

### 1. Missing MVP Actions

**Critical:** Two MVP-required actions are missing:

#### `upload_file`
- **Status:** Missing
- **Spec Requirement:** MVP required (`docs/specs/MCP_SPEC.md` section 2.2)
- **Purpose:** Upload file from local path, create source material
- **Impact:** Agents cannot upload files via MCP without using `ingest` with base64 content
- **Recommendation:** Implement `upload_file` action per spec

#### `list_provider_catalog`
- **Status:** Missing
- **Spec Requirement:** MVP required (`docs/specs/MCP_SPEC.md` section 2.3)
- **Purpose:** List available external providers
- **Impact:** Agents cannot discover available provider integrations
- **Recommendation:** Implement provider catalog listing

#### `sync_provider_imports`
- **Status:** Missing
- **Spec Requirement:** MVP required (`docs/specs/MCP_SPEC.md` section 2.3)
- **Purpose:** Trigger provider import sync
- **Impact:** Agents cannot trigger provider data synchronization
- **Recommendation:** Implement provider sync action

### 2. Legacy Terminology Usage

**Violates:** `docs/vocabulary/canonical_terms.md` canonical vocabulary rules

#### `get_graph_neighborhood`
- **Issue:** Uses "record" terminology instead of "source material"
- **Location:** `src/server.ts:1150, 1152, 1273-1287`
- **Details:**
  - Parameter `node_type: "record"` should be `"source_material"` (or removed if redundant)
  - Parameter `include_records` is legacy; `include_source_material` exists but both are present
  - Implementation queries `records` table instead of `sources` table
  - Response includes `related_records` instead of `related_source_material`
- **Impact:** Violates canonical vocabulary, confuses "record" (legacy) vs "source material" (canonical)
- **Recommendation:** Remove `node_type: "record"` option, remove `include_records` parameter, update implementation to use `sources` table

#### `list_timeline_events`
- **Issue:** Legacy parameter `source_record_id` alongside canonical `source_id`
- **Location:** `src/server.ts:223-225, 860, 884-885, 909-910`
- **Details:**
  - Accepts both `source_record_id` (legacy) and `source_id` (canonical)
  - Implementation prefers `source_id` but maintains backward compatibility
- **Impact:** Maintains backward compatibility but violates vocabulary purity
- **Recommendation:** Remove `source_record_id` parameter in next breaking change release

#### `get_field_provenance`
- **Issue:** Uses `records` table and `source_record_id` field
- **Location:** `src/server.ts:688-712`
- **Details:**
  - Queries `records` table instead of `sources` table
  - Uses `observation.source_record_id` instead of `observation.source_material_id`
  - Response includes `source_record_id` and `record_type` instead of `source_material_id` and source material metadata
- **Impact:** Returns legacy terminology in response, breaks provenance chain to source material
- **Recommendation:** Update to query `sources` table, use `source_material_id` field, return canonical terminology

### 3. Database Schema Misalignment

**Issue:** Actions reference legacy `records` table instead of `sources` table

**Affected Actions:**
- `get_field_provenance` - Queries `records` table (line 690)
- `get_graph_neighborhood` - Queries `records` table (lines 1249, 1275)

**Impact:** 
- Breaks architecture migration to source material model
- Observations may reference `source_record_id` instead of `source_material_id`
- Provenance chain incomplete

**Recommendation:** 
- Update all actions to use `sources` table
- Ensure observations table uses `source_material_id` field
- Update all queries to reference `sources` instead of `records`

### 4. Field Name Inconsistencies

**Issue:** Mixed use of `source_record_id` vs `source_material_id`

**Locations:**
- `get_field_provenance`: Uses `observation.source_record_id` (line 692)
- `get_graph_neighborhood`: Uses `obs.source_record_id` (line 1245)
- `list_timeline_events`: Accepts both `source_record_id` and `source_id` parameters

**Impact:** Inconsistent field naming breaks canonical vocabulary compliance

**Recommendation:** 
- Standardize on `source_material_id` throughout
- Update database schema if needed
- Migrate existing data references

## Architecture Compliance Summary

| Category | Status | Issues |
|----------|--------|--------|
| **Action Completeness** | ⚠️ Partial | Missing 3 MVP actions |
| **Terminology** | ❌ Non-compliant | Legacy "record" terminology in 3 actions |
| **Database Schema** | ❌ Misaligned | References `records` table instead of `sources` |
| **Field Naming** | ❌ Inconsistent | Mixed `source_record_id` / `source_material_id` |
| **Vocabulary Compliance** | ❌ Non-compliant | Violates canonical terms in multiple places |

## Recommendations

### Priority 1: Critical (MVP Blockers)
1. **Implement `upload_file` action** - Required for MVP per spec
2. **Implement `list_provider_catalog` action** - Required for MVP per spec
3. **Implement `sync_provider_imports` action** - Required for MVP per spec

### Priority 2: Architecture Alignment
4. **Update `get_field_provenance`** - Use `sources` table, `source_material_id` field, canonical terminology
5. **Update `get_graph_neighborhood`** - Remove `node_type: "record"`, remove `include_records`, use `sources` table
6. **Update `list_timeline_events`** - Remove `source_record_id` parameter (breaking change)

### Priority 3: Database Migration
7. **Verify observations table schema** - Ensure `source_material_id` field exists
8. **Migrate data references** - Update all `source_record_id` references to `source_material_id`
9. **Update all queries** - Replace `records` table references with `sources` table

### Priority 4: Documentation
10. **Update action descriptions** - Ensure all descriptions use canonical vocabulary
11. **Remove legacy parameter documentation** - Clean up deprecated parameter references

## Compliance Checklist

- [ ] All MVP-required actions implemented
- [ ] All actions use canonical vocabulary (`source material`, not `record`)
- [ ] All actions query `sources` table (not `records`)
- [ ] All actions use `source_material_id` field (not `source_record_id`)
- [ ] All action descriptions conform to `docs/vocabulary/canonical_terms.md`
- [ ] No legacy terminology in action schemas or responses
- [ ] All database queries align with source material architecture

## References

- **Canonical Vocabulary:** `docs/vocabulary/canonical_terms.md`
- **MCP Specification:** `docs/specs/MCP_SPEC.md`
- **Source Material Architecture:** `docs/architecture/source_material_model.md`
- **Implementation:** `src/server.ts`


