# Manual Migration Application for v0.2.15

**Issue:** Supabase CLI installation via npm is not supported.

## Option 1: Supabase Dashboard (Recommended)

### Step-by-Step Process

1. **Navigate to Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project
   - Click "SQL Editor" in the left sidebar

2. **Apply Migrations in Order**

#### Migration 1: Add Source Graph Edges

Copy the entire contents of:
```
supabase/migrations/20260101000001_add_source_graph_edges.sql
```

Paste into SQL Editor and click "Run".

**Expected Output:**
- Creates `source_entity_edges` table
- Creates `source_event_edges` table
- Adds `source_id` column to `timeline_events`
- Makes `source_record_id` nullable in `timeline_events`
- Renames column in `relationships` table

#### Migration 2: Rename Interpretation Runs Table

Copy the entire contents of:
```
supabase/migrations/20260101000002_rename_interpretation_runs_to_interpretations.sql
```

Paste into SQL Editor and click "Run".

**Expected Output:**
- Renames `interpretation_runs` → `interpretations`
- Updates indexes
- Updates RLS policies

#### Migration 3: Rename Interpretation ID Columns

Copy the entire contents of:
```
supabase/migrations/20260101000003_rename_interpretation_run_id_to_interpretation_id.sql
```

Paste into SQL Editor and click "Run".

**Expected Output:**
- Renames `interpretation_run_id` → `interpretation_id` in `observations`
- Renames `interpretation_run_id` → `interpretation_id` in `raw_fragments`
- Updates indexes

### Verification Queries

After applying all migrations, run these verification queries:

```sql
-- 1. Check interpretations table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'interpretations'
) as interpretations_exists;

-- 2. Check old table is gone
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'interpretation_runs'
) as old_table_exists; -- Should be FALSE

-- 3. Check column renamed in observations
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'observations' 
  AND column_name IN ('interpretation_id', 'interpretation_run_id');
-- Should return: interpretation_id

-- 4. Check new graph tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('source_entity_edges', 'source_event_edges');
-- Should return both tables

-- 5. Check relationships column renamed
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'relationships' 
  AND column_name IN ('source_material_id', 'source_record_id');
-- May return both during transition

-- 6. Test table access (should not error)
SELECT COUNT(*) FROM interpretations;
SELECT COUNT(*) FROM source_entity_edges;
SELECT COUNT(*) FROM source_event_edges;
```

**Expected Results:**
- `interpretations_exists` = `true` ✅
- `old_table_exists` = `false` ✅
- Only `interpretation_id` exists in observations ✅
- Both new graph tables exist ✅
- All test queries return without errors ✅

## Option 2: Install Supabase CLI (Homebrew on macOS)

```bash
# Install via Homebrew
brew install supabase/tap/supabase

# Verify installation
supabase --version

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

## Option 3: Install Supabase CLI (Other Methods)

**Linux/macOS:**
```bash
# Using Homebrew
brew install supabase/tap/supabase

# Using Scoop (Windows)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**See:** https://github.com/supabase/cli#install-the-cli

## Troubleshooting

### Error: "relation 'interpretation_runs' does not exist"

**Cause:** Migration 2 already applied or table never existed.  
**Fix:** This is expected if the table was already renamed. Verify with:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('interpretations', 'interpretation_runs');
```

### Error: "column 'interpretation_run_id' does not exist"

**Cause:** Migration 3 already applied.  
**Fix:** This is expected. Verify column exists:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'observations' 
  AND column_name = 'interpretation_id';
```

### Error: "permission denied"

**Cause:** Insufficient database permissions.  
**Fix:** Ensure you're using an admin account or service role key.

### Error: "constraint already exists"

**Cause:** Migration partially applied.  
**Fix:** Migrations are idempotent (safe to re-run). The `IF NOT EXISTS` clauses prevent errors.

## Post-Migration Validation

After applying all migrations, verify the system works:

### Test 1: Check Tables

```sql
SELECT 
  'interpretations' as table_name,
  COUNT(*) as row_count 
FROM interpretations
UNION ALL
SELECT 
  'source_entity_edges',
  COUNT(*) 
FROM source_entity_edges
UNION ALL
SELECT 
  'source_event_edges',
  COUNT(*) 
FROM source_event_edges;
```

### Test 2: Check Columns

```sql
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('observations', 'raw_fragments', 'relationships')
  AND column_name IN ('interpretation_id', 'source_material_id', 'source_id')
ORDER BY table_name, column_name;
```

### Test 3: Test Application

```bash
# Start backend
npm run dev:server

# In another terminal, test endpoint
curl -X POST http://localhost:8080/api/entities/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"limit": 10}'
```

## Rollback (If Needed)

If you need to rollback migrations:

```sql
-- Rollback Migration 3
ALTER TABLE observations RENAME COLUMN interpretation_id TO interpretation_run_id;
ALTER TABLE raw_fragments RENAME COLUMN interpretation_id TO interpretation_run_id;

-- Rollback Migration 2
ALTER TABLE interpretations RENAME TO interpretation_runs;

-- Rollback Migration 1
DROP TABLE IF EXISTS source_entity_edges;
DROP TABLE IF EXISTS source_event_edges;
ALTER TABLE timeline_events DROP COLUMN IF EXISTS source_id;
ALTER TABLE relationships RENAME COLUMN source_material_id TO source_record_id;
```

**Warning:** Rollback should only be done in emergency. Test thoroughly in development first.

## Support

- [Migration Guide](./migration_guide.md) - Full migration instructions
- [Deployment Checklist](./deployment_checklist.md) - Deployment steps
- [Release Plan](./release_plan.md) - Complete architectural context

## Quick Reference

**Migration Files:**
1. `supabase/migrations/20260101000001_add_source_graph_edges.sql`
2. `supabase/migrations/20260101000002_rename_interpretation_runs_to_interpretations.sql`
3. `supabase/migrations/20260101000003_rename_interpretation_run_id_to_interpretation_id.sql`

**Apply via Dashboard:**
- Copy file contents → Supabase SQL Editor → Run
- Repeat for each migration in order
- Verify with test queries
- Test application endpoints

---

**Status:** Migrations ready for manual application via Supabase Dashboard.


