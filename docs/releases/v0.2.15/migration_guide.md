# v0.2.15 Migration Guide

**Target Audience:** Developers and AI agents using Neotoma MCP actions

## Overview

v0.2.15 unifies ingestion into a single `ingest()` action and removes deprecated record-based operations. This guide helps you migrate to the new architecture.

## Breaking Changes Summary

### Removed MCP Actions

| Old Action | New Action | Notes |
|------------|------------|-------|
| `submit_payload` | `ingest({entities: [...]})` | Capabilities eliminated, use entity_type |
| `ingest_structured` | `ingest({entities: [...]})` | Merged into unified ingest |
| `update_record` | `ingest()` or `correct()` | New data or corrections |
| `retrieve_records` | `retrieve_entities()` | Entity-based queries |
| `delete_record` | N/A | Observations are immutable |

### Database Changes

- Table renamed: `interpretation_runs` → `interpretations`
- Column renamed: `interpretation_run_id` → `interpretation_id`
- Column renamed: `relationships.source_record_id` → `source_material_id`
- New tables: `source_entity_edges`, `source_event_edges`

## Migration Steps

### Step 1: Update MCP Action Calls

#### Submitting Structured Data

**Before (v0.2.14):**
```typescript
// Using submit_payload
await mcp.call("submit_payload", {
  capability_id: "neotoma:store_invoice:v1",
  body: {
    invoice_number: "INV-001",
    amount: 1500.00,
    vendor_name: "Acme Corp"
  },
  provenance: {
    source_refs: [],
    extracted_at: new Date().toISOString(),
    extractor_version: "v1.0"
  }
});

// Or using ingest_structured
await mcp.call("ingest_structured", {
  user_id: "user-123",
  entities: [{
    entity_type: "invoice",
    invoice_number: "INV-001",
    amount: 1500.00
  }]
});
```

**After (v0.2.15):**
```typescript
// Unified ingest action
await mcp.call("ingest", {
  user_id: "user-123",
  entities: [{
    entity_type: "invoice",
    invoice_number: "INV-001",
    amount: 1500.00,
    vendor_name: "Acme Corp"
  }]
});
```

#### Uploading Files

**Before (v0.2.14):**
```typescript
await mcp.call("ingest", {
  user_id: "user-123",
  file_content: "base64...",
  mime_type: "application/pdf",
  interpret: true
});
```

**After (v0.2.15):**
```typescript
// No change - same API
await mcp.call("ingest", {
  user_id: "user-123",
  file_content: "base64...",
  mime_type: "application/pdf",
  interpret: true
});
```

#### Querying Data

**Before (v0.2.14):**
```typescript
await mcp.call("retrieve_records", {
  type: "invoice",
  limit: 100
});
```

**After (v0.2.15):**
```typescript
await mcp.call("retrieve_entities", {
  entity_type: "invoice",
  limit: 100
});
```

#### Updating Data

**Before (v0.2.14):**
```typescript
await mcp.call("update_record", {
  id: "rec-123",
  properties: {
    status: "paid"
  }
});
```

**After (v0.2.15):**
```typescript
// For corrections (overrides AI extraction)
await mcp.call("correct", {
  user_id: "user-123",
  entity_id: "ent-123",
  entity_type: "invoice",
  field: "status",
  value: "paid"
});

// Or submit new data
await mcp.call("ingest", {
  user_id: "user-123",
  entities: [{
    entity_type: "invoice",
    external_id: "invoice-123",
    status: "paid"
  }]
});
```

### Step 2: Update HTTP API Calls

**Before (v0.2.14):**
```typescript
// Fetch records
const response = await fetch('/retrieve_records', {
  method: 'POST',
  body: JSON.stringify({ limit: 100 })
});
```

**After (v0.2.15):**
```typescript
// Fetch entities
const response = await fetch('/api/entities/query', {
  method: 'POST',
  body: JSON.stringify({ limit: 100 })
});
const data = await response.json();
const entities = data.entities; // Note: response structure changed
```

### Step 3: Update Database Queries

**Before (v0.2.14):**
```sql
SELECT * FROM interpretation_runs WHERE source_id = '...';
```

**After (v0.2.15):**
```sql
SELECT * FROM interpretations WHERE source_id = '...';
```

**Before (v0.2.14):**
```sql
SELECT * FROM observations WHERE interpretation_run_id = '...';
```

**After (v0.2.15):**
```sql
SELECT * FROM observations WHERE interpretation_id = '...';
```

### Step 4: Apply Database Migrations

**Option 1: Using Supabase CLI (Recommended)**
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

**Option 2: Manual Application**
1. Go to Supabase Dashboard → SQL Editor
2. Execute migrations in order:
   - `20260101000001_add_source_graph_edges.sql`
   - `20260101000002_rename_interpretation_runs_to_interpretations.sql`
   - `20260101000003_rename_interpretation_run_id_to_interpretation_id.sql`

## Terminology Changes

Update your code/documentation to use canonical terms:

| Old Term | New Term | Context |
|----------|----------|---------|
| record | source | When referring to raw data |
| record | entity | When referring to resolved objects |
| capability | entity schema | Processing rules |
| interpretation run | interpretation | AI extraction attempt |
| payload | source | Submitted data |

## Error Handling

### Removed Action Errors

If you try to use a removed action:

```typescript
// This will fail
await mcp.call("submit_payload", {...});
// Error: Unknown tool: submit_payload
```

**Fix:** Use `ingest()` instead.

### Migration During Transition

During the transition period (v0.2.15 → v0.2.16):
- Old HTTP endpoints still work but are deprecated
- Database supports both old and new column names
- Frontend updated to use new endpoints

## Testing Your Migration

### 1. Test Structured Ingestion

```typescript
const result = await mcp.call("ingest", {
  user_id: "test-user",
  entities: [{
    entity_type: "note",
    title: "Test Note",
    content: "Testing v0.2.15 migration"
  }]
});

console.assert(result.source_id, "Should return source_id");
console.assert(result.interpretation, "Should return interpretation result");
```

### 2. Test File Ingestion

```typescript
const result = await mcp.call("ingest", {
  user_id: "test-user",
  file_content: Buffer.from("Test content").toString("base64"),
  mime_type: "text/plain",
  interpret: true
});

console.assert(result.source_id, "Should return source_id");
console.assert(result.content_hash, "Should return content_hash");
```

### 3. Test Entity Queries

```typescript
const entities = await mcp.call("retrieve_entities", {
  entity_type: "note",
  limit: 10
});

console.assert(Array.isArray(entities), "Should return array");
```

## Rollback Plan

If you need to rollback to v0.2.14:

1. Revert code changes:
   ```bash
   git checkout v0.2.14
   npm install
   npm run build:server
   ```

2. Database migrations are **forward-only**. Rollback requires:
   - Rename `interpretations` → `interpretation_runs`
   - Rename `interpretation_id` → `interpretation_run_id`
   - Drop `source_entity_edges`, `source_event_edges` tables

**Note:** Rollback is not recommended. Test thoroughly in development first.

## Common Issues

### Issue: "Unknown tool: submit_payload"

**Cause:** Using deprecated action.  
**Fix:** Replace with `ingest({entities: [...]})`

### Issue: "Table 'interpretation_runs' does not exist"

**Cause:** Migrations not applied.  
**Fix:** Run `npm run migrate` or apply migrations manually.

### Issue: "Column 'interpretation_run_id' does not exist"

**Cause:** Column rename migration not applied.  
**Fix:** Apply migration `20260101000003_rename_interpretation_run_id_to_interpretation_id.sql`

## Support

For issues or questions:
1. Check [Release Plan](./release_plan.md) for detailed context
2. Review [Canonical Vocabulary](../../vocabulary/canonical_terms.md) for terminology
3. See [Implementation Summary](./implementation_summary.md) for technical details

## Checklist

Before considering migration complete:

- [ ] All MCP calls updated to use `ingest()` instead of deprecated actions
- [ ] Database migrations applied successfully
- [ ] Frontend updated to use new API endpoints
- [ ] Tests passing
- [ ] Documentation updated with new terminology
- [ ] No references to deprecated actions in codebase
- [ ] Monitoring confirms new actions working correctly

## Timeline

- **v0.2.15 (Current):** Deprecated actions removed, new APIs available
- **v0.2.16 (Next):** Legacy HTTP endpoints removed
- **v0.3.0 (Future):** Legacy `records` table removed

Plan your migration accordingly to avoid disruption.


