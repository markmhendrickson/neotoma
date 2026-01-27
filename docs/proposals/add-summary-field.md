---
title: "Add Top-Level Summary Field to Records"
status: "proposal"
source_plan: "add-summary-field.plan.md"
migrated_date: "2026-01-22"
priority: "p2"
estimated_effort: "1-2 weeks"
---

# Add Top-Level Summary Field to Records

## Proposal Context

This proposal was migrated from `.cursor/plans/add-summary-field.plan.md` on 2026-01-22.

**Original Status:** pending - no todos defined
**Relevance:** Improves record discoverability and provides concise overviews. Summary generation can leverage existing AI analysis infrastructure.
**Architecture Alignment:** Verified - aligns with existing record structure, minimal schema changes

## Overview

Add `summary` as a top-level database column and TypeScript property. Generate summaries during file uploads (extracting from existing AI analysis) and during record creation/updates (using new AI analysis of record data and associated files).

## Technical Details

### Database Schema Changes

**PostgreSQL (`supabase/schema.sql`):**
- Add `summary TEXT` column to `records` table with migration-safe `DO $$` block
- Column should be nullable to support existing records

**SQLite (`frontend/src/store/schema.ts`):**
- Add `summary TEXT` to `CREATE_RECORDS_TABLE` definition

### Type Updates

**Backend Types:**
- `src/db.ts`: Add `summary?: string | null` to `NeotomaRecord` interface

**Frontend Types:**
- `frontend/src/types/record.ts`: Add `summary?: string | null` to `NeotomaRecord` interface
- `frontend/src/store/types.ts`: Add `summary?: string | null` to `LocalRecord` if it exists

### File Upload Summary Generation

**Modify `src/services/file_analysis.ts`:**
- Update `analyzeFileForRecord()` to return `{ type, properties, summary }` instead of embedding summary in properties
- Extract summary from `properties.summary` if present, otherwise generate fallback
- Update `FileAnalysisResult` interface to include `summary?: string`
- Modify `createRecordFromUploadedFile()` to extract summary and set top-level `summary` field

### Record Creation/Update Summary Generation

**Create `src/services/summary.ts`:**
- New function `generateRecordSummary()` that:
  - Takes record `type`, `properties`, and `file_urls`
  - **Always analyzes associated files**: If `file_urls` exist, downloads all files from Supabase storage and analyzes their contents
  - Uses OpenAI to generate summary from record data (type + properties) + file contents
  - For records with files: combines file analysis (similar to `analyzeFileForRecord`) with record properties
  - For records without files: analyzes type and properties only
  - Returns summary string or null if OpenAI unavailable
  - Handles errors gracefully

### Update Actions

**`src/actions.ts`:**
- `/store_record`: Call `generateRecordSummary()` after generating embedding, set `summary` in `insertData`
- `/store_records`: Generate summaries for all records in parallel
- `/update_record`: Regenerate summary when `type`, `properties`, or `file_urls` change

**`src/server.ts` (MCP):**
- `storeRecord`: Generate summary similar to HTTP endpoint
- `storeRecords`: Generate summaries for all records
- `updateRecord`: Regenerate summary on updates

**`src/services/records.ts`:**
- `upsertExternalRecord()`: Generate summary when creating/updating records
- `upsertExternalRecords()`: Generate summaries for bulk operations

## Implementation Steps

1. Add database schema changes (PostgreSQL and SQLite)
2. Update TypeScript types (backend and frontend)
3. Modify file analysis service to extract/return summary
4. Create summary generation service
5. Update HTTP endpoints and MCP actions
6. Update record services for bulk operations
7. Add tests for summary generation

## Testing Strategy

- Update existing tests to handle new `summary` field
- Add tests for summary generation during file upload
- Add tests for summary generation during record creation/update
- Test summary regeneration on record updates
- Test handling of records with associated files
- Test error handling when OpenAI unavailable

## Implementation Considerations

**What's Already Done:**
- Some summary generation logic exists in `src/services/file_analysis.ts` (generateSummary function)
- Summary may already be stored in properties in some cases

**What's Still Needed:**
- Add top-level `summary` column to database
- Extract summary from properties and move to top-level field
- Create dedicated summary generation service
- Update all record creation/update paths
- Handle file analysis for summary generation

**Potential Conflicts:**
- May need to migrate existing summaries from `properties.summary` to top-level `summary` field
- Summary generation requires `OPENAI_API_KEY` (similar to embeddings)

**Dependencies:**
- OpenAI API access for summary generation
- Supabase storage access for file downloads
- Existing file analysis infrastructure

## References

- Original plan: `.cursor/plans/add-summary-field.plan.md`
- Related docs:
  - `src/services/file_analysis.ts` - Existing file analysis and summary generation
  - `docs/subsystems/schema.md` - Record schema documentation
