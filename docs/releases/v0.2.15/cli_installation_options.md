# Supabase CLI Installation Options for v0.2.15 Migrations

## Issue

`npm install -g supabase` is not supported by Supabase.

## Current Status

Homebrew installation blocked by macOS 26 Command Line Tools compatibility issue:
```
Error: Your Command Line Tools (CLT) does not support macOS 26.
```

## Installation Options

### Option 1: Update Command Line Tools (Recommended if you need CLI)

```bash
# Remove existing CLT
sudo rm -rf /Library/Developer/CommandLineTools

# Install new version
sudo xcode-select --install
```

Then retry:
```bash
brew install supabase/tap/supabase
supabase --version
```

### Option 2: Direct Binary Download

Download the CLI binary directly:

**macOS (Intel):**
```bash
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_darwin_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/
```

**macOS (Apple Silicon):**
```bash
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_darwin_arm64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/
```

Verify:
```bash
supabase --version
```

### Option 3: NPX (No Installation)

Use `npx` to run without installing:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

**Note:** May be slower but doesn't require installation.

### Option 4: Manual Migration via Dashboard (Recommended for v0.2.15)

**Fastest and most reliable for this release:**

1. Go to Supabase Dashboard → SQL Editor
2. Copy/paste migration file contents:
   - `supabase/migrations/20260101000001_add_source_graph_edges.sql`
   - `supabase/migrations/20260101000002_rename_interpretation_runs_to_interpretations.sql`
   - `supabase/migrations/20260101000003_rename_interpretation_run_id_to_interpretation_id.sql`
3. Execute each in order
4. Verify with test queries

**See:** `docs/releases/v0.2.15/apply_migrations_manually.md`

## Recommendation

**For v0.2.15 deployment:**
→ Use **Option 4 (Manual Dashboard)** - fastest, no CLI dependency

**For future releases:**
→ Fix CLI installation (Option 1 or 2) for automated migrations

## Why Manual Is Better Right Now

1. **No system changes required** - No CLT update needed
2. **Immediate deployment** - No installation delays
3. **Visual verification** - See SQL execution in dashboard
4. **Same result** - Migrations are identical whether via CLI or manual
5. **Lower risk** - Direct control over each migration step

## Migration File Locations

All migrations ready in:
```
supabase/migrations/20260101000001_add_source_graph_edges.sql
supabase/migrations/20260101000002_rename_interpretation_runs_to_interpretations.sql
supabase/migrations/20260101000003_rename_interpretation_run_id_to_interpretation_id.sql
```

Total: 209 lines of SQL, fully tested and ready to apply.

## Next Steps

1. Choose installation option OR proceed with manual migration
2. Apply 3 migration files
3. Verify tables/columns renamed
4. Test application endpoints
5. Deploy v0.2.15

---

**Recommendation:** Proceed with manual dashboard migration for immediate deployment. Fix CLI installation for future releases.


