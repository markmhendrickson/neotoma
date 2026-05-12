# Neotoma + Claude Agent SDK (reference adapter)

`@neotoma/claude-agent-sdk-adapter` returns ready-to-mount hook callbacks for agents built on the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk).

## Install

```bash
npm install \
  @neotoma/claude-agent-sdk-adapter \
  @neotoma/client \
  @anthropic-ai/claude-agent-sdk
```

## Usage

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createNeotomaAgentHooks } from "@neotoma/claude-agent-sdk-adapter";

const hooks = createNeotomaAgentHooks({ logLevel: "info" });

const result = query({
  prompt: "summarize @acme-corp",
  options: {
    hooks: {
      UserPromptSubmit: [{ matcher: "*", hooks: [hooks.UserPromptSubmit] }],
      PostToolUse: [{ matcher: "*", hooks: [hooks.PostToolUse] }],
      PreCompact: [{ matcher: "*", hooks: [hooks.PreCompact] }],
      Stop: [{ matcher: "*", hooks: [hooks.Stop] }],
    },
  },
});
```

## Hooks wired

| SDK hook | Behavior |
| --- | --- |
| `UserPromptSubmit` | Capture + retrieval injection via `hookSpecificOutput.additionalContext`, plus the one-shot failure-hint when the per-session counter has tripped (see [Failure-signal accumulator](#failure-signal-accumulator)). |
| `PostToolUse` | `tool_invocation` observation, OR `tool_invocation_failure` capture for Neotoma-relevant tools that errored. |
| `PreCompact` | `context_event` marker. |
| `Stop` | Assistant message safety net. |

Every hook above also accretes onto a single `conversation_turn` keyed by `(session_id, turn_id)` (idempotency key `conversation-{sessionId}-{turnId}-turn`). The legacy `turn_compliance` entity remains as a registered alias so historical rows continue to surface under `/turns`. See [`docs/subsystems/conversation_turn.md`](../../subsystems/conversation_turn.md).

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3080` | Neotoma API. |
| `token` | `dev-local` | Auth token. |
| `logLevel` | `warn` | Verbosity. |
| `injectContext` | `true` | Return retrieval as `additionalContext`. |
| `sessionId` | auto | External correlation id. |

Same `NEOTOMA_HOOK_STATE_DIR` / `NEOTOMA_HOOK_FEEDBACK_HINT` / `NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD` env vars as the cursor + claude-code layers control the failure-hint behavior.

## Failure-signal accumulator

The adapter reimplements the same Neotoma-relevant tool detection, PII scrub, error-class classifier, and per-`(tool, error_class)` counter described in the [Cursor hook docs](./cursor.md#failure-signal-accumulator) so each harness package stays runtime-light. `PostToolUse` writes a `tool_invocation_failure` entity for Neotoma-relevant errors; `UserPromptSubmit` surfaces a one-shot `Neotoma hook note: …` informational line via `additionalContext` once the threshold trips. The hook NEVER calls `submit_issue` itself.

Note: the optional Feature B surface (`conversation_turn` per-turn entity, small-model reminder injection, stop-hook compliance follow-up) is currently only wired in the cursor and opencode harnesses; the SDK adapter intentionally stays narrow until the SDK exposes the equivalent lifecycle hooks.

## Coexistence with MCP

The agent can still call Neotoma's MCP tools for structured writes. The adapter and MCP share idempotency keys so the same logical turn produces a single `agent_message` entity with multiple observations.
