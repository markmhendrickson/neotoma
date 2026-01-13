# Environment Variable Mappings Status

Generated: 2026-01-08

## Summary

- **Total mappings in parquet**: 19
- **Neotoma-specific mappings**: 0
- **Other service mappings**: 19 (Coinbase, Asana, Twilio, Wise, Bitcoin, OpenAI, Minted)

## Required Neotoma Variables Status

### ✅ Available and Configured
- `OPENAI_API_KEY` - Exists with environment-based keys (dev/prod)
  - ✅ **Code updated**: Now uses `OPENAI_API_KEY` (with fallback to `DEV_OPENAI_API_KEY`/`PROD_OPENAI_API_KEY` for backward compatibility)
  - The 1Password sync script will set `OPENAI_API_KEY` based on the `ENVIRONMENT` variable

### ❌ Missing Required Variables (Based on src/config.ts)

#### Supabase Configuration (REQUIRED - Code will fail without these)
- `DEV_SUPABASE_PROJECT_ID` - **MISSING** ⚠️ **CRITICAL**
- `DEV_SUPABASE_SERVICE_KEY` - **MISSING** ⚠️ **CRITICAL**
- `SUPABASE_ACCESS_TOKEN` - Missing (optional, for Supabase CLI)
- `PROD_SUPABASE_PROJECT_ID` - Missing (optional, if using production)
- `PROD_SUPABASE_SERVICE_KEY` - Missing (optional, if using production)

#### Connector Configuration (REQUIRED - Code will fail without this)
- `DEV_CONNECTOR_SECRET_KEY` - **MISSING** ⚠️ **CRITICAL**
- `PROD_CONNECTOR_SECRET_KEY` - Missing (optional, if using production)

#### OpenAI Configuration (RECOMMENDED - Required for embeddings/AI features)
- `OPENAI_API_KEY` - ✅ **AVAILABLE** (environment-based, set by 1Password sync)
  - Code now uses `OPENAI_API_KEY` with fallback to `DEV_OPENAI_API_KEY`/`PROD_OPENAI_API_KEY`
  - The sync script automatically selects dev/prod key based on `ENVIRONMENT` variable

#### Plaid Configuration (OPTIONAL - Only if using Plaid integration)
- `DEV_PLAID_CLIENT_ID` - Missing (optional)
- `DEV_PLAID_SECRET` - Missing (optional)
- `PROD_PLAID_CLIENT_ID` - Missing (optional)
- `PROD_PLAID_SECRET` - Missing (optional)

## Excluded Variables (Correctly Not Mapped)

These are intentionally excluded via `foundation-config.yaml` as they're local development values:
- `PORT`, `HTTP_PORT`, `WS_PORT`
- `ACTIONS_BEARER_TOKEN`
- `VITE_*` variables
- `NEOTOMA_ENV`, `NODE_ENV`
- `MCP_CMD`, `MCP_ARGS`
- `PLAID_ENV`, `PLAID_ENVIRONMENT`, `PLAID_PRODUCTS`, `PLAID_COUNTRY_CODES`
- `NEOTOMA_ACTIONS_DISABLE_AUTOSTART`, `BRANCH_PORTS_FILE`

## Action Items

### 🔴 Critical Priority (Required for Neotoma to work)
These must be added or the application will fail to start:
1. **Add `DEV_SUPABASE_PROJECT_ID` mapping** - Required by `src/config.ts`
2. **Add `DEV_SUPABASE_SERVICE_KEY` mapping** - Required by `src/config.ts`
3. **Add `DEV_CONNECTOR_SECRET_KEY` mapping** - Required by `src/config.ts`

### 🟡 High Priority (Recommended for full functionality)
4. ✅ **OPENAI_API_KEY** - Already configured and code updated to use it
   - The existing `OPENAI_API_KEY` mapping works with environment-based selection
   - Code now uses `OPENAI_API_KEY` (with backward compatibility fallback)

### 🟢 Medium Priority (Optional but useful)
5. Add `SUPABASE_ACCESS_TOKEN` mapping (if using Supabase CLI for migrations)
6. Add production environment mappings if deploying to production:
   - `PROD_SUPABASE_PROJECT_ID`
   - `PROD_SUPABASE_SERVICE_KEY`
   - `PROD_CONNECTOR_SECRET_KEY`
   - Note: `OPENAI_API_KEY` already handles production via environment-based selection

### 🔵 Low Priority (Feature-specific)
7. Add Plaid mappings if using Plaid integration:
   - `DEV_PLAID_CLIENT_ID`
   - `DEV_PLAID_SECRET`

## How to Add Missing Mappings

See [SETUP_ENV_MAPPINGS.md](SETUP_ENV_MAPPINGS.md) for detailed instructions.

Quick example:
```javascript
// Add DEV_SUPABASE_SERVICE_KEY
{
  "data_type": "env_var_mappings",
  "record": {
    "env_var": "DEV_SUPABASE_SERVICE_KEY",
    "op_reference": "op://Private/your-item-id/field-id",
    "vault": "Private",
    "item_name": "Neotoma Supabase",
    "service": "Supabase",
    "is_optional": false,
    "environment_based": false
  }
}
```
