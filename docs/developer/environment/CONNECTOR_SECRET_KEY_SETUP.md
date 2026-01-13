# CONNECTOR_SECRET_KEY Setup

## Overview

`CONNECTOR_SECRET_KEY` is a cryptographic key used to encrypt OAuth tokens for external connectors. Unlike other credentials (Supabase, OpenAI), this key is **generated locally** for each environment rather than synced from 1Password.

## Why Generate Locally?

1. **Repo-specific**: Each repository/environment should have its own unique key
2. **No external source**: It's not a credential from an external service
3. **One-time generation**: Generate once, keep forever (changing it breaks existing encrypted data)
4. **Local storage**: Stored in `.env` (gitignored), not in 1Password

## Quick Setup

### Generate the Key

```bash
npm run generate:connector-key
```

This will:
- Generate a secure random 32-character key
- Add it to your `.env` file
- Skip if the key already exists

### Manual Generation

If you prefer to generate manually:

```bash
# Generate a random key
openssl rand -base64 24

# Or using Python
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

Then add to your `.env`:
```bash
CONNECTOR_SECRET_KEY="<generated-key-here>"
```

## Requirements

- **Minimum length**: 16 characters (32+ recommended)
- **Must remain static**: Never change this key once set
- **Why?**: Changing it makes all existing encrypted OAuth tokens inaccessible

## Environment Separation

For different environments (dev/prod), you can:

1. **Same key for both** (simpler, less secure):
   - Use the same `CONNECTOR_SECRET_KEY` in both environments
   - Works if you don't need strict separation

2. **Different keys** (recommended):
   - Development: Generate locally, store in `.env`
   - Production: Generate separately, store in production `.env` or deployment config
   - The code uses `CONNECTOR_SECRET_KEY` for both, but you set different values per environment

## Exclusion from 1Password Sync

`CONNECTOR_SECRET_KEY` is excluded from 1Password sync in `foundation-config.yaml` because:
- It's generated locally, not stored in 1Password
- Each repo/environment should have its own key
- It's not a shared credential

## Security Notes

- ✅ Key is stored in `.env` (gitignored)
- ✅ Key is hashed (SHA-256) before use
- ✅ Uses AES-256-GCM encryption
- ⚠️ Never commit `.env` to git
- ⚠️ Never change the key once OAuth tokens are encrypted with it

## Troubleshooting

### "CONNECTOR_SECRET_KEY must be defined"
- Run `npm run generate:connector-key` to generate it
- Or manually add it to `.env`

### "Key must be at least 16 characters"
- Ensure the generated key is at least 16 characters
- The script generates 32-character keys by default

### "Can't decrypt existing tokens"
- You may have changed the key
- You need the original key to decrypt existing tokens
- If lost, you'll need to re-authenticate all connectors

## See Also

- [DEV_CONNECTOR_SECRET_KEY Explanation](DEV_CONNECTOR_SECRET_KEY_EXPLANATION.md) - What the key does
- [Environment Variable Management](../environment/README.md) - General env var docs
