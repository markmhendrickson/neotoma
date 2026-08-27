"""Unit tests for agent_session + session_transcript hook capture.

Exercises the pure builders and the best-effort record_* helpers in
hooks/_common.py with a stub client (no server required). Runs under pytest
or standalone via ``python3 test_session_capture.py``.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

# Import the hook helpers from the sibling hooks/ directory.
HOOKS_DIR = Path(__file__).resolve().parent.parent / "hooks"
sys.path.insert(0, str(HOOKS_DIR))

from _common import (  # noqa: E402
    HARNESS,
    build_agent_session_entity,
    build_session_transcript_entity,
    hash_transcript_file,
    record_agent_session,
    record_session_transcript,
)


class StubClient:
    """Captures store() calls so tests can assert the entity payloads."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def store(self, input):  # noqa: A002 - mirror real client signature
        self.calls.append(input)
        return {"entities": [{"entity_id": "ent_stub"}]}


def test_harness_is_hyphenated() -> None:
    # The value is part of agent_session's joint identity; underscore would
    # key a different entity. Lock the convention.
    assert HARNESS == "claude-code"


def test_build_agent_session_entity_identity_and_fields() -> None:
    entity = build_agent_session_entity(
        native_session_id="uuid-123",
        kind="interactive",
        model="claude-opus-4-8",
        created_at="2026-06-22T00:00:00Z",
        last_activity_at="2026-06-22T01:00:00Z",
        cwd="/work/repo",
        git={"repo": "neotoma", "branch": "main", "git_head_sha": "abc", "ignored": "x"},
        trigger_kind="interactive",
        resume_command="claude --resume uuid-123",
        hook_event="SessionStart",
    )
    assert entity["entity_type"] == "agent_session"
    assert entity["harness"] == "claude-code"
    assert entity["native_session_id"] == "uuid-123"
    assert entity["kind"] == "interactive"
    assert entity["model"] == "claude-opus-4-8"
    assert entity["repo"] == "neotoma"
    assert entity["branch"] == "main"
    assert entity["git_head_sha"] == "abc"
    assert entity["resume_command"] == "claude --resume uuid-123"
    assert entity["trigger_kind"] == "interactive"
    # Only declared git keys are copied across.
    assert "ignored" not in entity
    # Provenance carries the hook event and hyphenated harness.
    assert entity["hook_event"] == "SessionStart"
    assert entity["data_source"] == "claude-code-hook"


def test_build_session_transcript_entity_is_content_addressed() -> None:
    entity = build_session_transcript_entity(
        content_hash="deadbeef",
        agent_session_id="uuid-123",
        file_size=4096,
        turn_count=12,
    )
    assert entity["entity_type"] == "session_transcript"
    assert entity["content_hash"] == "deadbeef"
    assert entity["harness"] == "claude-code"
    assert entity["format"] == "claude_code_jsonl"
    assert entity["mime_type"] == "application/jsonl"
    assert entity["transcript_kind"] == "main"
    assert entity["agent_session_id"] == "uuid-123"
    assert entity["file_size"] == 4096
    assert entity["turn_count"] == 12


def test_hash_transcript_file_matches_sha256() -> None:
    import hashlib

    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "transcript.jsonl"
        body = b'{"a":1}\n{"b":2}\n{"c":3}\n'
        path.write_bytes(body)
        result = hash_transcript_file(str(path))
        assert result is not None
        content_hash, size, lines = result
        assert content_hash == hashlib.sha256(body).hexdigest()
        assert size == len(body)
        assert lines == 3


def test_hash_transcript_file_missing_returns_none() -> None:
    assert hash_transcript_file("/no/such/file.jsonl") is None


def test_record_agent_session_stores_with_stable_idempotency_key() -> None:
    client = StubClient()
    record_agent_session(
        client,
        native_session_id="uuid-123",
        hook_event="SessionStart",
        kind="interactive",
    )
    assert len(client.calls) == 1
    call = client.calls[0]
    assert call["idempotency_key"] == "agent-session-claude-code-uuid-123-SessionStart"
    assert call["entities"][0]["native_session_id"] == "uuid-123"
    assert call["entities"][0]["harness"] == "claude-code"


def test_record_agent_session_noop_without_session_id() -> None:
    client = StubClient()
    assert record_agent_session(client, native_session_id="") is None
    assert client.calls == []


def test_record_session_transcript_hashes_and_links() -> None:
    client = StubClient()
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "t.jsonl"
        path.write_bytes(b'{"x":1}\n')
        entity = record_session_transcript(
            client,
            transcript_path=str(path),
            agent_session_id="uuid-123",
        )
    assert entity is not None
    assert len(client.calls) == 1
    call = client.calls[0]
    stored = call["entities"][0]
    assert stored["entity_type"] == "session_transcript"
    assert stored["agent_session_id"] == "uuid-123"
    assert call["idempotency_key"] == f"session-transcript-{stored['content_hash']}"


def test_record_session_transcript_noop_for_missing_path() -> None:
    client = StubClient()
    assert record_session_transcript(client, transcript_path=None) is None
    assert record_session_transcript(client, transcript_path="/no/file") is None
    assert client.calls == []


def test_record_helpers_swallow_client_errors() -> None:
    class BoomClient:
        def store(self, input):  # noqa: A002
            raise RuntimeError("transport down")

    # Best-effort: a transport failure must never raise out of the hook.
    assert record_agent_session(BoomClient(), native_session_id="uuid-9") is None
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "t.jsonl"
        path.write_bytes(b"x\n")
        assert record_session_transcript(BoomClient(), transcript_path=str(path)) is None


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok   {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print(f"ERR  {name}: {exc}")
    print(f"\n{'PASS' if failures == 0 else 'FAIL'}: {failures} failure(s)")
    sys.exit(1 if failures else 0)
