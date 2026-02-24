# Migration to Single Variable Names

This document tracks the migration from `DEV_*/PROD_*` prefixed environment variables to single variable names with environment-based selection.

## Status: ✅ Code Updated

The codebase has been updated to support single variable names with backward compatibility:

### Updated Variables

- `CONNECTOR_SECRET_KEY` (replaces `DEV_CONNECTOR_SECRET_KEY` / `PROD_CONNECTOR_SECRET_KEY`)
- `OPENAI_API_KEY` (already using environment-based selection)

### How It Works

1. **1Password Sync**: The sync script reads `ENVIRONMENT` variable (defaults to "development")
2. **Environment Selection**: Mappings with `environment_based: true` and matching `environment_key` are selected
3. **Variable Setting**: The selected 1Password value is set to the single variable name (e.g., `CONNECTOR_SECRET_KEY`)
4. **Code Usage**: Code reads the single variable name, no environment checks needed

### Backward Compatibility

The code still supports `DEV_*/PROD_*` prefixed variables as fallback:
- If `CONNECTOR_SECRET_KEY` is set, use it
- Otherwise, fall back to `DEV_CONNECTOR_SECRET_KEY` or `PROD_CONNECTOR_SECRET_KEY` based on `NEOTOMA_ENV`

## Next Steps: Add Parquet Mappings

You need to add parquet mappings with `environment_based: true` for:

1. **CONNECTOR_SECRET_KEY**
   - ⚠️ **Note**: This key is now generated locally, not synced from 1Password
   - Run `npm run generate:connector-key` to generate it
   - See [CONNECTOR_SECRET_KEY Setup](CONNECTOR_SECRET_KEY_SETUP.md) for details

### Example Mapping Format

```json
{
  "env_var": "CONNECTOR_SECRET_KEY",
  "op_reference": "op://Private/connector-item/dev-key-field",
  "vault": "Private",
  "item_name": "Neotoma Connector",
  "service": "Connector",
  "is_optional": false,
  "environment_based": true,
  "environment_key": "development"
}
```

### Finding 1Password References

Use `op item get "Neotoma Connector" --format=json` to find the exact field references for connector secret keys.

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
CONNECTOR_SECRET_KEY=<value-from-1password>
```

The code will automatically use these values based on the `ENVIRONMENT` variable set during sync.

## Benefits

1. **Simpler Code**: No environment checks needed in code
2. **Standard Practice**: Follows 12-factor app principles
3. **Less Variables**: One variable name instead of two
4. **Environment Selection**: Happens at sync time, not runtime
5. **Backward Compatible**: Old `DEV_*/PROD_*` variables still work
