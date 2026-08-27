#!/usr/bin/env python3
"""Stop hook.

Runs when the agent completes its response. Used as the persistence
safety net for the assistant's final reply: if the agent forgot to
store the assistant agent_message via MCP, we capture it here so
the turn is not lost.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    get_client,
    git_context,
    harness_provenance,
    log,
    make_idempotency_key,
    read_hook_input,
    record_agent_session,
    record_conversation_turn,
    record_session_transcript,
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
    final_text = payload.get("response") or payload.get("assistant_response") or ""

    # Refresh the runtime/resume record and snapshot the transcript artifact.
    # Done before the empty-reply short-circuit so a turn that produces no
    # final text still advances last_activity_at and captures the transcript.
    # Guarded on a real harness UUID (the resume id must be genuine).
    raw_session_id = payload.get("session_id")
    if raw_session_id:
        cwd = payload.get("cwd") or str(Path.cwd())
        record_agent_session(
            client,
            native_session_id=raw_session_id,
            hook_event="Stop",
            kind="interactive",
            model=payload.get("model"),
            last_activity_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            cwd=cwd,
            git=git_context(cwd),
        )
        record_session_transcript(
            client,
            transcript_path=payload.get("transcript_path"),
            agent_session_id=raw_session_id,
        )

    if not final_text:
        write_hook_output({})
        try:
            client.close()
        except Exception:
            pass
        return 0

    entity = {
        "entity_type": "conversation_message",
        "role": "assistant",
        "sender_kind": "assistant",
        "content": final_text,
        "turn_key": f"{session_id}:{turn_id}:assistant",
        "observed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **harness_provenance({"hook_event": "Stop"}),
    }

    try:
        client.store(
            {
                "entities": [entity],
                "idempotency_key": make_idempotency_key(
                    session_id, turn_id, "assistant"
                ),
            }
        )
    except Exception as exc:
        log("debug", f"Stop store failed: {exc}")

    record_conversation_turn(
        client,
        session_id=session_id,
        turn_id=turn_id,
        hook_event="Stop",
        ended_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    try:
        client.close()
    except Exception:
        pass

    write_hook_output({})
    return 0


if __name__ == "__main__":
    sys.exit(main())
