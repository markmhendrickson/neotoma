# Neotoma + OpenAI Codex CLI (hooks)

Codex CLI exposes fewer hook points than Claude Code, so this integration focuses on the highest-leverage moments: session start, notifications, and session end.

## Install

```bash
pip install neotoma-client
npm install -g @neotoma/codex-hooks
neotoma-codex-hooks
```

This edits `~/.codex/config.toml` to register the hook scripts. Remove with `neotoma-codex-hooks --uninstall`.

## Hooks wired

| Codex hook | Behavior |
| --- | --- |
| `history.session_start_command` | Create `conversation` entity. |
| `notify.command` | `context_event` per notification (turn complete, approvals, errors). |
| `history.session_end_command` | `session_end` marker + assistant message safety net. |

## Coexistence with MCP

If you also run Codex's MCP client against Neotoma, structured writes remain MCP-driven. The hooks add the session-level spine Codex otherwise leaves invisible.
