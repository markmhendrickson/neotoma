"""Test-only outbound-network guard for the agentic-eval Python hook cells.

The eval adapter puts this directory on PYTHONPATH for claude-code-plugin
fixtures, so Python imports it at startup. It records every outbound
connection attempt at the socket layer (DNS lookups included), whatever HTTP
client makes it, so "the hooks make no requests" can be asserted against the
network rather than against a mock nothing points at.

  NEOTOMA_EVAL_NET_LOG   file to append one JSON line per attempt to; a
                         `<log>.loaded` marker is written on import so a
                         missing log can be told apart from a guard that
                         never loaded.
  NEOTOMA_EVAL_NET_DENY  "1": raise OSError for any non-loopback host, so a
                         regression cannot reach a real server from CI.

Never shipped: it lives under tests/ and is only on PYTHONPATH in the eval.
"""

from __future__ import annotations

import importlib.util
import ipaddress
import json
import os
import socket
import sys


def _chain_next_sitecustomize() -> None:
    """Run the sitecustomize this file shadows (Homebrew Python uses one to
    add its site-packages; without it httpx would not import)."""
    here = os.path.dirname(os.path.abspath(__file__))
    for entry in sys.path:
        if not entry or os.path.abspath(entry) == here:
            continue
        candidate = os.path.join(entry, "sitecustomize.py")
        if os.path.isfile(candidate):
            spec = importlib.util.spec_from_file_location("_shadowed_sitecustomize", candidate)
            if spec and spec.loader:
                spec.loader.exec_module(importlib.util.module_from_spec(spec))
            return


_chain_next_sitecustomize()

_LOG = os.environ.get("NEOTOMA_EVAL_NET_LOG") or ""
_DENY = os.environ.get("NEOTOMA_EVAL_NET_DENY") == "1"


def _is_loopback(host: object) -> bool:
    if not isinstance(host, str):
        return False
    if host.lower().rstrip(".") == "localhost":
        return True
    try:
        return ipaddress.ip_address(host.split("%", 1)[0]).is_loopback
    except ValueError:
        return False


def _record(fn: str, host: object, port: object) -> None:
    if _LOG:
        try:
            with open(_LOG, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"fn": fn, "host": str(host), "port": str(port)}) + "\n")
        except OSError:
            pass
    if _DENY and not _is_loopback(host):
        raise OSError(f"blocked by eval net guard: {fn} {host}:{port}")


def _split(address: object) -> tuple[object, object]:
    if isinstance(address, tuple) and address:
        return address[0], address[1] if len(address) > 1 else None
    return address, None  # AF_UNIX path or similar


if _LOG or _DENY:
    _orig_getaddrinfo = socket.getaddrinfo
    _orig_create_connection = socket.create_connection
    _orig_connect = socket.socket.connect
    _orig_connect_ex = socket.socket.connect_ex

    def _getaddrinfo(host, port, *args, **kwargs):  # type: ignore[no-untyped-def]
        _record("getaddrinfo", host, port)
        return _orig_getaddrinfo(host, port, *args, **kwargs)

    def _create_connection(address, *args, **kwargs):  # type: ignore[no-untyped-def]
        _record("create_connection", *_split(address))
        return _orig_create_connection(address, *args, **kwargs)

    def _connect(self, address):  # type: ignore[no-untyped-def]
        if self.family in (socket.AF_INET, socket.AF_INET6):
            _record("connect", *_split(address))
        return _orig_connect(self, address)

    def _connect_ex(self, address):  # type: ignore[no-untyped-def]
        if self.family in (socket.AF_INET, socket.AF_INET6):
            _record("connect_ex", *_split(address))
        return _orig_connect_ex(self, address)

    socket.getaddrinfo = _getaddrinfo
    socket.create_connection = _create_connection
    socket.socket.connect = _connect  # type: ignore[method-assign]
    socket.socket.connect_ex = _connect_ex  # type: ignore[method-assign]

    if _LOG:
        try:
            with open(_LOG + ".loaded", "w", encoding="utf-8") as fh:
                fh.write("1\n")
        except OSError:
            pass
