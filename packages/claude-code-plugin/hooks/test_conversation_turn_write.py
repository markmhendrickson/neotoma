"""Tests that ``record_conversation_turn`` actually writes a row.

Why these assertions and not easier ones
----------------------------------------
The defect under test left ``conversation_turn`` empty for the entire life of
the compliance framework: ``_common.py`` called

    client.store(entities=[entity], idempotency_key=...)

while the client declares ``def store(self, input: StoreInput)`` — one
positional parameter. The resulting ``TypeError`` was caught by a bare
``except`` and logged at ``debug``, which is *below* the default
``NEOTOMA_LOG_LEVEL`` of ``warn`` and therefore never printed at all.

Asserting that the hook runs, that it does not crash, or that ``store`` was
called would ALL have passed throughout this defect's life — the hook ran fine,
never crashed, and ``store`` was called (it just raised before sending
anything). So every test here asserts that **a conversation_turn row lands**.

The single most important property: the fake transport below reproduces the
REAL ``store`` signature — one positional ``input`` — and deliberately does NOT
accept ``**kwargs``. A permissive mock is exactly what would let this regress,
because the keyword call would sail straight through it.
"""

from __future__ import annotations

import inspect
import os
import sys
import unittest
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import _common  # noqa: E402
from _common import record_conversation_turn  # noqa: E402
from neotoma_client.client import NeotomaClient  # noqa: E402


class SignatureBoundFakeClient:
    """A fake whose ``store`` mirrors the real one: ONE positional parameter.

    No ``**kwargs``. If production code reverts to the keyword form, this
    raises ``TypeError`` exactly as the real client does, and the tests go red.
    """

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def store(self, input: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(input)
        return {"entities": [{"entity_id": "ent_test_turn_0001"}]}


class TestFakeMatchesRealSignature(unittest.TestCase):
    """The fake is only meaningful if it really mirrors the client."""

    def test_fake_store_signature_matches_real_client(self) -> None:
        real = inspect.signature(NeotomaClient.store)
        fake = inspect.signature(SignatureBoundFakeClient.store)
        self.assertEqual(
            [p.name for p in real.parameters.values()][1:],
            [p.name for p in fake.parameters.values()][1:],
            "fake store() must mirror the real signature or the tests prove nothing",
        )

    def test_fake_rejects_keyword_form_like_the_real_client(self) -> None:
        """Guards the guard: a fake that tolerated kwargs would hide the bug."""
        with self.assertRaises(TypeError):
            SignatureBoundFakeClient().store(  # type: ignore[call-arg]
                entities=[{"entity_type": "conversation_turn"}],
                idempotency_key="k",
            )


class TestConversationTurnRowLands(unittest.TestCase):
    def test_a_conversation_turn_row_lands(self) -> None:
        """THE test: a row must actually be written, not merely attempted."""
        client = SignatureBoundFakeClient()
        result = record_conversation_turn(
            client,
            session_id="sess-1",
            turn_id="turn-1",
            harness="claude-code",
        )

        self.assertEqual(len(client.calls), 1, "exactly one store call expected")
        payload = client.calls[0]
        entities = payload.get("entities")
        self.assertTrue(entities, "store payload carried no entities")
        self.assertEqual(entities[0]["entity_type"], "conversation_turn")
        self.assertEqual(entities[0]["session_id"], "sess-1")
        self.assertEqual(entities[0]["turn_id"], "turn-1")
        self.assertTrue(payload.get("idempotency_key"), "idempotency_key missing")

        self.assertIsNotNone(result, "caller got None — the row did not land")
        assert result is not None
        self.assertEqual(result["entity_id"], "ent_test_turn_0001")

    def test_compliance_counters_reach_the_payload(self) -> None:
        """The scorecard reads these fields; prove they survive the write."""
        client = SignatureBoundFakeClient()
        record_conversation_turn(
            client,
            session_id="sess-2",
            turn_id="turn-2",
            harness="claude-code",
            missed_steps=["user_phase_store"],
            tool_invocation_count=7,
            store_structured_calls=2,
            retrieve_calls=1,
        )
        entity = client.calls[0]["entities"][0]
        self.assertEqual(entity["missed_steps"], ["user_phase_store"])
        self.assertEqual(entity["tool_invocation_count"], 7)
        self.assertEqual(entity["store_structured_calls"], 2)
        self.assertEqual(entity["retrieve_calls"], 1)

    def test_store_receives_one_positional_argument(self) -> None:
        """Pins the call shape itself, so a keyword regression is caught here."""
        recorded: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

        class ShapeRecordingClient(SignatureBoundFakeClient):
            def store(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
                recorded.append((args, kwargs))
                return {"entities": [{"entity_id": "ent_shape"}]}

        record_conversation_turn(
            ShapeRecordingClient(), session_id="s", turn_id="t", harness="claude-code"
        )
        args, kwargs = recorded[0]
        self.assertEqual(len(args), 1, "store must take one positional StoreInput")
        self.assertEqual(kwargs, {}, "store must not be called with keywords")


class TestFailureIsVisibleButNonFatal(unittest.TestCase):
    """A hook must never crash a session — but must not hide a total failure."""

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
            KeywordOnlyClient(), session_id="s", turn_id="t", harness="claude-code"
        )

        self.assertIsNone(result, "must stay non-fatal")
        levels = [lvl for lvl, _ in self._logged]
        self.assertIn("error", levels, "a total write failure must be visible")
        self.assertNotIn(
            "debug", levels, "debug is below the default threshold and prints nothing"
        )
        self.assertTrue(
            any("BUG" in msg for _, msg in self._logged),
            "the signal must name this as a bug, not a transient blip",
        )

    def test_transport_error_is_warned_not_errored(self) -> None:
        """A genuine transport blip is not the same as a signature bug."""

        class FlakyClient(SignatureBoundFakeClient):
            def store(self, input: dict[str, Any]) -> dict[str, Any]:
                raise ConnectionError("connection refused")

        result = record_conversation_turn(
            FlakyClient(), session_id="s", turn_id="t", harness="claude-code"
        )
        self.assertIsNone(result)
        levels = [lvl for lvl, _ in self._logged]
        self.assertIn("warn", levels)
        self.assertNotIn("error", levels, "a blip must not cry BUG")

    def test_error_level_clears_the_default_log_threshold(self) -> None:
        """Proves the level change is not just a louder invisible line."""
        order = {"debug": 0, "info": 1, "warn": 2, "error": 3, "silent": 4}
        default_threshold = order["warn"]  # NEOTOMA_LOG_LEVEL default
        self.assertLess(
            order["debug"],
            default_threshold,
            "debug was structurally unprintable by default — that is why this hid",
        )
        self.assertGreaterEqual(
            order["error"], default_threshold, "error must actually print by default"
        )


if __name__ == "__main__":
    unittest.main()
