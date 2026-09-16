"""Tests for turn identity in the Claude Code hooks (#2440).

WHAT THESE HAVE TO CATCH, AND WHY THE OBVIOUS TESTS DO NOT

The defect was not that the hooks failed to run, or that rows were not
written, or that a field was missing. All of those were fine throughout. A
test asserting "the hook stores a tool_invocation" or "turn_key is populated"
passed for the entire life of the bug.

What was wrong was the VALUE: `turn_id = payload.get("turn_id") or
str(int(time.time() * 1000))` minted a fresh millisecond per call, so every
tool call became its own turn. Over the production corpus that produced 27,155
distinct turn_keys for 27,155 rows — mean exactly 1.00 calls per turn against
a contract mandating at least three.

So the assertion has to be about GROUPING: do two calls in one turn share a
turn_key? That is the question the old code answers wrongly and the new code
answers rightly, and it is the only question that separates them.

The second defect was detectability. The fallback produced a unique,
correctly-shaped, never-failing value indistinguishable from real data, so no
consumer could question it. Tests below therefore also assert that when
grouping is genuinely unavailable it is REPORTED as unavailable, in one
spelling, rather than papered over with a plausible value.
"""

from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


class TurnIdentityTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        os.environ["NEOTOMA_HOOK_STATE_DIR"] = self._tmp.name
        import _common

        importlib.reload(_common)
        self.common = _common

    def tearDown(self) -> None:
        os.environ.pop("NEOTOMA_HOOK_STATE_DIR", None)
        self._tmp.cleanup()

    # --- The regression itself ------------------------------------------

    def test_two_calls_in_one_turn_share_a_turn_key(self) -> None:
        """THE test. Red before the fix, for the right reason.

        Under the old code each call minted its own `time.time()*1000`, so the
        two turn_keys differed and this failed. It is the assertion that
        separates a working turn id from a per-call timestamp.
        """
        session = "session-abc"
        turn = self.common.begin_turn(session, None)

        first, first_src = self.common.resolve_turn_id(session, None)
        second, second_src = self.common.resolve_turn_id(session, None)

        self.assertEqual(first, second, "two calls in one turn must share a turn id")
        self.assertEqual(first, turn, "mid-turn hooks must see the turn UserPromptSubmit opened")
        self.assertEqual([first_src, second_src], ["state", "state"])

        key_one = f"{session}:{first}"
        key_two = f"{session}:{second}"
        self.assertEqual(key_one, key_two)

    def test_consecutive_turns_do_not_collide(self) -> None:
        """The counterpart: grouping must not over-group.

        A fix that returned a constant would pass the test above and be just as
        wrong, so this pins the other side.
        """
        session = "session-abc"
        first = self.common.begin_turn(session, None)
        calls_in_first = self.common.resolve_turn_id(session, None)[0]
        second = self.common.begin_turn(session, None)
        calls_in_second = self.common.resolve_turn_id(session, None)[0]

        self.assertNotEqual(first, second, "a new turn must get a new id")
        self.assertEqual(calls_in_first, first)
        self.assertEqual(calls_in_second, second)

    def test_turn_ids_are_not_timestamps(self) -> None:
        """Pins the specific shape that caused the bug.

        A 13-digit millisecond value is what made every call unique. If one
        ever reappears here, the defect is back regardless of what else passes.
        """
        turn = self.common.begin_turn("session-abc", None)
        self.assertFalse(
            turn.isdigit() and len(turn) == 13,
            f"turn id {turn!r} is a millisecond timestamp — the #2440 shape",
        )

    def test_sessions_do_not_share_turn_state(self) -> None:
        self.common.begin_turn("session-one", None)
        self.common.begin_turn("session-one", None)
        other = self.common.begin_turn("session-two", None)
        self.assertEqual(other, "t1", "each session counts its own turns")

    # --- Absence is legible, not fabricated ------------------------------

    def test_unavailable_grouping_is_reported_not_invented(self) -> None:
        """The heart of the second defect.

        With no turn ever opened there is no way to know the turn. The old code
        invented a unique plausible value; the fix says so in one spelling that
        a consumer can see and exclude.
        """
        turn, source = self.common.resolve_turn_id("never-started", None)
        self.assertEqual(turn, self.common.UNGROUPED_TURN_ID)
        self.assertEqual(source, "unavailable")
        self.assertFalse(
            turn.isdigit(),
            "absence must not be spelled as a number that looks like real data",
        )

    def test_ungrouped_rows_are_flagged_at_read_time(self) -> None:
        """Without this, a consumer cannot question the value it was given."""
        fields = self.common.turn_identity_fields("unavailable")
        self.assertIs(fields["turn_groupable"], False)
        self.assertEqual(fields["turn_id_source"], "unavailable")

        for good in ("harness", "state"):
            self.assertIs(self.common.turn_identity_fields(good)["turn_groupable"], True)

    def test_sentinel_spellings_normalize_to_one_value(self) -> None:
        """Absence gets a single spelling, per the SENTINEL_ASSIGNEES pattern.

        Without normalization, `""`, `"none"` and `"unknown"` would each group
        separately and silently — three flavours of "unknown" masquerading as
        three real turns.
        """
        for spelling in ("", "  ", "none", "NULL", "Unknown", "ungrouped", "-", "n/a"):
            turn, source = self.common.resolve_turn_id("never-started", spelling)
            self.assertEqual(turn, self.common.UNGROUPED_TURN_ID, f"{spelling!r} must normalize")
            self.assertEqual(source, "unavailable")

    # --- The harness-supplied path still wins ----------------------------

    def test_harness_turn_id_is_used_verbatim(self) -> None:
        turn, source = self.common.resolve_turn_id("session-abc", "real-turn-7")
        self.assertEqual(turn, "real-turn-7")
        self.assertEqual(source, "harness")

    def test_harness_turn_id_survives_into_state(self) -> None:
        opened = self.common.begin_turn("session-abc", "real-turn-7")
        self.assertEqual(opened, "real-turn-7")
        self.assertEqual(self.common.resolve_turn_id("session-abc", None), ("real-turn-7", "state"))

    # --- Never break a turn ----------------------------------------------

    def test_unwritable_state_degrades_to_unavailable_without_raising(self) -> None:
        """Hooks are best-effort. A state failure must be legible, not fatal."""
        os.environ["NEOTOMA_HOOK_STATE_DIR"] = "/proc/nonexistent-cannot-create"
        importlib.reload(self.common)
        try:
            self.common.begin_turn("session-abc", None)  # must not raise
            turn, source = self.common.resolve_turn_id("session-abc", None)
            self.assertEqual(source, "unavailable")
            self.assertEqual(turn, self.common.UNGROUPED_TURN_ID)
        finally:
            os.environ["NEOTOMA_HOOK_STATE_DIR"] = self._tmp.name
            importlib.reload(self.common)


if __name__ == "__main__":
    unittest.main()
