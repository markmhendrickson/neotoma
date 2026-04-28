#!/usr/bin/env python3
"""PostToolUse hook.

Fires after every tool call the agent makes. We use it as a passive
observation capture layer: record which tool ran, its outcome, and
links to the current conversation. We deliberately do NOT try to parse
tool outputs into entities — that is the agent's job via MCP, and
doing it here would violate the "no inference" principle.

This hook provides the "reliability floor" for observability: even if
the agent never writes a memory, we know what it did.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    classify_error_message,
    extract_error_message,
    extract_invocation_shape,
    get_client,
    harness_provenance,
    increment_failure_counter,
    is_neotoma_relevant_tool,
    log,
    make_idempotency_key,
    read_hook_input,
    record_conversation_turn,
    scrub_error_message,
    write_hook_output,
)


def main() -> int:
    payload = read_hook_input()
    client = get_client()
    if client is None:
        write_hook_output({})
        return 0

    session_id = payload.get("session_id") or "claude-code-unknown"
    turn_id = payload.get("turn_id") or str(int(time.time() * 1000))
    tool_name = payload.get("tool_name") or payload.get("tool") or "unknown"
    tool_input = payload.get("tool_input") or {}
    tool_result = payload.get("tool_response") or payload.get("tool_result") or {}
    has_error = bool(isinstance(tool_result, dict) and tool_result.get("error"))

    if has_error and is_neotoma_relevant_tool(tool_name, tool_input):
        error_message = extract_error_message(tool_result)
        error_class = classify_error_message(error_message)
        scrubbed = scrub_error_message(error_message)
        counter = increment_failure_counter(session_id, tool_name, error_class)
        failure_entity = {
            "entity_type": "tool_invocation_failure",
            "tool_name": tool_name,
            "error_class": error_class,
            "error_message_redacted": scrubbed,
            "invocation_shape": extract_invocation_shape(tool_input),
            "turn_key": f"{session_id}:{turn_id}",
            "hit_count_session": counter.get("count", 1),
            **harness_provenance({"hook_event": "PostToolUse.failure"}),
        }
        try:
            client.store(
                {
                    "entities": [failure_entity],
                    "idempotency_key": make_idempotency_key(
                        session_id,
                        turn_id,
                        f"tool-failure-{tool_name}-{counter.get('count', 1)}",
                    ),
                }
            )
        except Exception as exc:
            log("debug", f"PostToolUse failure store failed: {exc}")

        record_conversation_turn(
            client,
            session_id=session_id,
            turn_id=turn_id,
            hook_event="PostToolUse.failure",
            neotoma_tool_failures=1,
        )

        try:
            client.close()
        except Exception:
            pass
        write_hook_output({})
        return 0

    entity = {
        "entity_type": "tool_invocation",
        "tool_name": tool_name,
        "turn_key": f"{session_id}:{turn_id}",
        "status": tool_result.get("status") if isinstance(tool_result, dict) else None,
        "has_error": has_error,
        "input_summary": _summarize(tool_input),
        "output_summary": _summarize(tool_result),
        **harness_provenance({"hook_event": "PostToolUse"}),
    }

    try:
        client.store(
            {
                "entities": [entity],
                "idempotency_key": make_idempotency_key(
                    session_id, turn_id, f"tool-{tool_name}-{int(time.time() * 1000)}"
                ),
            }
        )
    except Exception as exc:
        log("debug", f"PostToolUse store failed: {exc}")

    record_conversation_turn(
        client,
        session_id=session_id,
        turn_id=turn_id,
        hook_event="PostToolUse",
        tool_invocation_count=1,
    )

    try:
        client.close()
    except Exception:
        pass

    write_hook_output({})
    return 0


def _summarize(value: object, max_len: int = 400) -> str:
    """Short, safe string summary of a tool input/output."""
    try:
        text = str(value)
    except Exception:
        return "<unserializable>"
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


if __name__ == "__main__":
    sys.exit(main())
