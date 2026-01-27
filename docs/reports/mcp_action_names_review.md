# MCP Action Names Review Against Canonical Terms

**Date:** 2026-01-08  
**Reference:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

## Summary

Review of all MCP action names against canonical terminology to ensure alignment.

## Canonical Terms Reference

### "Retrieving" (Lines 81-92)
**Definition:** The process of querying and retrieving [entities](#entity), [observations](#observation), [entity snapshots](#entity-snapshot), and related data from the [memory graph](#memory-graph).

**Forbidden Synonyms:**
- ❌ "fetch" (too generic)
- ❌ "load" (implies loading into memory, retrieving is querying)
- ❌ "get" (too generic, use specific action names)

**Example:** "Use `retrieve_entities` to query [entities](#entity) by type, or `get_entity_snapshot` to get current truth for an [entity](#entity)."

**Note:** The example itself uses `get_entity_snapshot`, suggesting that while "get" is discouraged as a generic term, specific action names like `get_entity_snapshot` may be acceptable if they are sufficiently descriptive.

### "Storing" (Lines 106-118)
**Definition:** The process of uploading, [extracting](#extraction), and inserting [source](#source) into the [memory graph](#memory-graph).

**Status:** ✅ Already renamed from `ingest` to `store`

### "Interpretation" (Lines 120-131)
**Definition:** Versioned interpretation attempt on unstructured [source](#source).

**Action:** ✅ `reinterpret` aligns with this term

## Current MCP Actions Analysis

### ✅ Actions That Align with Canonical Terms

| Action Name | Purpose | Canonical Term | Status |
|------------|---------|----------------|--------|
| `store` | Unified storing for all source | "Storing" | ✅ Aligned |
| `retrieve_entities` | Query entities with filters | "Retrieving" | ✅ Aligned |
| `list_observations` | Query observations for entity | "Retrieving" | ✅ Aligned |
| `list_relationships` | Query entity relationships | "Retrieving" | ✅ Aligned |
| `list_timeline_events` | Query timeline events | "Retrieving" | ✅ Aligned |
| `list_entity_types` | List all available entity types | "Retrieving" | ✅ Aligned |
| `reinterpret` | Re-run AI interpretation | "Interpretation" | ✅ Aligned |
| `create_relationship` | Create typed relationship | "Relationship" | ✅ Aligned |
| `merge_entities` | Merge duplicate entities | "Entity" | ✅ Aligned |
| `correct` | Create correction observation | "Observation" | ✅ Aligned |

### ⚠️ Actions with "get_" Prefix - Review Needed

| Action Name | Purpose | Issue | Recommendation |
|------------|---------|-------|----------------|
| `get_file_url` | Get signed URL for file access | Uses "get" (forbidden synonym for "Retrieving") | Consider `retrieve_file_url` or keep if "get URL" is a standard pattern |
| `get_entity_snapshot` | Get entity snapshot with provenance | Uses "get" (forbidden synonym) | However, canonical terms example uses this name. Could rename to `retrieve_entity_snapshot` but may break existing usage |
| `get_field_provenance` | Get provenance chain for field | Uses "get" (forbidden synonym) | Could rename to `retrieve_field_provenance` |
| `get_entity_by_identifier` | Find entity by identifier | Uses "get" (forbidden synonym) | Could rename to `retrieve_entity_by_identifier` |
| `get_related_entities` | Get entities via relationships | Uses "get" (forbidden synonym) | Could rename to `retrieve_related_entities` |
| `get_graph_neighborhood` | Get complete graph context | Uses "get" (forbidden synonym) | Could rename to `retrieve_graph_neighborhood` |

## Key Finding

The canonical terms document explicitly states that **"get" is a forbidden synonym** for "Retrieving" because it's "too generic." However, the same document's example uses `get_entity_snapshot`:

> "Use `retrieve_entities` to query [entities](#entity) by type, or `get_entity_snapshot` to get current truth for an [entity](#entity)."

This creates an inconsistency:
- The rule says "get" is forbidden
- The example uses `get_entity_snapshot`

## Recommendation

### Option 1: Rename All "get_" Actions to "retrieve_" (Consistent with Canonical Terms)

**Breaking Changes:**
- `get_file_url` → `retrieve_file_url`
- `get_entity_snapshot` → `retrieve_entity_snapshot`
- `get_field_provenance` → `retrieve_field_provenance`
- `get_entity_by_identifier` → `retrieve_entity_by_identifier`
- `get_related_entities` → `retrieve_related_entities`
- `get_graph_neighborhood` → `retrieve_graph_neighborhood`

**Pros:**
- Fully aligned with canonical terms
- Consistent naming pattern (`retrieve_*` for all retrieval operations)
- Removes ambiguity about whether "get" is acceptable

**Cons:**
- Breaking change for all existing MCP clients
- The canonical terms example uses `get_entity_snapshot`, so this contradicts that example

### Option 2: Keep "get_" Prefix for Specific Actions (Acceptable Specific Names)

**Rationale:**
- While "get" is forbidden as a generic term, specific action names like `get_entity_snapshot` may be acceptable if they are sufficiently descriptive
- The canonical terms example uses `get_entity_snapshot`, suggesting it's acceptable in practice
- `get_file_url` follows HTTP/REST conventions (GET request pattern)

**Status:** Keep as-is, but update canonical terms document to clarify that specific action names with "get_" prefix are acceptable when sufficiently descriptive.

### Option 3: Hybrid Approach - Rename Some, Keep Others

**Rename:**
- `get_entity_by_identifier` → `retrieve_entity_by_identifier` (query operation)
- `get_related_entities` → `retrieve_related_entities` (query operation)
- `get_graph_neighborhood` → `retrieve_graph_neighborhood` (query operation)

**Keep:**
- `get_file_url` (follows REST/HTTP conventions)
- `get_entity_snapshot` (used in canonical terms example)
- `get_field_provenance` (specific retrieval operation, may be acceptable)

## Decision Required

The canonical terms document has an inconsistency:
1. It states "get" is forbidden (line 92)
2. It uses `get_entity_snapshot` in an example (line 87)

**Questions to resolve:**
1. Should we strictly follow the rule and rename all "get_" actions to "retrieve_"?
2. Or should we clarify that specific action names with "get_" prefix are acceptable?
3. Should we update the canonical terms document to resolve this inconsistency?

## Recommended Action

**Immediate:** Clarify the canonical terms document to specify:
- "get" as a standalone generic term is forbidden
- Specific action names with "get_" prefix are acceptable if they are sufficiently descriptive (e.g., `get_entity_snapshot`, `get_file_url`)

**Future:** Consider standardizing on "retrieve_" prefix for all retrieval operations in a future major version release (v2.0.0) to fully align with canonical terms.
