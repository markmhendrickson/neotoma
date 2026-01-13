# Inclusion List vs Exclusion List

## Quick Answer

**You may not need exclusions if you have a strict inclusion list**, but they serve different purposes and can work together.

## How They Work

### Inclusion List (Whitelist)
- **When**: Applied BEFORE syncing from 1Password
- **Purpose**: Filters which variables from 1Password mappings get synced
- **Effect**: Only variables in the inclusion list are synced from 1Password

### Exclusion List (Blacklist)
- **When**: Applied DURING preservation of existing `.env` variables
- **Purpose**: Prevents certain variables from being preserved in the final `.env` file
- **Effect**: Variables in exclusion list are removed/not preserved, even if they exist in your current `.env`

## The Flow

1. **Load 1Password mappings** from parquet
2. **Apply inclusion list** → Filter to only variables in inclusion list
3. **Parse existing `.env` file**
4. **Identify unmanaged variables** (variables in `.env` but not in filtered mappings)
5. **Apply exclusion list** → Remove excluded variables from unmanaged vars
6. **Write final `.env`** with:
   - Synced variables from 1Password (inclusion list)
   - Preserved unmanaged variables (not in exclusion list)

## When You Need Exclusions

### Scenario 1: Clean Up Old Variables
You have a strict inclusion list, but your `.env` has old variables you want to remove:

```yaml
inclusions:
  - DEV_SUPABASE_SERVICE_KEY
  - OPENAI_API_KEY

exclusions:
  - OLD_API_KEY  # Remove this from .env
  - DEPRECATED_TOKEN  # Remove this too
```

**Without exclusions**: `OLD_API_KEY` would be preserved as "unmanaged"
**With exclusions**: `OLD_API_KEY` is removed from `.env`

### Scenario 2: Local Development Variables
You want to keep some local variables but not others:

```yaml
inclusions:
  - DEV_SUPABASE_SERVICE_KEY

exclusions:
  - PORT  # Don't preserve this
  - HTTP_PORT  # Don't preserve this
  # But keep other local vars like DATA_DIR
```

## When You DON'T Need Exclusions

If you're happy to keep all existing variables in your `.env` that aren't in the inclusion list, you don't need exclusions.

**Example:**
- Inclusion list: `[DEV_SUPABASE_SERVICE_KEY, OPENAI_API_KEY]`
- Your `.env` has: `DEV_SUPABASE_SERVICE_KEY=old`, `LOCAL_PORT=3000`, `DATA_DIR=/path`
- Result: `DEV_SUPABASE_SERVICE_KEY` gets synced, `LOCAL_PORT` and `DATA_DIR` are preserved

## Current Neotoma Configuration

Looking at your `foundation-config.yaml`:

```yaml
expected_variables:  # Acts as inclusion list
  required: [...]
  recommended: [...]

default_exclusions:  # Local dev variables
  - PORT
  - HTTP_PORT
  - ...
```

**Why both?**
- **Inclusion list**: Only sync Neotoma-specific secrets from 1Password
- **Exclusions**: Don't preserve local dev config (ports, etc.) - these should be set fresh or come from env.example

This makes sense because:
1. You only want Neotoma secrets from 1Password (inclusion)
2. You don't want to preserve local dev config that might be outdated (exclusion)

## Recommendation

For Neotoma, **keep both** because:
- **Inclusion list**: Ensures only Neotoma variables are synced (security/clarity)
- **Exclusions**: Keeps `.env` clean by not preserving local dev config

However, you could simplify by:
- Removing exclusions for variables that are already not in your inclusion list (they won't be synced anyway)
- Keeping exclusions only for variables you want to actively remove from `.env`

## Summary

| Situation | Need Exclusions? |
|-----------|------------------|
| Strict inclusion list + want to keep all other vars | ❌ No |
| Strict inclusion list + want to remove some vars | ✅ Yes |
| Want to clean up local dev config | ✅ Yes |
| Happy with preserving everything else | ❌ No |

For Neotoma: **Keep exclusions** for local dev variables (PORT, HTTP_PORT, etc.) to keep `.env` clean, even though they're not in the inclusion list.
