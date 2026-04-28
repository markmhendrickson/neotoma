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
| `session.started` | Create `conversation` entity, initialise turn state, optionally inject the compact reminder for small models. |
| `message.user` | User message capture + retrieval injection. |
| `experimental.chat.system.transform` | System-message system-prompt transform; optional small-model reminder injection. |
| `tool.called` | `tool_invocation` observation, OR `tool_invocation_failure` capture when the call errored on a Neotoma-relevant tool. |
| `chat.compacted` | `context_event` marker. |
| `message.assistant` | Assistant message safety net + compliance backfill. |

Every hook above also accretes onto a single `conversation_turn` keyed by `(session_id, turn_id)` (idempotency key `conversation-{sessionId}-{turnId}-turn`). The legacy `turn_compliance` entity remains as a registered alias so historical rows continue to surface under `/turns`. See [`docs/subsystems/conversation_turn.md`](../../subsystems/conversation_turn.md).

## Options

```ts
neotoma({
  baseUrl: "http://127.0.0.1:3080",
  token: process.env.NEOTOMA_TOKEN,
  logLevel: "info",
  injectContext: true,
});
```

## Failure-signal accumulator

Storage-only on this harness: `tool.called` records `tool_invocation_failure` entities for Neotoma-relevant errors and bumps the per-`(tool, error_class)` counter under `NEOTOMA_HOOK_STATE_DIR`. OpenCode does not surface an `additional_context` channel into the agent prompt that this plugin uses for hint injection, so the one-shot `Neotoma hook note: …` line is not delivered through the OpenCode harness; the structured signal is still captured and observable in the timeline / `submit_feedback` triage. The hook NEVER calls `submit_feedback` itself.

## Coexistence with MCP

OpenCode's MCP support continues to work — the plugin does not conflict. Structured writes stay with the agent via MCP; the plugin guarantees baseline capture.
