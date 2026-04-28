#!/usr/bin/env python3
"""Codex CLI session-end hook.

Records a session-end marker in Neotoma, closing the loop on the
conversation entity created in session_start.py. Also captures the
final assistant text when Codex provides it, as a persistence safety
net.
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
)


def main() -> int:
    payload = read_hook_input()
    client = get_client()
    if client is None:
        return 0

    session_id = payload.get("session_id") or "codex-unknown"
    final_text = payload.get("final_response") or payload.get("response") or ""
    turn_id = payload.get("turn_id") or str(int(time.time() * 1000))

    entities = [
        {
            "entity_type": "context_event",
            "event": "session_end",
            "turn_key": f"{session_id}:{turn_id}",
            "observed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            **harness_provenance({"hook_event": "session_end"}),
        }
    ]

    if final_text:
        entities.append(
            {
                "entity_type": "conversation_message",
                "role": "assistant",
                "sender_kind": "assistant",
                "content": final_text,
                "turn_key": f"{session_id}:{turn_id}:assistant",
                **harness_provenance({"hook_event": "session_end"}),
            }
        )

    try:
        client.store(
            {
                "entities": entities,
                "idempotency_key": make_idempotency_key(
                    session_id, turn_id, "session-end"
                ),
            }
        )
    except Exception as exc:
        log("debug", f"session_end store failed: {exc}")

    record_conversation_turn(
        client,
        session_id=session_id,
        turn_id=turn_id,
        hook_event="session_end",
        ended_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    try:
        client.close()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
