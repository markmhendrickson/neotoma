# Unauthenticated-state instructions

## Scope

Text the MCP server returns when the client is not authenticated. The server loads this file at runtime and uses it in the Initialize response (instructions and serverInfo.description).

## Purpose

Single source for unauthenticated messaging so copy can be changed without editing `src/server.ts`.

## Instructions (short line shown to user)

The following block is returned as `instructions` in the Initialize response when auth is required.

```
Authentication needed or expired. Use the Connect button to sign in.
```

## Server info description (longer text for serverInfo.description)

The following block is returned as `serverInfo.description` when auth is required.

```
Authentication needed or expired. If you have an X-Connection-Id configured, it may be invalid or expired. Use the Connect button to sign in again and access tools.
```

## Related documents

- `docs/developer/mcp/instructions.md` — Authenticated-state instructions
- `src/server.ts` — Loads this file in unauthenticated Initialize branch
