# Parquet Mappings Added

## ✅ Mappings Created

### SUPABASE_PROJECT_ID
- ✅ Development: `op://Private/Supabase/add more/kcxd34yc5l62cpbw7erntlvgde`
- ✅ Production: `op://Private/Supabase/add more/4mjiphwyrexwjh7qvdi3lygo3a`

### SUPABASE_SERVICE_KEY
- ✅ Development: `op://Private/Supabase/add more/j6aegoxuwjx4pd2qlvldlaruxy`
- ✅ Production: `op://Private/Supabase/add more/3mgyiaeyy3b4nufmllmryzftgu`

### CONNECTOR_SECRET_KEY
- ✅ **Generated locally** - Not synced from 1Password
- Run `npm run generate:connector-key` to generate it
- See [CONNECTOR_SECRET_KEY Setup](CONNECTOR_SECRET_KEY_SETUP.md) for details

## Testing the Sync

Once all mappings are configured:

```bash
# For development (default - no ENVIRONMENT variable needed)
npm run sync:env

# For production (must set ENVIRONMENT)
export ENVIRONMENT=production
npm run sync:env
```

**Note**: The `ENVIRONMENT` variable defaults to `"development"` if not set, so development sync works without any setup.

This will populate:
- `SUPABASE_PROJECT_ID`
- `SUPABASE_SERVICE_KEY`

For `CONNECTOR_SECRET_KEY`, generate it locally:
```bash
npm run generate:connector-key
```

## Current Status

- ✅ SUPABASE_PROJECT_ID: Ready to use (synced from 1Password)
- ✅ SUPABASE_SERVICE_KEY: Ready to use (synced from 1Password)
- ✅ CONNECTOR_SECRET_KEY: Generate locally with `npm run generate:connector-key`
