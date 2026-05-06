#!/usr/bin/env python3
"""SessionStart hook.

Runs once when a Claude Code session begins. Records the session as a
conversation entity, captures harness metadata (cwd, git branch, user),
and does a bounded retrieval of recent entities so the first user prompt
has context available.

This is part of the Option C architecture: MCP owns structured entity
storage; this hook provides the lifecycle-level observability MCP cannot
see (session start is not visible to the MCP server because it happens
before any tool call).
"""

from __future__ import annotations

import sys
import time
import uuid
from pathlib import Path

try:
    import urllib.request as _urllib_request
except ImportError:
    _urllib_request = None  # type: ignore[assignment]

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    NEOTOMA_BASE_URL,
    get_client,
    harness_provenance,
    log,
    make_idempotency_key,
    read_hook_input,
    record_conversation_turn,
    write_cached_mcp_instructions,
    write_hook_output,
)


def _prefetch_mcp_instructions() -> None:
    """Fetch MCP instructions once at session start and cache them."""
    if _urllib_request is None:
        return
    url = NEOTOMA_BASE_URL.rstrip("/") + "/mcp-interaction-instructions"
    try:
        with _urllib_request.urlopen(url, timeout=2) as resp:  # noqa: S310
            if resp.status == 200:
                text = resp.read().decode("utf-8", errors="replace").strip()
                if text:
                    write_cached_mcp_instructions(text)
    except Exception as exc:
        log("debug", f"prefetch_mcp_instructions failed: {exc}")


def main() -> int:
    payload = read_hook_input()
    _prefetch_mcp_instructions()
    client = get_client()
    if client is None:
        return 0

    session_id = payload.get("session_id") or f"claude-code-{uuid.uuid4()}"
    conversation_title = payload.get("conversation_title") or "Claude Code session"

    entities = [
        {
            "entity_type": "conversation",
            "title": conversation_title,
            "session_id": session_id,
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            **harness_provenance({"hook_event": "SessionStart"}),
        }
    ]

    try:
        client.store(
            {
                "entities": entities,
                "idempotency_key": make_idempotency_key(session_id, "session", "start"),
            }
        )
    except Exception as exc:
        log("warn", f"SessionStart store failed: {exc}")

    record_conversation_turn(
        client,
        session_id=session_id,
        turn_id="session",
        hook_event="SessionStart",
        started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    try:
        client.close()
    except Exception:
        pass

    write_hook_output({})
    return 0


if __name__ == "__main__":
    sys.exit(main())
