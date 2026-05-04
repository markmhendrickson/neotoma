# Neotoma for OpenCode

A plugin that wires [Neotoma](https://neotoma.io) into [OpenCode](https://opencode.ai) lifecycle hooks. It pairs with the Neotoma MCP server: the plugin is the reliability floor, MCP is the quality ceiling.

## What it does

| OpenCode event | Behavior |
| --- | --- |
| `event` (`session.created`, `session.compacted`, `message.updated`) | Captures session anchors, compaction markers, and best-effort message updates. |
| `tool.execute.after` | Logs a `tool_invocation` observation and captures Neotoma-relevant failures. |
| `experimental.session.compacting` | Adds the compact Neotoma turn checklist to compaction context and stores a `context_event`. |
| Legacy hook aliases | Keeps `session.started`, `message.user`, `tool.called`, `chat.compacted`, and `message.assistant` for older OpenCode builds and tests. |

No server-side LLM extraction runs here — that stays with the agent via MCP.

## Install

```bash
npm install -g neotoma
```

Start Neotoma locally:

```bash
neotoma api start --background --env dev
```

Then add the plugin package to your OpenCode config:

```json
{
  "plugin": ["@neotoma/opencode-plugin"]
}
```

OpenCode installs npm plugins automatically at startup. For local plugin files, create `~/.config/opencode/plugins/neotoma.ts`:

```ts
import neotoma from "@neotoma/opencode-plugin";

export const Neotoma = neotoma();
```

Or inline options:

```ts
import neotoma from "@neotoma/opencode-plugin";

export const Neotoma = neotoma({
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
| `NEOTOMA_HOOK_STATE_DIR` | `~/.neotoma/hook-state` | Local hook state for failure counters and turn bookkeeping. |

## License

MIT
