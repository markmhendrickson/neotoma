# Add Top-Level Summary Field to Records

## Overview

Add `summary` as a top-level database column and TypeScript property. Generate summaries during file uploads (extracting from existing AI analysis) and during record creation/updates (using new AI analysis of record data and associated files).

## Database Schema Changes

### PostgreSQL (`supabase/schema.sql`)

- Add `summary TEXT` column to `records` table with migration-safe `DO $$` block
- Column should be nullable to support existing records

### SQLite (`frontend/src/store/schema.ts`)

- Add `summary TEXT` to `CREATE_RECORDS_TABLE` definition

## Type Updates

### Backend Types

- `src/db.ts`: Add `summary?: string | null` to `NeotomaRecord` interface

### Frontend Types

- `frontend/src/types/record.ts`: Add `summary?: string | null` to `NeotomaRecord` interface
- `frontend/src/store/types.ts`: Add `summary?: string | null` to `LocalRecord` if it exists

## File Upload Summary Generation

### Modify `src/services/file_analysis.ts`

- Update `analyzeFileForRecord()` to return `{ type, properties, summary }` instead of embedding summary in properties
- Extract summary from `properties.summary` if present, otherwise generate fallback
- Update `FileAnalysisResult` interface to include `summary?: string`
- Modify `createRecordFromUploadedFile()` to:
- Extract summary from analysis result (from properties or separate field)
- Remove summary from `finalProperties` before inserting
- Set top-level `summary` in `insertPayload`

## Record Creation/Update Summary Generation

### Create `src/services/summary.ts`

- New function `generateRecordSummary()` that:
- Takes record `type`, `properties`, and `file_urls`
- **Always analyzes associated files**: If `file_urls` exist, downloads all files from Supabase storage and analyzes their contents
- Uses OpenAI to generate summary from record data (type + properties) + file contents
- For records with files: combines file analysis (similar to `analyzeFileForRecord`) with record properties
- For records without files: analyzes type and properties only
- Returns summary string or null if OpenAI unavailable
- Function should handle errors gracefully and return null on failure
- Reuse file analysis logic from `file_analysis.ts` where possible (extractPreview, etc.)

### Update `src/actions.ts`

- `/store_record`: Call `generateRecordSummary()` with `type`, `properties`, and `file_urls` after generating embedding, set `summary` in `insertData`
- `/store_records`: Generate summaries for all records in parallel (with their respective `file_urls`), include in `insertData`
- `/update_record`: 
- Fetch existing record's `file_urls` if not provided in update
- Regenerate summary when `type`, `properties`, or `file_urls` change (similar to embedding logic)
- Set `summary` in `updateData`

### Update `src/server.ts` (MCP)

- `storeRecord`: Generate summary similar to HTTP endpoint
- `storeRecords`: Generate summaries for all records
- `updateRecord`: Regenerate summary on updates

### Update `src/services/records.ts`

- `upsertExternalRecord()`: Generate summary when creating/updating records, passing `file_urls` to summary function
- `upsertExternalRecords()`: Generate summaries for bulk operations, each with their respective `file_urls`

## File Analysis for Summary Generation

### In `src/services/summary.ts`

- Function to download files from Supabase storage using `file_urls` array
- For each file in `file_urls`:
- Download file buffer from Supabase storage bucket
- Extract text preview (reuse `extractPreview` logic from `file_analysis.ts`)
- Collect file metadata (name, size, mime type) from path or storage metadata
- Combine all file contents and metadata into AI prompt
- Include record `type` and `properties` in the same analysis
- Handle binary files gracefully (PDFs, images) - extract what's possible, use filename/metadata as fallback
- If multiple files exist, analyze all of them together in a single summary generation call

## Testing Considerations

- Update existing tests to handle new `summary` field
- Add tests for summary generation during file upload
- Add tests for summary generation during record creation/update
- Test summary regeneration on record updates
- Test handling of records with associated files

## Migration Notes

- Existing records will have `summary = null` initially
- Summary generation requires `OPENAI_API_KEY` (similar to embeddings)