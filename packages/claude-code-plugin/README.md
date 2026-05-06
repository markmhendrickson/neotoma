# Neotoma lifecycle hooks

This directory is the **Claude Code** marketplace plugin (`plugin.json` + Python hooks). The **same package** also contains a **Cursor** hook map (`.cursor/hooks.json` → `packages/cursor-hooks`) so one checkout can wire both editors; lifecycle names and implementations differ per harness, but the intent matches: baseline capture, retrieval injection where the API supports it, and a stop-turn safety net. **MCP and CLI** stay the portable Neotoma surface for any agent.

It pairs with the Neotoma MCP server for agent-driven structured storage — hooks are the "reliability floor" (lifecycle-visible capture and markers), while MCP is the "quality ceiling" (rich, schema-typed extraction the agent performs deliberately).

## Harness compatibility

| Surface | What this repo wires | Notes |
| --- | --- | --- |
| **MCP / CLI** | Works in any agent or editor | Harness-agnostic; same store/retrieve contract everywhere. |
| **Claude Code** | `plugin.json` → `hooks/*.py` | Includes `PreCompact` for compaction markers. |
| **Cursor** | `.cursor/hooks.json` → `cursor-hooks` dist | Uses Cursor hook names (`sessionStart`, `beforeSubmitPrompt`, …); includes `postToolUseFailure`. Compaction hooks follow whatever Cursor exposes. |

## What it does (Claude Code hooks)

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

The `claude plugin install` CLI only resolves **marketplace** plugins (`name@marketplace`), not `.` or `./packages/...` paths. This package ships `.claude-plugin/marketplace.json` (`neotoma-marketplace`); register the directory, then install:

```bash
git clone https://github.com/markmhendrickson/neotoma
cd neotoma
claude plugin marketplace add "$(pwd)/packages/claude-code-plugin"
claude plugin install neotoma@neotoma-marketplace
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
