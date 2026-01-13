# 1Password Environment Variable Sync

This repository uses the foundation script `op_sync_env_from_1password.py` to sync environment variables from 1Password into the local `.env` file.

## Quick Start

1. **Ensure foundation is set up:**
   ```bash
   npm run setup:foundation
   ```

2. **Sign in to 1Password CLI:**
   ```bash
   op signin
   # or if using desktop app integration:
   eval $(op signin)
   ```

3. **Sync environment variables:**
   ```bash
   npm run sync:env
   ```
   
   **Note**: By default, this syncs **development** environment values. To sync production:
   ```bash
   export ENVIRONMENT=production
   npm run sync:env
   ```

   Or use the script directly:
   ```bash
   bash scripts/sync-env-from-1password.sh
   ```

   To sync to a custom `.env` file:
   ```bash
   npm run sync:env path/to/.env.custom
   ```

## How It Works

1. **Mappings**: The script reads environment variable mappings from a parquet file (via MCP server or direct read) that maps `ENV_VAR` names to 1Password references (`op://vault/item/field`).

2. **Backup**: Before modifying `.env`, it creates a timestamped backup in `.env.backups/`.

3. **Sync**: It fetches values from 1Password using the `op` CLI and updates the `.env` file.

4. **Preservation**: Variables not in the mappings are preserved (unless excluded via configuration).

## Configuration

### Inclusion Lists (Whitelist)

You can specify which variables should be synced from 1Password. If an inclusion list is specified, **only** variables in that list will be synced, even if other mappings exist in the parquet file.

**Two formats are supported:**

1. **Flat list format** (simple):
   ```yaml
   tooling:
     env_management:
       onepassword_sync:
         inclusions:
           - DEV_SUPABASE_PROJECT_ID
           - DEV_SUPABASE_SERVICE_KEY
           - DEV_CONNECTOR_SECRET_KEY
           - OPENAI_API_KEY
   ```

2. **Nested format** (from `expected_variables` - automatically flattened):
   ```yaml
   tooling:
     env_management:
       onepassword_sync:
         expected_variables:
           required:
             - DEV_SUPABASE_PROJECT_ID
             - DEV_SUPABASE_SERVICE_KEY
           recommended:
             - OPENAI_API_KEY
   ```

**If no inclusion list is specified**, all variables with mappings in the parquet file will be synced (default behavior).

### Exclusion Lists

You can exclude certain variables from being managed by 1Password sync:

1. **Default exclusions** (repo-wide): Edit `foundation-config.yaml`:
   ```yaml
   tooling:
     env_management:
       onepassword_sync:
         default_exclusions:
           - LOCAL_VAR_1
           - LOCAL_VAR_2
   ```

2. **Instance-specific exclusions** (local only): Create `foundation-config.local.yaml` (gitignored):
   ```yaml
   tooling:
     env_management:
       onepassword_sync:
         exclusions:
           - MY_LOCAL_VAR
   ```

### Environment Variable Mappings

The mappings are stored in a parquet file accessed via the MCP parquet server. To add or update mappings:

1. Use the MCP parquet server to add/update records in `env_var_mappings` data type
2. Each record should have:
   - `env_var`: The environment variable name (e.g., `DEV_SUPABASE_SERVICE_KEY`)
   - `op_reference`: The 1Password reference (e.g., `op://vault/item/field`)
   - `environment_based`: Boolean indicating if this is environment-specific
   - `environment_key`: The environment name (e.g., `development`, `production`)

To find 1Password references:
```bash
op item get "<item-name>" --format=json
```

## Requirements

- **1Password CLI**: Install from https://developer.1password.com/docs/cli/get-started
- **Python 3.9+**: Required to run the sync script
- **MCP dependencies** (optional): For MCP server integration (`pip install mcp`)
- **pandas and pyarrow** (fallback): If MCP is unavailable (`pip install pandas pyarrow`)

## Safety Features

- ✅ **Never prints secret values** - Only variable names are shown
- ✅ **Automatic backups** - Creates timestamped backups before modification
- ✅ **Session verification** - Checks 1Password CLI session before proceeding
- ✅ **Preserves unmanaged variables** - Variables not in mappings are kept
- ✅ **Placeholder support** - Variables with `PLACEHOLDER_` prefix are skipped until configured

## Troubleshooting

### "1Password CLI is not authenticated"
```bash
op signin
# or
eval $(op signin)
```

### "Could not find parquet MCP server"
- Ensure the parquet MCP server is available at the expected location
- Or set `PARQUET_MCP_SERVER_PATH` environment variable
- The script will fall back to direct parquet file reading if MCP is unavailable

### "No environment variable mappings found"
- Ensure mappings exist in the parquet file
- Check that the MCP server can access `data/env_var_mappings/env_var_mappings.parquet`
- Use the MCP parquet server to add mappings if needed

### "Failed to resolve [variable]"
- Verify the 1Password reference is correct
- Ensure you have access to the vault/item in 1Password
- Check that the field name in the reference matches the actual field in 1Password

## Restoring from Backup

If something goes wrong, you can restore from a backup:

```bash
# List backups
ls -la .env.backups/

# Restore a specific backup
cp .env.backups/.env-2024-01-15-143022 .env
```

## See Also

- Foundation script: `foundation/scripts/op_sync_env_from_1password.py`
- Configuration: `foundation-config.yaml`
- Local overrides: `foundation-config.local.yaml` (create if needed, gitignored)
