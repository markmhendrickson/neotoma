#!/usr/bin/env python3
"""Codex CLI session-start hook.

Writes a conversation entity so every Codex session is anchored in
Neotoma. This gives the rest of the hook chain (user messages, tool
calls, notifications) something consistent to link to.
"""

from __future__ import annotations

import sys
import time
import uuid
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

    # Codex supplies a raw UUID in `session_id`. Persist it under both
    # `session_id` (canonical identity) and `session_uuid` (cross-reference
    # bridge field on the conversation schema, v1.4). The bridge lets this
    # hook-created entity coalesce with a slug-keyed entity an MCP agent
    # later creates for the same session. See issue #145.
    raw_session_id = payload.get("session_id")
    session_id = raw_session_id or f"codex-{uuid.uuid4()}"
    title = payload.get("title") or "Codex CLI session"

    conversation_entity = {
        "entity_type": "conversation",
        "title": title,
        "session_id": session_id,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **harness_provenance({"hook_event": "session_start"}),
    }
    # Only populate session_uuid when the host actually supplied a UUID
    # (not when we synthesized a `codex-<uuid>` fallback).
    if raw_session_id:
        conversation_entity["session_uuid"] = raw_session_id

    try:
        client.store(
            {
                "entities": [conversation_entity],
                "idempotency_key": make_idempotency_key(
                    session_id, "session", "start"
                ),
            }
        )
    except Exception as exc:
        log("warn", f"session_start store failed: {exc}")

    record_conversation_turn(
        client,
        session_id=session_id,
        turn_id="session",
        hook_event="session_start",
        started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    try:
        client.close()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
