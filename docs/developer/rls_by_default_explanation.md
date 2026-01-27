# Why RLS Isn't Enabled by Default (And How We Fixed It)

## The Problem

**PostgreSQL/Supabase does NOT enable RLS by default** when creating tables via SQL. This is a common source of security vulnerabilities.

### Why PostgreSQL Doesn't Enable RLS by Default

1. **Historical reasons** - RLS was added in PostgreSQL 9.5 as an optional feature
2. **Backward compatibility** - Existing applications would break if RLS was suddenly enabled
3. **Flexibility** - Not all tables need RLS (e.g., lookup tables, system tables)
4. **Performance** - RLS adds overhead; some use cases don't need it

### Supabase-Specific Behavior

- **Dashboard-created tables:** RLS is automatically enabled
- **SQL-created tables (migrations):** RLS must be enabled manually
- **No database-wide setting:** There's no way to set "enable RLS on all tables by default"

## The Solution: Event Trigger

We've created an **event trigger** that automatically enables RLS on all new tables:

### Migration: `20260120120000_enable_rls_by_default_for_all_tables.sql`

This migration:

1. **Creates a function** (`auto_enable_rls_on_table()`) that:
   - Listens for `CREATE TABLE` events
   - Automatically runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
   - Only affects tables in the `public` schema

2. **Creates an event trigger** that:
   - Fires on `ddl_command_end` when `CREATE TABLE` is executed
   - Automatically enables RLS on the new table

3. **Backfills existing tables** that don't have RLS enabled

### How It Works

```sql
-- When you create a table:
CREATE TABLE my_new_table (...);

-- The event trigger automatically runs:
ALTER TABLE my_new_table ENABLE ROW LEVEL SECURITY;
```

**Result:** RLS is now enabled by default for all new tables.

## Important Notes

### What This Does

✅ **Automatically enables RLS** on all new tables  
✅ **Backfills existing tables** that were missing RLS  
✅ **Prevents security gaps** from forgotten RLS enabling  

### What This Doesn't Do

❌ **Does NOT create policies** - You still need to create RLS policies manually  
❌ **Does NOT fix existing policies** - Only enables RLS, doesn't fix policy issues  
❌ **Does NOT prevent anonymous access** - Policies still need `TO authenticated`  

### Why Policies Still Need to Be Created

RLS being enabled is just the first step. You still need:

1. **Service role policy** - For backend operations
2. **User-scoped policy** - For user data isolation
3. **Proper role restrictions** - `TO authenticated` to prevent anonymous access

## Best Practices

Even with auto-enable, you should still:

1. **Use the migration template** - `supabase/migrations/_template_new_table.sql` includes RLS + policies
2. **Follow the standard pattern** - Enable RLS immediately after CREATE TABLE (now automatic, but good practice)
3. **Create policies immediately** - Don't rely on RLS being enabled without policies
4. **Test user isolation** - Verify policies work correctly

## Verification

After applying the migration, verify it works:

```sql
-- Create a test table
CREATE TABLE test_rls_auto_enable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data TEXT
);

-- Check if RLS is enabled (should be true)
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'test_rls_auto_enable';

-- Clean up
DROP TABLE test_rls_auto_enable;
```

## Related Documentation

- `docs/developer/supabase_advisors.md` - Security advisor checks
- `docs/conventions/code_conventions_rules.mdc` - SQL conventions including RLS
- `supabase/migrations/_template_new_table.sql` - Migration template with RLS
