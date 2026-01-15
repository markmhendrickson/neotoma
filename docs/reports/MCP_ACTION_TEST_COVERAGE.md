# MCP Action Test Coverage Analysis

**Date**: 2026-01-14  
**Status**: ⚠️ **GAPS IDENTIFIED**

## Current Test Coverage

### Existing Tests

1. **`tests/integration/mcp_store_parquet.test.ts`**
   - ✅ Tests MCP `store` action with parquet files
   - ✅ Verifies entities are created from parquet data
   - ✅ Tests BigInt serialization
   - ❌ **Does NOT test known vs unknown entity types**
   - ❌ **Does NOT verify behavior when no schema exists**
   - Uses `test_task` entity type (may or may not have schema)

2. **`tests/integration/release/v0.1.0/it_002_entity_resolution.test.ts`**
   - ✅ Tests entity resolution and persistence
   - ✅ Verifies entities are created in database
   - ❌ **Uses old v0.1.0 API** (`store_record`), not MCP `store` action
   - ❌ **Does NOT test structured data** (parquet/CSV)

3. **`tests/integration/release/v0.1.0/it_006_mcp_actions.test.ts`**
   - ✅ Tests MCP actions
   - ❌ **Uses old v0.1.0 API**, not current MCP protocol
   - ❌ **Does NOT test structured data**

4. **`tests/integration/mcp_schema_actions.test.ts`**
   - ✅ Tests schema-related MCP actions
   - ✅ Tests auto-enhancement workflow
   - ❌ **Does NOT test entity creation** for known/unknown types

## Missing Test Coverage

### Critical Gaps

1. **Entity Creation for Known Entity Types**
   - ❌ No test verifies entities are created when schema exists
   - ❌ No test verifies fields are split into `observations.fields` vs `raw_fragments`
   - ❌ No test verifies `unknown_fields_count` is correct

2. **Entity Creation for Unknown Entity Types**
   - ❌ No test verifies entities are created when NO schema exists
   - ❌ No test verifies all fields go to `observations.fields` (not `raw_fragments`)
   - ❌ No test verifies `unknown_fields_count` is 0 when no schema

3. **Behavior Difference**
   - ❌ No test compares behavior between known vs unknown entity types
   - ❌ No test verifies auto-enhancement can work for known types but not unknown types

4. **MCP Store Action - Structured Data**
   - ❌ No test for parquet files with existing schema
   - ❌ No test for parquet files without schema
   - ❌ No test for CSV files with/without schema

## Recommended Test Cases

### Test 1: Entity Creation with Known Schema

```typescript
it("should create entities and split fields when schema exists", async () => {
  // 1. Ensure schema exists for entity type
  // 2. Store parquet file with some fields in schema, some not
  // 3. Verify:
  //    - Entities created in entities table
  //    - Known fields in observations.fields
  //    - Unknown fields in raw_fragments
  //    - unknown_fields_count > 0
});
```

### Test 2: Entity Creation without Schema

```typescript
it("should create entities with all fields in observations when no schema exists", async () => {
  // 1. Ensure NO schema exists for entity type
  // 2. Store parquet file
  // 3. Verify:
  //    - Entities created in entities table
  //    - All fields in observations.fields
  //    - No fields in raw_fragments
  //    - unknown_fields_count === 0
});
```

### Test 3: Comparison Test

```typescript
it("should behave differently for known vs unknown entity types", async () => {
  // 1. Store file with known entity type (has schema)
  // 2. Store file with unknown entity type (no schema)
  // 3. Compare:
  //    - Both create entities ✅
  //    - Known: some fields in raw_fragments ✅
  //    - Unknown: no fields in raw_fragments ✅
});
```

### Test 4: Auto-Enhancement Eligibility

```typescript
it("should enable auto-enhancement for known types but not unknown types", async () => {
  // 1. Store file with known entity type (has schema, unknown fields)
  // 2. Store file with unknown entity type (no schema)
  // 3. Verify:
  //    - Known: raw_fragments created → auto-enhancement possible
  //    - Unknown: no raw_fragments → auto-enhancement not possible
});
```

## Implementation Priority

1. **High Priority**: Test 1 & Test 2 (core behavior)
2. **Medium Priority**: Test 3 (comparison)
3. **Low Priority**: Test 4 (auto-enhancement integration)

## Files to Create/Update

1. **New**: `tests/integration/mcp_store_entity_creation.test.ts`
   - Comprehensive tests for entity creation scenarios
   - Known vs unknown entity types
   - Schema vs no-schema behavior

2. **Update**: `tests/integration/mcp_store_parquet.test.ts`
   - Add tests for known/unknown entity types
   - Add tests for schema behavior

## Related Documentation

- `docs/reports/NO_SCHEMA_BEHAVIOR_ANALYSIS.md` - Documents current behavior
- `docs/reports/ENTITY_CREATION_NO_SCHEMA.md` - Documents entity creation flow
