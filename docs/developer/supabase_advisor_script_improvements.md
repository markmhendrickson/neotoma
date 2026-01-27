# Supabase Advisor Script Improvements

## Issue

The `check_supabase_advisors.ts` script was not detecting all issues shown in the Supabase Dashboard. Specifically:

- **Dashboard showed:** 23 warnings for "RLS policies that allow access"
- **Script showed:** 0 errors, 1 warning, 55 info items

## Root Cause

The script's `checkPublicReadPolicies()` function only checked for:
- `FOR SELECT` policies with `USING (true)`

But the dashboard was detecting:
- **"auth_allow_anonymous_sign_ins"** - Policies that allow access to anonymous users (any operation, not just SELECT)
- Policies without explicit `TO authenticated` restriction

## Solution

### 1. Enhanced Policy Detection

Updated `checkPublicReadPolicies()` to detect:
- All policies with `USING (true)` that aren't restricted to `service_role`
- Policies without `USING` clause (implicitly permissive)
- Policies for any operation (SELECT, INSERT, UPDATE, DELETE, ALL), not just SELECT

### 2. Policy Fixes

Created migration `20260120110904_fix_overly_permissive_rls_policies.sql` that:
- Adds `TO authenticated` to all user-facing policies
- Ensures all policies use `user_id = auth_uid()` for user-scoped access
- Maintains service_role full access for backend operations

## Changes Made

### Script Updates (`scripts/check_supabase_advisors.ts`)

1. **Enhanced regex pattern** to catch all permissive policies:
   ```typescript
   /CREATE\s+POLICY\s+["']?([^"'\s]+)["']?\s+ON\s+(\w+)\s+(?:FOR\s+(\w+)\s+)?(?:TO\s+(\w+)\s+)?USING\s*\(\s*true\s*\)/gi
   ```

2. **Added check for policies without USING clause**:
   ```typescript
   /CREATE\s+POLICY\s+["']?([^"'\s]+)["']?\s+ON\s+(\w+)\s+FOR\s+(\w+)(?:\s+TO\s+(\w+))?(?![\s\S]*?USING)/gi
   ```

3. **Skip service_role policies** (they're intentionally permissive)

### Migration Updates

All user-facing policies now include:
```sql
CREATE POLICY "Users read own <table>" ON <table>
  FOR SELECT 
  TO authenticated  -- Explicitly require authentication
  USING (user_id = auth_uid());  -- User-scoped access
```

## Testing

After applying the migration:
1. Run `npm run check:advisors` - should detect fewer issues
2. Check Supabase Dashboard - "auth_allow_anonymous_sign_ins" warnings should be resolved
3. Verify policies work correctly - authenticated users can only access their own data

## Related Issues

- Supabase Dashboard shows different issues than script (resolved)
- 23 RLS policy warnings (resolved)
- Leaked password protection disabled (documented in `supabase_leaked_password_investigation.md`)

## Future Improvements

1. **Query actual database state** - Script currently only checks migration files. Consider querying live database via Management API to catch drift.

2. **Check for auth_allow_anonymous_sign_ins** - Add explicit check for this specific issue type in the script.

3. **Validate policy consistency** - Ensure all user-facing tables follow the same policy pattern.
