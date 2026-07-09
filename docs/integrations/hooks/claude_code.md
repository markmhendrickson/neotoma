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

## Path-based isolation and the Bash-tool gap

If you scope a local Neotoma install to a working directory and want to keep an
agent out of *sensitive sibling directories* (accounting, legal, client files,
etc.), be aware of an important limitation of Claude Code's declarative
permission rules:

> **Declarative `Read` / `Glob` / `Grep` deny rules do NOT stop a raw
> `cat` / `grep` / `find` / `ls` run through the agent's `Bash` tool.** The
> path-based deny list only governs the dedicated file tools; a shell command
> that reads the same file bypasses it.

So a `deny` entry like `Read(//Users/you/Private/**)` protects the `Read` tool,
but `Bash(cat /Users/you/Private/secret.txt)` still succeeds. If a broad allow
such as `Read(//Users/you/**)` is also present, that widens the exposure
further (deny overrides allow for the file tools, but Bash is unaffected).

### Recommended: a fail-closed `PreToolUse` hook

To actually enforce path-based isolation against the Bash tool, add a
`PreToolUse` hook (matcher `Bash`) that inspects the command and blocks reads
into denied paths. Make it **fail-closed**: if the command can't be parsed,
deny rather than allow. A minimal shape:

```python
#!/usr/bin/env python3
# .claude/hooks/scope-guard.py  (register under hooks.PreToolUse, matcher "Bash")
import json, sys

DENY_SUBSTRINGS = ["/Accounting/", "/LEGAL/", "/Equity/"]  # your sensitive paths

try:
    event = json.load(sys.stdin)
    command = event.get("tool_input", {}).get("command", "")
except Exception:
    # Unparseable input -> fail closed.
    print(json.dumps({"decision": "block", "reason": "scope-guard: unparseable"}))
    sys.exit(0)

if ".." in command or any(s in command for s in DENY_SUBSTRINGS):
    print(json.dumps({"decision": "block", "reason": "scope-guard: denied path"}))
else:
    print(json.dumps({"decision": "approve"}))
sys.exit(0)
```

Known limits of the pattern approach: a regex/substring check cannot catch
computed paths, symlinks, or `$(…)` command substitution. Treat the hook as one
layer; keep the declarative `Read`/`Glob`/`Grep` denies for the file tools, and
keep genuinely sensitive data out of the scoped tree entirely where possible.
