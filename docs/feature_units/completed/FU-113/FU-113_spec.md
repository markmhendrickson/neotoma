# FU-113: Entity Extensions

## Overview

**Feature Unit ID:** FU-113  
**Name:** Entity Extensions  
**Priority:** P0  
**Status:** Completed  
**Release:** v0.2.0

## Description

Extends the `entities` table with user isolation and entity merge tracking capabilities:

1. **user_id** - Owner user ID for RLS (Row-Level Security) isolation
2. **merged_to_entity_id** - ID of entity this was merged into (NULL if not merged)
3. **merged_at** - Timestamp when entity was merged
4. **RLS Policies** - User-scoped access control policies

## Dependencies

None - This is a foundational migration.

## Deliverables

### 1. Database Migration

**File:** `supabase/migrations/20251219000000_fu113_entity_extensions.sql`

The migration adds:
- `user_id UUID` column for user isolation
- `merged_to_entity_id TEXT` column for merge tracking (self-referencing FK)
- `merged_at TIMESTAMPTZ` column for merge timestamp
- Indexes for efficient queries:
  - `idx_entities_user_id` - User-scoped queries
  - `idx_entities_merged_to` - Merge tracking queries
  - `idx_entities_user_type` - User + type combination queries
  - `idx_entities_user_not_merged` - Exclude merged entities
- RLS policies for user isolation:
  - Service role full access
  - Authenticated users can CRUD own entities
  - Anonymous users can only read entities without user_id

### 2. Schema Update

**File:** `supabase/schema.sql`

Updated entities table definition to include:
- New columns (user_id, merged_to_entity_id, merged_at)
- Self-referencing foreign key constraint
- New indexes
- Updated RLS policies

## Technical Specifications

### Entity Table Schema (Extended)

```sql
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]',
  user_id UUID,                           -- FU-113: Owner user ID for RLS isolation
  merged_to_entity_id TEXT,               -- FU-113: ID of entity this was merged into
  merged_at TIMESTAMPTZ,                  -- FU-113: Timestamp when entity was merged
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| Service role full access | service_role | ALL | Always allowed |
| Users can read own entities | authenticated | SELECT | user_id = auth.uid() OR user_id IS NULL |
| Users can insert own entities | authenticated | INSERT | user_id = auth.uid() |
| Users can update own entities | authenticated | UPDATE | user_id = auth.uid() |
| Users can delete own entities | authenticated | DELETE | user_id = auth.uid() |
| public read | anon | SELECT | user_id IS NULL |

## Testing

### Unit Tests
- **Status:** PASS (68 tests passing)
- **Command:** `npm run test`

### Integration Tests
- **Status:** PARTIAL (116 passed, 39 failed)
- **Command:** `npm run test:integration`
- **Notes:** Failures are pre-existing issues related to missing `embedding` column in `records` table, not related to FU-113.

### E2E Tests
- **Status:** Inconclusive
- **Command:** `npm run test:e2e`
- **Notes:** Playwright browsers installed; tests timed out.

## Acceptance Criteria

- [x] Migration file created
- [x] Schema.sql updated
- [x] Indexes created for efficient queries
- [x] RLS policies defined for user isolation
- [x] Self-referencing FK for merge tracking
- [ ] Migration applied to database (requires manual application via Supabase Dashboard)

## Notes

The database migration needs to be applied manually via:
1. Supabase Dashboard → SQL Editor
2. Copy and paste contents of migration file
3. Execute

Or via Supabase CLI:
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## Related Documents

- [Release Plan v0.2.0](../../releases/in_progress/v0.2.0/release_plan.md)
- [Manifest v0.2.0](../../releases/in_progress/v0.2.0/manifest.yaml)
