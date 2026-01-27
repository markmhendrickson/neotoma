# Supabase Anonymous Access Investigation

## Issue

Management API reports 22 tables with "auth_allow_anonymous_sign_ins" warnings, even after migrations that add `TO authenticated` to policies.

## Root Cause Analysis

### Understanding Supabase Roles

1. **`anon` role**: Unauthenticated requests (no JWT)
2. **`authenticated` role**: Authenticated requests (valid JWT)
   - **Includes anonymous sign-in users** if anonymous sign-in is enabled
   - Anonymous sign-in users have `authenticated` role with `is_anonymous: true` in JWT

### Why `TO authenticated` Might Not Be Enough

If **anonymous sign-in is enabled** in Supabase Auth:
- Anonymous users sign in and get a JWT
- They have the `authenticated` role
- Policies with `TO authenticated` will match anonymous users
- Management API detects this as "allowing anonymous access"

### The Detection Logic

The Management API warning "auth_allow_anonymous_sign_ins" likely means:
- Policies are enforced on roles that include anonymous users
- Even with `TO authenticated`, if anonymous sign-in is enabled, anonymous users can access

## Solutions

### Option 1: Disable Anonymous Sign-In (Recommended for Neotoma)

Neotoma is privacy-first and requires explicit user authentication. Anonymous sign-in should be disabled.

**Steps:**
1. Go to Supabase Dashboard → Authentication → Settings
2. Disable "Enable anonymous sign-ins"
3. This ensures only authenticated, non-anonymous users can access data

### Option 2: Explicitly Block Anonymous Users in Policies

If anonymous sign-in must be enabled, update policies to check `is_anonymous`:

```sql
CREATE POLICY "Users read own entities" ON entities
  FOR SELECT 
  TO authenticated
  USING (
    user_id = auth_uid() 
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );
```

**Note:** This is more complex and requires updating all policies.

### Option 3: Verify Current Policy State

The policies might not actually have `TO authenticated` in the database. Verify:

```sql
SELECT 
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('entities', 'observations', 'records')
ORDER BY tablename, policyname;
```

**Expected:** All user-facing policies should have `roles = '{authenticated}'`

## Recommended Action

1. **Check if anonymous sign-in is enabled** in Supabase Dashboard
2. **If enabled, disable it** (aligns with Neotoma's privacy-first architecture)
3. **If disabled, verify policies** actually have `TO authenticated` in the database
4. **Re-run advisor check** after changes

## Verification

After disabling anonymous sign-in or updating policies:

1. Run `npm run check:advisors` - should show fewer warnings
2. Check Supabase Dashboard → Database → Advisors
3. Verify "auth_allow_anonymous_sign_ins" warnings are resolved

## Related Documentation

- [Supabase Anonymous Sign-In](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase RLS Policies](https://supabase.com/docs/guides/database/postgres/row-level-security)
- `docs/developer/supabase_rls_fixes_summary.md` - Previous RLS fixes
