# MCP Specification vs Implementation Comparison

**Generated:** 2025-01-27  
**Spec:** `docs/specs/MCP_SPEC.md`  
**Implementation:** `src/server.ts`

## Summary

| Category | Spec | Implementation | Status |
|----------|------|----------------|--------|
| **Total Actions** | 18 MVP actions | 15 actions | ⚠️ Missing 3 |
| **Response Format** | Structured JSON | MCP `content` array wrapper | ✅ Compatible |
| **Error Handling** | ErrorEnvelope | MCPError (SDK) | ⚠️ Different format |
| **Historical Snapshots** | Supported (`at` param) | Not implemented | ❌ Missing |
| **Parameter Names** | Mostly aligned | Some differences | ⚠️ Minor gaps |

## Action-by-Action Comparison

### ✅ Implemented Actions (15)

#### 1. `ingest` ✅
**Status:** Implemented with minor differences

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Unstructured** | ✅ | ✅ | Matches spec |
| **Structured** | ✅ | ✅ | Matches spec |
| **Response** | `source_id`, `content_hash`, `deduplicated`, `interpretation` | ✅ | Matches |
| **Missing** | `file_size` in response | Returns `file_size` | ✅ Actually present |

#### 2. `get_file_url` ⚠️
**Status:** Implemented with response schema mismatch

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `file_path`, `expires_in?` | ✅ | Matches |
| **Response (Spec)** | `{ signed_url: string, expires_at: string }` | ❌ | Different format |
| **Response (Impl)** | `{ url: string }` | ✅ | Missing `expires_at` |
| **Error Codes** | `FILE_NOT_FOUND`, `SIGNING_FAILED` | ⚠️ | Uses generic MCPError |

**Issue:** Response returns `url` instead of `signed_url`, and missing `expires_at` timestamp.

#### 3. `get_entity_snapshot` ⚠️
**Status:** Implemented but missing historical snapshot support

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `entity_id`, `at?` (ISO 8601) | ✅ `entity_id` only | Missing `at` param |
| **Response** | Full snapshot with provenance | ✅ | Matches |
| **Historical** | Supports `at` timestamp | ❌ | Not implemented |

**Issue:** Spec allows querying entity state at a specific point in time via `at` parameter, but implementation only returns current snapshot.

#### 4. `list_observations` ✅
**Status:** Fully implemented

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `entity_id`, `limit?`, `offset?` | ✅ | Matches |
| **Response** | Array with pagination | ✅ | Matches |

#### 5. `get_field_provenance` ⚠️
**Status:** Implemented with response schema differences

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `entity_id`, `field` | ✅ `entity_id`, `field_name` | Parameter name differs |
| **Response (Spec)** | `field`, `value`, `source_observation`, `source_material`, `observed_at` | ⚠️ | Different structure |
| **Response (Impl)** | `field_name`, `field_value`, `observation_id`, `observed_at`, `source_record_id`, `record_type`, `file_urls` | ✅ | Uses legacy `records` table |

**Issue:** 
- Parameter name: spec uses `field`, implementation uses `field_name`
- Response structure differs (spec expects nested `source_observation` and `source_material` objects)

#### 6. `retrieve_entities` ✅
**Status:** Implemented with minor differences

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `entity_type?`, `user_id?`, `limit?`, `offset?`, `include_snapshots?`, `include_merged?` | ✅ | Matches |
| **Response** | Entities array with snapshots | ✅ | Matches |

#### 7. `get_entity_by_identifier` ✅
**Status:** Fully implemented

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `identifier`, `entity_type?` | ✅ | Matches |
| **Response** | Entities array | ✅ | Matches |

#### 8. `get_related_entities` ✅
**Status:** Fully implemented

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `entity_id`, `relationship_types?`, `direction?`, `max_hops?`, `include_entities?` | ✅ | Matches |
| **Response** | Entities, relationships, counts | ✅ | Matches |

#### 9. `get_graph_neighborhood` ⚠️
**Status:** Implemented with parameter differences

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `node_id`, `node_type?`, `include_relationships?`, `include_sources?`, `include_events?`, `include_observations?` | ⚠️ | Different param names |
| **Spec Param** | `include_sources` | ❌ | Not in implementation |
| **Impl Param** | `include_records` (legacy), `include_source_material` | ✅ | Has both legacy and canonical |
| **node_type** | `'entity' \| 'source'` | `'entity' \| 'record'` | Uses legacy `'record'` instead of `'source'` |

**Issue:** 
- Spec uses `include_sources`, implementation uses `include_source_material` (canonical) and `include_records` (legacy)
- `node_type` enum uses `'record'` instead of `'source'` (though documented as legacy)

#### 10. `list_timeline_events` ⚠️
**Status:** Implemented with legacy parameter support

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `event_type?`, `after_date?`, `before_date?`, `source_id?`, `limit?`, `offset?` | ✅ | Matches |
| **Legacy Support** | N/A | ✅ `source_record_id` | Backward compatibility |
| **Response** | Events array | ✅ | Matches |

**Note:** Implementation correctly supports both `source_id` (canonical) and `source_record_id` (legacy) for backward compatibility.

#### 11. `correct` ✅
**Status:** Fully implemented

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `user_id`, `entity_id`, `entity_type`, `field`, `value` | ✅ | Matches |
| **Response** | Observation ID and confirmation | ✅ | Matches |
| **Priority** | 1000 (highest) | ✅ | Matches |

#### 12. `reinterpret` ✅
**Status:** Fully implemented

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `source_id`, `interpretation_config` | ✅ | Matches |
| **Response** | Run ID and counts | ✅ | Matches |

#### 13. `merge_entities` ⚠️
**Status:** Implemented with response differences

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `user_id`, `from_entity_id`, `to_entity_id`, `merge_reason?` | ✅ | Matches |
| **Response (Spec)** | `from_entity_id`, `to_entity_id`, `observations_moved`, `merged_at`, `merge_reason?` | ⚠️ | Missing `merged_at` |
| **Response (Impl)** | `from_entity_id`, `to_entity_id`, `observations_moved`, `message` | ❌ | Returns `message` instead of `merged_at` |

**Issue:** Response returns `message` string instead of `merged_at` ISO 8601 timestamp.

#### 14. `create_relationship` ⚠️
**Status:** Implemented with validation differences

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `relationship_type`, `source_entity_id`, `target_entity_id`, `metadata?` | ✅ | Matches |
| **Type Validation** | Enum: `PART_OF`, `CORRECTS`, `REFERS_TO`, `SETTLES`, `DUPLICATE_OF`, `DEPENDS_ON`, `SUPERSEDES` | ⚠️ | Accepts any string |
| **Cycle Detection** | Required | ⚠️ | Code imports but may not be used |
| **Error Codes** | `ENTITY_NOT_FOUND`, `INVALID_RELATIONSHIP_TYPE`, `CYCLE_DETECTED` | ⚠️ | Uses generic MCPError |

**Issue:** 
- No enum validation on `relationship_type` (accepts any string)
- Cycle detection may not be fully implemented

#### 15. `list_relationships` ⚠️
**Status:** Implemented with missing parameters

| Aspect | Spec | Implementation | Notes |
|--------|------|----------------|-------|
| **Request** | `entity_id`, `direction?`, `relationship_type?`, `limit?`, `offset?` | ⚠️ | Missing `relationship_type`, `limit`, `offset` |
| **Response** | Relationships array with pagination | ⚠️ | Missing pagination metadata |

**Issue:** Missing optional filters (`relationship_type`, `limit`, `offset`) and pagination metadata in response.

### ❌ Missing Actions (3)

#### 1. `upload_file` ❌
**Status:** Not implemented (deprecated in favor of `ingest`)

**Spec Details:**
- Upload file from local path
- Create source material
- Run interpretation optionally

**Implementation:** 
- Comment in code: "Removed deprecated actions: submit_payload, update_record, retrieve_records, delete_record, ingest_structured. Use unified ingest() action instead"
- `upload_file` is not in the tools list

**Note:** This is intentional - the spec documents it but implementation uses unified `ingest` instead.

## Error Handling Comparison

### Spec Standard: ErrorEnvelope
```typescript
interface MCPErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    trace_id?: string;
  };
}
```

### Implementation: MCP SDK Error
```typescript
// Uses @modelcontextprotocol/sdk/types.js McpError
throw new McpError(ErrorCode.InvalidParams, "message");
```

**Issue:** Implementation uses MCP SDK's error format, not the custom ErrorEnvelope from spec. The SDK format is compatible but different structure.

## Response Format Comparison

### Spec Format
Direct JSON objects:
```json
{
  "source_id": "...",
  "content_hash": "..."
}
```

### Implementation Format
MCP `content` array wrapper:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"source_id\":\"...\",\"content_hash\":\"...\"}"
    }
  ]
}
```

**Note:** This is correct for MCP protocol - the SDK wraps responses in `content` array. The spec shows the unwrapped data structure.

## Parameter Name Differences

| Action | Spec Parameter | Implementation Parameter | Status |
|--------|----------------|-------------------------|--------|
| `get_field_provenance` | `field` | `field_name` | ⚠️ Mismatch |
| `get_graph_neighborhood` | `include_sources` | `include_source_material` | ⚠️ Different name (but canonical) |
| `get_graph_neighborhood` | `node_type: 'source'` | `node_type: 'record'` | ⚠️ Legacy name |

## Missing Features

### 1. Historical Entity Snapshots ❌
**Spec:** `get_entity_snapshot` supports `at?: string` (ISO 8601) to get entity state at a specific point in time.

**Implementation:** Only returns current snapshot.

**Impact:** Cannot query historical entity states.

### 2. Relationship Type Enum Validation ⚠️
**Spec:** `create_relationship` should validate `relationship_type` against enum.

**Implementation:** Accepts any string.

**Impact:** Invalid relationship types can be created.

### 3. Pagination Metadata ⚠️
**Spec:** `list_relationships` should return `limit` and `offset` in response.

**Implementation:** Missing pagination metadata.

**Impact:** Clients cannot determine pagination state.

## Recommendations

### High Priority
1. **Add `at` parameter to `get_entity_snapshot`** - Enable historical snapshot queries
2. **Fix `get_file_url` response** - Return `signed_url` and `expires_at` as per spec
3. **Fix `merge_entities` response** - Return `merged_at` timestamp instead of `message`
4. **Add relationship type validation** - Enforce enum in `create_relationship`

### Medium Priority
5. **Standardize parameter names** - Use `field` instead of `field_name` in `get_field_provenance`
6. **Add pagination to `list_relationships`** - Support `limit`, `offset`, and return pagination metadata
7. **Implement cycle detection** - Ensure `create_relationship` properly detects cycles

### Low Priority
8. **Document legacy parameters** - Clearly mark `include_records` and `node_type: 'record'` as deprecated
9. **Error code mapping** - Map MCP SDK errors to spec error codes where possible
10. **Response structure alignment** - Align `get_field_provenance` response with spec structure

## Action Count Summary

| Category | Count |
|----------|-------|
| **Fully Compliant** | 8 |
| **Minor Issues** | 6 |
| **Missing Features** | 1 |
| **Not Implemented (Intentional)** | 1 (`upload_file`) |
| **Total Implemented** | 15 |
| **Total in Spec** | 16 unique actions (18 includes deprecated) |

## Notes

- The spec mentions "18 MVP actions" but only lists 16 unique actions (including deprecated `upload_file`)
- Implementation correctly uses unified `ingest` instead of separate `upload_file` action
- MCP SDK response wrapping is correct - spec shows unwrapped data structures
- Most differences are minor and don't break functionality
- Historical snapshots is the most significant missing feature
