# Secrets Manager Setup

This project uses an encrypted file-based secrets manager for storing sensitive credentials.

## Setup

### 1. Initialize Secrets Storage

The first time you run a secrets command, a new encryption key will be generated:

```bash
node scripts/secrets_manager.js list
```

This creates:
- `.secrets/.key` - Encryption key (DO NOT COMMIT)
- `.secrets/secrets.enc` - Encrypted secrets file (DO NOT COMMIT)

**Important:** The `.secrets/` directory is in `.gitignore` and should never be committed.

### 2. Store Secrets

Store credentials for cloud agents:

```bash
# Supabase credentials
node scripts/secrets_manager.js set DEV_SUPABASE_URL "https://your-project.supabase.co"
node scripts/secrets_manager.js set DEV_SUPABASE_SERVICE_KEY "your-service-role-key"

# Or use generic names
node scripts/secrets_manager.js set SUPABASE_URL "https://your-project.supabase.co"
node scripts/secrets_manager.js set SUPABASE_SERVICE_KEY "your-service-role-key"

# OpenAI API key
node scripts/secrets_manager.js set OPENAI_API_KEY "sk-your-key"
```

### 3. Retrieve Secrets

For use in scripts or agent instructions:

```bash
# Get a single secret
node scripts/secrets_manager.js get SUPABASE_URL

# List all stored keys
node scripts/secrets_manager.js list

# Export all secrets as key=value pairs (for agent use)
node scripts/get_secrets_for_agents.js
```

### 4. Use with Orchestrator

The orchestrator can retrieve secrets and pass them to agents:

```bash
# In orchestrator script, use:
const { execSync } = require('child_process');
const encodedSecrets = execSync('node scripts/get_secrets_for_agents.js', { encoding: 'utf-8' }).trim();
```

## Security

### Encryption Key Management

**Local Development:**
- Encryption key is stored in `.secrets/.key`
- Keep this file secure (chmod 600)
- Never commit it to git

**CI/CD / Cloud Agents:**
- Set `NEOTOMA_SECRETS_MASTER_KEY` environment variable
- Value should be the hex-encoded encryption key
- Store this securely in your CI/CD system's secrets manager

**Key Rotation:**
1. Export all secrets: `node scripts/secrets_manager.js export > secrets_backup.txt`
2. Delete `.secrets/` directory
3. Re-run setup to generate new key
4. Re-import secrets from backup
5. Update `NEOTOMA_SECRETS_MASTER_KEY` in CI/CD

### Best Practices

1. **Use dedicated test credentials** - Never use production credentials
2. **Rotate keys regularly** - Monthly rotation recommended
3. **Limit access** - Only give access to `.secrets/` to authorized users
4. **Monitor usage** - Check Supabase dashboard for unusual activity
5. **Never commit secrets** - Always verify `.secrets/` is in `.gitignore`

## Integration with Release Orchestrator

The orchestrator will automatically use the secrets manager if available:

1. Check if secrets exist: `node scripts/secrets_manager.js list`
2. Retrieve encoded secrets: `node scripts/get_secrets_for_agents.js`
3. Include in agent instructions (base64-encoded)

This provides better security than plain base64 encoding in conversation text, as:
- Secrets are encrypted at rest
- Access requires the encryption key
- No secrets in conversation history (only encrypted references)

## Migration from Base64 Approach

To migrate existing credentials to the secrets manager:

```bash
# Export current credentials from .env
source .env
node scripts/secrets_manager.js set SUPABASE_URL "$SUPABASE_URL"
node scripts/secrets_manager.js set SUPABASE_SERVICE_KEY "$SUPABASE_SERVICE_KEY"
# ... repeat for other credentials
```

Then update the orchestrator to use `get_secrets_for_agents.js` instead of reading from `.env` directly.




