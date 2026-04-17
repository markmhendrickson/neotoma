# Neotoma Claude Agent SDK adapter

Reference adapter that wires [Neotoma](https://neotoma.io) into agents built on the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk). Returns ready-to-mount hook callbacks implementing the Option C architecture: hooks provide the reliability floor, MCP provides the quality ceiling.

## What it does

| SDK hook | Neotoma behavior |
| --- | --- |
| `UserPromptSubmit` | Captures user message, returns retrieval context as `additionalContext`. |
| `PostToolUse` | Logs a `tool_invocation` observation. |
| `PreCompact` | Snapshots a `context_event` marker before compaction. |
| `Stop` | Persists the assistant's final reply as a safety net. |

No LLM-based entity extraction runs here — that remains the agent's job via MCP.

## Install

```bash
npm install @neotoma/claude-agent-sdk-adapter @neotoma/client @anthropic-ai/claude-agent-sdk
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

for await (const message of result) {
  console.log(message);
}
```

## Configuration

| Option / env | Default | Purpose |
| --- | --- | --- |
| `baseUrl` / `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | Neotoma API root. |
| `token` / `NEOTOMA_TOKEN` | `dev-local` | Auth token. |
| `logLevel` / `NEOTOMA_LOG_LEVEL` | `warn` | Log verbosity. |
| `injectContext` | `true` | Whether `UserPromptSubmit` returns `additionalContext`. |
| `sessionId` | auto | Override to correlate with an external session id. |

## License

MIT
