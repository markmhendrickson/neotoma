#!/usr/bin/env python3
"""Codex CLI notify hook.

Codex CLI invokes a notify program on major events (task turn complete,
approvals required, errors). We record each as a context_event entity
linked to the current session so the timeline reflects agent progress,
even when no tool call fires.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    classify_error_message,
    get_client,
    harness_provenance,
    increment_failure_counter,
    is_neotoma_relevant_tool,
    log,
    make_idempotency_key,
    read_hook_input,
    record_conversation_turn,
    scrub_error_message,
)


_ERROR_EVENT_TYPES = {"error", "tool_error", "task_error", "abort"}


def _looks_like_error(event_type: str, message: str) -> bool:
    """Heuristic: codex notify events that imply a tool/task failure."""
    if isinstance(event_type, str) and event_type.lower() in _ERROR_EVENT_TYPES:
        return True
    if isinstance(message, str):
        lower = message.lower()
        if "error" in lower or "failed" in lower or "aborted" in lower:
            return True
    return False


def _implied_tool_name(payload: dict) -> str:
    for key in ("tool_name", "tool", "command_name"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    cmd = payload.get("command") or payload.get("cmd") or payload.get("url")
    if isinstance(cmd, str) and cmd:
        return cmd.split()[0] if cmd.split() else cmd
    return "unknown"


def main() -> int:
    payload = read_hook_input()
    client = get_client()
    if client is None:
        return 0

    session_id = payload.get("session_id") or "codex-unknown"
    event_type = payload.get("type") or payload.get("event") or "notify"
    message = payload.get("message") or payload.get("text") or ""
    turn_id = payload.get("turn_id") or str(int(time.time() * 1000))

    if _looks_like_error(event_type, message):
        tool_name = _implied_tool_name(payload)
        if is_neotoma_relevant_tool(tool_name, payload):
            error_class = classify_error_message(message)
            scrubbed = scrub_error_message(message)
            counter = increment_failure_counter(session_id, tool_name, error_class)
            try:
                client.store(
                    {
                        "entities": [
                            {
                                "entity_type": "tool_invocation_failure",
                                "tool_name": tool_name,
                                "error_class": error_class,
                                "error_message_redacted": scrubbed,
                                "turn_key": f"{session_id}:{turn_id}",
                                "hit_count_session": counter.get("count", 1),
                                **harness_provenance(
                                    {"hook_event": f"notify.{event_type}"}
                                ),
                            }
                        ],
                        "idempotency_key": make_idempotency_key(
                            session_id,
                            turn_id,
                            f"notify-failure-{tool_name}-{counter.get('count', 1)}",
                        ),
                    }
                )
            except Exception as exc:
                log("debug", f"notify failure store failed: {exc}")
            finally:
                try:
                    client.close()
                except Exception:
                    pass
            return 0

    try:
        client.store(
            {
                "entities": [
                    {
                        "entity_type": "context_event",
                        "event": event_type,
                        "message": message,
                        "turn_key": f"{session_id}:{turn_id}",
                        "observed_at": time.strftime(
                            "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                        ),
                        **harness_provenance({"hook_event": event_type}),
                    }
                ],
                "idempotency_key": make_idempotency_key(
                    session_id, turn_id, f"notify-{event_type}"
                ),
            }
        )
    except Exception as exc:
        log("debug", f"notify store failed: {exc}")

    record_conversation_turn(
        client,
        session_id=session_id,
        turn_id=turn_id,
        hook_event=f"notify.{event_type}",
    )

    try:
        client.close()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
