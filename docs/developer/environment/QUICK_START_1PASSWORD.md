# Quick Start: 1Password Environment Variable Sync

## ✅ Setup Complete

All infrastructure is in place:
- ✅ Foundation script configured
- ✅ Wrapper script created (`scripts/sync-env-from-1password.sh`)
- ✅ NPM script added (`npm run sync:env`)
- ✅ Configuration updated (`foundation-config.yaml`)
- ✅ Documentation created

## 🚀 Quick Start (3 Steps)

### 1. Sign in to 1Password CLI

```bash
op signin
# or if using desktop app integration:
eval $(op signin)
```

### 2. Add Environment Variable Mappings

You need to map your Neotoma environment variables to 1Password references. See [SETUP_ENV_MAPPINGS.md](SETUP_ENV_MAPPINGS.md) for detailed instructions.

**Quick example using MCP tools:**
```javascript
// Add a mapping for DEV_SUPABASE_SERVICE_KEY
{
  "data_type": "env_var_mappings",
  "record": {
    "env_var": "DEV_SUPABASE_SERVICE_KEY",
    "op_reference": "op://Private/your-item-id/field-id",
    "vault": "Private",
    "item_name": "Neotoma Supabase",
    "service": "Supabase",
    "is_optional": false
  }
}
```

**Required variables to map:**
- `DEV_SUPABASE_PROJECT_ID`
- `DEV_SUPABASE_SERVICE_KEY`
- `DEV_CONNECTOR_SECRET_KEY`
- `DEV_OPENAI_API_KEY` (or use existing `OPENAI_API_KEY` mappings)
- `DEV_PLAID_CLIENT_ID` (if using Plaid)
- `DEV_PLAID_SECRET` (if using Plaid)

### 3. Run the Sync

```bash
npm run sync:env
```

**Default**: Syncs **development** environment values (no `ENVIRONMENT` variable needed)

For production:
```bash
export ENVIRONMENT=production
npm run sync:env
```

This will:
- Create a backup of your `.env` file
- Fetch values from 1Password (based on `ENVIRONMENT`, defaults to "development")
- Update your `.env` file with single variable names (SUPABASE_PROJECT_ID, SUPABASE_SERVICE_KEY, etc.)
- Preserve any unmanaged variables

## 📚 Documentation

- **Main guide**: [README_1PASSWORD_SYNC.md](README_1PASSWORD_SYNC.md) - Complete usage documentation
- **Setup guide**: [SETUP_ENV_MAPPINGS.md](SETUP_ENV_MAPPINGS.md) - How to add mappings
- **Foundation script**: `foundation/scripts/op_sync_env_from_1password.py` - The actual sync script

## 🔧 Configuration

### Exclusions

Local development variables are automatically excluded (ports, URLs, etc.). To add more exclusions:

**Repo-wide** (edit `foundation-config.yaml`):
```yaml
tooling:
  env_management:
    onepassword_sync:
      default_exclusions:
        - YOUR_LOCAL_VAR
```

**Instance-specific** (create `foundation-config.local.yaml` - gitignored):
```yaml
tooling:
  env_management:
    onepassword_sync:
      exclusions:
        - MY_PERSONAL_VAR
```

## 🛠️ Troubleshooting

### "1Password CLI is not authenticated"
```bash
op signin
```

### "No environment variable mappings found"
- Add mappings using MCP parquet tools (see `SETUP_ENV_MAPPINGS.md`)
- Ensure `op_reference` doesn't start with `PLACEHOLDER_`

### "Failed to resolve [variable]"
- Verify the 1Password reference is correct
- Check you have access to the vault/item
- Ensure the field exists in 1Password

## 📝 Next Steps

1. **Sign in to 1Password**: `op signin`
2. **Add mappings**: See `SETUP_ENV_MAPPINGS.md` for the list of required variables
3. **Test sync**: Run `npm run sync:env` to verify everything works
4. **Regular use**: Run `npm run sync:env` whenever you need to update your `.env` from 1Password

## 💡 Tips

- Backups are automatically created in `.env.backups/` before each sync
- The script never prints secret values, only variable names
- Unmanaged variables (not in mappings) are preserved
- Placeholder mappings (starting with `PLACEHOLDER_`) are skipped until configured
