---
title: "Neotoma + OpenAI Codex CLI (hooks)"
summary: "Codex CLI exposes fewer hook points than Claude Code, so this integration focuses on the highest-leverage moments: session start, notifications, and session end."
---

# Neotoma + OpenAI Codex CLI (hooks)

Codex CLI exposes fewer hook points than Claude Code, so this integration focuses on the highest-leverage moments: session start, notifications, and session end.

## Install

```bash
pip install neotoma-client
npm install -g @neotoma/codex-hooks
neotoma-codex-hooks
```

This edits `~/.codex/config.toml` to register the hook scripts. Remove with `neotoma-codex-hooks --uninstall`.

If Codex reports `missing field 'persistence' in 'history'`, your `[history]` table is incomplete for the current CLI. Add `persistence = "save-all"` (or `"none"`) under `[history]`, or re-run `neotoma-codex-hooks` after upgrading `@neotoma/codex-hooks` so the installer can merge the hook block and patch in `persistence` when it is missing.

If Codex reports `invalid type: map, expected a sequence` at `[notify]`, an old Neotoma snippet used a `[notify]` table with `command = […]`. Current Codex expects a **root-level** `notify = ["argv0", "argv1", …]` (see Codex sample config). Re-run `neotoma-codex-hooks` from an updated `@neotoma/codex-hooks`, or replace that table with a single `notify = […]` line.

## Hooks wired

| Codex hook | Behavior |
| --- | --- |
| `history.session_start_command` | Create `conversation` entity. |
| `notify` (argv array) | `context_event` per notification, OR `tool_invocation_failure` capture when the notification looks like a tool/task error on a Neotoma-relevant tool (see [Failure-signal accumulator](#failure-signal-accumulator)). |
| `history.session_end_command` | `session_end` marker + assistant message safety net. |

Every hook above also accretes onto a single `conversation_turn` keyed by `(session_id, turn_id)` (idempotency key `conversation-{sessionId}-{turnId}-turn`). The legacy `turn_compliance` entity remains as a registered alias so historical rows continue to surface under `/turns`. See [`docs/subsystems/conversation_turn.md`](../../subsystems/conversation_turn.md).

## Failure-signal accumulator

Storage-only on this harness: the `notify` argv hook classifies the event with a small `_ERROR_EVENT_TYPES = {"error", "tool_error", "task_error", "abort"}` heuristic, and when the implied tool is Neotoma-relevant it persists a `tool_invocation_failure` entity (PII-scrubbed) and bumps the per-`(tool, error_class)` counter under `NEOTOMA_HOOK_STATE_DIR`. Codex CLI's notify hook is fire-and-forget — there is no `additionalContext` injection point — so the threshold-based hint is NOT surfaced through this harness; the structured signal still feeds the rest of the [issue reporting system](../../subsystems/agent_feedback_pipeline.md). Hooks NEVER call `submit_issue` themselves.

## Coexistence with MCP

If you also run Codex's MCP client against Neotoma, structured writes remain MCP-driven. The hooks add the session-level spine Codex otherwise leaves invisible.
