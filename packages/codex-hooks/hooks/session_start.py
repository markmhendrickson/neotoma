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
)


def main() -> int:
    payload = read_hook_input()
    client = get_client()
    if client is None:
        return 0

    session_id = payload.get("session_id") or f"codex-{uuid.uuid4()}"
    title = payload.get("title") or "Codex CLI session"

    try:
        client.store(
            {
                "entities": [
                    {
                        "entity_type": "conversation",
                        "title": title,
                        "session_id": session_id,
                        "started_at": time.strftime(
                            "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                        ),
                        **harness_provenance({"hook_event": "session_start"}),
                    }
                ],
                "idempotency_key": make_idempotency_key(
                    session_id, "session", "start"
                ),
            }
        )
    except Exception as exc:
        log("warn", f"session_start store failed: {exc}")
    finally:
        try:
            client.close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
