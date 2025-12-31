# Database Migrations

This directory contains numbered SQL migration files for the Supabase database.

## Migration Naming Convention

Migrations MUST follow this naming pattern:

```
YYYYMMDDHHMMSS_description.sql
```

Example: `20251231120000_add_users_table.sql`

## Creating Migrations

### 1. Generate Migration File

Create a new migration file with the next timestamp:

```bash
# Get the current timestamp
date +"%Y%m%d%H%M%S"

# Create migration file
touch supabase/migrations/$(date +"%Y%m%d%H%M%S")_your_description.sql
```

### 2. Write Migration SQL

Each migration file should:
- Be idempotent (use `IF NOT EXISTS`, `IF EXISTS` checks)
- Handle both fresh deployments and upgrades
- Include all related changes (table + indexes + policies) together

Example migration structure:

```sql
-- Migration: Add users table
-- Created: 2025-12-31
-- Description: Creates users table with RLS policies

-- Extensions (if needed)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON users;
CREATE POLICY "service_role_full_access" ON users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### 3. Validate Migration

Before committing, run the pre-release checklist:

```bash
# Check migration syntax
npm run migrate:dry-run

# Apply migrations
npm run migrate

# Check for issues
npm run check:advisors
```

## Running Migrations

### Development

```bash
npm run migrate
```

### Production

Migrations are applied via Supabase CLI:

```bash
npx supabase db push
```

## Migration Checklist

When adding a migration, ensure:

- [ ] Migration filename follows `YYYYMMDDHHMMSS_description.sql` format
- [ ] Migration is idempotent (can be run multiple times safely)
- [ ] All `CREATE TABLE` statements use `IF NOT EXISTS`
- [ ] All `CREATE INDEX` statements use `IF NOT EXISTS`
- [ ] All `DROP POLICY` statements use `IF EXISTS`
- [ ] RLS is enabled on user-facing tables
- [ ] RLS policies are created for service_role
- [ ] Foreign keys reference existing tables
- [ ] Extensions are created before use
- [ ] Extension schema is correct (e.g., `vector` in `extensions` schema)
- [ ] Migration adds corresponding entries to `schema.sql` if it's a fresh deployment

## Schema.sql vs Migrations

**Important**: Changes should be made in BOTH places:

1. **`schema.sql`**: Reference schema for fresh deployments
2. **`migrations/*.sql`**: Incremental changes for existing deployments

### Keeping Them in Sync

After adding a migration:

1. **Update `schema.sql`** with the same changes
2. **Verify consistency**:
   ```bash
   # All tables in schema.sql should have migrations
   grep "^CREATE TABLE" supabase/schema.sql
   grep "^CREATE TABLE" supabase/migrations/*.sql
   ```

## Common Issues

### 1. Type "vector" does not exist

**Problem**: Vector extension not in search path

**Solution**: Set search path or reference extension schema:

```sql
-- Option 1: Set search path in DO block
DO $$
BEGIN
  SET LOCAL search_path = public, extensions;
  ALTER TABLE records ADD COLUMN embedding vector(1536);
END $$;

-- Option 2: Create extension in public schema (not recommended)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
```

### 2. Table not found after migration

**Problem**: Table in `schema.sql` but not in migrations

**Solution**: Create migration for the table (see "Creating Migrations" above)

### 3. RLS enabled but no policies

**Problem**: Table has RLS enabled but migration didn't create policies

**Solution**: Add policies in the same migration:

```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_access" ON my_table;
CREATE POLICY "service_role_access" ON my_table
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### 4. Migration fails with "already exists"

**Problem**: Migration not idempotent

**Solution**: Use `IF NOT EXISTS` / `IF EXISTS`:

```sql
CREATE TABLE IF NOT EXISTS ...
CREATE INDEX IF NOT EXISTS ...
DROP POLICY IF EXISTS ...
ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...  -- PostgreSQL 9.6+
```

## Testing Migrations

### Test in Clean Environment

1. **Create test database** (Supabase project or local)
2. **Run all migrations** from scratch
3. **Verify schema advisor** passes:
   ```bash
   npm run check:advisors
   ```
4. **Test application startup**:
   ```bash
   npm run dev
   ```

### Test Idempotency

Run migrations twice to ensure they're idempotent:

```bash
npm run migrate
npm run migrate  # Should succeed without errors
```

## Pre-Release Validation

Before marking a release as `ready_for_deployment`:

1. **Run pre-release checklist**: `docs/developer/pre_release_checklist.md`
2. **Verify all schema.sql tables have migrations**
3. **Test migrations in clean environment**
4. **Run schema advisor checks**
5. **Verify MCP server starts successfully**

See `docs/developer/pre_release_checklist.md` for complete validation steps.

## References

- **Supabase Migrations**: https://supabase.com/docs/guides/cli/local-development#database-migrations
- **PostgreSQL IF NOT EXISTS**: https://www.postgresql.org/docs/current/sql-createtable.html
- **Pre-release Checklist**: `docs/developer/pre_release_checklist.md`
- **Schema Advisor**: `scripts/check_supabase_advisors.ts`

