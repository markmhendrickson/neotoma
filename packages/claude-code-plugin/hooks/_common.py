"""Shared helpers for Neotoma Claude Code hooks.

Each hook reads the Claude Code hook payload from stdin, does a small
amount of work against the Neotoma API, and writes a JSON response (or
nothing) to stdout. All hooks are best-effort — a failure here must never
block the agent. We catch every exception and log to stderr so Claude
Code prints it in verbose mode but the turn still proceeds.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Prefer the vendored copy bundled alongside this file so the hook works
# without any manual pip install, regardless of the system Python environment.
sys.path.insert(0, str(Path(__file__).parent))
try:
    from neotoma_client import NeotomaClient, NeotomaClientError  # type: ignore
except Exception:  # pragma: no cover
    NeotomaClient = None  # type: ignore[assignment]
    NeotomaClientError = Exception  # type: ignore[assignment]


NEOTOMA_BASE_URL = os.environ.get("NEOTOMA_BASE_URL", "http://127.0.0.1:3080")
NEOTOMA_TOKEN = os.environ.get("NEOTOMA_TOKEN") or None
NEOTOMA_LOG_LEVEL = os.environ.get("NEOTOMA_LOG_LEVEL", "warn").lower()


def log(level: str, message: str) -> None:
    """Write a single-line log to stderr when level is enabled."""
    order = {"debug": 0, "info": 1, "warn": 2, "error": 3, "silent": 4}
    if order.get(level, 3) >= order.get(NEOTOMA_LOG_LEVEL, 2):
        sys.stderr.write(f"[neotoma-claude-code] {level}: {message}\n")


def read_hook_input() -> dict[str, Any]:
    """Parse the JSON payload Claude Code sends on stdin."""
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return {}
        return json.loads(raw)
    except Exception as exc:
        log("warn", f"Failed to parse hook input: {exc}")
        return {}


def write_hook_output(payload: dict[str, Any]) -> None:
    """Write the JSON response Claude Code expects on stdout."""
    try:
        sys.stdout.write(json.dumps(payload))
        sys.stdout.flush()
    except Exception as exc:
        log("warn", f"Failed to write hook output: {exc}")


def get_client() -> Any | None:
    """Construct a NeotomaClient, returning None if the package is missing.

    We do not raise here because that would fail the hook and the user's
    agent turn. Instead we log a one-line warning the first time.
    """
    if NeotomaClient is None:
        log(
            "warn",
            "neotoma-client not installed; skipping. Run `pip install neotoma-client`.",
        )
        return None
    try:
        return NeotomaClient(base_url=NEOTOMA_BASE_URL, token=NEOTOMA_TOKEN)
    except Exception as exc:
        log("warn", f"Failed to construct NeotomaClient: {exc}")
        return None


def make_idempotency_key(session_id: str, turn_id: str, suffix: str) -> str:
    safe_session = session_id or f"session-{uuid.uuid4()}"
    safe_turn = turn_id or str(int(time.time() * 1000))
    return f"conversation-{safe_session}-{safe_turn}-{suffix}"


def harness_provenance(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """Provenance fields every observation written by this plugin carries."""
    fields: dict[str, Any] = {
        "data_source": "claude-code-hook",
        "harness": "claude-code",
        "cwd": str(Path.cwd()),
    }
    if extra:
        fields.update(extra)
    return fields


def record_conversation_turn(
    client: Any | None,
    *,
    session_id: str,
    turn_id: str,
    hook_event: str | None = None,
    harness: str = "claude-code",
    harness_version: str | None = None,
    model: str | None = None,
    status: str | None = None,
    conversation_entity_id: str | None = None,
    missed_steps: list[str] | None = None,
    tool_invocation_count: int | None = None,
    store_structured_calls: int | None = None,
    retrieve_calls: int | None = None,
    neotoma_tool_failures: int | None = None,
    injected_context_chars: int | None = None,
    retrieved_entity_ids: list[str] | None = None,
    stored_entity_ids: list[str] | None = None,
    failure_hint_shown: bool | None = None,
    safety_net_used: bool | None = None,
    started_at: str | None = None,
    ended_at: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Append an observation to the per-turn ``conversation_turn`` entity.

    Best-effort: transport errors are logged and swallowed.
    """
    if client is None or not session_id or not turn_id:
        return None
    turn_key = f"{session_id}:{turn_id}"
    entity: dict[str, Any] = {
        "entity_type": "conversation_turn",
        "session_id": session_id,
        "turn_id": turn_id,
        "turn_key": turn_key,
        "harness": harness,
        **harness_provenance({"hook_event": hook_event} if hook_event else None),
    }
    if conversation_entity_id:
        entity["conversation_id"] = conversation_entity_id
    if harness_version:
        entity["harness_version"] = harness_version
    if model:
        entity["model"] = model
    if status:
        entity["status"] = status
    if hook_event:
        entity["hook_events"] = [hook_event]
    if missed_steps:
        entity["missed_steps"] = list(missed_steps)
    if tool_invocation_count is not None:
        entity["tool_invocation_count"] = tool_invocation_count
    if store_structured_calls is not None:
        entity["store_structured_calls"] = store_structured_calls
    if retrieve_calls is not None:
        entity["retrieve_calls"] = retrieve_calls
    if neotoma_tool_failures is not None:
        entity["neotoma_tool_failures"] = neotoma_tool_failures
    if injected_context_chars is not None:
        entity["injected_context_chars"] = injected_context_chars
    if retrieved_entity_ids:
        entity["retrieved_entity_ids"] = list(retrieved_entity_ids)
    if stored_entity_ids:
        entity["stored_entity_ids"] = list(stored_entity_ids)
    if failure_hint_shown is not None:
        entity["failure_hint_shown"] = failure_hint_shown
    if safety_net_used is not None:
        entity["safety_net_used"] = safety_net_used
    if started_at:
        entity["started_at"] = started_at
    if ended_at:
        entity["ended_at"] = ended_at
    if extra:
        entity.update(extra)
    idempotency_key = make_idempotency_key(session_id, turn_id, "turn")
    try:
        result = client.store(entities=[entity], idempotency_key=idempotency_key)
        try:
            from neotoma_client.helpers import _extract_entities
            entities_list = _extract_entities(result)
        except Exception:
            # Fallback if helpers not available: tolerate both response shapes.
            entities_list = (result or {}).get("entities") or (result or {}).get("structured", {}).get("entities") or []
        return {"entity_id": entities_list[0].get("entity_id")} if entities_list else None
    except Exception as exc:
        log("debug", f"record_conversation_turn failed: {exc}")
        return None


# ---------------------------------------------------------------------------
# agent_session + session_transcript capture
#
# MCP owns structured turn storage (conversation / conversation_message). The
# lifecycle hooks own the *runtime/resume* record that MCP cannot see: which
# harness produced the session, its native resume id, the git env to
# reconstruct, and the raw transcript artifact. These two helpers write the
# `agent_session` and `session_transcript` entity types added in the
# agent-session-capture work. Both are best-effort and identity-stable so
# repeated calls across SessionStart / Stop coalesce rather than duplicate.
# ---------------------------------------------------------------------------

# Harness value MUST be the hyphenated Neotoma convention; it is part of the
# agent_session joint identity ["harness","native_session_id"], so an
# underscore variant would key a different (wrong) entity.
HARNESS = "claude-code"


def git_context(cwd: str | None = None) -> dict[str, Any]:
    """Best-effort git repo/branch/sha for the working directory.

    Returns only the keys we could resolve; never raises. Used to populate
    the agent_session git-env fields needed to reconstruct a session on
    another machine.
    """
    root = cwd or str(Path.cwd())

    def _git(args: list[str]) -> str | None:
        try:
            res = subprocess.run(  # noqa: S603
                ["git", *args],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=2,
            )
        except Exception:
            return None
        if res.returncode != 0:
            return None
        value = res.stdout.strip()
        return value or None

    out: dict[str, Any] = {}
    toplevel = _git(["rev-parse", "--show-toplevel"])
    if toplevel:
        out["repo"] = Path(toplevel).name
        out["worktree_path"] = toplevel
    branch = _git(["rev-parse", "--abbrev-ref", "HEAD"])
    if branch and branch != "HEAD":
        out["branch"] = branch
    sha = _git(["rev-parse", "HEAD"])
    if sha:
        out["git_head_sha"] = sha
    remote = _git(["config", "--get", "remote.origin.url"])
    if remote:
        out["repo_remote_url"] = remote
    return out


def build_agent_session_entity(
    *,
    native_session_id: str,
    kind: str = "interactive",
    model: str | None = None,
    created_at: str | None = None,
    last_activity_at: str | None = None,
    message_count: int | None = None,
    cwd: str | None = None,
    git: dict[str, Any] | None = None,
    trigger_kind: str | None = None,
    parent_session_id: str | None = None,
    resume_command: str | None = None,
    hook_event: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build an agent_session entity payload (pure; no network)."""
    entity: dict[str, Any] = {
        "entity_type": "agent_session",
        "harness": HARNESS,
        "native_session_id": native_session_id,
        **harness_provenance({"hook_event": hook_event} if hook_event else None),
    }
    if kind:
        entity["kind"] = kind
    if model:
        entity["model"] = model
    if created_at:
        entity["created_at"] = created_at
    if last_activity_at:
        entity["last_activity_at"] = last_activity_at
    if message_count is not None:
        entity["message_count"] = message_count
    if cwd:
        entity["cwd"] = cwd
    for key in ("repo", "branch", "git_head_sha", "worktree_path", "repo_remote_url"):
        if git and git.get(key):
            entity[key] = git[key]
    if trigger_kind:
        entity["trigger_kind"] = trigger_kind
    if parent_session_id:
        entity["parent_session_id"] = parent_session_id
    if resume_command:
        entity["resume_command"] = resume_command
    if extra:
        entity.update(extra)
    return entity


def record_agent_session(
    client: Any | None,
    *,
    native_session_id: str,
    hook_event: str | None = None,
    **kwargs: Any,
) -> dict[str, Any] | None:
    """Upsert the agent_session entity for this session. Best-effort."""
    if client is None or not native_session_id:
        return None
    entity = build_agent_session_entity(
        native_session_id=native_session_id, hook_event=hook_event, **kwargs
    )
    idempotency_key = f"agent-session-{HARNESS}-{native_session_id}-{hook_event or 'update'}"
    try:
        client.store({"entities": [entity], "idempotency_key": idempotency_key})
    except Exception as exc:
        log("debug", f"record_agent_session failed: {exc}")
        return None
    return entity


def hash_transcript_file(transcript_path: str) -> tuple[str, int, int] | None:
    """Return (sha256_hex, byte_size, line_count) for a transcript file.

    Streams the file so large JSONL transcripts do not load into memory.
    Returns None if the path is missing or unreadable.
    """
    try:
        path = Path(transcript_path)
        if not path.is_file():
            return None
        digest = hashlib.sha256()
        size = 0
        lines = 0
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                digest.update(chunk)
                size += len(chunk)
                lines += chunk.count(b"\n")
        return digest.hexdigest(), size, lines
    except Exception as exc:
        log("debug", f"hash_transcript_file failed: {exc}")
        return None


def build_session_transcript_entity(
    *,
    content_hash: str,
    agent_session_id: str | None = None,
    file_size: int | None = None,
    turn_count: int | None = None,
    transcript_kind: str = "main",
    fmt: str = "claude_code_jsonl",
    mime_type: str = "application/jsonl",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a session_transcript index entity (pure; no network).

    Content-addressed by ``content_hash`` (identity), so re-recording an
    unchanged transcript coalesces. This writes the index only; uploading the
    transcript bytes to the sources bucket is handled out-of-band (backfill /
    future enhancement), hence no ``source_id`` / ``storage_url`` here.
    """
    entity: dict[str, Any] = {
        "entity_type": "session_transcript",
        "content_hash": content_hash,
        "harness": HARNESS,
        "format": fmt,
        "mime_type": mime_type,
        "transcript_kind": transcript_kind,
        **harness_provenance(),
    }
    if agent_session_id:
        entity["agent_session_id"] = agent_session_id
    if file_size is not None:
        entity["file_size"] = file_size
    if turn_count is not None:
        entity["turn_count"] = turn_count
    if extra:
        entity.update(extra)
    return entity


def record_session_transcript(
    client: Any | None,
    *,
    transcript_path: str | None,
    agent_session_id: str | None = None,
    transcript_kind: str = "main",
) -> dict[str, Any] | None:
    """Hash a transcript file and upsert its session_transcript index entity.

    Best-effort: a missing path, unreadable file, or transport error is logged
    and swallowed so the agent turn is never blocked.
    """
    if client is None or not transcript_path:
        return None
    hashed = hash_transcript_file(transcript_path)
    if hashed is None:
        return None
    content_hash, file_size, line_count = hashed
    entity = build_session_transcript_entity(
        content_hash=content_hash,
        agent_session_id=agent_session_id,
        file_size=file_size,
        turn_count=line_count or None,
        transcript_kind=transcript_kind,
    )
    idempotency_key = f"session-transcript-{content_hash}"
    try:
        client.store({"entities": [entity], "idempotency_key": idempotency_key})
    except Exception as exc:
        log("debug", f"record_session_transcript failed: {exc}")
        return None
    return entity


# ---------------------------------------------------------------------------
# Feature A — failure-signal accumulator
# ---------------------------------------------------------------------------

_NEOTOMA_TOOL_NAMES = {
    "submit_issue",
    "get_issue_status",
    "store",
    "store_structured",
    "store_unstructured",
    "retrieve_entities",
    "retrieve_entity_by_identifier",
    "create_relationship",
    "list_entity_types",
    "list_timeline_events",
}


def is_neotoma_relevant_tool(tool_name: Any, tool_input: Any) -> bool:
    """True when the tool looks like an MCP/CLI/HTTP call into Neotoma."""
    if isinstance(tool_name, str):
        lower = tool_name.lower()
        if (
            "neotoma" in lower
            or lower.startswith("mcp_neotoma")
            or lower.startswith("mcp_user-neotoma")
            or lower in _NEOTOMA_TOOL_NAMES
        ):
            return True
    if isinstance(tool_input, dict):
        for key in ("command", "cmd", "url"):
            value = tool_input.get(key)
            if isinstance(value, str):
                lower = value.lower()
                if (
                    "neotoma " in lower
                    or lower.startswith("neotoma")
                    or "/neotoma/" in lower
                    or "neotoma.io" in lower
                ):
                    return True
    return False


_HOME_DIR = str(Path.home())
_HOME_PATTERN = re.compile(re.escape(_HOME_DIR)) if _HOME_DIR else None
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_TOKEN_RE = re.compile(r"\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\b")
_UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
_PHONE_RE = re.compile(r"\b(?:\+?\d[\s-]?){7,}\d\b")


def scrub_error_message(raw: Any) -> str:
    """Light PII scrub for short error messages persisted via hooks."""
    if raw is None:
        return ""
    text = raw if isinstance(raw, str) else str(raw)
    text = _EMAIL_RE.sub("<EMAIL>", text)
    text = _TOKEN_RE.sub("<TOKEN>", text)
    text = _UUID_RE.sub("<UUID>", text)
    text = _PHONE_RE.sub("<PHONE>", text)
    if _HOME_PATTERN is not None:
        text = _HOME_PATTERN.sub("<HOME>", text)
    if len(text) > 400:
        text = text[:397] + "..."
    return text


_ERR_RE = re.compile(r"ERR_[A-Z0-9_]+")
_CODE_RE = re.compile(
    r"\b(ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|EACCES|EPIPE|EPERM|EEXIST|ENOENT)\b"
)
_HTTP_RE = re.compile(r"\bHTTP\s*(\d{3})\b", re.IGNORECASE)


def classify_error_message(raw: Any) -> str:
    if raw is None:
        return "unknown"
    text = raw if isinstance(raw, str) else str(raw)
    match = _ERR_RE.search(text)
    if match:
        return match.group(0)
    match = _CODE_RE.search(text)
    if match:
        return match.group(1)
    match = _HTTP_RE.search(text)
    if match:
        return f"HTTP_{match.group(1)}"
    if re.search(r"fetch failed", text, re.IGNORECASE):
        return "fetch_failed"
    if re.search(r"timeout", text, re.IGNORECASE):
        return "timeout"
    return "generic_error"


def extract_error_message(tool_output: Any) -> str:
    if not tool_output:
        return ""
    if isinstance(tool_output, str):
        return tool_output
    if not isinstance(tool_output, dict):
        return ""
    for key in ("error", "message", "error_message", "stderr"):
        candidate = tool_output.get(key)
        if isinstance(candidate, str):
            return candidate
        if isinstance(candidate, dict):
            nested = candidate.get("message")
            if isinstance(nested, str):
                return nested
            try:
                return json.dumps(candidate)
            except Exception:
                return ""
    return ""


def extract_invocation_shape(tool_input: Any) -> dict[str, Any]:
    if not isinstance(tool_input, dict):
        return {}
    shape: dict[str, Any] = {}
    for key in ("command", "cmd", "url", "method", "endpoint", "path", "operation"):
        value = tool_input.get(key)
        if isinstance(value, str):
            shape[key] = value if len(value) <= 120 else value[:117] + "..."
    entities = tool_input.get("entities")
    if isinstance(entities, list):
        shape["entity_count"] = len(entities)
    return shape


def _mcp_instructions_cache_path() -> Path:
    """Return the path for caching MCP interaction instructions."""
    import hashlib

    key = hashlib.md5(NEOTOMA_BASE_URL.encode()).hexdigest()[:8]
    return _hook_state_dir() / f"mcp-instructions-{key}.txt"


_MCP_INSTRUCTIONS_TTL_S = 3600  # 1 hour


def read_cached_mcp_instructions() -> str | None:
    """Return cached instructions if present and not expired."""
    path = _mcp_instructions_cache_path()
    if not path.exists():
        return None
    try:
        age = time.time() - path.stat().st_mtime
        if age > _MCP_INSTRUCTIONS_TTL_S:
            return None
        text = path.read_text(encoding="utf-8").strip()
        return text or None
    except Exception as exc:
        log("debug", f"read_cached_mcp_instructions failed: {exc}")
        return None


def write_cached_mcp_instructions(text: str) -> None:
    """Persist instructions to the cache file."""
    try:
        directory = _hook_state_dir()
        directory.mkdir(parents=True, exist_ok=True)
        _mcp_instructions_cache_path().write_text(text, encoding="utf-8")
    except Exception as exc:
        log("debug", f"write_cached_mcp_instructions failed: {exc}")


def _hook_state_dir() -> Path:
    override = os.environ.get("NEOTOMA_HOOK_STATE_DIR")
    if override:
        return Path(override)
    return Path.home() / ".neotoma" / "hook-state"


def _failure_state_path(session_id: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", session_id) or "unknown"
    return _hook_state_dir() / f"failures-{safe}.json"


def _read_failure_state(session_id: str) -> dict[str, Any]:
    path = _failure_state_path(session_id)
    if not path.exists():
        return {"session_id": session_id, "updated_at": "", "entries": {}}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return {
            "session_id": raw.get("session_id", session_id),
            "updated_at": raw.get("updated_at", ""),
            "entries": raw.get("entries", {}),
        }
    except Exception as exc:
        log("debug", f"failure state parse failed: {exc}")
        return {"session_id": session_id, "updated_at": "", "entries": {}}


def _write_failure_state(state: dict[str, Any]) -> None:
    try:
        directory = _hook_state_dir()
        directory.mkdir(parents=True, exist_ok=True)
        path = _failure_state_path(state["session_id"])
        path.write_text(json.dumps(state), encoding="utf-8")
    except Exception as exc:
        log("debug", f"failure state write failed: {exc}")


_FAILURE_TTL_S = 24 * 60 * 60


def _prune_expired(state: dict[str, Any]) -> dict[str, Any]:
    now = time.time()
    entries: dict[str, Any] = {}
    for key, entry in state.get("entries", {}).items():
        last_at = entry.get("last_at")
        try:
            ts = (
                datetime.fromisoformat(last_at.replace("Z", "+00:00"))
                if isinstance(last_at, str)
                else None
            )
        except Exception:
            ts = None
        if ts is None:
            continue
        age = now - ts.timestamp()
        if 0 <= age <= _FAILURE_TTL_S:
            entries[key] = entry
    return {**state, "entries": entries}


def failure_counter_key(tool_name: str, error_class: str) -> str:
    return f"{tool_name}::{error_class}"


def increment_failure_counter(
    session_id: str, tool_name: str, error_class: str
) -> dict[str, Any]:
    state = _prune_expired(_read_failure_state(session_id))
    key = failure_counter_key(tool_name, error_class)
    now_iso = datetime.now(timezone.utc).isoformat()
    prior = state["entries"].get(key)
    if prior:
        nxt = {
            "count": prior.get("count", 0) + 1,
            "first_at": prior.get("first_at", now_iso),
            "last_at": now_iso,
            "hinted": prior.get("hinted", False),
        }
    else:
        nxt = {"count": 1, "first_at": now_iso, "last_at": now_iso, "hinted": False}
    state["entries"][key] = nxt
    state["updated_at"] = now_iso
    _write_failure_state(state)
    return nxt


def read_failure_hint(session_id: str) -> dict[str, Any] | None:
    if os.environ.get("NEOTOMA_HOOK_FEEDBACK_HINT", "on").lower() == "off":
        return None
    try:
        threshold = int(os.environ.get("NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD", "2"))
    except ValueError:
        threshold = 2
    threshold = max(1, threshold)
    state = _prune_expired(_read_failure_state(session_id))
    best_key: str | None = None
    best_entry: dict[str, Any] | None = None
    for key, entry in state["entries"].items():
        if entry.get("hinted"):
            continue
        if entry.get("count", 0) < threshold:
            continue
        if best_entry is None or entry.get("count", 0) > best_entry.get("count", 0):
            best_key = key
            best_entry = entry
    if best_key is None or best_entry is None:
        return None
    parts = best_key.split("::", 1)
    tool_name = parts[0] if parts else "unknown"
    error_class = parts[1] if len(parts) > 1 else "unknown"
    state["entries"][best_key] = {**best_entry, "hinted": True}
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_failure_state(state)
    return {
        "tool_name": tool_name,
        "error_class": error_class,
        "count": best_entry.get("count", 0),
    }


def format_failure_hint(hint: dict[str, Any] | None) -> str:
    if not hint:
        return ""
    return (
        f"Neotoma hook note: {hint.get('count', 0)} recent failures this session "
        f"for tool `{hint.get('tool_name')}` with error class "
        f"`{hint.get('error_class')}`. If this is blocking your task, consider "
        "calling `submit_issue` with a PII-redacted title/body describing the friction. This "
        "is informational — do not auto-submit."
    )
