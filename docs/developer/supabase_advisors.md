# Supabase Security & Performance Advisors
## Overview
The Supabase Security and Performance Advisors detect common security and performance issues in your database schema. This document describes how to automatically catch and resolve these issues.
## Automated Checks
### Pre-commit Hook
The pre-commit hook automatically checks for advisor issues when you commit changes:
```bash
npm run check:advisors
```
This runs checks on migration files and reports:
- **Errors**: Critical issues that must be fixed (e.g., RLS disabled with policies)
- **Warnings**: Issues that should be addressed (e.g., function search_path, extensions in public)
- **Info**: Informational suggestions
### Manual Checks
Check for issues:
```bash
npm run check:advisors
```
Generate a migration to fix issues:
```bash
npm run check:advisors:fix
```
## Common Issues and Fixes
### 1. RLS Not Enabled on Table
**Issue**: Table was created but RLS is not enabled. **ALL tables must have RLS enabled for security**, even if no policies exist yet.

**Fix**:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
-- Then add appropriate RLS policies
CREATE POLICY "Service role full access" ON table_name
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Add user-specific policies as needed
```

**Prevention**: 
1. **Always enable RLS immediately after creating a table** (before creating policies)
2. **Use the migration template** (`supabase/migrations/_template_new_table.sql`) which includes RLS by default
3. **Follow the standard pattern**:
```sql
CREATE TABLE IF NOT EXISTS my_table (...);

-- Enable RLS FIRST
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- Then create policies
CREATE POLICY "Service role full access" ON my_table
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own records" ON my_table
  FOR SELECT USING (user_id = auth.uid());
```

### 2. RLS Disabled with Policies
**Issue**: Table has RLS policies but RLS is not enabled (legacy issue).
**Fix**:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```
**Prevention**: Always enable RLS when creating policies (see above).
### 3. Function Search Path Mutable
**Issue**: Function doesn't set `search_path`, making it vulnerable to search_path injection.
**Fix**:
```sql
CREATE OR REPLACE FUNCTION function_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- function body
END;
$$;
```
**Prevention**: Always include `SET search_path` in function definitions.
### 4. Extension in Public Schema
**Issue**: Extension installed in `public` schema instead of dedicated schema.
**Fix**:
```sql
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO public;
CREATE EXTENSION extension_name SCHEMA extensions;
```
**Prevention**: Install extensions in `extensions` schema by default.
### 5. Overly Permissive RLS Policies
**Issue**: Policy uses `USING (true)` allowing public access.
**Fix**:
```sql
DROP POLICY IF EXISTS "policy_name" ON table_name;
CREATE POLICY "policy_name" ON table_name
  FOR SELECT USING (auth.role() = 'authenticated');
```
**Prevention**: Always require authentication or specific user checks in policies.
## CI/CD Integration
### GitHub Actions Example
```yaml
name: Check Supabase Advisors
on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'supabase/schema.sql'
jobs:
  check-advisors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run check:advisors
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```
## Manual Review
While automated checks catch most issues, you should also:
1. **Review Supabase Dashboard**: Check the Security Advisor in Supabase Studio regularly
2. **Before Production Deploys**: Run `npm run check:advisors` and fix all errors
3. **After Schema Changes**: Verify no new issues were introduced
## Migration Best Practices
When creating migrations, follow these patterns:

**⚠️ IMPORTANT: Use the migration template** (`supabase/migrations/_template_new_table.sql`) which includes RLS by default.

### Tables with RLS (REQUIRED FOR ALL TABLES)
```sql
CREATE TABLE IF NOT EXISTS my_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  -- columns
);

-- ⚠️ REQUIRED: Enable RLS immediately after table creation
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Service role access" ON my_table
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own records" ON my_table
  FOR SELECT USING (user_id = auth.uid());
```

**Key Points:**
- **RLS is mandatory** for all tables, not optional
- Enable RLS **immediately after** `CREATE TABLE`, before creating policies
- The pre-commit hook will **block commits** if RLS is missing
- CI will **fail** if RLS is not enabled on any table
### Functions
```sql
CREATE OR REPLACE FUNCTION my_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- function body
END;
$$;
```
### Extensions
```sql
-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO public;
-- Install extensions in extensions schema
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
```
## Troubleshooting
### Check script fails but Supabase Dashboard shows no issues
The check script analyzes migration files, while the dashboard checks the actual database. If migrations haven't been applied, there may be a mismatch. Apply migrations first:
```bash
npm run migrate
```
### False positives
Some warnings may be acceptable (e.g., keeping `pgcrypto` in public schema). You can:
1. Fix them anyway for consistency
2. Document why they're acceptable
3. Suppress specific checks in the script (not recommended)
