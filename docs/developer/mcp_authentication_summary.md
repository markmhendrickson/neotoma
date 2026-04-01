# MCP Authentication Summary

Overview of Neotoma's authentication mechanisms for MCP connections.

## Authentication Decision Tree

```
Is the request local (Host: localhost)?
├── YES → Auto-authenticated as local dev user. No token needed.
│         (Unless encryption is enabled — then key-derived token required.)
└── NO (tunnel/remote request)
    ├── Has Bearer token?
    │   ├── Matches NEOTOMA_BEARER_TOKEN? → Authenticated
    │   ├── Matches key-derived MCP token? → Authenticated (encryption mode)
    │   ├── Valid Ed25519 public key? → Authenticated
    │   └── Valid OAuth access token? → Authenticated with connection scope
    └── No Bearer token → 401 Unauthorized
        └── MCP endpoint returns WWW-Authenticate → Cursor shows Connect button
```

## Authentication Methods

### 1. Local Auto-Auth (No Token)

- **When**: Request `Host` header is `localhost` or `127.0.0.1`
- **How**: Server automatically assigns the local dev user identity
- **Config**: Default behavior when `NEOTOMA_ENCRYPTION_ENABLED` is not `true`
- **Use case**: Local development, stdio MCP transport

### 2. Bearer Token (`NEOTOMA_BEARER_TOKEN`)

- **When**: Remote/tunnel requests with `Authorization: Bearer <token>` header
- **How**: Token compared to `NEOTOMA_BEARER_TOKEN` env var
- **Config**: Set `NEOTOMA_BEARER_TOKEN=<your-secret>` in `.env`
- **Use case**: Scripts, CI/CD, simple remote access without OAuth

### 3. Key-Derived MCP Token (Encryption Mode)

- **When**: `NEOTOMA_ENCRYPTION_ENABLED=true` and request has Bearer header
- **How**: Token derived from user's Ed25519 private key; run `neotoma auth mcp-token` to get it
- **Config**: Encryption key configured via `NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC`
- **Use case**: High-security local or remote access

### 4. OAuth 2.0 + PKCE

- **When**: MCP clients like Cursor connect via HTTP using the Connect button
- **How**: Full OAuth flow with PKCE; access token returned after authorization
- **Config**: Automatic. Optional `NEOTOMA_REQUIRE_KEY_FOR_OAUTH=true` (default) adds key-auth gate.
- **Use case**: Cursor Connect, Claude Code, any MCP client using OAuth

### 5. Ed25519 Bearer Token

- **When**: Programmatic access with a registered public key
- **How**: Public key registered in the key registry; used as bearer token
- **Config**: Register via `neotoma auth register-key`
- **Use case**: Automated agents, programmatic API access

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEOTOMA_BEARER_TOKEN` | (none) | Shared bearer token for remote access |
| `NEOTOMA_ENCRYPTION_ENABLED` | `false` | Enable key-derived auth |
| `NEOTOMA_REQUIRE_KEY_FOR_OAUTH` | `true` | Require key-auth before OAuth |
| `NEOTOMA_KEY_FILE_PATH` | (none) | Path to Ed25519 private key file |
| `NEOTOMA_MNEMONIC` | (none) | BIP-39 mnemonic alternative to key file |

## Related Documents

- [auth.md](../subsystems/auth.md) — Full authentication architecture
- [mcp_oauth_implementation.md](mcp_oauth_implementation.md) — OAuth flow details
- [mcp_cursor_setup.md](mcp_cursor_setup.md) — Cursor setup guide
- [tunnels.md](tunnels.md) — Tunnel security
