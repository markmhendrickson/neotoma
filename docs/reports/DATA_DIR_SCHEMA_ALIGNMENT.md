# DATA_DIR Schema Alignment Report

**Date:** 2025-01-27  
**Purpose:** Align `src/services/schema_definitions.ts` with entity types found in `$DATA_DIR`

## Summary

The `schema_definitions.ts` file should represent all entity types found in `$DATA_DIR` to ensure default schemas are available for all data types being stored.

## Current Status

- **Entity types in schema_definitions.ts:** 32
- **Entity types in DATA_DIR:** 73 directories
- **Matching types:** 30
- **Missing schemas:** 39
- **Extra schemas:** 2 (may be intentional)

**Last Updated:** 2025-01-27 - Added 14 high-priority schemas (address, company, person, location, relationship, task, project, goal, email, message, note, event, exercise, meal)

## Matching Types ✅

These entity types exist in both DATA_DIR and schema_definitions.ts:
- account
- address ⭐ (added)
- company ⭐ (added)
- contact
- contract
- crypto_transaction
- email ⭐ (added)
- event ⭐ (added)
- exercise ⭐ (added)
- fixed_cost
- flow
- goal ⭐ (added)
- holding
- income
- liability
- location ⭐ (added)
- meal ⭐ (added)
- message ⭐ (added)
- note ⭐ (added)
- order
- person ⭐ (added)
- project ⭐ (added)
- property
- relationship ⭐ (added)
- task ⭐ (added)
- tax_event
- tax_filing
- transaction
- transfer
- wallet

⭐ = Added in high-priority schema addition (2025-01-27)

## Missing Schemas ⚠️

These entity types exist in DATA_DIR but have no schema definition:

### Core Entity Types (High Priority)
✅ **COMPLETED** - All high-priority core types have been added

### Task/Project Management
✅ **COMPLETED** - task, project, goal have been added
- **outcome** - Outcomes/results
- **task_attachment** - Task attachments
- **task_comment** - Task comments
- **task_custom_field** - Task custom fields
- **task_dependency** - Task dependencies
- **task_story** - Task stories

### Communication
✅ **COMPLETED** - email, message, note have been added

### Health & Lifestyle
✅ **COMPLETED** - exercise, meal have been added
- **workout** - Workout sessions (lower priority)
- **food** - Food items
- **emotion** - Emotional states

### Events & Activities
✅ **COMPLETED** - event has been added
- **recurring_event** - Recurring events (lower priority)
- **movie** - Movies watched
- **read** - Reading materials

### Financial (Additional)
- **account_identifier** - Account identifiers
- **asset_type** - Asset type classifications
- **asset_value** - Asset values
- **bank_certificate** - Bank certificates
- **investment** - Investments
- **payroll_document** - Payroll documents

### Other
- **argument** - Arguments/beliefs
- **belief** - Beliefs
- **daily_triage** - Daily triage items
- **dispute** - Disputes
- **domain** - Domains
- **email_workflow** - Email workflows
- **embedding** - Embeddings
- **env_var_mapping** - Environment variable mappings
- **equity_unit** - Equity units
- **financial_strategy** - Financial strategies
- **log** - Logs
- **mcp_server_integration** - MCP server integrations
- **property_equipment** - Property equipment
- **related_material** - Related materials
- **schema** - Schema definitions
- **set** - Sets
- **transcription** - Transcriptions
- **usage** - Usage data
- **user_account** - User accounts

## Recommendations

### Option 1: Add All Missing Schemas (Comprehensive)
Create schema definitions for all 53 missing entity types. This ensures complete coverage but requires significant work.

### Option 2: Add High-Priority Schemas Only (Selective)
Focus on core entity types that are most commonly used:
- address, company, person, location, relationship
- task, project, goal
- email, message, note
- event, exercise, meal

### Option 3: Generate Schemas from DATA_DIR (Automated)
Create a script that:
1. Reads parquet files from DATA_DIR
2. Infers schema from actual data
3. Generates basic schema definitions
4. Allows manual refinement

## Implementation Plan

1. **Create schema generation script** - Automatically generate basic schemas from DATA_DIR parquet files
2. **Review and refine** - Manually review generated schemas for accuracy
3. **Add to schema_definitions.ts** - Integrate new schemas
4. **Test** - Verify schemas work with actual data

## Scripts

- `scripts/analyze-data-dir-schemas.js` - Compare DATA_DIR vs schema_definitions.ts
- `scripts/generate-schemas-from-data-dir.js` - (To be created) Generate schemas from parquet files

## Next Steps

1. Run analysis: `node scripts/analyze-data-dir-schemas.js`
2. Review missing schemas list
3. Prioritize which schemas to add
4. Generate or manually create schema definitions
5. Add to `src/services/schema_definitions.ts`
