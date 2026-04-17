#!/usr/bin/env python3
"""PreCompact hook.

Fires immediately before Claude Code compacts (summarizes) the context
window. This is one of the highest-leverage hook points: by the time
compaction runs, transient information that was never stored to memory
is about to be lost.

We snapshot a compaction marker to Neotoma so the timeline reflects
that a compaction happened and we can later correlate "what the agent
knew before vs after". We do not try to rewrite or augment the
compacted summary — per Option C, any enrichment is the agent's job
on the next turn via MCP retrieval.
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
    trigger = payload.get("trigger") or "auto"

    entity = {
        "entity_type": "context_event",
        "event": "pre_compact",
        "trigger": trigger,
        "turn_key": f"{session_id}:{turn_id}",
        "observed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **harness_provenance({"hook_event": "PreCompact"}),
    }

    try:
        client.store(
            {
                "entities": [entity],
                "idempotency_key": make_idempotency_key(
                    session_id, turn_id, f"compact-{int(time.time() * 1000)}"
                ),
            }
        )
    except Exception as exc:
        log("debug", f"PreCompact store failed: {exc}")
    finally:
        try:
            client.close()
        except Exception:
            pass

    write_hook_output({})
    return 0


if __name__ == "__main__":
    sys.exit(main())
