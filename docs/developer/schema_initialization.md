# Schema Initialization

## Overview

Entity schemas defined in `src/services/schema_definitions.ts` should be initialized in the database's `schema_registry` table for transparent, queryable schema management. This is more elegant than using TypeScript code as runtime fallbacks.

## Why Initialize Schemas?

**Benefits:**
- **Transparency**: Schemas are visible and queryable in the database
- **Consistency**: Single source of truth (database) instead of code fallbacks
- **Versioning**: Database tracks schema versions and history
- **Simplicity**: No fallback logic needed in runtime code
- **Auditability**: Schema changes are tracked in database

**Current Approach:**
- Schemas in `schema_definitions.ts` are used as runtime fallbacks
- Fallback logic adds complexity to `interpretation.ts`
- Schemas are not visible in database until explicitly registered

**Recommended Approach:**
- Initialize all schemas from `schema_definitions.ts` into database
- Database becomes single source of truth
- Runtime code only queries database (no fallback needed)

## When Seeding Runs (deploy contract)

Seeding is **not** a manual step you have to remember (issue #1968). It runs
automatically on every deploy path:

| Path | Mechanism |
|---|---|
| Any server start (all deploy paths, incl. future ones) | `seedSchemaRegistryIfEmpty()` in `startHTTPServer()` — `src/services/schema_registry_bootstrap.ts` |
| Fly.io deploys (`fly.toml`, `fly.sandbox.toml`) | `[deploy] release_command = "node dist/seed_schemas_entry.js"` |
| Rolling-main RC autodeploy | `node dist/seed_schemas_entry.js` step in `scripts/redeploy_rc_from_main.sh` |
| Local / manual | `npm run schema:init` |

Boot-time seeding is the backstop that covers every path, including deploy
paths not yet written; the explicit `release_command` and RC-script steps run
seeding *before* the new release takes traffic and surface a failure in the
deploy log rather than a single warn line in the server log. Running several
of these is harmless — whichever gets there first registers, the rest skip.

Boot seeding is deliberately **non-blocking**: it is wrapped in try/catch, so a
briefly-unavailable database yields a warn log and the server still starts. It
logs either `registry empty for N type(s) → seeding: …` or `all N built-in
schema(s) already registered; nothing to seed`.

**All of these paths are additive** — see the skip-if-present guard below.

## Initialization Script

### Usage

```bash
# Initialize all schemas (register and activate)
npm run schema:init

# Dry run (see what would be registered without making changes)
npm run schema:init:dry-run

# Force re-registration of existing schemas
tsx scripts/initialize-schemas.ts --force
```

### What It Does

1. **Reads schemas** from `src/services/schema_definitions.ts`:
   - All schemas from `ENTITY_SCHEMAS` (unified structure)

2. **Checks database** for an existing ACTIVE schema (skip-if-present):
   - If the entity type already has an active schema → skip, whatever
     version it is. The script never re-registers or re-activates over it.
   - If the entity type has no active schema → register and activate it

   This guard exists because an operator may deliberately register a **custom
   schema** that overrides a built-in (via `register_schema` /
   `update_schema_incremental`). Before issue #1968 the script decided by
   matching the built-in's `schema_version` *string* and called `activate()`
   whenever that version was registered-but-inactive — which deactivated the
   operator's custom schema and reverted the type to the built-in on every
   run. Keying on "is anything active?" removes that hazard.

3. **Activates schemas**:
   - Only one schema version per entity type can be active
   - Activation automatically deactivates other versions — which is exactly
     why the skip-if-present guard above matters

4. **Reports results**:
   - Shows which schemas were registered, activated, or skipped
   - Reports any errors

### Example Output

```
🔧 Initializing Schema Registry from schema_definitions.ts

Processing base schemas...
  ✓ holding v1.0 - registered
  ✓ income v1.0 - registered
  ↻ contact v1.0 - activated
  ⊘ account v1.0 - skipped (already active)
  ...

Processing expanded schemas...
  ✓ transaction v1.0 - registered
  ...

============================================================
SUMMARY
============================================================
Total schemas processed: 32
  ✓ Registered: 28
  ↻ Activated: 2
  ⊘ Skipped (already active): 2

✓ Schema initialization complete!
💡 Schemas are now available in the database and will be used instead of code fallbacks.
```

## When to Run

### Initial Setup
Run after:
- Setting up a new database
- Running migrations that create `schema_registry` table
- Cloning the repository for the first time

### After Schema Changes
Run after:
- Adding new entity types to `schema_definitions.ts`
- Updating existing schema definitions
- Adding new schema versions

### Development Workflow
```bash
# 1. Make changes to schema_definitions.ts
# 2. Initialize schemas
npm run schema:init

# 3. Verify schemas are active
# (query schema_registry table or check logs)
```

## Fallback Behavior

The runtime code in `src/services/interpretation.ts` still includes fallback logic for backward compatibility:

- **Development**: Falls back to code schemas with a warning
- **Production**: Should rely on database schemas only

**Warning in Development:**
```
[Schema Fallback] No database schema found for entity type "invoice". 
Using code fallback. Run 'npm run schema:init' to register schemas in the database.
```

## Database Schema

Schemas are stored in the `schema_registry` table:

```sql
CREATE TABLE schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  schema_definition JSONB NOT NULL,
  reducer_config JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_type, schema_version)
);
```

## Related Commands

- `npm run schema:export` - Export schema snapshots to `docs/subsystems/schema_snapshots/`
- `npm run analyze:schemas` - Compare DATA_DIR entity types with schema definitions

## Migration Path

For existing deployments:

1. **Run initialization script:**
   ```bash
   npm run schema:init
   ```

2. **Verify schemas are active:**
   ```sql
   SELECT entity_type, schema_version, active 
   FROM schema_registry 
   WHERE active = true 
   ORDER BY entity_type;
   ```

3. **Optional: Remove fallback logic** (after verifying all schemas are registered):
   - Update `src/services/interpretation.ts` to remove fallback code
   - This makes the system more strict and transparent

## Troubleshooting

### Schema Already Exists Error
If you see "duplicate key" or "unique constraint" errors:
- The schema is already registered
- Use `--force` flag to re-register: `tsx scripts/initialize-schemas.ts --force`

> **`--force` overrides the skip-if-present guard.** It re-registers and
> activates the built-in over whatever is currently active, which will
> **deactivate an operator-registered custom schema** for that entity type.
> Check `SELECT entity_type, schema_version, active FROM schema_registry
> WHERE active = true` for unexpected versions before running it.

### Schema Not Found After Initialization
- Check that the schema was actually registered: query `schema_registry` table
- Verify the entity type name matches exactly (case-sensitive)
- Check for errors in the initialization output

### Fallback Still Being Used
- Verify schemas are active: `SELECT * FROM schema_registry WHERE active = true`
- Check that `entity_type` matches exactly (case-sensitive)
- Run initialization again: `npm run schema:init`
