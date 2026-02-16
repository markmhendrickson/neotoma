# Database Migration Automation Rule

**Reference:** `docs/conventions/code_conventions_rules.md` — SQL migration conventions

## Purpose

Ensures database migrations are automatically applied after creation or modification, preventing schema drift between migration files and the database.

## Scope

This document covers:
- Automatic migration execution after SQL file changes
- Migration validation before application
- Error handling for failed migrations
- Pre-commit migration verification

This document does NOT cover:
- Migration file creation (see `supabase/migrations/_template_new_table.sql`)
- RLS policy requirements (see code conventions)
- Schema design patterns (see architecture docs)

## Trigger Patterns

Agents MUST automatically run migrations when:

- Creating new migration files in `supabase/migrations/`
- Modifying existing migration files
- User requests to "apply migrations" or "run migrations"
- After completing database schema changes
- Before marking schema-related work as complete

## Agent Actions

### Step 1: Validate Migration File

Before applying migration:

1. **Check migration file syntax:**
   ```bash
   # Verify SQL syntax is valid
   psql --dry-run < supabase/migrations/{migration_file}.sql 2>&1 | grep -i error
   ```

2. **Verify RLS is enabled for new tables:**
   ```bash
   # Check if CREATE TABLE includes ALTER TABLE ... ENABLE ROW LEVEL SECURITY
   grep -A 5 "CREATE TABLE" supabase/migrations/{migration_file}.sql | grep "ENABLE ROW LEVEL SECURITY"
   ```

3. **Check for required elements:**
   - Header comment with migration name, date, description
   - CREATE TABLE with `IF NOT EXISTS`
   - ALTER TABLE ... ENABLE ROW LEVEL SECURITY (for new tables)
   - CREATE POLICY statements with `DROP POLICY IF EXISTS`
   - CREATE INDEX with `IF NOT EXISTS`

### Step 2: Apply Migration

After validation passes:

1. **Run migration command:**
   ```bash
   npm run migrate
   ```

2. **Capture output:**
   - Check for errors in migration output
   - Verify all migrations applied successfully
   - Note any warnings

3. **Verify migration state:**
   ```bash
   # Check migration was recorded
   npm run migrate:status
   ```

### Step 3: Handle Errors

If migration fails:

1. **Identify error type:**
   - Syntax error → Fix SQL and retry
   - Constraint violation → Check data compatibility
   - Missing dependency → Add required migrations first
   - RLS not enabled → Add ALTER TABLE statement

2. **Fix and retry:**
   - Update migration file to fix error
   - Re-run `npm run migrate`
   - Verify success

3. **Never skip errors:**
   - Do NOT mark work complete if migration fails
   - Do NOT proceed to other tasks while migration is broken
   - Fix migration errors immediately

### Step 4: Verify Schema Changes

After successful migration:

1. **Verify tables exist:**
   ```bash
   # Check new tables were created
   npm run db:query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
   ```

2. **Verify RLS enabled:**
   ```bash
   npm run check:advisors
   ```

3. **Verify policies exist:**
   ```bash
   # Check RLS policies were created
   npm run db:query "SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = '{table_name}'"
   ```

## Workflow Integration

### During Schema Development

1. **Create migration file** (using template)
2. **Write migration SQL** with required elements
3. **Automatically run `npm run migrate`** (this rule)
4. **Verify success** and schema state
5. **Proceed with implementation**

### Before Committing

1. **Verify all migrations applied:**
   ```bash
   npm run migrate:status
   ```

2. **Check for schema drift:**
   ```bash
   npm run check:advisors
   ```

3. **Verify RLS enabled** on all user-facing tables

### Pre-Commit Hook

The migration automation is enforced by a pre-commit hook that:

1. Detects changes to `supabase/migrations/*.sql`
2. Automatically runs `npm run migrate`
3. Blocks commit if migrations fail
4. Verifies RLS is enabled for new tables

## Constraints

Agents MUST:
- Run `npm run migrate` after creating/modifying migration files
- Verify migration succeeded before proceeding
- Fix migration errors immediately (never skip)
- Check RLS is enabled for all new tables
- Verify schema state after migrations

Agents MUST NOT:
- Skip migration application to save time
- Mark work complete if migrations fail
- Proceed with other tasks while migrations are broken
- Assume migrations applied successfully without verification
- Create tables without enabling RLS

## Error Patterns

### Missing RLS

**Symptom:** `check:advisors` warns about tables without RLS enabled

**Fix:**
```sql
-- Add to migration file
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
```

### Syntax Error

**Symptom:** Migration fails with SQL syntax error

**Fix:**
- Fix SQL syntax in migration file
- Re-run `npm run migrate`
- Verify success

### Constraint Violation

**Symptom:** Migration fails with "violates foreign key constraint"

**Fix:**
- Check data compatibility
- Add required migrations first (create referenced tables)
- Update migration order if needed

### Missing IF NOT EXISTS

**Symptom:** Migration fails with "already exists" error

**Fix:**
```sql
-- Add IF NOT EXISTS to CREATE statements
CREATE TABLE IF NOT EXISTS {table_name} (...);
CREATE INDEX IF NOT EXISTS {index_name} ON {table_name}(...);
```

## Examples

### ✅ Correct: Auto-Apply After Creation

```bash
# Agent creates migration file
echo "CREATE TABLE IF NOT EXISTS ..." > supabase/migrations/20260212000000_new_table.sql

# Agent automatically runs migration
npm run migrate

# Output: ✅ Applied migration 20260212000000_new_table.sql

# Agent verifies success
npm run check:advisors
# Output: ✅ No issues found
```

### ✅ Correct: Fix and Retry on Error

```bash
# Agent runs migration
npm run migrate
# Output: ❌ Error: syntax error at or near "CRATE"

# Agent fixes error in migration file
sed -i 's/CRATE TABLE/CREATE TABLE/' supabase/migrations/20260212000000_new_table.sql

# Agent retries
npm run migrate
# Output: ✅ Applied migration 20260212000000_new_table.sql
```

### ❌ Incorrect: Skip Migration Application

```bash
# Agent creates migration file
echo "CREATE TABLE ..." > supabase/migrations/20260212000000_new_table.sql

# Agent marks work complete WITHOUT running migration
# Result: Schema drift between migration files and database
```

### ❌ Incorrect: Ignore Migration Errors

```bash
# Agent runs migration
npm run migrate
# Output: ❌ Error: table "users" does not exist

# Agent proceeds with other tasks WITHOUT fixing error
# Result: Database in broken state
```

## Configuration

Migration commands are configured in `package.json`:

```json
{
  "scripts": {
    "migrate": "supabase db push --local",
    "migrate:status": "supabase migration list --local",
    "check:advisors": "supabase db lint --level warning"
  }
}
```

## Related Documents

- `supabase/migrations/_template_new_table.sql` — Migration template
- `docs/conventions/code_conventions_rules.md` — SQL conventions and RLS requirements
- `docs/architecture/determinism.md` — Deterministic migration requirements
- `.pre-commit-config.yaml` — Pre-commit hook configuration

## Agent Instructions

### When to Load This Document

Load this document when:
- Creating or modifying database migrations
- Implementing schema changes
- Debugging migration failures
- Reviewing database migration workflow

### Required Co-Loaded Documents

- `docs/conventions/code_conventions_rules.md` — SQL conventions
- `supabase/migrations/_template_new_table.sql` — Migration template

### Constraints Agents Must Enforce

1. **MANDATORY migration application** after creating/modifying SQL files
2. **MANDATORY error fixing** before proceeding (never skip errors)
3. **MANDATORY RLS verification** for all new tables
4. **MANDATORY schema state verification** after migrations

### Forbidden Patterns

- Skipping migration application to save time
- Marking work complete with failed migrations
- Proceeding with other tasks while migrations are broken
- Creating tables without enabling RLS
- Ignoring migration errors

### Validation Checklist

Before marking schema work complete:
- [ ] Migration file created following template
- [ ] Migration includes header comment
- [ ] RLS enabled for all new tables (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
- [ ] Policies created for all new tables
- [ ] Migration applied successfully (`npm run migrate`)
- [ ] No migration errors in output
- [ ] Schema advisors pass (`npm run check:advisors`)
- [ ] Tables exist in database
- [ ] Policies exist for tables
- [ ] Migration status shows all applied (`npm run migrate:status`)
