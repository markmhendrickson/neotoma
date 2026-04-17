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

    session_id = payload.get("session_id") or "codex-unknown"
    event_type = payload.get("type") or payload.get("event") or "notify"
    message = payload.get("message") or payload.get("text") or ""
    turn_id = payload.get("turn_id") or str(int(time.time() * 1000))

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
    finally:
        try:
            client.close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
