# Neotoma for Cursor

Hooks that integrate [Neotoma](https://neotoma.io) into Cursor. Pairs with the Neotoma MCP server for agent-driven structured storage — the hooks are the "reliability floor" (capture, retrieval injection, safety net) and MCP is the "quality ceiling" (agent-driven, schema-typed writes).

## What it does

| Cursor hook | Purpose |
| --- | --- |
| `beforeSubmitPrompt` | Injects retrieval context (`@identifier` matches + recent timeline) and captures the user message. |
| `postToolUse` | Logs a `tool_invocation` observation for each tool call — passive observability. |
| `stop` | Persists the assistant's final reply as a safety net. |

No LLM-based extraction runs in the hook layer — that stays with the agent via MCP.

## Install

```bash
# From the project where you want Cursor to use Neotoma
npm install --save-dev @neotoma/cursor-hooks @neotoma/client
npx @neotoma/cursor-hooks install
```

This writes Neotoma entries into `.cursor/hooks.json` in the current directory, merging with anything already there. To remove:

```bash
npx @neotoma/cursor-hooks --uninstall
```

## Prerequisites

1. A running Neotoma server (default `http://127.0.0.1:3080`). See the main Neotoma install guide.
2. Node 18+.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | Neotoma API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug` \| `info` \| `warn` \| `error` \| `silent`. |

All hooks are best-effort — any failure is logged to stderr and the agent continues.

## Build

```bash
npm install
npm run build
```

Emits compiled hooks to `dist/`. The installer points Cursor at those files.

## License

MIT
