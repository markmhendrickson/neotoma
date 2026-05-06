# Neotoma + Claude Code (hooks)

Pairs with the Neotoma MCP server. Hooks provide the reliability floor (guaranteed capture, retrieval injection, compaction markers). MCP provides the quality ceiling (agent-driven structured writes).

## Install

```bash
# 1. Run Neotoma locally or point at a remote instance.
# 2. Install the Python client used by the hooks.
pip install neotoma-client

# 3. Install the plugin in Claude Code.
#    From a local checkout: register the plugin directory as a marketplace, then
#    install by id (the bare `claude plugin install` CLI only accepts plugin@marketplace):
claude plugin marketplace add /ABS/PATH/TO/neotoma/packages/claude-code-plugin
claude plugin install neotoma@neotoma-marketplace

#    Or from the Neotoma marketplace (once published):
#    /plugin marketplace add markmhendrickson/neotoma
#    /plugin install neotoma
```

## Hooks wired

| Event | Behavior |
| --- | --- |
| `SessionStart` | Create a `conversation` entity. |
| `UserPromptSubmit` | Retrieval injection (`additionalContext`) + user message capture + one-shot failure-hint surfacing (see [Failure-signal accumulator](#failure-signal-accumulator)). |
| `PostToolUse` | `tool_invocation` observation, OR `tool_invocation_failure` capture for Neotoma-relevant tools that errored. |
| `PreCompact` | `context_event` marker so the timeline reflects compaction. |
| `Stop` | Assistant `conversation_message` safety net. |

Every hook above also accretes onto a single `conversation_turn` keyed by `(session_id, turn_id)` (idempotency key `conversation-{sessionId}-{turnId}-turn`). The legacy `turn_compliance` entity remains as a registered alias so historical rows continue to surface under `/turns`. See [`docs/subsystems/conversation_turn.md`](../../subsystems/conversation_turn.md).

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug` through `silent`. |
| `NEOTOMA_HOOK_STATE_DIR` | `~/.neotoma/hook-state` | Where the hook layer keeps per-session failure-counter state. |
| `NEOTOMA_HOOK_FEEDBACK_HINT` | `on` | Set to `off` to disable the one-shot failure hint. |
| `NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD` | `2` | Failures (per tool + error class, per session) before a hint is surfaced. |

## Failure-signal accumulator

`PostToolUse` branches on `tool_response.error`: when the failing tool is Neotoma-relevant (MCP tool against the Neotoma server, the `neotoma` CLI, or a direct HTTP call into a Neotoma endpoint), it persists a `tool_invocation_failure` entity (with PII-scrubbed `error_message_redacted`, `error_class`, and `invocation_shape`) and increments a per-`(tool, error_class)` counter on disk. `UserPromptSubmit` then surfaces a single `Neotoma hook note: …` informational line via `additionalContext` once the threshold trips, suggesting the agent call `submit_issue` if friction is blocking. Hooks NEVER call `submit_issue` themselves. Counters TTL out after 24h.

## Coexistence with MCP

MCP and the plugin share idempotency keys — `conversation-{session_id}-{turn_id}-user` etc. — so a user message captured by the plugin and then enriched by the agent via MCP lands on the same `agent_message` observation, not a duplicate.
