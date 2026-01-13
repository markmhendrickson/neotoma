# Inclusion List Feature for 1Password Sync

## Overview

The foundation script `op_sync_env_from_1password.py` now supports an **inclusion list** (whitelist) feature. This allows you to specify exactly which environment variables should be synced from 1Password, even if other mappings exist in the parquet file.

## Why Use Inclusion Lists?

- **Repository-specific control**: Only sync variables relevant to this specific repository
- **Security**: Prevent syncing variables from other projects/services that might be in the shared parquet file
- **Clarity**: Explicitly document which variables this repo needs
- **Flexibility**: Works alongside exclusion lists for fine-grained control

## How It Works

1. **Without inclusion list** (default): All variables with mappings in parquet are synced
2. **With inclusion list**: Only variables in the inclusion list are synced, even if other mappings exist

## Configuration

### Format 1: Flat List

Add an `inclusions` list in `foundation-config.yaml`:

```yaml
tooling:
  env_management:
    onepassword_sync:
      enabled: true
      inclusions:
        - DEV_SUPABASE_PROJECT_ID
        - DEV_SUPABASE_SERVICE_KEY
        - DEV_CONNECTOR_SECRET_KEY
        - OPENAI_API_KEY
        - SUPABASE_ACCESS_TOKEN
```

### Format 2: Nested from expected_variables

The script automatically flattens the `expected_variables` structure:

```yaml
tooling:
  env_management:
    onepassword_sync:
      enabled: true
      expected_variables:
        required:
          - DEV_SUPABASE_PROJECT_ID
          - DEV_SUPABASE_SERVICE_KEY
          - DEV_CONNECTOR_SECRET_KEY
        recommended:
          - OPENAI_API_KEY
          - SUPABASE_ACCESS_TOKEN
        optional:
          - DEV_PLAID_CLIENT_ID
          - DEV_PLAID_SECRET
        production:
          - PROD_SUPABASE_PROJECT_ID
          - PROD_SUPABASE_SERVICE_KEY
```

All variables from `required`, `recommended`, `optional`, and `production` categories are automatically included.

## Example Behavior

### Without Inclusion List
```
Parquet has mappings for: [DEV_SUPABASE_SERVICE_KEY, COINBASE_API_KEY, ASANA_PAT, OPENAI_API_KEY]
→ All 4 variables are synced
```

### With Inclusion List
```yaml
inclusions:
  - DEV_SUPABASE_SERVICE_KEY
  - OPENAI_API_KEY
```
```
Parquet has mappings for: [DEV_SUPABASE_SERVICE_KEY, COINBASE_API_KEY, ASANA_PAT, OPENAI_API_KEY]
→ Only DEV_SUPABASE_SERVICE_KEY and OPENAI_API_KEY are synced
→ COINBASE_API_KEY and ASANA_PAT are ignored (not in inclusion list)
```

## Current Configuration

The Neotoma repo is configured to use `expected_variables` format, which means:

- **Required variables** will be synced: `DEV_SUPABASE_PROJECT_ID`, `DEV_SUPABASE_SERVICE_KEY`, `DEV_CONNECTOR_SECRET_KEY`
- **Recommended variables** will be synced: `OPENAI_API_KEY`, `SUPABASE_ACCESS_TOKEN`
- **Optional variables** will be synced (if mappings exist): `DEV_PLAID_CLIENT_ID`, `DEV_PLAID_SECRET`
- **Production variables** will be synced (if mappings exist): `PROD_*` variables

Variables from other services (Coinbase, Asana, etc.) in the parquet file will **not** be synced unless they're in the inclusion list.

## Interaction with Exclusions

- **Inclusions** (whitelist): Which variables to sync from 1Password
- **Exclusions** (blacklist): Which variables to preserve from existing `.env` (not overwritten)

They work together:
1. Inclusion list filters which variables are synced from 1Password
2. Exclusion list prevents overwriting certain variables (even if they're in the inclusion list)

## Troubleshooting

### "No environment variable mappings match the inclusion list"

This means:
- Your inclusion list specifies variables that don't have mappings in the parquet file
- Or the mappings exist but have `PLACEHOLDER_` prefixes

**Solution**: Add mappings for the variables in your inclusion list using the MCP parquet server.

### Variables not syncing

Check:
1. Is the variable in your inclusion list? (if inclusion list is configured)
2. Does the variable have a mapping in parquet? (not a placeholder)
3. Is the variable in the exclusion list? (exclusions prevent overwriting)

## See Also

- Main documentation: [README_1PASSWORD_SYNC.md](README_1PASSWORD_SYNC.md)
- Foundation script: `foundation/scripts/op_sync_env_from_1password.py`
- Configuration: `foundation-config.yaml`
- [Inclusion vs Exclusion Lists](INCLUSION_VS_EXCLUSION.md)