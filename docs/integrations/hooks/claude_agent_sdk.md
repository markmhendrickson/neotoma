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
| `UserPromptSubmit` | Capture + retrieval injection via `hookSpecificOutput.additionalContext`. |
| `PostToolUse` | `tool_invocation` observation. |
| `PreCompact` | `context_event` marker. |
| `Stop` | Assistant message safety net. |

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3080` | Neotoma API. |
| `token` | `dev-local` | Auth token. |
| `logLevel` | `warn` | Verbosity. |
| `injectContext` | `true` | Return retrieval as `additionalContext`. |
| `sessionId` | auto | External correlation id. |

## Coexistence with MCP

The agent can still call Neotoma's MCP tools for structured writes. The adapter and MCP share idempotency keys so the same logical turn produces a single `agent_message` entity with multiple observations.
