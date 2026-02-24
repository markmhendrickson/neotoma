# Environment Variable Naming Strategy: Prefixes vs Environment-Based Selection

## The Question

Should we use:
- **Current**: `DEV_CONNECTOR_SECRET_KEY` and `PROD_CONNECTOR_SECRET_KEY` (different variable names)
- **Proposed**: `CONNECTOR_SECRET_KEY` (same variable name, different values per environment)

## Current State

### Foundation Script Support
✅ **The foundation script already supports environment-based selection!**

The `OPENAI_API_KEY` mapping demonstrates this:
- Same variable name: `OPENAI_API_KEY`
- Different 1Password references based on `ENVIRONMENT` variable
- Uses `environment_based: true` and `environment_key: "development"` or `"production"`

### Codebase Current Approach
The codebase currently uses DEV_/PROD_ prefixes for some credentials:
- `DEV_CONNECTOR_SECRET_KEY` / `PROD_CONNECTOR_SECRET_KEY`
- `DEV_OPENAI_API_KEY` / `PROD_OPENAI_API_KEY` (with fallback to `OPENAI_API_KEY`)

**Rationale in code comments**: "to prevent accidental dev/prod mixups"

## Comparison

### Approach 1: DEV_/PROD_ Prefixes (Current)

**Pros:**
- ✅ **Explicit safety**: Can't accidentally use wrong environment's credentials
- ✅ **Can have both in same .env**: Useful for testing/debugging
- ✅ **Clear intent**: Variable name shows which environment it's for
- ✅ **Prevents mistakes**: Harder to accidentally mix dev/prod
- ✅ **Works without ENVIRONMENT variable**: No dependency on runtime env detection

**Cons:**
- ❌ More verbose code (environment checks)
- ❌ More variables to manage
- ❌ More mappings in parquet file
- ❌ Code must check environment and select variable

### Approach 2: Single Variable Name (Proposed)

**Pros:**
- ✅ Simpler code (no environment checks needed)
- ✅ Standard practice in many systems (12-factor app)
- ✅ Less variables to manage
- ✅ Foundation script already supports this via `environment_based`
- ✅ Environment selection happens at sync time, not runtime

**Cons:**
- ❌ **Risk of wrong value**: If `ENVIRONMENT` is wrong, you get wrong credentials
- ❌ Can't have both dev and prod in same `.env` file
- ❌ Less explicit (variable name doesn't show environment)
- ❌ Requires `ENVIRONMENT` variable to be set correctly
- ❌ If you sync with wrong `ENVIRONMENT`, you get wrong values

## Recommendation

### Hybrid Approach (Best of Both Worlds)

Use **single variable names** for most cases, but keep **explicit prefixes** for critical credentials where safety is paramount.

**Use single names for:**
- `OPENAI_API_KEY` ✅ (already done)
- `PLAID_CLIENT_ID` / `PLAID_SECRET` (if using Plaid)

**Keep prefixes for:**
- `DEV_CONNECTOR_SECRET_KEY` / `PROD_CONNECTOR_SECRET_KEY` ⚠️ (critical, encrypts tokens)

**Why?**
- Connector secrets are **high-risk** if wrong
- Mixing dev/prod for these could cause data corruption or security issues
- The explicit prefix provides an extra safety layer
- Less critical variables (like API keys) can use environment-based selection

## Migration Path

If you want to migrate to single variable names:

### Step 1: Update Parquet Mappings
Use `environment_based: true` with same `env_var` name:

```json
{
  "env_var": "CONNECTOR_SECRET_KEY",
  "op_reference": "op://Private/connector-item/dev-key",
  "environment_based": true,
  "environment_key": "development"
}
```

### Step 2: Update Code
Simplify `src/config.ts` to use single variable names where applicable.

### Step 3: Set ENVIRONMENT Variable
Ensure `ENVIRONMENT=development` or `ENVIRONMENT=production` is set when syncing.

## Current Recommendation for Neotoma

**Keep the DEV_/PROD_ prefixes** for now because:

1. **Safety first**: The explicit prefixes prevent accidental credential mixing
2. **Already implemented**: The codebase is built around this pattern
3. **Works without ENVIRONMENT**: No dependency on `ENVIRONMENT` variable being set
4. **Clear intent**: Variable names make it obvious which environment they're for
5. **Can test both**: Can have dev and prod values in same `.env` for testing

**Exception**: `OPENAI_API_KEY` already uses environment-based selection, which is fine since it's less critical than database credentials.

## If You Do Migrate

If you decide to migrate to single variable names:

1. ✅ Use `environment_based: true` in parquet mappings
2. ✅ Set `ENVIRONMENT` variable before syncing
3. ✅ Update code to use single variable names
4. ✅ Update documentation
5. ⚠️ Be extra careful about `ENVIRONMENT` variable value
6. ⚠️ Consider keeping prefixes for critical credentials (Connector)

## Foundation Script Behavior

The foundation script checks `ENVIRONMENT` variable (defaults to "development"):

```python
current_env = os.getenv("ENVIRONMENT", "development").lower()

if record.get("environment_based", False):
    env_key = str(record.get("environment_key", "")).lower()
    if env_key != current_env:
        continue  # Skip this mapping
```

So if you set `ENVIRONMENT=production` before running `npm run sync:env`, it will select production values.

## Conclusion

**For Neotoma**: Keep DEV_/PROD_ prefixes for critical credentials (Connector) for safety. Use single variable names for less critical ones (OpenAI API key) where the foundation script already supports it.

This gives you:
- Safety for critical credentials
- Simplicity for less critical ones
- Best of both worlds
