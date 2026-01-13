# Migration to Single Variable Names

This document tracks the migration from `DEV_*/PROD_*` prefixed environment variables to single variable names with environment-based selection.

## Status: ✅ Code Updated

The codebase has been updated to support single variable names with backward compatibility:

### Updated Variables

- `SUPABASE_PROJECT_ID` (replaces `DEV_SUPABASE_PROJECT_ID` / `PROD_SUPABASE_PROJECT_ID`)
- `SUPABASE_SERVICE_KEY` (replaces `DEV_SUPABASE_SERVICE_KEY` / `PROD_SUPABASE_SERVICE_KEY`)
- `CONNECTOR_SECRET_KEY` (replaces `DEV_CONNECTOR_SECRET_KEY` / `PROD_CONNECTOR_SECRET_KEY`)
- `OPENAI_API_KEY` (already using environment-based selection)

### How It Works

1. **1Password Sync**: The sync script reads `ENVIRONMENT` variable (defaults to "development")
2. **Environment Selection**: Mappings with `environment_based: true` and matching `environment_key` are selected
3. **Variable Setting**: The selected 1Password value is set to the single variable name (e.g., `SUPABASE_SERVICE_KEY`)
4. **Code Usage**: Code reads the single variable name, no environment checks needed

### Backward Compatibility

The code still supports `DEV_*/PROD_*` prefixed variables as fallback:
- If `SUPABASE_SERVICE_KEY` is set, use it
- Otherwise, fall back to `DEV_SUPABASE_SERVICE_KEY` or `PROD_SUPABASE_SERVICE_KEY` based on `NEOTOMA_ENV`

## Next Steps: Add Parquet Mappings

You need to add parquet mappings with `environment_based: true` for:

1. **SUPABASE_PROJECT_ID**
   - Development: `environment_key: "development"` → 1Password reference for dev project ID
   - Production: `environment_key: "production"` → 1Password reference for prod project ID

2. **SUPABASE_SERVICE_KEY**
   - Development: `environment_key: "development"` → 1Password reference for dev service key
   - Production: `environment_key: "production"` → 1Password reference for prod service key

3. **CONNECTOR_SECRET_KEY**
   - ⚠️ **Note**: This key is now generated locally, not synced from 1Password
   - Run `npm run generate:connector-key` to generate it
   - See [CONNECTOR_SECRET_KEY Setup](CONNECTOR_SECRET_KEY_SETUP.md) for details

### Example Mapping Format

```json
{
  "env_var": "SUPABASE_SERVICE_KEY",
  "op_reference": "op://Private/supabase-item/dev-service-key-field",
  "vault": "Private",
  "item_name": "Supabase",
  "field_label": "neotoma secret key (development)",
  "service": "Supabase",
  "is_optional": false,
  "environment_based": true,
  "environment_key": "development"
}
```

### Finding 1Password References

From your Supabase 1Password entry:
- Development project ID: `zbljeeexirekzzqduxli`
- Production project ID: `htczllkfgrqjyqxygymh`

Use `op item get "Supabase" --format=json` to find the exact field references for:
- Development service key
- Production service key
- Connector secret keys (if stored in Supabase entry or separate entry)

## Usage

### Setting Environment Before Sync

**Default**: If `ENVIRONMENT` is not set, it defaults to `"development"`

```bash
# For development (default - no need to set ENVIRONMENT)
npm run sync:env

# Or explicitly:
export ENVIRONMENT=development
npm run sync:env

# For production (must set ENVIRONMENT)
export ENVIRONMENT=production
npm run sync:env
```

### Result

After syncing, your `.env` will have:
```bash
SUPABASE_PROJECT_ID=zbljeeexirekzzqduxli  # or htczllkfgrqjyqxygymh for prod
SUPABASE_SERVICE_KEY=<value-from-1password>
CONNECTOR_SECRET_KEY=<value-from-1password>
```

The code will automatically use these values based on the `ENVIRONMENT` variable set during sync.

## Benefits

1. **Simpler Code**: No environment checks needed in code
2. **Standard Practice**: Follows 12-factor app principles
3. **Less Variables**: One variable name instead of two
4. **Environment Selection**: Happens at sync time, not runtime
5. **Backward Compatible**: Old `DEV_*/PROD_*` variables still work
