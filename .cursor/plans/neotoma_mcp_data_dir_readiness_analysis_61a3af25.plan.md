---
name: Neotoma MCP DATA_DIR Readiness Analysis
overview: Analyze the readiness of the neotoma MCP to store all data found in $DATA_DIR, identifying gaps in format support, schema coverage, and required implementation work.
todos:
  - id: inventory-data-dir
    content: "Inventory DATA_DIR contents: list all entity type directories, parquet files, and their structures"
    status: pending
  - id: assess-parquet-support
    content: "Assess parquet reading capability: check for existing libraries, evaluate adding parquet support to MCP store"
    status: pending
  - id: evaluate-schema-coverage
    content: "Evaluate schema readiness: determine which entity types can use raw_fragments vs need schemas"
    status: pending
  - id: design-ingestion-strategy
    content: "Design ingestion strategy: choose between parquet support, pre-conversion, or batch processing"
    status: pending
  - id: test-readiness
    content: "Test readiness: create test plan with sample parquet files and verify MCP store works"
    status: pending
---

# Neotoma MCP DATA_DIR Readiness Analysis Plan

## Overview

This plan analyzes whether the neotoma MCP `store` action can handle all data types and formats found in `$DATA_DIR`, identifying gaps and required implementation work.

## Current State Analysis

### 1. DATA_DIR Structure

- **Location**: Defined by `DATA_DIR` or `NEOTOMA_DATA_DIR` environment variable
- **Format**: Parquet files organized by entity type in subdirectories
- **Entity Types**: 73 directories found (per `docs/reports/DATA_DIR_SCHEMA_ALIGNMENT.md`)
- **Schema Coverage**: 30 entity types have schemas defined in `src/services/schema_definitions.ts`

### 2. Neotoma MCP Store Capabilities

The `store` action in `src/server.ts` supports:

**Unstructured Files:**

- `file_path`: Local file path (auto-detects MIME type from extension)
- `file_content`: Base64-encoded content + `mime_type`
- Supported formats: Any file type (PDF, images, text, etc.)
- Automatic interpretation via `analyzeFileForRecord()` if `interpret=true`

**Structured Entities:**

- `entities`: Array of entity objects with `entity_type` field
- All fields preserved (schema fields → observations, unknown fields → `raw_fragments`)
- No interpretation needed (direct entity processing)

### 3. Current Gaps Identified

#### Gap 1: Parquet File Reading

- **Issue**: MCP `store` action cannot directly read parquet files
- **Current Workaround**: None - parquet files must be converted to JSON/CSV first
- **Impact**: Cannot directly ingest DATA_DIR parquet files via MCP

#### Gap 2: Batch Processing

- **Issue**: `store` action processes one file or one entities array at a time
- **Current Workaround**: Scripts like `ingest_finances_data.ts` process CSV files in batches via API
- **Impact**: Inefficient for large parquet files with thousands of rows

#### Gap 3: Schema Coverage

- **Issue**: 39 of 73 entity types lack schema definitions
- **Mitigation**: System handles unknown fields via `raw_fragments` table
- **Impact**: Unknown fields preserved but not queryable via schema-validated fields

**Detailed Impact Analysis:**

The negative consequences of storing fields in `raw_fragments` instead of schema-validated `observations.fields` include:

**1. Query Limitations & Performance**

- **No JSONB GIN Indexes**: `raw_fragments.fragment_value` is JSONB but lacks the optimized GIN indexes that `observations.fields` has
- Schema-validated fields: `SELECT * FROM observations WHERE (fields->>'amount')::numeric > 1000` - fast with GIN index
- Raw fragments: `SELECT * FROM raw_fragments WHERE fragment_key = 'amount' AND (fragment_value->>'value')::numeric > 1000` - requires full table scan or less efficient index
- **Impact**: Queries on raw_fragments are significantly slower, especially for large datasets

- **Complex Query Syntax**: Querying raw_fragments requires joining multiple tables and filtering by `fragment_key`
- Schema fields: Simple JSONB path queries (`fields->>'field_name'`)
- Raw fragments: Must join `raw_fragments` to `observations` or `entities`, filter by `fragment_key`, then extract from `fragment_value`
- **Impact**: More complex queries, harder to write, less intuitive for users/developers

- **No Type-Safe Queries**: `fragment_value` is generic JSONB, so type casting is required and error-prone
- Schema fields: Type validation ensures `amount` is always numeric
- Raw fragments: Must cast `(fragment_value->>'value')::numeric` with potential for runtime errors if type is wrong
- **Impact**: Runtime type errors, no compile-time safety, requires defensive coding

**2. MCP Action Limitations**

- **Limited MCP Query Support**: MCP actions like `retrieve_entities` and `retrieve_entity_snapshot` primarily query `observations.fields`
- Schema fields: Automatically included in entity snapshots and queries
- Raw fragments: May not be included in standard MCP responses, requiring separate queries
- **Impact**: MCP actions may not expose raw_fragments data, making it inaccessible via standard workflows

- **No Filtering by Raw Fragment Fields**: MCP actions can't filter entities by raw_fragment field values
- Schema fields: `retrieve_entities({ entity_type: "task", filters: { status: "completed" } })`
- Raw fragments: No equivalent filtering capability via MCP
- **Impact**: Cannot query or filter entities based on fields stored in raw_fragments

**3. Frontend/UI Limitations**

- **No Automatic Field Discovery**: Frontend code expects schema-defined fields
- Schema fields: UI components can auto-generate forms/tables from schema definitions
- Raw fragments: Must manually discover and handle each field, no automatic UI generation
- **Impact**: More development work, inconsistent UI, harder to build generic entity viewers

- **No Type-Aware Display**: Raw fragments lack type information for proper formatting
- Schema fields: Dates formatted as dates, numbers as currency, booleans as checkboxes
- Raw fragments: All displayed as generic JSON, requires manual type detection
- **Impact**: Poor user experience, incorrect formatting, harder to read

**4. Aggregation & Analytics Limitations**

- **No Efficient Aggregations**: Can't easily compute statistics on raw_fragment fields
- Schema fields: `SELECT SUM((fields->>'amount')::numeric) FROM observations WHERE entity_type = 'transaction'`
- Raw fragments: Requires complex joins and type casting, much slower
- **Impact**: Analytics queries are slow or impractical, can't build dashboards efficiently

- **No Date Range Queries**: Date fields in raw_fragments can't use date indexes
- Schema fields: `WHERE (fields->>'date')::date BETWEEN '2024-01-01' AND '2024-12-31'` - can use date indexes
- Raw fragments: Must extract and cast dates from JSONB, no index support
- **Impact**: Date-based queries are slow, can't efficiently filter by time ranges

**5. Relationship Building Limitations**

- **Harder to Build Relationships**: Relationship detection relies on schema-validated fields
- Schema fields: System can automatically detect relationships (e.g., `invoice.vendor_id` → `company.id`)
- Raw fragments: Relationship fields may be stored in raw_fragments, making automatic relationship detection impossible
- **Impact**: Manual relationship creation required, graph building is incomplete

- **No Foreign Key Validation**: Can't validate references stored in raw_fragments
- Schema fields: Can validate that `account_id` references a valid account entity
- Raw fragments: No validation, potential for broken references
- **Impact**: Data integrity issues, orphaned relationships

**6. Schema Evolution & Migration**

- **Manual Promotion Required**: Fields in raw_fragments must be manually promoted to schema fields
- Schema fields: Automatically handled by schema system, reducer configs apply
- Raw fragments: Requires schema update, data migration, and re-ingestion
- **Impact**: Significant work to promote fields, may require re-processing all data

- **No Automatic Type Inference**: System can't automatically determine field types from raw_fragments
- Schema fields: Types are defined and validated
- Raw fragments: Types must be manually analyzed and defined
- **Impact**: More work to create schemas, potential for type mismatches

**7. Data Quality & Validation**

- **No Validation Rules**: Raw fragments don't have validation constraints
- Schema fields: Can enforce required fields, value ranges, format validation
- Raw fragments: No validation, accepts any value
- **Impact**: Data quality issues, invalid data can be stored

- **No Default Values**: Can't set defaults for raw_fragment fields
- Schema fields: Can define default values in schema
- Raw fragments: No default mechanism
- **Impact**: Inconsistent data, missing values not handled

**8. Performance at Scale**

- **Storage Overhead**: Each raw_fragment field is a separate row
- Schema fields: All fields in one JSONB object per observation
- Raw fragments: One row per field, significant storage overhead for entities with many unknown fields
- **Impact**: Larger database size, more I/O for queries

- **Query Performance Degradation**: Joining raw_fragments adds overhead
- Schema fields: Single table query
- Raw fragments: Requires joins, especially slow for entities with many unknown fields
- **Impact**: Queries become slower as more fields are in raw_fragments

**Summary**: While `raw_fragments` ensures zero data loss and preserves all fields, it comes with significant operational limitations. Fields stored in raw_fragments are:

- Harder to query (complex joins, no optimized indexes)
- Slower to access (table scans vs indexed lookups)
- Not exposed via standard MCP actions
- Difficult to use in frontend/UI (no type information, manual handling)
- Impractical for analytics/aggregations
- Require manual promotion to become fully queryable

**Recommendation**: For entity types that will be frequently queried, filtered, or used in analytics, creating schemas is strongly recommended. Raw fragments are acceptable for:

- One-off data preservation
- Fields that are rarely accessed
- Temporary storage before schema definition
- Low-priority entity types

#### Gap 4: Entity Type Mapping

- **Issue**: DATA_DIR uses plural directory names (e.g., `transactions/`, `holdings/`)
- **Current**: `scripts/analyze-data-dir-schemas.js` has normalization logic
- **Impact**: Need consistent mapping from directory names to entity types

## Analysis Tasks

### Task 1: Inventory DATA_DIR Contents

**Files to examine:**

- Run `scripts/analyze-data-dir-schemas.js` to get current entity type list
- Check actual parquet file structure (column names, data types)
- Identify file naming patterns and organization

**Questions to answer:**

- What parquet files exist in each entity type directory?
- What columns/fields are in each parquet file?
- Are there any non-parquet files (CSV, JSON) that also need ingestion?

### Task 2: Assess Parquet Reading Capability

**Check:**

- Does the codebase have any parquet reading libraries?
- Can we add parquet support to the MCP store action?
- What's the best approach: convert to JSON first, or add native parquet reading?

**Dependencies:**

- Node.js parquet libraries (e.g., `parquetjs`, `apache-arrow`)
- File size considerations for large parquet files

### Task 3: Evaluate Schema Readiness

**Review:**

- `src/services/schema_definitions.ts` - current schema definitions
- `docs/reports/DATA_DIR_SCHEMA_ALIGNMENT.md` - missing schemas list
- Which missing schemas are high priority vs. can use raw_fragments

**Decision:**

- Can we proceed with storing entities that lack schemas (using raw_fragments)?
- Or do we need to create schemas first for certain entity types?

### Task 4: Design Ingestion Strategy

**Options:**

**Option A: Add Parquet Support to MCP Store**

- Extend `store` action to accept `file_path` pointing to parquet files
- Read parquet file, convert rows to entity objects
- Process via structured entities path
- Pros: Direct MCP usage, no intermediate conversion
- Cons: Requires parquet library, larger MCP action

**Option B: Pre-convert Parquet to JSON**

- Create script to convert parquet → JSON
- Use existing structured entities path
- Pros: Simpler, reuses existing code
- Cons: Extra conversion step, storage overhead

**Option C: Batch Store Action**

- New MCP action `store_batch` for bulk ingestion
- Accepts array of file paths or entity arrays
- Pros: Efficient for large datasets
- Cons: New action to maintain

### Task 5: Test Readiness Assessment

**Create test plan:**

- Sample parquet files from each entity type
- Test MCP store with converted data
- Verify all fields preserved (schema + raw_fragments)
- Check entity resolution and relationship creation

## Implementation Recommendations

### Phase 1: Immediate Readiness (Can Do Now)

1. ✅ **Structured entities path works** - Can store any entity type via `entities` array
2. ✅ **Unknown fields preserved** - `raw_fragments` handles missing schemas
3. ✅ **File path support** - Can read files from DATA_DIR if converted to JSON/CSV

### Phase 2: Enhanced Readiness (Recommended)

1. **Add parquet reading capability**

- Install parquet library (`parquetjs` or `apache-arrow`)
- Extend `store` action to detect and read parquet files
- Convert parquet rows to entity objects automatically

2. **Create ingestion script**

- Script to iterate DATA_DIR subdirectories
- Read parquet files, convert to entity format
- Call MCP store action for each entity type
- Handle batch processing and error recovery

3. **Schema expansion** (optional)

- Add high-priority missing schemas
- Enables querying via schema fields instead of raw_fragments

### Phase 3: Production Readiness (Future)

1. **Batch processing optimization**

- Bulk insert capabilities
- Progress tracking and resumability
- Error handling and retry logic

2. **Incremental updates**

- Track which files/rows already ingested
- Support delta updates from parquet files

## Key Files to Review

- `src/server.ts` (lines 1706-2013): MCP store action implementation
- `src/services/file_analysis.ts`: File format detection and analysis
- `src/services/schema_definitions.ts`: Entity schema definitions
- `scripts/analyze-data-dir-schemas.js`: DATA_DIR entity type analysis
- `docs/reports/DATA_DIR_SCHEMA_ALIGNMENT.md`: Schema coverage report
- `scripts/ingest_finances_data.ts`: Example ingestion script (CSV-based)

## Success Criteria

The neotoma MCP is ready to store DATA_DIR data when:

1. ✅ Can read parquet files from DATA_DIR (or convert them)
2. ✅ Can process all 73 entity types (with or without schemas)
3. ✅ All fields preserved (schema fields + raw_fragments)
4. ✅ Batch processing handles large files efficiently
5. ✅ Entity resolution works correctly for all types

## Questions to Answer

1. **What's the actual structure of parquet files in DATA_DIR?**

- Column names, data types, row counts
- Any nested structures or complex types?

2. **Are there any entity types that MUST have schemas?**

- Or can all types use raw_fragments initially?

3. **What's the preferred ingestion approach?**

- Direct parquet support in MCP?
- Pre-conversion script?
- Hybrid approach?

4. **Performance requirements?**

- How large are the parquet files?
- How many rows per entity type?
- What's acceptable ingestion time?
