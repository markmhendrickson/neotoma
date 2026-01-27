# Supabase Current Issues Status

## Summary

**Total Issues:** 81
- **Errors:** 3
- **Warnings:** 1  
- **Info:** 77

## Critical Issues (Errors - 3)

### 1. RLS Disabled with Policies (3 errors)

These tables have policies but RLS is not enabled:

1. **`public.payload_submissions`**
   - Fix: `ALTER TABLE payload_submissions ENABLE ROW LEVEL SECURITY;`
   - Status: Migration includes conditional check, but table may not exist or lacks user_id

2. **`public.record_relationships`**
   - Fix: `ALTER TABLE payload_submissions ENABLE ROW LEVEL SECURITY;`
   - Status: Migration includes conditional check, but table may not exist or lacks user_id

3. **`public.entity_event_edges`**
   - Fix: `ALTER TABLE entity_event_edges ENABLE ROW LEVEL SECURITY;`
   - Status: Migration includes conditional check, but table may not exist or lacks user_id

**Action Required:** Verify if these tables exist and have user_id columns. If they do, ensure RLS is enabled.

## Warnings (1)

### 1. Function Search Path Mutable

**`public.auth_uid`** - Function does not set search_path

**Status:** The function SHOULD have `SET search_path` based on migration `20260115130254_optimize_rls_policies.sql` line 12:
```sql
CREATE OR REPLACE FUNCTION auth_uid() RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$ SELECT auth.uid() $$;
```

**Possible Causes:**
1. Migration didn't apply correctly
2. Function was recreated without search_path
3. Management API cache is stale

**Action Required:** Verify function definition in database and recreate if needed.

## Informational Issues (77)

### 1. auth_allow_anonymous_sign_ins (22 warnings)

**Status:** Migration `20260120110904_fix_overly_permissive_rls_policies.sql` was applied and should have fixed these by adding `TO authenticated` to all policies.

**Possible Causes:**
1. Management API cache delay (wait 2-5 minutes)
2. Policies weren't properly updated in database
3. Conflicting policies from earlier migrations

**Affected Tables:**
- auto_enhancement_queue
- entities
- entity_event_edges
- entity_merges
- entity_snapshots
- field_blacklist
- interpretations
- observations
- payload_submissions
- raw_fragments
- record_relationships
- records
- relationship_observations
- relationship_snapshots
- (and 8 more)

**Action Required:** 
1. Verify policies directly in database using SQL query
2. Check if `TO authenticated` is present in actual policies
3. If missing, may need to manually apply fixes

### 2. auth_rls_initplan (7 info)

Performance optimization - policies calling `auth.uid()` are re-evaluated per row.

**Status:** Should be using `auth_uid()` function which is STABLE and cached.

**Action Required:** Verify policies use `auth_uid()` instead of `auth.uid()`.

### 3. unused_index (39 info)

Indexes that have never been used.

**Status:** Informational - can be reviewed for cleanup but not critical.

**Action Required:** Review and remove unused indexes if safe to do so.

### 4. multiple_permissive_policies (8 info)

Multiple permissive policies on same table/role/action.

**Status:** Performance issue, not security issue.

**Action Required:** Consolidate policies where possible.

### 5. auth_leaked_password_protection (1 info)

Leaked password protection is disabled.

**Status:** Supabase Auth setting, not a code issue.

**Action Required:** Enable in Supabase Dashboard → Authentication → Settings.

### 6. auth_db_connections_absolute (1 info)

Using absolute connection allocation instead of percentage-based.

**Status:** Performance optimization suggestion.

**Action Required:** Consider switching to percentage-based allocation in production.

## Verification Queries

### Check Policy Roles

```sql
SELECT 
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN (
  'entities', 'observations', 'entity_snapshots', 'raw_fragments',
  'entity_merges', 'interpretations', 'relationship_observations',
  'relationship_snapshots', 'schema_recommendations', 'field_blacklist',
  'auto_enhancement_queue', 'source_entity_edges', 'source_event_edges',
  'records'
)
ORDER BY tablename, policyname;
```

**Expected:** All user-facing policies should have `roles = '{authenticated}'`

### Check auth_uid() Function

```sql
SELECT 
  proname,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'auth_uid';
```

**Expected:** Definition should include `SET search_path = public, pg_catalog`

### Check RLS Status

```sql
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('payload_submissions', 'record_relationships', 'entity_event_edges')
ORDER BY tablename;
```

**Expected:** All should have `rls_enabled = true`

## Next Steps

1. **Verify policies in database** - Run SQL queries above to check actual state
2. **Fix auth_uid() function** - Recreate if search_path is missing
3. **Enable RLS on missing tables** - If tables exist, enable RLS
4. **Wait for cache refresh** - Management API may need time to update
5. **Enable leaked password protection** - Dashboard setting
