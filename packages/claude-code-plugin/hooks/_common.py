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


# ---------------------------------------------------------------------------
# Tool-capture policy
#
# Hooks persist a `tool_invocation` record per tool call. Tool output is the
# bytes of whatever the tool touched, so the record carries METADATA ONLY for
# read-type tools (tool name, path, byte length, content hash) and a bounded,
# secret-redacted summary for every other tool. Nothing is stored for a call
# that touches a secret-bearing path. Adds fields; never renames existing ones
# (`input_summary`, `output_summary` keep their string shape).
#
# Python twin of the block in packages/cursor-hooks/hooks/_common.ts. The
# packages ship independently, so the logic is duplicated; behaviour parity is
# pinned by tests/fixtures/hook_output_capture/vectors.json.
# ---------------------------------------------------------------------------

CAPTURE_SUMMARY_MAX_LEN = 400
CAPTURE_SCAN_CAP = 8192

WITHHELD_SECRET_PATH_SUMMARY = "[withheld: secret-bearing path; output text not stored]"
WITHHELD_READ_SUMMARY = "[output text not stored: read-type tool]"

_SECRET_BASENAME_PATTERNS = [
    re.compile(r"^\.env", re.I),
    re.compile(r"\.env$", re.I),
    re.compile(
        r"\.(?:pem|key|p12|pfx|jks|keystore|kdbx|ppk|gpg|pgp|jwk|keychain|keychain-db|tfvars|tfstate)$",
        re.I,
    ),
    re.compile(r"^id_(?:rsa|dsa|ecdsa|ed25519)(?!.*\.pub$)", re.I),
    re.compile(
        r"^_?\.?(?:npmrc|yarnrc|netrc|pgpass|pypirc|git-credentials|htpasswd|dockercfg|vault-token|kubeconfig)$",
        re.I,
    ),
    re.compile(r"\.sops(?:\.|$)", re.I),
    re.compile(r"^keys\.txt$", re.I),
    re.compile(r"^\.claude\.json$", re.I),
    re.compile(
        r"(?:^|[._-])(?:secrets?|credentials?|passwords?|private[_-]?keys?|service[_-]?account|client[_-]?secret|api[_-]?keys?)(?:[._-]|$)",
        re.I,
    ),
]

_SECRET_DIR_SEGMENTS = frozenset(
    {".ssh", ".aws", ".gnupg", ".gpg", ".kube", ".docker", ".azure", ".password-store", ".sops"}
)


def is_secret_bearing_path(raw: Any) -> bool:
    """True when a path names a secret-bearing file or sits inside a secret directory."""
    if not isinstance(raw, str):
        return False
    trimmed = raw.strip()
    if not trimmed or len(trimmed) > 4096:
        return False
    segments = [s for s in trimmed.replace("\\", "/").split("/") if s]
    if not segments:
        return False
    for segment in segments:
        if segment.lower() in _SECRET_DIR_SEGMENTS:
            return True
    base = segments[-1]
    return any(p.search(base) for p in _SECRET_BASENAME_PATTERNS)


_PRIVATE_KEY_RE = re.compile(
    r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)"
)
_PREFIXED_TOKEN_RE = re.compile(r"\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\b")
_PROVIDER_TOKEN_RE = re.compile(
    r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b"
)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
_BEARER_RE = re.compile(r"\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}", re.I)
_URL_CREDENTIALS_RE = re.compile(r"(://)[^/\s:@]+:[^/\s@]+@")
_SECRET_ASSIGNMENT_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]*(?:secret|token|passw(?:or)?d|passphrase|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization)[A-Za-z0-9_.-]*\\?[\"']?\s*[:=]\s*)((?:(?:bearer|basic)\s+)?(?:\\?\"(?:[^\"\\]|\\(?!\"))*\\?\"|'[^']*'|[^\s\"'\\,;&}\]]+))",
    re.I,
)


def redact_secret_text(raw: Any) -> str:
    """Redact credential-shaped text.

    Extends the token pattern already used by `scrub_error_message` (plus the
    bearer / URL-credential patterns used elsewhere in the hooks) with
    private-key blocks, common provider tokens, JWTs, and `NAME=value` /
    `"name": "value"` assignments for secret-looking names.
    """
    if raw is None:
        return ""
    out = raw if isinstance(raw, str) else str(raw)
    if len(out) > CAPTURE_SCAN_CAP:
        out = out[:CAPTURE_SCAN_CAP]
    out = _PRIVATE_KEY_RE.sub("<PRIVATE_KEY>", out)
    out = _PREFIXED_TOKEN_RE.sub("<TOKEN>", out)
    out = _PROVIDER_TOKEN_RE.sub("<TOKEN>", out)
    out = _JWT_RE.sub("<JWT>", out)
    out = _BEARER_RE.sub(r"\1<REDACTED>", out)
    out = _URL_CREDENTIALS_RE.sub(r"\1<redacted>@", out)
    out = _SECRET_ASSIGNMENT_RE.sub(r"\1<REDACTED>", out)
    return out


_CAPTURE_PATH_KEYS = frozenset(
    {
        "path",
        "paths",
        "file",
        "files",
        "file_path",
        "file_paths",
        "filepath",
        "filename",
        "target_file",
        "targetfile",
        "target_directory",
        "notebook_path",
        "uri",
        "directory",
        "dir",
        "glob",
        "glob_pattern",
        "include",
        "pattern",
    }
)
_CAPTURE_COMMAND_KEYS = frozenset({"command", "cmd", "script"})
_COMMAND_TOKEN_SPLIT_RE = re.compile(r"[\s\"'`;|&<>()=,]+")
_OUTPUT_TOKEN_SPLIT_RE = re.compile(r"[\s\"'`;|&<>()=,:\[\]{}]+")


def _path_like_token(token: str) -> bool:
    return "/" in token or "\\" in token or "." in token


def _secret_path_tokens_in(text: str, splitter: "re.Pattern[str]") -> bool:
    for raw in splitter.split(text[:CAPTURE_SCAN_CAP]):
        token = re.sub(r"[.,;:!?]+$", "", raw)
        if token and _path_like_token(token) and is_secret_bearing_path(token):
            return True
    return False


def _collect_input_paths(tool_input: Any) -> tuple[list[str], bool]:
    paths: list[str] = []
    secret = False
    budget = 200

    def walk(value: Any, key: str, depth: int) -> None:
        nonlocal secret, budget
        budget -= 1
        if budget < 0 or depth > 4 or value is None:
            return
        if isinstance(value, str):
            lowered = key.lower()
            if lowered in _CAPTURE_PATH_KEYS:
                if len(paths) < 8:
                    paths.append(value[:512])
                if is_secret_bearing_path(value):
                    secret = True
            elif lowered in _CAPTURE_COMMAND_KEYS:
                if _secret_path_tokens_in(value, _COMMAND_TOKEN_SPLIT_RE):
                    secret = True
            return
        if isinstance(value, (list, tuple)):
            for item in list(value)[:50]:
                walk(item, key, depth + 1)
            return
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, str(k), depth + 1)

    walk(tool_input, "", 0)
    return paths, secret


def tool_input_mentions_secret_path(tool_input: Any) -> bool:
    """True when a tool input names a secret-bearing path (path field or shell token)."""
    return _collect_input_paths(tool_input)[1]


def _tool_name_tokens(name: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name).lower()
    return [t for t in re.split(r"[^a-z0-9]+", spaced) if t]


_READ_TOOL_TOKENS = frozenset(
    {
        "read",
        "cat",
        "view",
        "open",
        "grep",
        "glob",
        "search",
        "find",
        "head",
        "tail",
        "ripgrep",
        "rg",
        "parse",
        "ls",
        "dir",
        "directory",
    }
)
_WRITE_TOOL_TOKENS = frozenset({"write", "edit", "editor", "replace", "patch", "append", "insert"})
_SHELL_READ_PROGRAMS = frozenset(
    {
        "cat",
        "head",
        "tail",
        "less",
        "more",
        "bat",
        "nl",
        "tac",
        "sed",
        "awk",
        "grep",
        "egrep",
        "fgrep",
        "rg",
        "ag",
        "ack",
        "strings",
        "xxd",
        "od",
        "hexdump",
        "base64",
        "cut",
        "jq",
        "yq",
        "sort",
        "uniq",
        "type",
        "get-content",
        "gc",
    }
)
_SHELL_WRAPPERS = frozenset({"sudo", "env", "command", "time", "nohup", "exec", "builtin"})
_GIT_CONTENT_SUBCOMMANDS = frozenset({"show", "diff", "blame", "cat-file", "grep"})
_ENV_ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")


def _command_reads_files(command: str) -> bool:
    for segment in re.split(r"[|;&\n]+", command[:CAPTURE_SCAN_CAP]):
        words = segment.split()
        i = 0
        while i < len(words) and (
            _ENV_ASSIGNMENT_RE.match(words[i]) or words[i] in _SHELL_WRAPPERS
        ):
            i += 1
        program = re.sub(r"^.*[\\/]", "", words[i] if i < len(words) else "").lower()
        if program in _SHELL_READ_PROGRAMS:
            return True
        if program == "git":
            if any(w in _GIT_CONTENT_SUBCOMMANDS for w in words[i + 1 :]):
                return True
    return False


def _shell_command_of(tool_input: Any) -> str | None:
    if not isinstance(tool_input, dict):
        return None
    command = tool_input.get("command")
    if command is None:
        command = tool_input.get("cmd")
    return command if isinstance(command, str) else None


def is_read_type_tool(tool_name: Any, tool_input: Any) -> bool:
    """File reads and searches that return file content, including shell `cat`/`grep`/`git show`."""
    tokens = _tool_name_tokens(tool_name if isinstance(tool_name, str) else "")
    if any(t in _READ_TOOL_TOKENS for t in tokens):
        return True
    command = _shell_command_of(tool_input)
    return command is not None and _command_reads_files(command)


def is_write_type_tool(tool_name: Any) -> bool:
    """Tools whose INPUT carries the file content being written."""
    tokens = _tool_name_tokens(tool_name if isinstance(tool_name, str) else "")
    if any(t in _WRITE_TOOL_TOKENS for t in tokens):
        return True
    return "create" in tokens and "file" in tokens


def _serialize_for_capture(value: Any) -> str | None:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    except Exception:
        return None


def _bound_capture(text: str, max_len: int = CAPTURE_SUMMARY_MAX_LEN) -> str:
    return text if len(text) <= max_len else text[: max_len - 3] + "..."


def describe_tool_capture(tool_name: Any, tool_input: Any, tool_output: Any) -> dict[str, Any]:
    """Build the capture fields for a `tool_invocation` record.

    - read-type tool: metadata only (`output_bytes`, `output_sha256`, path); no text.
    - any tool touching a secret-bearing path (input path, shell token, or a path
      named in the output): no output text and no input content; byte length only.
    - write-type tool: input stored as metadata (paths, key names), never content.
    - everything else: bounded summary with credential-shaped text redacted.
    """
    paths, input_secret = _collect_input_paths(tool_input)
    out_text = _serialize_for_capture(tool_output)
    output_bytes = 0 if out_text is None else len(out_text.encode("utf-8", errors="replace"))
    secret = input_secret or (
        out_text is not None and _secret_path_tokens_in(out_text, _OUTPUT_TOKEN_SPLIT_RE)
    )
    read = is_read_type_tool(tool_name, tool_input)

    fields: dict[str, Any] = {}
    if secret:
        fields["output_summary"] = WITHHELD_SECRET_PATH_SUMMARY
        fields["output_capture"] = "withheld_secret_path"
    elif read:
        fields["output_summary"] = WITHHELD_READ_SUMMARY
        fields["output_capture"] = "metadata_only"
        if out_text is not None:
            fields["output_sha256"] = hashlib.sha256(
                out_text.encode("utf-8", errors="replace")
            ).hexdigest()
    else:
        fields["output_summary"] = (
            "<unserializable>"
            if out_text is None
            else _bound_capture(redact_secret_text(out_text))
        )
        fields["output_capture"] = "redacted_summary"
    fields["output_bytes"] = output_bytes
    if paths:
        fields["target_path"] = paths[0]

    if secret or is_write_type_tool(tool_name):
        record = tool_input if isinstance(tool_input, dict) else {}
        meta: dict[str, Any] = {
            "paths": paths[:5],
            "keys": [str(k) for k in list(record.keys())[:32]],
        }
        command = _shell_command_of(tool_input)
        if command is not None:
            meta["command"] = _bound_capture(redact_secret_text(command), 200)
        fields["input_summary"] = _bound_capture(
            json.dumps(meta, separators=(",", ":"), ensure_ascii=False)
        )
        fields["input_capture"] = "metadata_only"
    else:
        in_text = _serialize_for_capture(tool_input)
        fields["input_summary"] = (
            "<unserializable>"
            if in_text is None
            else _bound_capture(redact_secret_text(in_text))
        )
        fields["input_capture"] = "redacted_summary"
    return fields


def scrub_error_message(raw: Any) -> str:
    """Light PII scrub for short error messages persisted via hooks."""
    if raw is None:
        return ""
    text = redact_secret_text(raw if isinstance(raw, str) else str(raw))
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
