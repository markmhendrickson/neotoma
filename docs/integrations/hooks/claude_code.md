# Neotoma + Claude Code (hooks)

Pairs with the Neotoma MCP server. Hooks provide the reliability floor (guaranteed capture, retrieval injection, compaction markers). MCP provides the quality ceiling (agent-driven structured writes).

## Install

```bash
# 1. Run Neotoma locally or point at a remote instance.
# 2. Install the Python client used by the hooks.
pip install neotoma-client

# 3. Install the plugin in Claude Code.
#    From a local checkout:
claude plugin install ./packages/claude-code-plugin

#    Or from the Neotoma marketplace (once published):
#    /plugin marketplace add markmhendrickson/neotoma
#    /plugin install neotoma
```

## Hooks wired

| Event | Behavior |
| --- | --- |
| `SessionStart` | Create a `conversation` entity. |
| `UserPromptSubmit` | Retrieval injection (`additionalContext`) + user message capture. |
| `PostToolUse` | `tool_invocation` observation. |
| `PreCompact` | `context_event` marker so the timeline reflects compaction. |
| `Stop` | Assistant `agent_message` safety net. |

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug` through `silent`. |

## Coexistence with MCP

MCP and the plugin share idempotency keys — `conversation-{session_id}-{turn_id}-user` etc. — so a user message captured by the plugin and then enriched by the agent via MCP lands on the same `agent_message` observation, not a duplicate.
