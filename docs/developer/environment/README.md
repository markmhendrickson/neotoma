# Environment Variable Management

This directory contains documentation for managing environment variables in the Neotoma project, including 1Password integration and configuration strategies.

## Quick Start

- **[Quick Start Guide](QUICK_START_1PASSWORD.md)** - Get started with 1Password sync in 3 steps
- **[Main Documentation](README_1PASSWORD_SYNC.md)** - Complete usage guide for 1Password sync
- **[Setup Environment Mappings](SETUP_ENV_MAPPINGS.md)** - How to add mappings for your environment variables

## Feature Documentation

- **[Inclusion List Feature](INCLUSION_LIST_FEATURE.md)** - How to use inclusion lists (whitelist)
- **[Inclusion vs Exclusion Lists](INCLUSION_VS_EXCLUSION.md)** - Understanding the difference
- **[Environment Variable Naming Strategy](ENV_VAR_NAMING_STRATEGY.md)** - DEV_/PROD_ prefixes vs environment-based selection

## Reference

- **[Environment Mappings Status](ENV_MAPPINGS_STATUS.md)** - Current status of required variables
- **[CONNECTOR_SECRET_KEY Setup](CONNECTOR_SECRET_KEY_SETUP.md)** - How to generate the connector secret key locally
- **[DEV_CONNECTOR_SECRET_KEY Explanation](DEV_CONNECTOR_SECRET_KEY_EXPLANATION.md)** - What this key is for and why it's needed

## Related Documentation

- **Configuration**: `foundation-config.yaml` - Main configuration file
- **Scripts**: `scripts/sync-env-from-1password.sh` - Sync wrapper script
- **Foundation Script**: `foundation/scripts/op_sync_env_from_1password.py` - The actual sync script
