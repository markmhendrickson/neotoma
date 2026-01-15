# Failing Tests Analysis

**Date**: 2026-01-15

## Summary

**Total**: 23 tests failing out of 58 tests (40% failure rate)

### Test Suites Status

| Test Suite | Passing | Failing | Total |
|------------|---------|---------|-------|
| mcp_store_parquet | 8 | 0 | 8 ✅ |
| mcp_store_unstructured | 9 | 0 | 9 ✅ |
| mcp_entity_creation | 6 | 0 | 6 ✅ |
| mcp_actions_matrix | 11 | 18 | 29 ⚠️ |
| mcp_auto_enhancement | 1 | 5 | 6 ⚠️ |
| **Total** | **35** | **23** | **58** |

## Failure Categories

### Category 1: MCP Action Method Access (18 failures)

**Problem**: Tests are calling MCP actions as direct methods on `server` object, but they're not exposed as methods - they're handled through the MCP protocol handler.

**Failing Tests**:
1. `retrieve_entity_snapshot` - `server.retrieve_entity_snapshot is not a function`
2. `retrieve_entities` - `server.retrieve_entities is not a function`
3. `list_entity_types` - `server.list_entity_types is not a function`
4. `retrieve_entity_by_identifier` - `server.retrieve_entity_by_identifier is not a function`
5. `merge_entities` - `server.merge_entities is not a function`
6. `list_observations` - `server.list_observations is not a function`
7. `retrieve_field_provenance` - `server.retrieve_field_provenance is not a function`
8. `create_relationship` - `server.create_relationship is not a function`
9. `list_relationships` - `server.list_relationships is not a function`
10. `analyze_schema_candidates` - `server.analyze_schema_candidates is not a function`
11. `get_schema_recommendations` - `server.get_schema_recommendations is not a function`
12. `update_schema_incremental` - `server.update_schema_incremental is not a function`
13. `register_schema` - `server.register_schema is not a function`
14. `correct` - `server.correct is not a function`

**Root Cause**: MCP actions are handled via `handleRequest()` method, not as direct methods. The `store` action works because it's a private method, but other actions need to go through the MCP handler.

**Solution**: Update tests to use `server.handleRequest({ method: "action_name", params: {...} })` or expose actions as testable methods.

### Category 2: Auto-Enhancement Queue Issues (5 failures)

**Problem**: Tests expect queue entries and raw_fragments to be created, but they're not being created or counted correctly.

**Failing Tests**:
1. `should create queue entries when storing unknown fields` - `expected 0 to be greater than 0` (raw_fragments count)
2. `should process queue and create schema recommendations` - `expected 0 to be greater than 0` (processed count)
3. `should analyze raw_fragments and return recommendations` - Method access issue (Category 1)
4. `should return stored schema recommendations` - Method access issue (Category 1)
5. `should filter recommendations by status` - Method access issue (Category 1)

**Root Cause**: 
- Some tests have method access issues (Category 1)
- Raw fragments may not be created if all fields match schema
- Queue entries may not be created if eligibility criteria not met

**Solution**: 
- Fix method access (Category 1)
- Adjust test expectations to match actual behavior
- Ensure test data has unknown fields that will create raw_fragments

## Detailed Failure List

### mcp_actions_matrix.test.ts (18 failures)

#### Entity Operations (6 failures)
1. ❌ `retrieve_entity_snapshot` - should retrieve entity snapshot with provenance
2. ❌ `retrieve_entity_snapshot` - should return ENTITY_NOT_FOUND for nonexistent entity
3. ❌ `retrieve_entities` - should retrieve entities with filters
4. ❌ `retrieve_entities` - should support pagination
5. ❌ `list_entity_types` - should list all entity types
6. ❌ `list_entity_types` - should filter entity types by keyword
7. ❌ `retrieve_entity_by_identifier` - should find entity by identifier
8. ❌ `merge_entities` - should merge two entities

#### Observation Operations (2 failures)
9. ❌ `list_observations` - should list observations for entity
10. ❌ `retrieve_field_provenance` - should retrieve provenance chain for field

#### Relationship Operations (3 failures)
11. ❌ `create_relationship` - should create relationship between entities
12. ❌ `create_relationship` - should return CYCLE_DETECTED for circular relationships
13. ❌ `list_relationships` - should list relationships for entity

#### Schema Operations (4 failures)
14. ❌ `analyze_schema_candidates` - should return recommendations structure
15. ❌ `get_schema_recommendations` - should return recommendations for entity type
16. ❌ `update_schema_incremental` - should add fields to schema
17. ❌ `register_schema` - should register new schema

#### Correction Operations (1 failure)
18. ❌ `correct` - should create high-priority correction observation

### mcp_auto_enhancement.test.ts (5 failures)

1. ❌ `should create queue entries when storing unknown fields` - No raw_fragments created
2. ❌ `should process queue and create schema recommendations` - No queue items processed
3. ❌ `should analyze raw_fragments and return recommendations` - Method access issue
4. ❌ `should return stored schema recommendations` - Method access issue
5. ❌ `should filter recommendations by status` - Method access issue

## Fix Strategy

### Priority 1: Fix Method Access (18 tests)

**Option A**: Expose MCP actions as testable methods
- Add public wrapper methods to NeotomaServer for testing
- Pros: Clean test code
- Cons: Exposes internal methods

**Option B**: Use handleRequest pattern
- Update tests to use `server.handleRequest({ method: "action_name", params })`
- Pros: Tests actual MCP protocol
- Cons: More verbose test code

**Option C**: Create test helper that wraps handleRequest
- Create `callMCPAction(server, action, params)` helper
- Pros: Clean tests, tests actual protocol
- Cons: Additional abstraction layer

**Recommended**: Option C - Create test helper

### Priority 2: Fix Auto-Enhancement Tests (5 tests)

1. Fix method access issues (use helper from Priority 1)
2. Ensure test data has unknown fields (verify parquet file structure)
3. Adjust expectations for eligibility criteria (may be skipped if criteria not met)
4. Add better synchronization for background processor

## Next Steps

1. Create `callMCPAction` test helper
2. Update all failing tests to use helper
3. Fix auto-enhancement test data and expectations
4. Re-run tests to verify fixes
