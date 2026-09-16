"""Unit tests for agent_session + session_transcript hook capture.

Exercises the pure builders and the best-effort record_* helpers in
hooks/_common.py with a stub client (no server required). Runs under pytest
or standalone via ``python3 test_session_capture.py``.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

# Import the hook helpers from the sibling hooks/ directory.
HOOKS_DIR = Path(__file__).resolve().parent.parent / "hooks"
sys.path.insert(0, str(HOOKS_DIR))

from _common import (  # noqa: E402
    HARNESS,
    build_agent_session_entity,
    build_session_transcript_entity,
    git_context,
    hash_transcript_file,
    record_agent_session,
    record_session_transcript,
    redact_repository_remote,
)


class StubClient:
    """Captures store() calls so tests can assert the entity payloads."""

    def __init__(self, entity_id: str = "ent_stub") -> None:
        self.calls: list[dict] = []
        self._entity_id = entity_id

    def store(self, input):  # noqa: A002 - mirror real client signature
        self.calls.append(input)
        return {"entities": [{"entity_id": self._entity_id}]}


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


def test_build_session_transcript_entity_requires_ent_fk() -> None:
    linked = build_session_transcript_entity(
        content_hash="deadbeef",
        agent_session_id="ent_stub",
        file_size=4096,
        turn_count=12,
    )
    assert linked["entity_type"] == "session_transcript"
    assert linked["content_hash"] == "deadbeef"
    assert linked["harness"] == "claude-code"
    assert linked["format"] == "claude_code_jsonl"
    assert linked["mime_type"] == "application/jsonl"
    assert linked["transcript_kind"] == "main"
    assert linked["agent_session_id"] == "ent_stub"
    assert linked["file_size"] == 4096
    assert linked["turn_count"] == 12

    # Harness UUID must NOT be written as agent_session_id (silent join miss).
    rejected = build_session_transcript_entity(
        content_hash="deadbeef",
        agent_session_id="uuid-123",
    )
    assert "agent_session_id" not in rejected


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


def test_record_agent_session_returns_entity_id_from_store() -> None:
    client = StubClient(entity_id="ent_session_abc")
    result = record_agent_session(
        client,
        native_session_id="uuid-123",
        hook_event="SessionStart",
        kind="interactive",
    )
    assert result is not None
    assert result["entity_id"] == "ent_session_abc"
    assert result["native_session_id"] == "uuid-123"
    assert len(client.calls) == 1
    call = client.calls[0]
    assert call["idempotency_key"] == "agent-session-claude-code-uuid-123-SessionStart"
    assert call["entities"][0]["native_session_id"] == "uuid-123"
    assert call["entities"][0]["harness"] == "claude-code"


def test_record_agent_session_retrieve_fallback_uses_entities_id() -> None:
    """When store omits entity_id, parse REST retrieve shape {entities:[{id}]}."""

    class StoreThenRetrieveClient:
        def __init__(self) -> None:
            self.store_calls: list[dict] = []

        def store(self, input):  # noqa: A002
            self.store_calls.append(input)
            # Dual-shape empty: no entity_id in response.
            return {"entities": [{"action": "updated"}]}

        def retrieve_entity_by_identifier(self, input):  # noqa: A002
            assert input["entity_type"] == "agent_session"
            assert input["identifier"] == "uuid-123"
            return {
                "entities": [{"id": "ent_from_retrieve"}],
                "total": 1,
                "match_mode": "snapshot_field",
            }

    result = record_agent_session(
        StoreThenRetrieveClient(),
        native_session_id="uuid-123",
        hook_event="Stop",
    )
    assert result is not None
    assert result["entity_id"] == "ent_from_retrieve"


def test_record_agent_session_noop_without_session_id() -> None:
    client = StubClient()
    assert record_agent_session(client, native_session_id="") is None
    assert client.calls == []


def test_record_session_transcript_hashes_and_links_ent_fk() -> None:
    client = StubClient()
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "t.jsonl"
        path.write_bytes(b'{"x":1}\n')
        entity = record_session_transcript(
            client,
            transcript_path=str(path),
            agent_session_id="ent_stub",
        )
    assert entity is not None
    assert len(client.calls) == 1
    call = client.calls[0]
    stored = call["entities"][0]
    assert stored["entity_type"] == "session_transcript"
    assert stored["agent_session_id"] == "ent_stub"
    assert call["idempotency_key"] == f"session-transcript-{stored['content_hash']}"
    assert call["relationships"] == [
        {
            "relationship_type": "PART_OF",
            "source_index": 0,
            "target_entity_id": "ent_stub",
        }
    ]


def test_record_session_transcript_rejects_harness_uuid_fk() -> None:
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
    stored = client.calls[0]["entities"][0]
    assert "agent_session_id" not in stored
    assert "relationships" not in client.calls[0]


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


def test_redact_repository_remote_userinfo() -> None:
    # Placeholder credentials only — never real secrets in fixtures.
    assert (
        redact_repository_remote("https://oauth2:PLACEHOLDER_TOKEN@github.com/org/repo.git")
        == "https://<redacted>@github.com/org/repo.git"
    )
    assert (
        redact_repository_remote("https://user:PLACEHOLDER_PASS@github.com/org/repo.git")
        == "https://<redacted>@github.com/org/repo.git"
    )


def test_redact_repository_remote_query_params() -> None:
    assert (
        redact_repository_remote(
            "https://github.com/org/repo.git?access_token=PLACEHOLDER_AT&ref=main"
        )
        == "https://github.com/org/repo.git?access_token=<redacted>&ref=main"
    )
    assert (
        redact_repository_remote(
            "https://github.com/org/repo.git?token=PLACEHOLDER_T&auth=PLACEHOLDER_A"
        )
        == "https://github.com/org/repo.git?token=<redacted>&auth=<redacted>"
    )
    assert (
        redact_repository_remote(
            "https://github.com/org/repo.git?key=PLACEHOLDER_K&password=PLACEHOLDER_P"
        )
        == "https://github.com/org/repo.git?key=<redacted>&password=<redacted>"
    )


def test_redact_repository_remote_clean_and_empty() -> None:
    clean = "https://github.com/org/repo.git"
    assert redact_repository_remote(clean) == clean
    assert redact_repository_remote("git@github.com:org/repo.git") == "git@github.com:org/repo.git"
    assert redact_repository_remote(None) is None
    assert redact_repository_remote("") is None


def test_git_context_redacts_remote_origin_url() -> None:
    with patch("subprocess.run") as run_mock:

        def _run(cmd, **kwargs):  # noqa: ANN001
            class Res:
                returncode = 0
                stdout = ""

            # Mirror _git: it passes ["git", *args]
            args = cmd[1:] if cmd and cmd[0] == "git" else cmd
            joined = " ".join(args)
            res = Res()
            if "show-toplevel" in joined:
                res.stdout = "/tmp/repo\n"
            elif "abbrev-ref" in joined:
                res.stdout = "main\n"
            elif args == ["rev-parse", "HEAD"]:
                res.stdout = "abc123\n"
            elif "remote.origin.url" in joined:
                res.stdout = "https://oauth2:PLACEHOLDER_TOKEN@github.com/org/repo.git\n"
            return res

        run_mock.side_effect = _run
        ctx = git_context("/tmp/repo")

    assert ctx["repo_remote_url"] == "https://<redacted>@github.com/org/repo.git"
    assert "PLACEHOLDER_TOKEN" not in ctx["repo_remote_url"]


def test_build_agent_session_entity_redacts_raw_git_remote() -> None:
    entity = build_agent_session_entity(
        native_session_id="uuid-123",
        git={
            "repo_remote_url": "https://user:PLACEHOLDER_PASS@github.com/org/repo.git",
        },
    )
    assert entity["repo_remote_url"] == "https://<redacted>@github.com/org/repo.git"


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
