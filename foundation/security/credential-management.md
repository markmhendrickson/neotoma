# Credential Management

## Purpose

Define secure practices for storing, accessing, and managing credentials and sensitive data.

## Principles

1. **Never commit credentials to version control**
2. **Use environment-specific variables** (DEV_*, PROD_*)
3. **Store secrets securely** (encrypted at rest, access controlled)
4. **Rotate credentials regularly** (monthly or after exposure)
5. **Use least privilege** (minimum required access)

## Environment Variable Management

### Standard Approach

Use `.env` files for local development (NEVER commit):

```bash
# .env (add to .gitignore)
DATABASE_URL=postgres://localhost:5432/mydb
API_KEY=your_api_key_here
SECRET_KEY=your_secret_key_here
```

Add to `.gitignore`:

```
.env
.env.*
!.env.example
```

Provide `.env.example` template:

```bash
# .env.example (safe to commit)
DATABASE_URL=postgres://localhost:5432/database_name
API_KEY=your_api_key_here
SECRET_KEY=your_secret_key_here
```

### Environment Separation (Optional)

For projects requiring strict dev/prod separation:

```bash
# .env
# Use prefixed variables to prevent dev/prod mixups

# Development
DEV_DATABASE_URL=postgres://localhost:5432/mydb_dev
DEV_API_KEY=dev_api_key_here

# Production (typically set in deployment environment)
# PROD_DATABASE_URL=postgres://prod-host:5432/mydb_prod
# PROD_API_KEY=prod_api_key_here
```

Configuration in `foundation-config.yaml`:

```yaml
security:
  credential_management:
    enabled: true
    require_env_separation: true  # Require DEV_*/PROD_* prefixes
```

## Secrets Manager (Optional)

For enhanced security, use encrypted secrets storage.

### Setup

1. **Initialize secrets storage:**

```bash
node scripts/secrets-manager.js init
```

Creates:

- `.secrets/.key` - Encryption key (DO NOT COMMIT)
- `.secrets/secrets.enc` - Encrypted secrets file (DO NOT COMMIT)

2. **Store secrets:**

```bash
node scripts/secrets-manager.js set API_KEY "your-api-key"
node scripts/secrets-manager.js set DATABASE_URL "postgres://..."
```

3. **Retrieve secrets:**

```bash
# Get a single secret
node scripts/secrets-manager.js get API_KEY

# List all stored keys
node scripts/secrets-manager.js list

# Export all secrets as environment variables
eval $(node scripts/secrets-manager.js export)
```

### Key Management

**Local Development:**

- Encryption key stored in `.secrets/.key`
- Keep secure (chmod 600)
- Never commit to git

**CI/CD / Production:**

- Set `SECRETS_MASTER_KEY` environment variable
- Value should be the hex-encoded encryption key
- Store securely in CI/CD system's secrets manager

**Key Rotation:**

1. Export all secrets: `node scripts/secrets-manager.js export > backup.txt`
2. Delete `.secrets/` directory
3. Re-run setup to generate new key
4. Re-import secrets from backup
5. Update `SECRETS_MASTER_KEY` in CI/CD

## Best Practices

### 1. Development Credentials

- **Use dedicated test credentials** - Never use production credentials
- **Rotate regularly** - Monthly rotation recommended for sensitive services
- **Limit access** - Only give access to authorized developers
- **Monitor usage** - Check service dashboards for unusual activity

### 2. Production Credentials

- **Use CI/CD secrets management** - GitHub Secrets, GitLab CI/CD variables, etc.
- **Never log credentials** - Sanitize logs to prevent credential exposure
- **Use short-lived tokens** - Where possible, use tokens that expire
- **Implement RBAC** - Role-based access control for team access

### 3. Credential Exposure Response

If credentials are accidentally exposed:

1. **Rotate immediately** - Generate new credentials
2. **Revoke old credentials** - Invalidate exposed credentials
3. **Audit access logs** - Check for unauthorized access
4. **Update all consumers** - Update services using the credentials
5. **Document incident** - Record exposure and response for future reference

## Configuration

Configure credential management in `foundation-config.yaml`:

```yaml
security:
  credential_management:
    enabled: true
    require_env_separation: false  # whether to require DEV_*/PROD_* prefixes
    secrets_manager:
      enabled: false
      storage_path: ".secrets/secrets.enc"
      key_path: ".secrets/.key"
      algorithm: "aes-256-gcm"
      master_key_env: "SECRETS_MASTER_KEY"

tooling:
  env_management:
    enabled: true
    env_file_priority:
      - ".env.dev"
      - ".env"
      - ".env.development"
    environment_separation:
      enabled: false
      dev_prefix: "DEV_"
      prod_prefix: "PROD_"
      require_explicit_env: false  # whether to prevent generic variables
```

## Common Patterns to Avoid

❌ **Don't:**

- Commit `.env` files to git
- Hard-code credentials in source code
- Use same credentials for dev and prod
- Share credentials via email or chat
- Store credentials in plain text files
- Use weak or default passwords

✅ **Do:**

- Use `.env` files locally (gitignored)
- Use environment variables or secrets manager
- Use separate credentials for each environment
- Share credentials via secure secrets management
- Encrypt credentials at rest
- Use strong, unique passwords/keys

## Integration with CI/CD

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          API_KEY: ${{ secrets.API_KEY }}
        run: |
          npm run deploy
```

### GitLab CI

```yaml
# .gitlab-ci.yml
deploy:
  script:
    - npm run deploy
  variables:
    DATABASE_URL: $CI_DATABASE_URL
    API_KEY: $CI_API_KEY
```

### Other CI/CD

Consult your CI/CD platform's documentation for secrets management.

## Compliance

Ensure credential management practices comply with:

- GDPR (for EU user data)
- SOC 2 (for enterprise customers)
- PCI DSS (for payment processing)
- Industry-specific regulations

## References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [12-Factor App: Config](https://12factor.net/config)

