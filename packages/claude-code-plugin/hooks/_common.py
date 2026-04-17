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
import sys
import time
import uuid
from pathlib import Path
from typing import Any

try:
    from neotoma_client import NeotomaClient, NeotomaClientError  # type: ignore
except Exception:  # pragma: no cover - import fallback when package not installed
    NeotomaClient = None  # type: ignore[assignment]
    NeotomaClientError = Exception  # type: ignore[assignment]


NEOTOMA_BASE_URL = os.environ.get("NEOTOMA_BASE_URL", "http://127.0.0.1:3080")
NEOTOMA_TOKEN = os.environ.get("NEOTOMA_TOKEN", "dev-local")
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
