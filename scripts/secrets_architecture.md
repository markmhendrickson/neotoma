# Secrets Manager Architecture

## Current Architecture (Recommended)

**Flow:**
1. Orchestrator reads encrypted secrets file (`.secrets/secrets.enc`)
2. Orchestrator uses encryption key (`.secrets/.key` or `NEOTOMA_SECRETS_MASTER_KEY`) to decrypt
3. Orchestrator base64-encodes **already-decrypted** credentials for transmission
4. Agents receive base64-encoded credentials in instructions
5. Agents decode base64 and use credentials directly

**Security Benefits:**
- ✅ Encryption key never leaves orchestrator
- ✅ Secrets encrypted at rest until orchestrator decrypts
- ✅ Agents only see decrypted credentials (base64 is just encoding, not encryption)
- ✅ No key management needed for agents

**How it works:**
```
[Secrets Manager] → [Orchestrator (decrypts)] → [Base64 encode] → [Agent Instructions] → [Agent (decodes)]
     (encrypted)          (has key)              (safe transport)      (base64 string)       (plaintext)
```

## Alternative: Agent-Side Decryption (Not Recommended)

If you wanted agents to decrypt secrets themselves, you would need to:

1. Pass the encryption key to agents (defeats security purpose)
2. Pass encrypted secrets file to agents
3. Agents decrypt using the key

**Why this is worse:**
- ❌ Encryption key must be passed to agents (security risk)
- ❌ Key appears in conversation history
- ❌ More complex for agents (must handle decryption)
- ❌ No real security benefit

## Implementation Details

### Orchestrator Side (Has Encryption Key)

```javascript
// In release_orchestrator.js
function loadCredentials() {
  // Decrypts secrets using key from .secrets/.key or NEOTOMA_SECRETS_MASTER_KEY
  const creds = loadCredentialsFromSecretsManager();
  
  // Base64 encode already-decrypted credentials
  return Buffer.from(creds.join("\n")).toString("base64");
}
```

### Agent Side (No Encryption Key Needed)

```bash
# Agent receives base64-encoded string in instructions
# Agent decodes (not decrypts - it's already decrypted):
echo "<base64_string>" | base64 -d > .env.agent
export $(cat .env.agent | xargs)
```

## Key Management

**Local Development:**
- Key stored in `.secrets/.key` (chmod 600)
- Orchestrator reads key automatically
- Key never committed to git

**CI/CD / Production:**
- Set `NEOTOMA_SECRETS_MASTER_KEY` environment variable
- Value is hex-encoded encryption key
- Store securely in CI/CD secrets manager

**Key Location Priority:**
1. `NEOTOMA_SECRETS_MASTER_KEY` environment variable (preferred for CI/CD)
2. `.secrets/.key` file (fallback for local development)

## Security Notes

1. **Base64 is not encryption** - It's encoding for safe text transmission
2. **Decryption happens at orchestrator** - Agents only decode base64
3. **Key never shared with agents** - Only orchestrator has decryption key
4. **Secrets encrypted at rest** - `.secrets/secrets.enc` is encrypted
5. **Use dedicated test credentials** - Separate from production keys

## Summary

**Agents do NOT need the decryption key** because:
- Orchestrator decrypts secrets before sending to agents
- Agents only receive already-decrypted credentials (base64-encoded for safe text transmission)
- This is more secure than giving agents the encryption key




