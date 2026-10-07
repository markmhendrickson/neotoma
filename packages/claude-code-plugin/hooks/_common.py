"""Shared helpers for Neotoma Claude Code hooks.

Each hook reads the Claude Code hook payload from stdin, does a small
amount of work against the Neotoma API, and writes a JSON response (or
nothing) to stdout. All hooks are best-effort — a failure here must never
block the agent. We catch every exception and log to stderr so Claude
Code prints it in verbose mode but the turn still proceeds.
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

# Prefer the vendored copy bundled alongside this file so the hook works
# without any manual pip install, regardless of the system Python environment.
sys.path.insert(0, str(Path(__file__).parent))
try:
    from neotoma_client import NeotomaClient, NeotomaClientError  # type: ignore
except Exception:  # pragma: no cover
    NeotomaClient = None  # type: ignore[assignment]
    NeotomaClientError = Exception  # type: ignore[assignment]


NEOTOMA_LOG_LEVEL = os.environ.get("NEOTOMA_LOG_LEVEL", "warn").lower()

# --- Which Neotoma the hooks talk to -------------------------------------
#
# The plugin bundles an MCP connector whose URL is the plugin option
# `neotoma_mcp_url` (plugin.json `userConfig`, default: the public sandbox).
# Claude Code resolves the connector to `connector_mcp_url()` below.
#
# Precedence for the hooks:
#   1. The plugin option (CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL), when the user
#      set it to something other than the default. Hooks == connector.
#   2. NEOTOMA_BASE_URL, when explicitly set (an existing local configuration).
#   3. An existing Neotoma CLI configuration (~/.config/neotoma/config.json):
#      its `base_url`, else http://127.0.0.1:3080, which is what plugin 0.1.x
#      hooks used. This keeps upgraded installs capturing where they did.
#   4. The plugin default (the public sandbox). Hooks == connector.
#
# 2 and 3 honour an existing local setup instead of falling back to the
# sandbox. If that differs from where the bundled connector points, the
# SessionStart hook says so visibly (see `status_message()`), with the one
# command that makes them agree. `neotoma hooks install --tool claude-code`
# sets the option, so after it runs 1 applies and they never differ.

PLUGIN_URL_OPTION_ENV = "CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL"
_PLUGIN_MANIFEST = Path(__file__).resolve().parent.parent / ".claude-plugin" / "plugin.json"
# Used only if plugin.json cannot be read; tests pin it to the manifest default.
_FALLBACK_DEFAULT_MCP_URL = "https://sandbox.neotoma.io/mcp"
# The 0.1.x hooks default, honoured when a local Neotoma CLI config exists.
LEGACY_LOCAL_BASE_URL = "http://127.0.0.1:3080"
# Hostnames that serve the shared public sandbox (custom domain and the
# hosting platform's alias for the same app).
PUBLIC_SANDBOX_HOSTS = frozenset({"sandbox.neotoma.io", "neotoma-sandbox.fly.dev"})
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def plugin_default_mcp_url() -> str:
    """The connector's default URL: plugin.json userConfig.neotoma_mcp_url.default."""
    try:
        manifest = json.loads(_PLUGIN_MANIFEST.read_text(encoding="utf-8"))
        value = manifest["userConfig"]["neotoma_mcp_url"]["default"]
        if isinstance(value, str) and value.strip():
            return value.strip()
    except Exception:
        pass
    return _FALLBACK_DEFAULT_MCP_URL


def _with_scheme(url: str) -> str:
    url = url.strip()
    if url and "://" not in url:
        return "https://" + url
    return url


def mcp_url_to_base_url(url: str) -> str:
    """API root for an MCP endpoint URL (drops a trailing `/mcp`)."""
    base = _with_scheme(url).rstrip("/")
    if base.lower().endswith("/mcp"):
        base = base[: -len("/mcp")]
    return base


def url_host(url: str) -> str:
    """Normalised hostname: lowercase, no trailing dot, scheme optional."""
    try:
        from urllib.parse import urlparse

        return (urlparse(_with_scheme(url)).hostname or "").lower().rstrip(".")
    except Exception:
        return ""


def url_origin(url: str) -> str:
    """scheme://host:port, normalised, for pairing a token with a URL."""
    try:
        from urllib.parse import urlparse

        parsed = urlparse(_with_scheme(url))
        scheme = (parsed.scheme or "").lower()
        port = parsed.port or (443 if scheme == "https" else 80)
        return f"{scheme}://{url_host(url)}:{port}"
    except Exception:
        return ""


def is_public_sandbox(url: str) -> bool:
    """True when url points at the shared public sandbox."""
    return url_host(url) in PUBLIC_SANDBOX_HOSTS


def is_loopback(url: str) -> bool:
    return url_host(url) in _LOOPBACK_HOSTS


def connector_mcp_url(environ: Any = None) -> str:
    """Where the bundled connector points: `${user_config.neotoma_mcp_url}`, defaulted."""
    environ = os.environ if environ is None else environ
    option = (environ.get(PLUGIN_URL_OPTION_ENV) or "").strip()
    return option or plugin_default_mcp_url()


def _local_cli_config_base_url(environ: Any) -> str | None:
    """Base URL from an existing Neotoma CLI config, or None if there is none."""
    home = (environ.get("HOME") or "").strip() or str(Path.home())
    config_path = Path(home) / ".config" / "neotoma" / "config.json"
    if not config_path.is_file():
        return None
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
        value = data.get("base_url") if isinstance(data, dict) else None
        if isinstance(value, str) and value.strip():
            return mcp_url_to_base_url(value)
    except Exception:
        pass
    return LEGACY_LOCAL_BASE_URL


def resolve_neotoma_url(environ: Any = None) -> tuple[str, str]:
    """Return (api_base_url, source) for the hooks. See precedence above."""
    environ = os.environ if environ is None else environ
    default = plugin_default_mcp_url()
    option = (environ.get(PLUGIN_URL_OPTION_ENV) or "").strip()
    if option and mcp_url_to_base_url(option) != mcp_url_to_base_url(default):
        return mcp_url_to_base_url(option), "plugin_option"
    explicit = (environ.get("NEOTOMA_BASE_URL") or "").strip()
    if explicit:
        return mcp_url_to_base_url(explicit), "env"
    local = _local_cli_config_base_url(environ)
    if local:
        return local, "local_config"
    return mcp_url_to_base_url(default), "plugin_default"


def resolve_token(base_url: str, environ: Any = None) -> str | None:
    """NEOTOMA_TOKEN, only for the Neotoma it was configured for.

    The token is paired with NEOTOMA_BASE_URL: it is sent only when the hooks'
    URL has the same origin, or, when NEOTOMA_BASE_URL is unset, only to a
    loopback (local) server. Never over plain http to a non-local host.
    """
    environ = os.environ if environ is None else environ
    token = (environ.get("NEOTOMA_TOKEN") or "").strip()
    if not token:
        return None
    if base_url.strip().lower().startswith("http://") and not is_loopback(base_url):
        return None
    paired = (environ.get("NEOTOMA_BASE_URL") or "").strip()
    if paired:
        return token if url_origin(paired) == url_origin(base_url) else None
    return token if is_loopback(base_url) else None


def in_plugin(environ: Any = None) -> bool:
    environ = os.environ if environ is None else environ
    return bool((environ.get("CLAUDE_PLUGIN_ROOT") or "").strip())


def status_message(environ: Any = None) -> str | None:
    """One user-visible line about capture, or None when all is well."""
    environ = os.environ if environ is None else environ
    base, source = resolve_neotoma_url(environ)
    if is_public_sandbox(base):
        return (
            "Neotoma: connected to the shared public sandbox, so lifecycle capture is off. "
            "Do not store personal data there. To use your own Neotoma, run "
            "`neotoma hooks install --tool claude-code`, or set /plugin > neotoma > "
            "Configure options > Neotoma MCP URL."
        )
    if not in_plugin(environ):
        return None
    connector = connector_mcp_url(environ)
    if mcp_url_to_base_url(connector) != base:
        where = "NEOTOMA_BASE_URL" if source == "env" else "your Neotoma CLI config"
        return (
            f"Neotoma: lifecycle capture uses {base} (from {where}), but the plugin's "
            f"bundled connector points at {connector}. Run "
            "`neotoma hooks install --tool claude-code` to point the plugin at your "
            "Neotoma and turn off the duplicate connector."
        )
    return None


NEOTOMA_BASE_URL, NEOTOMA_URL_SOURCE = resolve_neotoma_url()
NEOTOMA_TOKEN = resolve_token(NEOTOMA_BASE_URL)


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
    if is_public_sandbox(NEOTOMA_BASE_URL):
        # The public sandbox is shared and readable by other visitors. Hooks
        # capture every prompt and reply, so they never write there; the
        # connector (agent-driven, deliberate writes) still works. The
        # SessionStart hook tells the user (status_message()).
        log("warn", "Neotoma is the public sandbox; lifecycle capture is off.")
        return None
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
