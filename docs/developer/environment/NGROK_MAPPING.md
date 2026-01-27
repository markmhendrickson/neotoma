# Adding NGROK_AUTHTOKEN to Environment Variable Mappings

This document provides instructions for adding the ngrok authtoken to the 1Password sync mappings.

## Mapping Details

**Environment Variable:** `NGROK_AUTHTOKEN`

**1Password Reference:** `op://Private/ngrok Ngrok/authtoken – neotoma (development)`

**Mapping Record:**
```json
{
  "env_var": "NGROK_AUTHTOKEN",
  "op_reference": "op://Private/ngrok Ngrok/authtoken – neotoma (development)",
  "vault": "Private",
  "item_name": "ngrok Ngrok",
  "field_label": "authtoken – neotoma (development)",
  "service": "ngrok",
  "is_optional": true,
  "environment_based": true,
  "environment_key": "development",
  "notes": "ngrok authtoken for development environment HTTPS tunneling"
}
```

## How to Add

### Option 1: Via MCP Parquet Tools (Recommended)

If you have access to the parquet MCP server in Cursor:

1. **Use MCP tool:** `mcp_parquet_add_record` (or similar)
2. **Data type:** `env_var_mappings`
3. **Record:** Use the JSON above

### Option 2: Via Python Script

If the parquet MCP server is accessible:

```bash
# Set environment variables (from sync script)
export PARQUET_MCP_SERVER_PATH="/path/to/parquet_mcp_server.py"
export PARQUET_MCP_PYTHON="/path/to/python3"
export DATA_DIR="/path/to/data"

# Run the add script
python3 scripts/add_ngrok_mapping.py
```

### Option 3: Manual Addition to Parquet File

If you have direct access to the parquet file:

1. **Locate the parquet file:**
   - Usually at: `$DATA_DIR/env_var_mappings/env_var_mappings.parquet`
   - Or check the parquet MCP server configuration

2. **Add the record** using pandas or parquet tools:
   ```python
   import pandas as pd
   
   # Read existing mappings
   df = pd.read_parquet('env_var_mappings.parquet')
   
   # Add new record
   new_record = {
       'env_var': 'NGROK_AUTHTOKEN',
       'op_reference': 'op://Private/ngrok Ngrok/authtoken – neotoma (development)',
       'vault': 'Private',
       'item_name': 'ngrok Ngrok',
       'field_label': 'authtoken – neotoma (development)',
       'service': 'ngrok',
       'is_optional': True,
       'environment_based': True,
       'environment_key': 'development',
       'notes': 'ngrok authtoken for development environment HTTPS tunneling'
   }
   
   # Append and save
   df = pd.concat([df, pd.DataFrame([new_record])], ignore_index=True)
   df.to_parquet('env_var_mappings.parquet', index=False)
   ```

## After Adding

Once the mapping is added:

1. **Run the sync:**
   ```bash
   npm run sync:env
   # or
   bash scripts/sync-env-from-1password.sh
   ```

2. **Verify in .env:**
   ```bash
   grep NGROK_AUTHTOKEN .env
   ```

3. **Use for ngrok:**
   ```bash
   # Configure ngrok
   ngrok config add-authtoken $NGROK_AUTHTOKEN
   
   # Or use in tunnel script
   export NGROK_AUTHTOKEN=$(grep NGROK_AUTHTOKEN .env | cut -d'=' -f2)
   ```

## Adding to Inclusion List (Optional)

If you want `NGROK_AUTHTOKEN` to be automatically synced, add it to the inclusion list in `foundation-config.yaml`:

```yaml
tooling:
  env_management:
    onepassword_sync:
      expected_variables:
        recommended:
          - OPENAI_API_KEY
          - SUPABASE_ACCESS_TOKEN
          - ACTIONS_BEARER_TOKEN
          - CURSOR_CLOUD_API_KEY
          - NGROK_AUTHTOKEN  # Add this line
```

Or use flat list format:

```yaml
tooling:
  env_management:
    onepassword_sync:
      inclusions:
        - SUPABASE_PROJECT_ID
        - SUPABASE_SERVICE_KEY
        - OPENAI_API_KEY
        - NGROK_AUTHTOKEN  # Add this line
```

## Verification

After adding and syncing:

1. **Check mapping exists:**
   - Query parquet file for `env_var = 'NGROK_AUTHTOKEN'`

2. **Check sync includes it:**
   - Run sync and verify `NGROK_AUTHTOKEN` appears in output

3. **Check .env file:**
   - Variable should be present with value from 1Password

## Troubleshooting

**Mapping not found during sync:**
- Verify the mapping was added to parquet file
- Check that `env_var` field matches exactly: `NGROK_AUTHTOKEN`
- Ensure parquet file is accessible to sync script

**1Password reference fails:**
- Verify item exists: `op item get "ngrok Ngrok" --vault="Private"`
- Check field label matches exactly (including em dash character)
- Try getting field directly: `op item get "ngrok Ngrok" --vault="Private" --fields="authtoken – neotoma (development)"`

**Not in inclusion list:**
- Add to `expected_variables.recommended` or `inclusions` list in `foundation-config.yaml`
- Or it will sync if no inclusion list is configured (all mappings sync)
