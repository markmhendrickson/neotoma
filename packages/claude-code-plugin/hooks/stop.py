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
    harness_provenance,
    log,
    make_idempotency_key,
    read_hook_input,
    record_conversation_turn,
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
