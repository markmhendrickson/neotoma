# Tooling

Optional tooling for development workflow automation.

## Overview

Foundation provides configuration and guidelines for common development tools:

1. **Secrets Manager** - Encrypted secrets storage
2. **Environment Management** - Dev/prod environment separation
3. **Agent Setup** - Automated agent environment setup
4. **README Generator** - Automated README maintenance

All tools are optional and configurable via `foundation-config.yaml`.

## Secrets Manager

Encrypted file-based secrets storage for credentials.

### Configuration

```yaml
tooling:
  secrets:
    enabled: true
    storage_path: ".secrets/secrets.enc"
    key_path: ".secrets/.key"
    algorithm: "aes-256-gcm"
    master_key_env: "SECRETS_MASTER_KEY"
```

### Implementation

Implement a secrets manager in your repository:

```bash
# Store secret
node scripts/secrets-manager.js set API_KEY "value"

# Retrieve secret
node scripts/secrets-manager.js get API_KEY

# List secrets
node scripts/secrets-manager.js list
```

See `foundation/security/credential-management.md` for best practices.

## Environment Management

Handles environment file copying for git worktrees and dev/prod separation.

### Configuration

```yaml
tooling:
  env_management:
    enabled: true
    env_file_priority:
      - ".env.dev"
      - ".env"
    worktree_detection:
      cursor_worktrees: true
    environment_separation:
      enabled: true
      dev_prefix: "DEV_"
      prod_prefix: "PROD_"
      require_explicit_env: false
```

### Implementation

Implement environment handlers in your repository:

**Worktree env handler:**
```bash
# Copy .env to new worktree
node scripts/copy-env-to-worktree.js
```

**Environment separation:**
```bash
# .env with prefixed variables
DEV_DATABASE_URL=postgres://localhost:5432/db_dev
PROD_DATABASE_URL=postgres://prod:5432/db_prod

# Code reads appropriate prefix based on NODE_ENV
```

## Agent Setup

Automated infrastructure setup for cloud agents.

### Configuration

```yaml
tooling:
  agent_setup:
    enabled: true
    database:
      type: "supabase"
      migration_command: "supabase db push"
      fallback_script: "scripts/apply_migrations.js"
    tools:
      - name: "playwright"
        install_command: "npx playwright install --with-deps chromium"
```

### Implementation

Create a setup script in your repository:

```bash
#!/bin/bash
# scripts/setup-agent-environment.sh

# Load env
source .env

# Apply migrations
npm run migrate

# Install tools
npx playwright install --with-deps chromium

# Verify setup
npm test
```

See Neotoma's `scripts/setup_agent_environment.sh` for reference implementation.

## README Generator

Automated README maintenance from source documentation.

### Configuration

```yaml
tooling:
  readme_generation:
    enabled: true
    source_documents:
      - "docs/overview.md"
      - "docs/features.md"
    structure_template: "templates/readme-structure.md"
    regenerate_triggers:
      - "docs/**/*.md"
```

### Implementation

Implement a README generator in your repository:

```bash
# Generate README from docs
node scripts/generate-readme.js

# Triggered on doc changes
# - Extracts content from source docs
# - Applies template structure
# - Generates README.md
```

## Best Practices

1. **Keep tooling optional** - Not all projects need all tools
2. **Make it configurable** - Use foundation-config.yaml
3. **Document usage** - Include examples and setup instructions
4. **Test thoroughly** - Verify tools work across environments
5. **Provide fallbacks** - Handle missing dependencies gracefully

## Custom Tooling

Add custom tools specific to your project:

```yaml
tooling:
  custom_tools:
    my_tool:
      enabled: true
      config: "..."
```

Implement in your repository's `scripts/` directory.

