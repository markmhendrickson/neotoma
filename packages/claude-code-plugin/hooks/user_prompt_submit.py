#!/usr/bin/env python3
"""UserPromptSubmit hook.

Runs each time the user submits a prompt. Does two things:

1. Retrieval injection — runs a bounded retrieval against Neotoma
   (entities referenced by identifier, plus recent timeline events) and
   returns the result as `additionalContext` so Claude Code prepends it
   to the agent prompt. This is the "reliability floor" for recall —
   it happens even if the agent never calls a retrieval MCP tool.
2. Persistence safety net — stores the user message as an agent_message
   entity linked to the session conversation. This guarantees basic
   capture even if the agent forgets to call MCP store.

Deep entity extraction is left to the agent via MCP — per Option C we
do not run server-side LLM extraction here. We only capture what is
directly observable.
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    format_failure_hint,
    get_client,
    harness_provenance,
    log,
    make_idempotency_key,
    read_failure_hint,
    read_hook_input,
    record_conversation_turn,
    write_hook_output,
)


IDENTIFIER_PATTERN = re.compile(r"@([A-Za-z0-9_][A-Za-z0-9_.\-]{2,})")


def extract_identifiers(prompt: str) -> list[str]:
    """Pull @-mentions out of the prompt as likely entity identifiers."""
    if not prompt:
        return []
    return list({match for match in IDENTIFIER_PATTERN.findall(prompt)})[:5]


def format_context(sections: list[tuple[str, object]]) -> str:
    """Render retrieval results as a compact context block."""
    lines: list[str] = []
    for heading, body in sections:
        if not body:
            continue
        lines.append(f"## {heading}")
        if isinstance(body, (list, tuple)):
            for item in body[:10]:
                lines.append(f"- {item}")
        else:
            lines.append(str(body))
        lines.append("")
    return "\n".join(lines).strip()


def main() -> int:
    payload = read_hook_input()
    prompt = payload.get("prompt") or payload.get("user_prompt") or ""
    session_id = payload.get("session_id") or "claude-code-unknown"
    turn_id = payload.get("turn_id") or str(int(time.time() * 1000))

    client = get_client()
    if client is None:
        write_hook_output({})
        return 0

    context_sections: list[tuple[str, object]] = []
    try:
        identifiers = extract_identifiers(prompt)
        for identifier in identifiers:
            try:
                match = client.retrieve_entity_by_identifier({"identifier": identifier})
                if match:
                    context_sections.append((f"Entity: {identifier}", match))
            except Exception as exc:
                log("debug", f"retrieve_entity_by_identifier({identifier}) failed: {exc}")

        try:
            timeline = client.list_timeline_events({"limit": 5})
            if timeline:
                context_sections.append(("Recent timeline", timeline))
        except Exception as exc:
            log("debug", f"list_timeline_events failed: {exc}")
    except Exception as exc:
        log("warn", f"retrieval pass failed: {exc}")

    # Persistence safety net — always store the user message
    try:
        client.store(
            {
                "entities": [
                    {
                        "entity_type": "conversation_message",
                        "role": "user",
                        "sender_kind": "user",
                        "content": prompt,
                        "turn_key": f"{session_id}:{turn_id}",
                        **harness_provenance({"hook_event": "UserPromptSubmit"}),
                    }
                ],
                "idempotency_key": make_idempotency_key(session_id, turn_id, "user"),
            }
        )
    except Exception as exc:
        log("warn", f"UserPromptSubmit store failed: {exc}")

    record_conversation_turn(
        client,
        session_id=session_id,
        turn_id=turn_id,
        hook_event="UserPromptSubmit",
        started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    try:
        client.close()
    except Exception:
        pass

    response: dict[str, object] = {}
    additional: list[str] = []
    if context_sections:
        additional.append(format_context(context_sections))
    hint = read_failure_hint(session_id)
    if hint:
        additional.append(format_failure_hint(hint))
    if additional:
        response["additionalContext"] = "\n\n".join(s for s in additional if s)
    write_hook_output(response)
    return 0


if __name__ == "__main__":
    sys.exit(main())
