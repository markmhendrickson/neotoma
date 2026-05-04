# Neotoma + OpenCode (plugin)

## Install

For the npm plugin path, add the package to `opencode.json`:

```json
{
  "plugin": ["@neotoma/opencode-plugin"]
}
```

OpenCode installs npm plugins with Bun at startup.

For a local plugin file:

```bash
npm install @neotoma/opencode-plugin @neotoma/client
```

Register in your OpenCode plugin config, e.g. `~/.config/opencode/plugins/neotoma.ts`:

```ts
import neotoma from "@neotoma/opencode-plugin";

export const Neotoma = neotoma();
```

## Events handled

| OpenCode event | Behavior |
| --- | --- |
| `event` (`session.created`, `session.compacted`, `message.updated`) | Session anchor, compaction marker, and best-effort message capture. |
| `tool.execute.after` | `tool_invocation` observation, OR `tool_invocation_failure` capture when the call errored on a Neotoma-relevant tool. |
| `experimental.session.compacting` | Adds the compact Neotoma turn checklist to the compaction context and stores a `context_event`. |
| Legacy aliases | `session.started`, `message.user`, `experimental.chat.system.transform`, `tool.called`, `chat.compacted`, and `message.assistant` remain for older OpenCode builds and direct tests. |

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
