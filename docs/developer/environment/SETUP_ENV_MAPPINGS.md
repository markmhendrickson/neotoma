# Setting Up Environment Variable Mappings for 1Password Sync

This guide helps you add mappings for Neotoma-specific environment variables to the `env_var_mappings` parquet data type.

## Current Status

✅ **Setup Complete:**
- Foundation script is configured
- Wrapper script is ready (`npm run sync:env`)
- 1Password CLI is installed
- Python 3 is available

📋 **Next Steps:**
- Add mappings for Neotoma environment variables (see list below)
- Test the sync process

## Required Environment Variables (from .env.example)

Based on `.env.example`, these variables should be mapped to 1Password:

### Database Configuration (Required)
- `DEV_REMOTE_DB_PROJECT_ID` - Development remote database project ID
- `DEV_REMOTE_DB_SERVICE_KEY` - Development remote database service role key
- `REMOTE_DB_ACCESS_TOKEN` - Remote database Management API access token (optional)
- `PROD_REMOTE_DB_PROJECT_ID` - Production remote database project ID (if needed)
- `PROD_REMOTE_DB_SERVICE_KEY` - Production remote database service role key (if needed)

### Connector Configuration
- `DEV_CONNECTOR_SECRET_KEY` - Development connector secret key (min 16 chars)
- `PROD_CONNECTOR_SECRET_KEY` - Production connector secret key (if needed)

### OpenAI Configuration
- `DEV_OPENAI_API_KEY` - Development OpenAI API key
- `PROD_OPENAI_API_KEY` - Production OpenAI API key (if needed)

**Note:** `OPENAI_API_KEY` already has mappings, but you may want to use `DEV_OPENAI_API_KEY` and `PROD_OPENAI_API_KEY` instead for consistency.

### Plaid Configuration (Optional)
- `DEV_PLAID_CLIENT_ID` - Development Plaid client ID
- `DEV_PLAID_SECRET` - Development Plaid secret
- `PLAID_ENV` - Plaid environment (usually "sandbox" or "production")
- `PROD_PLAID_CLIENT_ID` - Production Plaid client ID (if needed)
- `PROD_PLAID_SECRET` - Production Plaid secret (if needed)

### Server Configuration (Optional - usually local)
These can be excluded from 1Password sync as they're typically local development values:
- `PORT` / `NEOTOMA_PORT` - MCP Server port (default: 3000)
- `HTTP_PORT` / `NEOTOMA_HTTP_PORT` - HTTP Actions Server port (default: 8080 for development, 8180 for production)
- `WS_PORT` / `NEOTOMA_WS_PORT` - WebSocket MCP Bridge port (default: 8280)
- `ACTIONS_BEARER_TOKEN` - Bearer token for HTTP Actions API
- `NEOTOMA_HOST_URL` - Host URL for API and MCP
- `NEOTOMA_FRONTEND_URL` / `FRONTEND_URL` - Frontend URL for CORS
- `NEOTOMA_MCP_PROXY_URL` / `MCP_PROXY_URL` - MCP proxy URL override
- `NEOTOMA_OAUTH_REDIRECT_BASE_URL` / `OAUTH_REDIRECT_BASE_URL` - OAuth redirect base
- `NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY` / `MCP_TOKEN_ENCRYPTION_KEY` - OAuth token encryption
- `NEOTOMA_MCP_CMD` / `MCP_CMD`, `NEOTOMA_MCP_ARGS` / `MCP_ARGS` - MCP WebSocket bridge config

### Frontend Configuration (Optional - usually local)
These can be excluded from 1Password sync:
- `VITE_WS_PORT` - WebSocket port for frontend
- `VITE_LOCAL_MCP_URL` - Local MCP WebSocket URL
- `VITE_MCP_URL` - MCP URL
- `VITE_API_BASE_URL` - API Base URL (frontend)
- `VITE_AUTO_SEED_RECORDS` - Auto-seed records flag

## How to Add Mappings

### Step 1: Find 1Password References

For each environment variable, you need to find its 1Password reference. Use the 1Password CLI:

```bash
# List all items in a vault
op item list --vault="VaultName"

# Get details of a specific item
op item get "Item Name" --vault="VaultName" --format=json

# Get a specific field reference
op item get "Item Name" --vault="VaultName" --fields="fieldLabel"
```

The reference format is: `op://vault/item/field`

### Step 2: Add Mapping via MCP Parquet Server

Use the MCP parquet server to add a new record. The required fields are:
- `env_var` (string, required) - The environment variable name
- `op_reference` (string, required) - The 1Password reference (op://...)

Optional but recommended fields:
- `vault` (string) - Vault name
- `item_name` (string) - Item name in 1Password
- `field_label` (string) - Field label
- `service` (string) - Service name (e.g., "database", "OpenAI", "Plaid")
- `is_optional` (boolean) - Whether this variable is optional
- `notes` (string) - Any additional notes
- `environment_based` (boolean) - Whether this is environment-specific
- `environment_key` (string) - Environment name if environment_based is true

### Step 3: Example Mapping

Here's an example for adding `DEV_REMOTE_DB_SERVICE_KEY`:

```json
{
  "env_var": "DEV_REMOTE_DB_SERVICE_KEY",
  "op_reference": "op://Private/your-item-id/field-id",
  "vault": "Private",
  "item_name": "Neotoma Database",
  "field_label": "Development Service Role Key",
  "service": "database",
  "is_optional": false,
  "environment_based": false,
  "notes": "Development environment remote database service role key"
}
```

### Step 4: Environment-Based Variables

For variables that have different values for dev/prod (like OpenAI API keys), you can create separate mappings:

```json
{
  "env_var": "DEV_OPENAI_API_KEY",
  "op_reference": "op://Private/openai-item/dev-key-field",
  "environment_based": true,
  "environment_key": "development",
  "service": "OpenAI"
}
```

```json
{
  "env_var": "PROD_OPENAI_API_KEY",
  "op_reference": "op://Private/openai-item/prod-key-field",
  "environment_based": true,
  "environment_key": "production",
  "service": "OpenAI"
}
```

## Quick Reference: Using MCP Tools

You can use the MCP parquet tools directly. Here's the pattern:

**Add a new mapping:**
```javascript
// Use mcp_parquet_add_record with:
{
  "data_type": "env_var_mappings",
  "record": {
    "env_var": "DEV_REMOTE_DB_SERVICE_KEY",
    "op_reference": "op://Private/item/field",
    "vault": "Private",
    "item_name": "Neotoma Database",
    "service": "database",
    "is_optional": false,
    "environment_based": false
  }
}
```

**Update an existing mapping:**
```javascript
// Use mcp_parquet_update_records with:
{
  "data_type": "env_var_mappings",
  "filters": {
    "env_var": "DEV_REMOTE_DB_SERVICE_KEY"
  },
  "updates": {
    "op_reference": "op://Private/new-item/new-field"
  }
}
```

## Testing the Sync

Once you've added mappings:

1. **Sign in to 1Password:**
   ```bash
   op signin
   ```

2. **Run the sync:**
   ```bash
   npm run sync:env
   ```

3. **Verify the results:**
   - Check that `.env` was updated
   - Check that a backup was created in `.env.backups/`
   - Verify the variables have the correct values

## Excluding Variables

If you want to exclude certain variables from being managed by 1Password (e.g., local development ports), add them to `foundation-config.yaml`:

```yaml
tooling:
  env_management:
    onepassword_sync:
      default_exclusions:
        - PORT
        - NEOTOMA_PORT
        - HTTP_PORT
        - NEOTOMA_HTTP_PORT
        - WS_PORT
        - NEOTOMA_WS_PORT
        - ACTIONS_BEARER_TOKEN
        - NEOTOMA_HOST_URL
        - NEOTOMA_FRONTEND_URL
        - FRONTEND_URL
        - NEOTOMA_MCP_PROXY_URL
        - MCP_PROXY_URL
        - NEOTOMA_OAUTH_REDIRECT_BASE_URL
        - OAUTH_REDIRECT_BASE_URL
        - NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY
        - MCP_TOKEN_ENCRYPTION_KEY
        - NEOTOMA_MCP_CMD
        - MCP_CMD
        - NEOTOMA_MCP_ARGS
        - MCP_ARGS
        - VITE_WS_PORT
        - VITE_LOCAL_MCP_URL
        - VITE_MCP_URL
        - VITE_API_BASE_URL
        - VITE_AUTO_SEED_RECORDS
```

Or create `foundation-config.local.yaml` (gitignored) for instance-specific exclusions.

## Troubleshooting

### "Failed to resolve [variable]"
- Verify the 1Password reference is correct
- Ensure you have access to the vault/item
- Check that the field name matches

### "No environment variable mappings found"
- Verify mappings exist in the parquet file
- Check that `op_reference` doesn't start with `PLACEHOLDER_`
- Ensure the MCP server can access the parquet file

### Variables not syncing
- Check if they're in the exclusion list
- Verify the mapping exists and `op_reference` is valid
- Check that `environment_based` and `environment_key` match your `ENVIRONMENT` variable

## See Also

- Main documentation: [README_1PASSWORD_SYNC.md](README_1PASSWORD_SYNC.md)
- Foundation script: `foundation/scripts/op_sync_env_from_1password.py`
- Configuration: `foundation-config.yaml`
