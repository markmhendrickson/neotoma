"""Exception types for the Neotoma client."""

from __future__ import annotations

from typing import Any


class NeotomaClientError(Exception):
    """Raised for all Neotoma client errors (network, HTTP, protocol)."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.body = body
