"""Tests that codex's ``record_conversation_turn`` actually writes a row.

This is the codex twin of the identical defect fixed in the Claude Code
plugin: ``client.store(entities=[...], idempotency_key=...)`` against a client
declaring ``def store(self, input: StoreInput)`` — one positional parameter.
The ``TypeError`` was swallowed by a bare ``except`` logging at ``debug``,
which is below the default ``NEOTOMA_LOG_LEVEL`` of ``warn`` and so printed
nothing at all.

As in the sibling suite, the fake transport reproduces the REAL signature and
deliberately refuses ``**kwargs`` — a permissive mock is precisely what would
let this regress. Every test asserts that **a conversation_turn row lands**,
not merely that the hook ran or that ``store`` was called; both of those were
always true while the table stayed empty.

Unlike the Claude Code plugin, codex does not vendor ``neotoma_client``, so the
real-signature cross-check is skipped when the package is not installed. The
call-shape assertions below do not depend on it.
"""

from __future__ import annotations

import importlib.util
import inspect
import os
import unittest
from typing import Any

# Load codex's _common BY PATH under a unique module name.
#
# A plain ``import _common`` is not safe here: the Claude Code plugin ships a
# module with the same name, and when both hook suites are collected in one
# pytest run whichever loads first wins via ``sys.modules`` — so these tests
# would silently exercise the OTHER package's code and pass while codex was
# broken. Verified empirically: breaking codex's _common left this suite green
# until the import below was made path-based.
_CODEX_COMMON_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "_common.py"
)
_spec = importlib.util.spec_from_file_location(
    "codex_hooks_common", _CODEX_COMMON_PATH
)
assert _spec is not None and _spec.loader is not None
_common = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_common)

record_conversation_turn = _common.record_conversation_turn


class SignatureBoundFakeClient:
    """Mirrors the real ``store``: ONE positional parameter, no ``**kwargs``."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def store(self, input: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(input)
        return {"entities": [{"entity_id": "ent_codex_turn_0001"}]}


class TestFakeMatchesRealSignature(unittest.TestCase):
    def test_fake_store_signature_matches_real_client(self) -> None:
        try:
            from neotoma_client.client import NeotomaClient
        except Exception:  # pragma: no cover - package not installed in this lane
            self.skipTest("neotoma_client not installed; call-shape tests still apply")
        real = inspect.signature(NeotomaClient.store)
        fake = inspect.signature(SignatureBoundFakeClient.store)
        self.assertEqual(
            [p.name for p in real.parameters.values()][1:],
            [p.name for p in fake.parameters.values()][1:],
        )

    def test_fake_rejects_keyword_form(self) -> None:
        """Guards the guard: a kwargs-tolerant fake would hide the bug."""
        with self.assertRaises(TypeError):
            SignatureBoundFakeClient().store(  # type: ignore[call-arg]
                entities=[{"entity_type": "conversation_turn"}], idempotency_key="k"
            )


class TestConversationTurnRowLands(unittest.TestCase):
    def test_a_conversation_turn_row_lands(self) -> None:
        client = SignatureBoundFakeClient()
        result = record_conversation_turn(
            client, session_id="sess-1", turn_id="turn-1", harness="codex"
        )

        self.assertEqual(len(client.calls), 1, "exactly one store call expected")
        entities = client.calls[0].get("entities")
        self.assertTrue(entities, "store payload carried no entities")
        self.assertEqual(entities[0]["entity_type"], "conversation_turn")
        self.assertEqual(entities[0]["session_id"], "sess-1")
        self.assertTrue(client.calls[0].get("idempotency_key"))

        self.assertIsNotNone(result, "caller got None — the row did not land")
        assert result is not None
        self.assertEqual(result["entity_id"], "ent_codex_turn_0001")

    def test_top_level_response_shape_is_understood(self) -> None:
        """The live instance returns entities at the top level, not nested."""

        class TopLevelClient(SignatureBoundFakeClient):
            def store(self, input: dict[str, Any]) -> dict[str, Any]:
                return {"entities": [{"entity_id": "ent_top"}]}

        result = record_conversation_turn(
            TopLevelClient(), session_id="s", turn_id="t", harness="codex"
        )
        self.assertIsNotNone(result, "top-level entities must be read back")
        assert result is not None
        self.assertEqual(result["entity_id"], "ent_top")

    def test_structured_response_shape_still_understood(self) -> None:
        class StructuredClient(SignatureBoundFakeClient):
            def store(self, input: dict[str, Any]) -> dict[str, Any]:
                return {"structured": {"entities": [{"entity_id": "ent_struct"}]}}

        result = record_conversation_turn(
            StructuredClient(), session_id="s", turn_id="t", harness="codex"
        )
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["entity_id"], "ent_struct")

    def test_store_receives_one_positional_argument(self) -> None:
        recorded: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

        class ShapeRecordingClient:
            def store(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
                recorded.append((args, kwargs))
                return {"entities": [{"entity_id": "ent_shape"}]}

        record_conversation_turn(
            ShapeRecordingClient(), session_id="s", turn_id="t", harness="codex"
        )
        args, kwargs = recorded[0]
        self.assertEqual(len(args), 1, "store must take one positional StoreInput")
        self.assertEqual(kwargs, {}, "store must not be called with keywords")


class TestFailureIsVisibleButNonFatal(unittest.TestCase):
    def setUp(self) -> None:
        self._logged: list[tuple[str, str]] = []
        self._orig_log = _common.log
        _common.log = lambda level, message: self._logged.append((level, message))

    def tearDown(self) -> None:
        _common.log = self._orig_log

    def test_signature_mismatch_logs_at_error_not_debug(self) -> None:
        class KeywordOnlyClient:
            def store(self, *, entities: Any, idempotency_key: Any) -> Any:
                raise AssertionError("unreachable")

        result = record_conversation_turn(
            KeywordOnlyClient(), session_id="s", turn_id="t", harness="codex"
        )
        self.assertIsNone(result, "must stay non-fatal")
        levels = [lvl for lvl, _ in self._logged]
        self.assertIn("error", levels, "a total write failure must be visible")
        self.assertNotIn("debug", levels, "debug prints nothing at the default level")
        self.assertTrue(any("BUG" in msg for _, msg in self._logged))

    def test_transport_error_is_warned_not_errored(self) -> None:
        class FlakyClient(SignatureBoundFakeClient):
            def store(self, input: dict[str, Any]) -> dict[str, Any]:
                raise ConnectionError("connection refused")

        result = record_conversation_turn(
            FlakyClient(), session_id="s", turn_id="t", harness="codex"
        )
        self.assertIsNone(result)
        levels = [lvl for lvl, _ in self._logged]
        self.assertIn("warn", levels)
        self.assertNotIn("error", levels, "a blip must not cry BUG")


if __name__ == "__main__":
    unittest.main()
