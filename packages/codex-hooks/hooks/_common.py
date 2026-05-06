"""Shared helpers for Neotoma Codex CLI hooks.

Codex CLI invokes external commands at specific lifecycle points
(session start, session end, notifications). We mirror the pattern
used in the Claude Code plugin: read JSON from stdin, do a best-effort
Neotoma write, never block the agent.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from neotoma_client import NeotomaClient  # type: ignore
except Exception:  # pragma: no cover
    NeotomaClient = None  # type: ignore[assignment]


NEOTOMA_BASE_URL = os.environ.get("NEOTOMA_BASE_URL", "http://127.0.0.1:3080")
NEOTOMA_TOKEN = os.environ.get("NEOTOMA_TOKEN", "dev-local")
NEOTOMA_LOG_LEVEL = os.environ.get("NEOTOMA_LOG_LEVEL", "warn").lower()


def log(level: str, message: str) -> None:
    order = {"debug": 0, "info": 1, "warn": 2, "error": 3, "silent": 4}
    if order.get(level, 3) >= order.get(NEOTOMA_LOG_LEVEL, 2):
        sys.stderr.write(f"[neotoma-codex] {level}: {message}\n")


def read_hook_input() -> dict[str, Any]:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return {}
        return json.loads(raw)
    except Exception as exc:
        log("warn", f"Failed to parse hook input: {exc}")
        return {}


def get_client() -> Any | None:
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
    safe_session = session_id or f"codex-{uuid.uuid4()}"
    safe_turn = turn_id or str(int(time.time() * 1000))
    return f"conversation-{safe_session}-{safe_turn}-{suffix}"


def harness_provenance(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "data_source": "codex-hook",
        "harness": "codex-cli",
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
    harness: str = "codex-cli",
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
    """Append an observation to the per-turn ``conversation_turn`` entity."""
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
        entities_list = (result or {}).get("structured", {}).get("entities", [])
        return {"entity_id": entities_list[0].get("entity_id")} if entities_list else None
    except Exception as exc:
        log("debug", f"record_conversation_turn failed: {exc}")
        return None


# ---------------------------------------------------------------------------
# Feature A — failure-signal accumulator (storage-only for codex; codex CLI
# does not surface additionalContext, so we capture without prompt injection)
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
