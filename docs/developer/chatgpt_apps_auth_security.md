---
title: ChatGPT Apps Auth and Security Notes
summary: "This document captures Neotoma's auth/security expectations for ChatGPT Apps connector deployments."
---

# ChatGPT Apps Auth and Security Notes

This document captures Neotoma's auth/security expectations for ChatGPT Apps connector deployments.

## OAuth Endpoints

Neotoma exposes OAuth and protected-resource metadata for MCP clients:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/mcp/oauth/authorize`
- `/mcp/oauth/token`
- `/mcp/oauth/register` (dynamic client registration)

## Required Behaviors

- Unauthenticated calls to `/mcp` must return `401` with a `WWW-Authenticate` header.
- Invalid connection IDs must return `invalid_token` so clients can trigger reconnect flows.
- OAuth token exchange must reject malformed requests with explicit error codes.
- Sensitive values (`Authorization`, tokens, client secrets) must be redacted in logs.

## Verification Commands

```bash
# OAuth metadata
curl -i "https://<host>/.well-known/oauth-authorization-server"
curl -i "https://<host>/.well-known/oauth-protected-resource"

# MCP unauthenticated should challenge
curl -i "https://<host>/mcp"

# Optional: dynamic registration endpoint behavior
curl -i -X POST "https://<host>/mcp/oauth/register" -H "Content-Type: application/json" -d '{}'
```

## Privacy and Data Minimization

- Return only required fields for each tool call.
- Prefer bounded pagination over broad unfiltered payloads.
- Avoid exposing raw secrets, credentials, or internal auth material in tool outputs.

## Regression Focus

- OAuth reconnect path after expired token.
- `WWW-Authenticate` header presence on every auth challenge path.
- Write action confirmations and authorization behavior in ChatGPT Developer Mode.
