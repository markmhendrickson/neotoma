# DEV_CONNECTOR_SECRET_KEY Explanation

## What is it?

`DEV_CONNECTOR_SECRET_KEY` is a cryptographic key used to encrypt and decrypt OAuth tokens stored in the database for external connectors (integrations with third-party services).

## Purpose

When Neotoma connects to external services (like Plaid, Asana, Gmail, etc.) via OAuth, it receives:
- **Access tokens** - Used to authenticate API requests
- **Refresh tokens** - Used to obtain new access tokens when they expire
- **Expiration times** - When tokens need to be refreshed

These tokens are sensitive and must be stored securely. The `DEV_CONNECTOR_SECRET_KEY` is used to encrypt these tokens before storing them in the database.

## How it works

1. **Encryption**: When OAuth tokens are received, they're encrypted using AES-256-GCM encryption with the connector secret key
2. **Storage**: The encrypted tokens (stored as a "secrets envelope") are saved in the `external_connectors` table in the database
3. **Decryption**: When tokens are needed for API calls, they're decrypted using the same key

## Requirements

- **Minimum length**: 16 characters
- **Must remain static**: The key MUST NOT change within an environment
- **Why?**: If you change the key, all existing encrypted tokens become inaccessible (you can't decrypt them anymore)

## Code Location

The encryption/decryption logic is in `src/services/connectors.ts`:
- `encryptConnectorSecrets()` - Encrypts OAuth tokens before storage
- `decryptConnectorSecrets()` - Decrypts tokens when needed
- `getConnectorSecretKey()` - Gets the key from config and validates it

## Environment Separation

- **Development**: Uses `DEV_CONNECTOR_SECRET_KEY`
- **Production**: Uses `PROD_CONNECTOR_SECRET_KEY`

This ensures that:
- Development and production use different keys (security best practice)
- Tokens encrypted in one environment can't be decrypted in another

## Security Notes

- The key is hashed (SHA-256) before use as the encryption key
- Uses AES-256-GCM encryption (authenticated encryption)
- Each encryption uses a random IV (initialization vector) for security
- The key itself should be stored securely (e.g., in 1Password, not in code)

## Example

```typescript
// When storing OAuth tokens after OAuth flow
const secrets: ConnectorSecrets = {
  accessToken: "ya29.a0AfH6...",
  refreshToken: "1//0gX...",
  expiresAt: "2024-01-15T12:00:00Z"
};

// Encrypted and stored in database
const encrypted = encryptConnectorSecrets(secrets);
// Result: {"v":1,"iv":"...","tag":"...","data":"..."}

// Later, when making API calls
const decrypted = decryptConnectorSecrets(encrypted);
// Result: { accessToken: "ya29.a0AfH6...", ... }
```

## Adding to 1Password

You should add `DEV_CONNECTOR_SECRET_KEY` to 1Password as a secure note or password field. Generate a random string that's at least 16 characters long (longer is better for security).

Example generation:
```bash
# Generate a random 32-character key
openssl rand -base64 24
```

Then add it to your 1Password sync mappings so it can be automatically synced to your `.env` file.
