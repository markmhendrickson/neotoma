# Neotoma for OpenCode

A plugin that wires [Neotoma](https://neotoma.io) into [OpenCode](https://opencode.ai) as lifecycle hooks. Pairs with the Neotoma MCP server for agent-driven structured storage — the plugin is the reliability floor; MCP is the quality ceiling.

## What it does

| OpenCode event | Behavior |
| --- | --- |
| `session.started` | Creates a `conversation` entity for the OpenCode session. |
| `message.user` | Captures the user message and injects retrieval context via `additionalContext`. |
| `tool.called` | Logs a `tool_invocation` observation. |
| `chat.compacted` | Snapshots a `context_event` marker around compaction. |
| `message.assistant` | Persists the assistant reply as a safety net. |

No server-side LLM extraction runs here — that stays with the agent via MCP.

## Install

```bash
npm install @neotoma/opencode-plugin @neotoma/client
```

Then register it in your OpenCode plugin config, e.g. `~/.config/opencode/plugins/neotoma.ts`:

```ts
import neotoma from "@neotoma/opencode-plugin";
export default neotoma();
```

Or inline options:

```ts
import neotoma from "@neotoma/opencode-plugin";
export default neotoma({
  baseUrl: "http://127.0.0.1:3080",
  token: process.env.NEOTOMA_TOKEN,
  logLevel: "info",
  injectContext: true,
});
```

## Prerequisites

A running Neotoma server (default `http://127.0.0.1:3080`). Node 18+.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug` \| `info` \| `warn` \| `error` \| `silent`. |

## License

MIT
