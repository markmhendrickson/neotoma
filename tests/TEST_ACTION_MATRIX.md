# MCP Action Test Matrix

**Reference**: [docs/specs/MCP_SPEC.md](../docs/specs/MCP_SPEC.md)

This document defines the test permutation matrix for all 17 MCP actions, with expected outcomes aligned to the MCP specification.

## 1. Core Storing Operations

### 1.1 `store` (Unified)

**Spec Reference**: Section 3.1

**Test Permutations**:

| Variation | Input | Expected Outcome (per spec 3.1) | Error Code (per spec 5) |
|-----------|-------|--------------------------------|-------------------------|
| Structured - Known Schema | `entities: [{entity_type: "task", ...40 fields}]` with schema defining 15 fields | `{source_id, entities: [{entity_id, entity_type, observation_id}], unknown_fields_count: 25}` | - |
| Structured - Unknown Schema | `entities: [{entity_type: "new_type", ...fields}]` with no schema | `{source_id, entities: [{entity_id, entity_type, observation_id}], unknown_fields_count: 0}` | - |
| Structured - Parquet File | `file_path: "samples/task.parquet"` with existing schema | `{source_id, entities: [...], unknown_fields_count > 0}` | - |
| Structured - Invalid Entity | `entities: [{entity_type: null}]` | Error | `VALIDATION_ERROR` |
| Unstructured - Base64 | `file_content: "base64...", mime_type: "application/pdf", interpret: true` | `{source_id, content_hash, deduplicated: false, interpretation: {run_id, entities_created, observations_created}}` | - |
| Unstructured - File Path | `file_path: "/path/to/file.pdf", interpret: true` | `{source_id, content_hash, deduplicated: false, interpretation: {...}}` | - |
| Unstructured - Deduplication | Same file content stored twice | Second call: `{deduplicated: true, source_id: <same>}` (deterministic per spec 7.1) | - |
| Unstructured - No Interpret | `file_path: "...", interpret: false` | `{source_id, content_hash, interpretation: null}` | - |
| File Not Found | `file_path: "/nonexistent.parquet"` | Error | `FILE_NOT_FOUND` |
| File Too Large | `file_path: "huge_file.parquet"` (>50MB) | Error | `FILE_TOO_LARGE` |
| Missing User ID | `{entities: [...]}` (no user_id) | Error | `VALIDATION_ERROR` |

**Consistency**: Strong (per spec 6.1)  
**Determinism**: Yes (same content → same content_hash → same source_id, per spec 7.1)

---

## 2. Entity Operations

### 2.1 `retrieve_entity_snapshot`

**Spec Reference**: Section 3.4

| Variation | Input | Expected Outcome (per spec 3.4) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid Entity | `{entity_id: "ent_abc123"}` | `{entity_id, entity_type, schema_version, snapshot: {...}, provenance: {...}, computed_at, observation_count, last_observation_at}` | - |
| Historical Snapshot | `{entity_id: "ent_abc123", at: "2024-01-01T00:00:00Z"}` | Snapshot computed from observations up to timestamp | - |
| Entity Not Found | `{entity_id: "ent_nonexistent"}` | Error | `ENTITY_NOT_FOUND` |
| Invalid Entity ID | `{entity_id: "invalid"}` | Error | `VALIDATION_ERROR` |

**Consistency**: Strong  
**Determinism**: Yes (same entity_id → same snapshot)

### 2.2 `retrieve_entities`

**Spec Reference**: Section 3.7

| Variation | Input | Expected Outcome (per spec 3.7) | Error Code |
|-----------|-------|--------------------------------|------------|
| Filter by Type | `{entity_type: "task"}` | `{entities: [{id, entity_type, canonical_name, snapshot, observation_count, last_observation_at}], total, excluded_merged: true}` | - |
| With Pagination | `{entity_type: "task", limit: 10, offset: 20}` | Entities 21-30 | - |
| Exclude Snapshots | `{entity_type: "task", include_snapshots: false}` | Entities without snapshot field | - |
| Include Merged | `{include_merged: true}` | Includes merged entities | - |
| Invalid Type | `{entity_type: 123}` | Error | `VALIDATION_ERROR` |

**Consistency**: Strong  
**Determinism**: Yes (same query + DB state → same results)

### 2.3 `retrieve_entity_by_identifier`

**Spec Reference**: Section 3.8

| Variation | Input | Expected Outcome (per spec 3.8) | Error Code |
|-----------|-------|--------------------------------|------------|
| By Name | `{identifier: "Acme Corp"}` | `{entities: [...], total}` (normalized identifier) | - |
| By Email | `{identifier: "john@example.com"}` | Entities with matching email | - |
| With Type Filter | `{identifier: "Acme Corp", entity_type: "company"}` | Entities of type "company" only | - |
| No Match | `{identifier: "nonexistent"}` | `{entities: [], total: 0}` | - |

**Consistency**: Strong  
**Determinism**: Yes (same identifier → same results after normalization)

### 2.4 `retrieve_related_entities`

**Spec Reference**: Section 3.9

| Variation | Input | Expected Outcome (per spec 3.9) | Error Code |
|-----------|-------|--------------------------------|------------|
| 1-Hop | `{entity_id: "ent_abc", max_hops: 1}` | `{entities: [...], relationships: [...], total_entities, total_relationships, hops_traversed: 1}` | - |
| 2-Hop | `{entity_id: "ent_abc", max_hops: 2}` | Entities 2 hops away | - |
| Filter by Type | `{entity_id: "ent_abc", relationship_types: ["PART_OF"]}` | Only PART_OF relationships | - |
| Inbound Only | `{entity_id: "ent_abc", direction: "inbound"}` | Inbound relationships only | - |
| Entity Not Found | `{entity_id: "ent_nonexistent"}` | Error | `ENTITY_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: Yes

### 2.5 `retrieve_graph_neighborhood`

**Spec Reference**: Section 3.10

| Variation | Input | Expected Outcome (per spec 3.10) | Error Code |
|-----------|-------|--------------------------------|------------|
| Entity Node | `{node_id: "ent_abc", node_type: "entity"}` | `{node_id, node_type: "entity", entity, entity_snapshot, relationships, related_entities, related_sources, timeline_events}` | - |
| Source Node | `{node_id: "src_xyz", node_type: "source"}` | `{node_id, node_type: "source", source_material, ...}` | - |
| Exclude Observations | `{node_id: "ent_abc", include_observations: false}` | No observations field | - |
| Node Not Found | `{node_id: "ent_nonexistent"}` | Error | `ENTITY_NOT_FOUND` or `SOURCE_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: Yes

### 2.6 `list_entity_types`

**Spec Reference**: Section 3.2

| Variation | Input | Expected Outcome (per spec 3.2) | Error Code |
|-----------|-------|--------------------------------|------------|
| All Types | `{}` | `{entity_types: [{entity_type, schema_version, field_names, field_summary}], total, keyword: null, search_method: "all"}` | - |
| Keyword Match | `{keyword: "task"}` | Entity types with "task" in name or fields, `match_type: "keyword"` | - |
| Vector Search | `{keyword: "payment"}` | Semantically related types (transaction, invoice), `match_type: "vector"` | - |

**Consistency**: Strong (keyword), Bounded eventual (vector per spec 3.2)  
**Determinism**: Yes (keyword), Yes with variance (vector per spec 3.2)

### 2.7 `merge_entities`

**Spec Reference**: Section 3.14

| Variation | Input | Expected Outcome (per spec 3.14) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid Merge | `{user_id, from_entity_id: "ent_a", to_entity_id: "ent_b"}` | `{from_entity_id, to_entity_id, observations_moved, merged_at}` | - |
| Already Merged | Merge entity that's already merged | Error | `ENTITY_ALREADY_MERGED` |
| Entity Not Found | `{from_entity_id: "ent_nonexistent", to_entity_id: "ent_b"}` | Error | `ENTITY_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: Yes

---

## 3. Observation and Relationship Operations

### 3.1 `list_observations`

**Spec Reference**: Section 3.5

| Variation | Input | Expected Outcome (per spec 3.5) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid Entity | `{entity_id: "ent_abc"}` | `{observations: [{id, entity_id, entity_type, schema_version, source_id, observed_at, fields, ...}], total, limit: 100, offset: 0}` | - |
| With Pagination | `{entity_id: "ent_abc", limit: 10, offset: 20}` | Observations 21-30 | - |
| Entity Not Found | `{entity_id: "ent_nonexistent"}` | Error | `ENTITY_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: Yes (sorted by observed_at DESC)

### 3.2 `retrieve_field_provenance`

**Spec Reference**: Section 3.6

| Variation | Input | Expected Outcome (per spec 3.6) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid Field | `{entity_id: "ent_abc", field: "amount"}` | `{field, value, source_observation: {id, source_id, observed_at, specificity_score, source_priority}, source_material: {...}, observed_at}` | - |
| Field Not Found | `{entity_id: "ent_abc", field: "nonexistent"}` | Error | `FIELD_NOT_FOUND` |
| Entity Not Found | `{entity_id: "ent_nonexistent", field: "amount"}` | Error | `ENTITY_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: Yes

### 3.3 `create_relationship`

**Spec Reference**: Section 3.15

| Variation | Input | Expected Outcome (per spec 3.15) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid Relationship | `{relationship_type: "PART_OF", source_entity_id: "ent_a", target_entity_id: "ent_b"}` | `{id, relationship_type, source_entity_id, target_entity_id, created_at}` | - |
| With Metadata | `{..., metadata: {amount: 100}}` | Relationship with metadata | - |
| Cycle Detection | Create relationship that would form cycle | Error | `CYCLE_DETECTED` |
| Invalid Type | `{relationship_type: "INVALID", ...}` | Error | `INVALID_RELATIONSHIP_TYPE` |
| Entity Not Found | `{source_entity_id: "ent_nonexistent", ...}` | Error | `ENTITY_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: Yes

### 3.4 `list_relationships`

**Spec Reference**: Section 3.16

| Variation | Input | Expected Outcome (per spec 3.16) | Error Code |
|-----------|-------|--------------------------------|------------|
| All Relationships | `{entity_id: "ent_abc"}` | `{relationships: [{id, relationship_type, source_entity_id, target_entity_id, metadata, created_at}], total, limit, offset}` | - |
| Outbound Only | `{entity_id: "ent_abc", direction: "outbound"}` | Only relationships where entity is source | - |
| Filter by Type | `{entity_id: "ent_abc", relationship_type: "PART_OF"}` | Only PART_OF relationships | - |
| Entity Not Found | `{entity_id: "ent_nonexistent"}` | Error | `ENTITY_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: Yes (sorted by created_at DESC)

### 3.5 `get_relationship_snapshot`

**Spec Reference**: Section 3.17

| Variation | Input | Expected Outcome (per spec 3.17) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid Relationship | `{relationship_type: "PART_OF", source_entity_id: "ent_a", target_entity_id: "ent_b"}` | `{snapshot: {relationship_key, ..., snapshot: {...}, provenance: {...}, observation_count}, observations: [...]}` | - |
| Relationship Not Found | Non-existent relationship | Error | `NOT_FOUND` |
| Entity Not Found | One entity doesn't exist | Error | `ENTITY_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: Yes

---

## 4. Correction and Reinterpretation Operations

### 4.1 `correct`

**Spec Reference**: Section 3.12

| Variation | Input | Expected Outcome (per spec 3.12) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid Correction | `{user_id, entity_id: "ent_abc", entity_type: "task", field: "status", value: "completed"}` | `{observation_id, entity_id, field, value, message}` with priority 1000 | - |
| Entity Not Found | `{entity_id: "ent_nonexistent", ...}` | Error | `ENTITY_NOT_FOUND` |
| Invalid Field | `{field: null, ...}` | Error | `VALIDATION_ERROR` |

**Consistency**: Strong (correction immediately affects snapshot per spec 3.12)  
**Determinism**: Yes

### 4.2 `reinterpret`

**Spec Reference**: Section 3.13

| Variation | Input | Expected Outcome (per spec 3.13) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid Reinterpretation | `{source_id: "src_xyz", interpretation_config: {...}}` | `{run_id, entities_created, observations_created, source_id}` | - |
| Source Not Found | `{source_id: "src_nonexistent", ...}` | Error | `SOURCE_NOT_FOUND` |
| Quota Exceeded | Reinterpret when quota exceeded | Error | `QUOTA_EXCEEDED` |

**Consistency**: Strong  
**Determinism**: Yes (same source + config → same interpretation result per spec 3.13)

---

## 5. Schema Management Operations

### 5.1 `analyze_schema_candidates`

**Spec Reference**: Section 3.18

| Variation | Input | Expected Outcome (per spec 3.18) | Error Code |
|-----------|-------|--------------------------------|------------|
| All Entity Types | `{min_frequency: 5, min_confidence: 0.8}` | `{recommendations: [{entity_type, fields: [{field_name, field_type, frequency, confidence, type_consistency, sample_values, ...}], source: "raw_fragments", confidence_score}], total_entity_types, total_fields, min_frequency, min_confidence}` | - |
| Specific Entity Type | `{entity_type: "task", min_frequency: 3}` | Recommendations for "task" only | - |
| User-Specific | `{user_id: "user_xyz"}` | User-specific recommendations | - |
| No Candidates | Empty raw_fragments | `{recommendations: [], total_entity_types: 0, total_fields: 0}` | - |

**Consistency**: Strong (deterministic analysis per spec 3.18)  
**Determinism**: Yes (same raw_fragments → same recommendations)

### 5.2 `get_schema_recommendations`

**Spec Reference**: Section 3.19

| Variation | Input | Expected Outcome (per spec 3.19) | Error Code |
|-----------|-------|--------------------------------|------------|
| Pending Recommendations | `{entity_type: "task", status: "pending"}` | `{recommendations: [{id, entity_type, fields, source, confidence_score, reasoning, status: "pending"}], total, entity_type}` | - |
| Auto-Applied | `{entity_type: "task", status: "auto_applied"}` | Recommendations with status "auto_applied" | - |
| All Sources | `{entity_type: "task", source: "all"}` | Recommendations from all sources (raw_fragments, agent, inference) | - |
| No Recommendations | `{entity_type: "new_type"}` | `{recommendations: [], total: 0}` | - |

**Consistency**: Strong  
**Determinism**: Yes

### 5.3 `update_schema_incremental`

**Spec Reference**: Section 3.20

| Variation | Input | Expected Outcome (per spec 3.20) | Error Code |
|-----------|-------|--------------------------------|------------|
| Add Fields | `{entity_type: "task", fields_to_add: [{field_name: "urgency", field_type: "string"}], activate: true}` | `{success: true, entity_type, schema_version, fields_added: ["urgency"], activated: true, migrated_existing: false, scope: "global"}` | - |
| With Migration | `{..., migrate_existing: true}` | Raw fragments migrated to observations | - |
| User-Specific | `{..., user_specific: true, user_id: "user_xyz"}` | `{scope: "user"}` | - |
| No Schema Exists | `{entity_type: "nonexistent_type", ...}` | Error | `SCHEMA_NOT_FOUND` |
| Missing User ID | `{user_specific: true}` (no user_id) | Error | `USER_ID_REQUIRED` |

**Consistency**: Strong (atomic per spec 3.20)  
**Determinism**: Yes

### 5.4 `register_schema`

**Spec Reference**: Section 3.21

| Variation | Input | Expected Outcome (per spec 3.21) | Error Code |
|-----------|-------|--------------------------------|------------|
| New Schema | `{entity_type: "new_type", schema_definition: {...}, reducer_config: {...}}` | `{success: true, entity_type, schema_version: "1.0", activated: false, scope: "global", schema_id}` | - |
| With Activation | `{..., activate: true}` | `{activated: true}` | - |
| User-Specific | `{..., user_specific: true, user_id: "user_xyz"}` | `{scope: "user"}` | - |
| Invalid Schema | `{schema_definition: {fields: null}}` | Error | `VALIDATION_ERROR` |
| Schema Exists | Register duplicate schema version | Error | `SCHEMA_EXISTS` |

**Consistency**: Strong  
**Determinism**: Yes

---

## 6. Timeline Operations

### 6.1 `list_timeline_events`

**Spec Reference**: Section 3.11

| Variation | Input | Expected Outcome (per spec 3.11) | Error Code |
|-----------|-------|--------------------------------|------------|
| All Events | `{limit: 100}` | `{events: [{id, event_type, event_timestamp, source_id, entity_ids, properties}], total}` | - |
| Date Range | `{after_date: "2024-01-01", before_date: "2024-12-31"}` | Events within date range | - |
| Filter by Type | `{event_type: "InvoiceIssued"}` | Events of specific type | - |
| Filter by Source | `{source_id: "src_xyz"}` | Events from specific source | - |
| Invalid Date | `{after_date: "invalid"}` | Error | `VALIDATION_ERROR` |

**Consistency**: Strong  
**Determinism**: Yes (sorted by timestamp DESC per spec 3.11)

---

## 7. File Operations

### 7.1 `retrieve_file_url`

**Spec Reference**: Section 3.3

| Variation | Input | Expected Outcome (per spec 3.3) | Error Code |
|-----------|-------|--------------------------------|------------|
| Valid File | `{file_path: "sources/abc123.pdf"}` | `{signed_url, expires_at}` (time-limited URL) | - |
| Custom Expiry | `{file_path: "...", expires_in: 7200}` | URL expires in 2 hours | - |
| File Not Found | `{file_path: "nonexistent.pdf"}` | Error | `FILE_NOT_FOUND` |

**Consistency**: Strong  
**Determinism**: No (signed URL contains timestamp per spec 7.2)

---

## Test Implementation Strategy

### Priority 1: Core Actions (MVP Critical)

1. `store` (structured + unstructured)
2. `retrieve_entity_snapshot`
3. `list_entity_types`
4. `retrieve_entities`

### Priority 2: Schema Evolution

1. `analyze_schema_candidates`
2. `get_schema_recommendations`
3. `update_schema_incremental`
4. `register_schema`

### Priority 3: Relationships and Observations

1. `create_relationship`
2. `list_relationships`
3. `list_observations`
4. `retrieve_field_provenance`

### Priority 4: Advanced Queries

1. `retrieve_related_entities`
2. `retrieve_graph_neighborhood`
3. `list_timeline_events`
4. `retrieve_entity_by_identifier`

### Priority 5: Correction Operations

1. `correct`
2. `reinterpret`

### Priority 6: File Operations

1. `retrieve_file_url`

---

## Validation Checklist (per spec sections 4, 5)

For each test:

- [ ] Response schema matches spec section 3.x exactly
- [ ] Error codes match spec section 5
- [ ] ErrorEnvelope format used (spec section 4)
- [ ] Consistency guarantees verified (spec section 6)
- [ ] Determinism guarantees verified (spec section 7)
- [ ] No PII in error messages or logs
- [ ] Backward compatibility maintained
