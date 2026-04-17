# Neotoma + OpenCode (plugin)

## Install

```bash
npm install @neotoma/opencode-plugin @neotoma/client
```

Register in your OpenCode plugin config, e.g. `~/.config/opencode/plugins/neotoma.ts`:

```ts
import neotoma from "@neotoma/opencode-plugin";
export default neotoma();
```

## Events handled

| OpenCode event | Behavior |
| --- | --- |
| `session.started` | Create `conversation` entity. |
| `message.user` | User message capture + retrieval injection. |
| `tool.called` | `tool_invocation` observation. |
| `chat.compacted` | `context_event` marker. |
| `message.assistant` | Assistant message safety net. |

## Options

```ts
neotoma({
  baseUrl: "http://127.0.0.1:3080",
  token: process.env.NEOTOMA_TOKEN,
  logLevel: "info",
  injectContext: true,
});
```

## Coexistence with MCP

OpenCode's MCP support continues to work — the plugin does not conflict. Structured writes stay with the agent via MCP; the plugin guarantees baseline capture.
