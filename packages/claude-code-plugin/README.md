# Neotoma for Claude Code

A plugin that wires [Neotoma](https://neotoma.io) into Claude Code as a set of lifecycle hooks. Pairs with the Neotoma MCP server for agent-driven structured storage — the plugin is the "reliability floor" (guaranteed capture, retrieval injection, compaction markers), while MCP is the "quality ceiling" (rich, schema-typed entity extraction the agent performs deliberately).

## What it does

| Hook | Purpose |
| --- | --- |
| `SessionStart` | Records the Claude Code session as a `conversation` entity. |
| `UserPromptSubmit` | Injects retrieval context (recent timeline + `@identifier` matches) via `additionalContext`, and captures the user message as `agent_message`. |
| `PostToolUse` | Logs a `tool_invocation` observation for every tool call — passive observability. |
| `PreCompact` | Snapshots a `context_event` marker before Claude Code summarizes the context window. |
| `Stop` | Persists the assistant's final reply as an `agent_message` safety net. |

The plugin deliberately does not do LLM-based entity extraction from chat or tool output. That stays in the agent's hands via MCP, preserving Neotoma's "no inference" guarantee.

## Install

### From the Neotoma marketplace (recommended)

```bash
# In Claude Code
/plugin marketplace add markmhendrickson/neotoma
/plugin install neotoma
```

### Local development

```bash
git clone https://github.com/markmhendrickson/neotoma
cd neotoma/packages/claude-code-plugin
claude plugin install .
```

## Prerequisites

1. A running Neotoma server (default: `http://127.0.0.1:3080`). See [install.md](https://github.com/markmhendrickson/neotoma/blob/main/install.md).
2. The `neotoma-client` Python package: `pip install neotoma-client`.

## Configuration

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | Neotoma API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token for the Neotoma API. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug`, `info`, `warn`, `error`, `silent`. |

All hooks are best-effort: a failure in the plugin never blocks your turn. Errors are logged to stderr and the agent continues.

## Relationship to the MCP server

You can run both at once — they are designed to coexist:

- **MCP** handles structured, agent-driven writes: the agent calls `store_structured` with typed entities and schema-inferred fields.
- **Hooks** handle the lifecycle events MCP cannot see: session start, prompt arrival, compaction, stop. They also guarantee a baseline capture if the agent forgets to call MCP.

Idempotency keys are shared across both layers so nothing is double-counted.

## License

MIT
