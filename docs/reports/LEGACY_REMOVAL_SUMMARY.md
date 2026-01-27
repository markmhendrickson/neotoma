# Legacy Support Removal Summary

**Date:** 2025-01-27  
**File:** `src/server.ts`

## Overview

All legacy support and deprecated functionality has been removed from the MCP server implementation. The codebase now uses only canonical terminology and modern source architecture.

## Removed Legacy Features

### 1. Removed `source_record_id` Parameter
- **Location:** `list_timeline_events`
- **Change:** Removed `source_record_id` parameter (legacy)
- **Result:** Now only supports `source_id` (canonical)

### 2. Removed `include_records` Parameter
- **Location:** `get_graph_neighborhood`
- **Change:** Removed `include_records` parameter (legacy)
- **Result:** Now only supports `include_sources` (canonical, matches spec)

### 3. Removed `node_type: 'record'` Option
- **Location:** `get_graph_neighborhood`
- **Change:** Changed enum from `["entity", "record"]` to `["entity", "source"]`
- **Result:** Now only supports `node_type: 'source'` (canonical)

### 4. Removed Records Table Fallback
- **Location:** `get_field_provenance`
- **Change:** Removed fallback to `records` table
- **Result:** Now only uses `sources` table (canonical)

### 5. Removed Legacy Source Lookup
- **Location:** `get_graph_neighborhood` (when `node_type === "source"`)
- **Change:** Removed `records` table lookup, now uses `sources` table
- **Result:** All source queries use canonical `sources` table

### 6. Removed Legacy Observation Source Lookup
- **Location:** `get_graph_neighborhood` (observations → source)
- **Change:** Removed `records` table lookup for observation sources
- **Result:** Now uses `sources` table via `source_id`

### 7. Removed Legacy Comments
- **Location:** Multiple locations
- **Change:** Removed all comments referencing "legacy", "deprecated", "backward compatibility"
- **Result:** Clean codebase with no legacy references

### 8. Removed Unused Legacy Imports
- **Removed:**
  - `NeotomaRecord` type (unused)
  - `generateEmbedding` (unused)
  - `getRecordText` (unused)
  - `generateRecordSummary` (unused)
  - `normalizeRecordType` (unused)
  - `recordMatchesKeywordSearch` (unused)
  - `config` (unused)
  - `listEntities` (unused)

## Updated Code Sections

### `list_timeline_events`
- ✅ Removed `source_record_id` parameter
- ✅ Only supports `source_id` (canonical)

### `get_graph_neighborhood`
- ✅ Removed `include_records` parameter
- ✅ Changed `include_source_material` to `include_sources` (matches spec)
- ✅ Changed `node_type` enum from `["entity", "record"]` to `["entity", "source"]`
- ✅ Removed all `records` table queries
- ✅ Now uses `sources` table exclusively
- ✅ Response uses `related_sources` instead of `related_records`

### `get_field_provenance`
- ✅ Removed fallback to `records` table
- ✅ Now requires `source_id` (no fallback)
- ✅ Only queries `sources` table

### Historical Snapshot Computation
- ✅ Removed `source_record_id` fallback
- ✅ Maps `source_id` directly to reducer's `source_record_id` field (internal interface)

## Impact

### Breaking Changes
⚠️ **These changes are breaking for any clients using:**
- `source_record_id` parameter in `list_timeline_events`
- `include_records` parameter in `get_graph_neighborhood`
- `node_type: 'record'` in `get_graph_neighborhood`
- Observations without `source_id` (only `source_record_id`)

### Migration Path
Clients should:
1. Use `source_id` instead of `source_record_id`
2. Use `include_sources` instead of `include_records`
3. Use `node_type: 'source'` instead of `node_type: 'record'`
4. Ensure all observations have `source_id` populated

## Verification

- ✅ No linter errors
- ✅ All legacy parameters removed
- ✅ All legacy table references removed
- ✅ All legacy comments removed
- ✅ All unused imports removed
- ✅ Code now uses only canonical terminology

## Status

**Complete:** All legacy support and deprecated functionality has been successfully removed from the MCP server implementation.
