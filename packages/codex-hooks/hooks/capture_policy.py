"""Tool-capture policy shared by the Neotoma agent-hook packages.

Hooks persist a `tool_invocation` record per tool call. Tool output is the
bytes of whatever the tool touched, so the record carries METADATA ONLY
(tool name, path, byte length) for every tool that is not positively known to
be a harmless non-content tool, and a bounded, secret-redacted summary for the
ones that are. Nothing is stored for a call that touches a secret-bearing path
or runs a secret-producing command. The policy fails closed: an unclassified
tool, an input larger than the scan limits, or a scan that had to stop early
all withhold output text.

Adds fields to the stored record; never renames existing ones
(`input_summary` and `output_summary` keep their string shape).

Python twin of packages/cursor-hooks/hooks/capture_policy.ts. THIS FILE IS
COPIED VERBATIM into packages/codex-hooks/hooks (the packages ship
independently); `tests/unit/hook_capture_policy_copies.test.ts` fails if a copy
drifts. Behaviour parity with the TypeScript copies is pinned by
tests/fixtures/hook_output_capture/vectors.json.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

SUMMARY_MAX_LEN = 400
# Redaction only ever returns the first SUMMARY_MAX_LEN characters, so it reads a bounded prefix.
REDACT_PREFIX_LEN = 8192
INPUT_STRING_CAP = 65536
INPUT_NODE_BUDGET = 5000
INPUT_MAX_DEPTH = 12
INPUT_ARRAY_CAP = 1000
OUTPUT_SCAN_CAP = 262144
RESOLVE_CAP = 256

WITHHELD_SECRET_PATH_SUMMARY = "[withheld: secret-bearing path; output text not stored]"
WITHHELD_READ_SUMMARY = "[output text not stored: read-type tool]"

# ---------------------------------------------------------------------------
# Secret-bearing paths
# ---------------------------------------------------------------------------

_SECRET_BASENAME_PATTERNS = [
    re.compile(p, re.I)
    for p in (
        r"^\.env",
        r"\.env$",
        r"\.(?:pem|key|p12|pfx|jks|keystore|kdbx|ppk|gpg|pgp|jwk|keychain|keychain-db|tfvars|tfstate)$",
        r"^id_(?:rsa|dsa|ecdsa|ed25519)(?!.*\.pub$)",
        r"^_?\.?(?:npmrc|yarnrc|netrc|pgpass|pypirc|git-credentials|htpasswd|dockercfg|vault-token|kubeconfig)$",
        r"\.sops(?:\.|$)",
        r"^keys?\.(?:txt|json|pem|yaml|yml)$",
        r"^\.claude\.json$",
        r"^\.?mcp\.json$",
        r"^auth\.(?:json|toml|ya?ml)$",
        r"^hosts\.ya?ml$",
        r"^wallet\.(?:dat|json)$",
        r"^tokens?\.(?:json|txt|ya?ml|toml|env|key|pem|cfg|conf|ini)$",
        r"^tokens?$",
        r"^application-(?:prod|production|secrets?)\.(?:ya?ml|properties)$",
        r"^\.?(?:bash|zsh|sh|fish|psql|mysql|python|node_repl|irb|lesshst|viminfo)_?(?:history|rc|profile|env|aliases)$",
        r"_history$",
        r"^\.(?:zshrc|bashrc|zprofile|zshenv|bash_profile|profile)$",
        r"(?:^|[._-])(?:mnemonic|seed[_-]?phrase|recovery[_-]?phrase)(?:[._-]|$)",
        r"(?:^|[._-])(?:secrets?|credentials?|passwords?|private[_-]?keys?|service[_-]?account|client[_-]?secret|api[_-]?keys?|access[_-]?tokens?|refresh[_-]?tokens?)(?:[._-]|$)",
    )
]

# Whole-path patterns (matched against the normalised, forward-slash path).
_SECRET_PATH_PATTERNS = [re.compile(r"(?:^|/)\.git/config$", re.I)]

_SECRET_DIR_SEGMENTS = frozenset(
    {".ssh", ".aws", ".gnupg", ".gpg", ".kube", ".docker", ".azure", ".password-store", ".sops"}
)

_PERCENT_RE = re.compile(r"%([0-9a-fA-F]{2})")
_FILE_URI_RE = re.compile(r"^file:(?://[^/]*)?", re.I)


def _percent_decode(text: str) -> str:
    return _PERCENT_RE.sub(lambda m: chr(int(m.group(1), 16)), text)


def _lexical_secret_path(raw: str) -> bool:
    normalised = raw.strip().replace("\\", "/")
    if not normalised or len(normalised) > 4096:
        return False
    if any(p.search(normalised) for p in _SECRET_PATH_PATTERNS):
        return True
    segments = [s for s in normalised.split("/") if s]
    if not segments:
        return False
    for segment in segments:
        if segment.lower() in _SECRET_DIR_SEGMENTS:
            return True
    base = segments[-1]
    return any(p.search(base) for p in _SECRET_BASENAME_PATTERNS)


class _ScanContext:
    __slots__ = ("resolve", "resolve_budget", "truncated")

    def __init__(self, resolve: bool = True) -> None:
        # Whether to resolve symlinks (input paths only; output text is just scanned for names).
        self.resolve = resolve
        # Symlink resolutions left; exhausting this marks the scan truncated.
        self.resolve_budget = RESOLVE_CAP
        # True when any limit stopped the scan from looking at everything.
        self.truncated = False


def _path_variants(raw: str) -> list[str]:
    out = [raw]
    current = raw.strip()
    match = _FILE_URI_RE.match(current)
    if match:
        current = current[match.end() :]
        out.append(current)
    if _PERCENT_RE.search(current):
        out.append(_percent_decode(current))
    return out


def _secret_path_in(raw: str, ctx: _ScanContext) -> bool:
    if not raw or len(raw) > 4096:
        return False
    variants = _path_variants(raw)
    if any(_lexical_secret_path(v) for v in variants):
        return True
    # A benign-looking name can be a symlink to a secret-bearing file.
    candidate = variants[-1].strip()
    if ctx.resolve and ("/" in candidate or "\\" in candidate or candidate.startswith(".")):
        if ctx.resolve_budget <= 0:
            ctx.truncated = True
            return False
        ctx.resolve_budget -= 1
        try:
            resolved = os.path.realpath(candidate)
            if resolved != candidate and os.path.lexists(candidate) and _lexical_secret_path(resolved):
                return True
        except Exception:
            pass
    return False


def is_secret_bearing_path(raw: Any) -> bool:
    """True when a path names a secret-bearing file, sits in a secret directory, or resolves to one."""
    if not isinstance(raw, str):
        return False
    return _secret_path_in(raw, _ScanContext())


# ---------------------------------------------------------------------------
# Credential-shaped text
# ---------------------------------------------------------------------------

_SECRET_NAME_KEYWORDS = (
    r"secret|token|passw(?:or)?d|passphrase|pass(?![a-z])|pwd|credential|authorization"
    r"|api[_-]?key|access[_-]?key|private[_-]?key|(?:encryption|signing|ssh|master|auth|license|client|service|app|deploy|crypt)[_-]?key|cookie|mnemonic"
    r"|seed[_-]?phrase|session[_-]?id|signature|dsn"
)

_PRIVATE_KEY_RE = re.compile(
    r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)"
)
_PREFIXED_TOKEN_RE = re.compile(r"\b(?:sk|pk|ghp|ghs|ntk|aa)_[A-Za-z0-9_-]{16,}\b")
_PROVIDER_TOKEN_RE = re.compile(
    r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}"
    r"|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{30,}"
    r"|hf_[A-Za-z0-9]{24,}|AIza[0-9A-Za-z_-]{30,})\b"
)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
_BEARER_RE = re.compile(r"\b((?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]{12,}", re.I)
_URL_CREDENTIALS_RE = re.compile(r"(://)[^/\s:@]+:[^/\s@]+@")
_SECRET_FLAG_RE = re.compile(
    r"(?<![A-Za-z0-9_-])(--?[A-Za-z0-9-]*(?:"
    r"password|passwd|pass|pwd|passphrase|token|secret|api-?key|access-?key|private-?key|credential|auth|authorization|bearer|cookie"
    r")[A-Za-z0-9-]*(?:=|\s+))(?!-)(\"[^\"]*\"|'[^']*'|\S+)",
    re.I,
)
_USER_FLAG_RE = re.compile(r"((?:^|\s)(?:-u|--user|--proxy-user)(?:\s+|=))(\S*:\S*)")
_ATTACHED_P_FLAG_RE = re.compile(r"((?:^|\s)-p)(?=[^\s=-])\S+")
_SECRET_ASSIGNMENT_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]*(?:"
    + _SECRET_NAME_KEYWORDS
    + r")[A-Za-z0-9_.-]*\\?[\"']?\s*[:=]\s*)"
    r"((?:(?:bearer|basic)\s+)?(?:\\?\"(?:[^\"\\]|\\(?!\"))*\\?\"|'[^']*'|[^\s\"'\\,;&}\]]+))",
    re.I,
)


def redact_secret_text(raw: Any) -> str:
    """Redact credential-shaped text.

    Extends the token pattern already used by `scrub_error_message` with
    private-key blocks, common provider tokens, JWTs, bearer/basic credentials,
    URL credentials, secret-looking flags (`--password x`, `-pX`,
    `-u user:pass`) and `NAME=value` / `"name": "value"` assignments for
    secret-looking names. Only the first REDACT_PREFIX_LEN characters are read;
    callers return at most SUMMARY_MAX_LEN of the result.
    """
    if raw is None:
        return ""
    out = raw if isinstance(raw, str) else str(raw)
    if len(out) > REDACT_PREFIX_LEN:
        out = out[:REDACT_PREFIX_LEN]
    out = _PRIVATE_KEY_RE.sub("<PRIVATE_KEY>", out)
    out = _PREFIXED_TOKEN_RE.sub("<TOKEN>", out)
    out = _PROVIDER_TOKEN_RE.sub("<TOKEN>", out)
    out = _JWT_RE.sub("<JWT>", out)
    out = _BEARER_RE.sub(r"\1<REDACTED>", out)
    out = _URL_CREDENTIALS_RE.sub(r"\1<redacted>@", out)
    out = _USER_FLAG_RE.sub(r"\1<REDACTED>", out)
    out = _ATTACHED_P_FLAG_RE.sub(r"\1<REDACTED>", out)
    out = _SECRET_FLAG_RE.sub(r"\1<REDACTED>", out)
    out = _SECRET_ASSIGNMENT_RE.sub(r"\1<REDACTED>", out)
    return out


# ---------------------------------------------------------------------------
# Tool input scan (every string, fail closed)
# ---------------------------------------------------------------------------

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

# Commands whose output is, or can be, a credential.
_SECRET_SOURCE_COMMAND_RES = [
    re.compile(p, flags)
    for p, flags in (
        (r"(?<![A-Za-z0-9_-])op\s+(?:read|item|inject|run|document)(?![A-Za-z0-9_-])", re.I),
        (
            r"(?<![A-Za-z0-9_-])security\s+(?:find-generic-password|find-internet-password|dump-keychain|export)(?![A-Za-z0-9_-])",
            re.I,
        ),
        (r"(?<![A-Za-z0-9_-])pass\s+show(?![A-Za-z0-9_-])", re.I),
        (r"(?<![A-Za-z0-9_-])gpg2?\b[^|;&\n]*(?:--decrypt|\s-d\b)", re.I),
        (r"(?<![A-Za-z0-9_-])sops\s+(?:-d|--decrypt|exec-env)", re.I),
        (r"(?<![A-Za-z0-9_-])gh\s+auth\s+(?:token|status)", re.I),
        (
            r"(?<![A-Za-z0-9_-])(?:aws\s+(?:secretsmanager|ssm)|vault\s+(?:read|kv)|kubectl\s+get\s+secrets?|fly\s+secrets|doppler\s+secrets)(?![A-Za-z0-9_-])",
            re.I,
        ),
        (r"(?<![A-Za-z0-9_-])printenv(?![A-Za-z0-9_-])", re.I),
        (r"(?:^|[;&|(\s])env\s*(?:$|[;&|)>])", 0),
        (r"/proc/[^\s/]+/environ", re.I),
        (r"\$\{?[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASS|PASSWORD|PWD)[A-Za-z0-9_]*\}?", 0),
    )
]


def _text_is_secret_source(text: str) -> bool:
    return any(p.search(text) for p in _SECRET_SOURCE_COMMAND_RES)


_TOKEN_SPLIT_RE = re.compile(r"[\s\"'`;|&<>()=,:\[\]{}]+")
_TRAILING_PUNCT_RE = re.compile(r"[.,;:!?]+$")


def _string_mentions_secret_path(text: str, cap: int, ctx: _ScanContext) -> bool:
    if len(text) > cap:
        ctx.truncated = True
    bounded = text[:cap] if len(text) > cap else text
    # Whole-string check only for a single token: prose is judged token by token below.
    if len(bounded) <= 4096 and not re.search(r"\s", bounded) and _secret_path_in(bounded, ctx):
        return True
    sources = [bounded]
    if _PERCENT_RE.search(bounded):
        sources.append(_percent_decode(bounded))
    for source in sources:
        for raw_token in _TOKEN_SPLIT_RE.split(source):
            token = _TRAILING_PUNCT_RE.sub("", raw_token)
            if not token:
                continue
            if ("/" in token or "\\" in token or "." in token) and _secret_path_in(token, ctx):
                return True
    return False


def _collect_input(tool_input: Any) -> tuple[list[str], bool, bool]:
    """Returns (path-key values, secret found, scan truncated)."""
    ctx = _ScanContext()
    paths: list[str] = []
    secret = False
    budget = INPUT_NODE_BUDGET

    def walk(value: Any, key: str, depth: int) -> None:
        nonlocal secret, budget
        if value is None or isinstance(value, (bool, int, float)):
            return
        budget -= 1
        if budget < 0 or depth > INPUT_MAX_DEPTH:
            ctx.truncated = True
            return
        if isinstance(value, str):
            if key.lower() in _CAPTURE_PATH_KEYS and len(paths) < 8:
                paths.append(value[:512])
            if _string_mentions_secret_path(value, INPUT_STRING_CAP, ctx):
                secret = True
            head = value[:INPUT_STRING_CAP] if len(value) > INPUT_STRING_CAP else value
            if len(head) <= 4096 and _text_is_secret_source(head):
                secret = True
            return
        if isinstance(value, (list, tuple)):
            if len(value) > INPUT_ARRAY_CAP:
                ctx.truncated = True
            for item in list(value)[:INPUT_ARRAY_CAP]:
                walk(item, key, depth + 1)
            return
        if isinstance(value, dict):
            items = list(value.items())
            if len(items) > INPUT_ARRAY_CAP:
                ctx.truncated = True
            for k, v in items[:INPUT_ARRAY_CAP]:
                k = str(k)
                if _string_mentions_secret_path(k, 4096, ctx):
                    secret = True
                walk(v, k, depth + 1)
            return
        # Anything else is not serialisable input and cannot be inspected.
        ctx.truncated = True

    walk(tool_input, "", 0)
    return paths, secret, ctx.truncated


def tool_input_mentions_secret_path(tool_input: Any) -> bool:
    """True when a tool input names a secret-bearing path or secret-producing command in ANY
    string value (any key, any depth), or when the input was too large or too deep to scan
    completely."""
    _paths, secret, truncated = _collect_input(tool_input)
    return secret or truncated


# ---------------------------------------------------------------------------
# Tool classification (default: not harmless)
# ---------------------------------------------------------------------------


def _tool_name_tokens(name: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name).lower()
    return [t for t in re.split(r"[^a-z0-9]+", spaced) if t]


# Tools whose names say they return file or search content.
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
        "fetch",
        "download",
        "contents",
        "content",
    }
)
# Tools whose INPUT carries content, and whose result may echo content.
_WRITE_TOOL_TOKENS = frozenset(
    {"write", "edit", "editor", "replace", "patch", "append", "insert", "save", "upload", "put"}
)
# Tools positively known not to return file or tool-fetched content.
_HARMLESS_TOOL_TOKENS = frozenset(
    {"todo", "todos", "ask", "question", "plan", "mode", "switch", "think"}
)

_SHELL_READ_WORDS = (
    "cat|head|tail|less|more|bat|nl|tac|sed|awk|gawk|xargs|find|grep|egrep|fgrep|rg|ag|ack|strings"
    "|xxd|od|hexdump|base64|cut|jq|yq|sort|uniq|tee|cp|mv|scp|rsync|curl|wget|source|eval|dd|type"
    "|get-content|gc|open|vi|vim|nano|tar|zip|unzip|cpio|pbcopy|diff|cmp|comm|paste|fold|rev|column"
    "|read|mapfile|readarray"
)
_SHELL_READ_WORD_RE = re.compile(
    r"(?<![A-Za-z0-9_-])(?:" + _SHELL_READ_WORDS + r")(?![A-Za-z0-9_-])", re.I
)
_SHELL_GIT_CONTENT_RE = re.compile(
    r"(?<![A-Za-z0-9_-])git\b[^|;&\n]*(?<![A-Za-z0-9_-])"
    r"(?:show|diff|log|blame|cat-file|grep|archive|format-patch|stash)(?![A-Za-z0-9_-])",
    re.I,
)
_SHELL_INLINE_CODE_RE = re.compile(
    r"(?<![A-Za-z0-9_-])(?:(?:bash|sh|zsh|dash|ksh)\s+(?:-[A-Za-z]*c\b)"
    r"|(?:python[0-9.]*|node|perl|ruby|php|deno|bun|lua)\s+-[A-Za-z]*[ceEp]\b)",
    re.I,
)


def _command_reads_content(command: str) -> bool:
    """Any command whose text could read or fetch file content."""
    if len(command) > INPUT_STRING_CAP:
        return True
    return bool(
        _SHELL_READ_WORD_RE.search(command)
        or _SHELL_GIT_CONTENT_RE.search(command)
        or _SHELL_INLINE_CODE_RE.search(command)
        or "<" in command
    )


def _shell_command_of(tool_input: Any) -> str | None:
    if not isinstance(tool_input, dict):
        return None
    command = tool_input.get("command")
    if command is None:
        command = tool_input.get("cmd")
    return command if isinstance(command, str) else None


def _is_neotoma_family(tool_name: str, tool_input: Any) -> bool:
    if "neotoma" in tool_name.lower():
        return True
    if isinstance(tool_input, dict):
        for key in ("server", "toolName", "tool_name"):
            value = tool_input.get(key)
            if isinstance(value, str) and "neotoma" in value.lower():
                return True
    return False


def is_read_type_tool(tool_name: Any, tool_input: Any) -> bool:
    """Tools whose names say they read, search, fetch or parse content."""
    tokens = _tool_name_tokens(tool_name if isinstance(tool_name, str) else "")
    if any(t in _READ_TOOL_TOKENS for t in tokens):
        return True
    command = _shell_command_of(tool_input)
    return command is not None and _command_reads_content(command)


def is_write_type_tool(tool_name: Any) -> bool:
    """Tools whose input carries the file content being written."""
    tokens = _tool_name_tokens(tool_name if isinstance(tool_name, str) else "")
    if any(t in _WRITE_TOOL_TOKENS for t in tokens):
        return True
    return "create" in tokens and "file" in tokens


def is_harmless_non_content_tool(tool_name: Any, tool_input: Any) -> bool:
    """Positive classification of a tool as returning no file or fetched content: Neotoma's own
    tools, a few planning/UI tools, and shell commands whose text contains no read-like program
    or file-fetch verb. Anything else is treated as a content-returning tool and stored as
    metadata only."""
    name = tool_name if isinstance(tool_name, str) else ""
    if is_read_type_tool(name, tool_input) or is_write_type_tool(name):
        return False
    if _shell_command_of(tool_input) is not None:
        return True
    if _is_neotoma_family(name, tool_input):
        return True
    return any(t in _HARMLESS_TOOL_TOKENS for t in _tool_name_tokens(name))


# ---------------------------------------------------------------------------
# Capture fields
# ---------------------------------------------------------------------------


def _serialize_for_capture(value: Any) -> str | None:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    except Exception:
        return None


def _bound_capture(text: str, max_len: int = SUMMARY_MAX_LEN) -> str:
    return text if len(text) <= max_len else text[: max_len - 3] + "..."


def describe_tool_capture(tool_name: Any, tool_input: Any, tool_output: Any) -> dict[str, Any]:
    """Build the capture fields for a `tool_invocation` record.

    - secret-bearing path or secret-producing command anywhere in the input, a
      secret-bearing path named in the output, or any scan that hit a limit: no
      output text and no input content; byte length only.
    - any tool that is not positively harmless (file reads, searches, fetches,
      parses, writes whose results can echo content, unknown tools): metadata only.
    - harmless non-content tools: bounded summary, credential-shaped text redacted.
    - write-type tools and secret calls store their input as metadata (paths and
      key names), never the content.
    """
    paths, input_secret, input_truncated = _collect_input(tool_input)
    out_text = _serialize_for_capture(tool_output)
    output_bytes = 0 if out_text is None else len(out_text.encode("utf-8", errors="replace"))
    out_ctx = _ScanContext(resolve=False)
    output_secret = out_text is not None and (
        _string_mentions_secret_path(out_text, OUTPUT_SCAN_CAP, out_ctx) or out_ctx.truncated
    )
    secret = input_secret or input_truncated or output_secret

    fields: dict[str, Any] = {}
    if secret:
        fields["output_summary"] = WITHHELD_SECRET_PATH_SUMMARY
        fields["output_capture"] = "withheld_secret_path"
    elif not is_harmless_non_content_tool(tool_name, tool_input):
        fields["output_summary"] = WITHHELD_READ_SUMMARY
        fields["output_capture"] = "metadata_only"
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


def summarize_invocation_shape(tool_input: Any) -> dict[str, Any]:
    """Shape of a failed call's input for `tool_invocation_failure.invocation_shape`: which
    well-known fields were present and how long each was, never their text."""
    if not isinstance(tool_input, dict):
        return {}
    shape: dict[str, Any] = {}
    for key in ("command", "cmd", "url", "method", "endpoint", "path", "operation"):
        value = tool_input.get(key)
        if isinstance(value, str):
            shape[key] = f"<{len(value)} chars>"
    entities = tool_input.get("entities")
    if isinstance(entities, list):
        shape["entity_count"] = len(entities)
    return shape
