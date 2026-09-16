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
        turn, _ = self.common.begin_turn(session, None)

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
        first, _ = self.common.begin_turn(session, None)
        calls_in_first = self.common.resolve_turn_id(session, None)[0]
        second, _ = self.common.begin_turn(session, None)
        calls_in_second = self.common.resolve_turn_id(session, None)[0]

        self.assertNotEqual(first, second, "a new turn must get a new id")
        self.assertEqual(calls_in_first, first)
        self.assertEqual(calls_in_second, second)

    def test_turn_ids_are_not_timestamps(self) -> None:
        """Pins the specific shape that caused the bug.

        A 13-digit millisecond value is what made every call unique. If one
        ever reappears here, the defect is back regardless of what else passes.
        """
        turn, _ = self.common.begin_turn("session-abc", None)
        self.assertFalse(
            turn.isdigit() and len(turn) == 13,
            f"turn id {turn!r} is a millisecond timestamp — the #2440 shape",
        )

    def test_sessions_do_not_share_turn_state(self) -> None:
        self.common.begin_turn("session-one", None)
        self.common.begin_turn("session-one", None)
        other, _ = self.common.begin_turn("session-two", None)
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
        opened, _ = self.common.begin_turn("session-abc", "real-turn-7")
        self.assertEqual(opened, "real-turn-7")
        self.assertEqual(self.common.resolve_turn_id("session-abc", None), ("real-turn-7", "state"))

    # --- The counter is monotonic, not derived from the displayed id ------

    def test_counter_survives_harness_turn(self) -> None:
        """A harness turn must not rewind the session counter.

        RED against the pre-fix line `"counter": int(resolved[1:]) if source
        == "counter" else 0`: a harness turn stored `counter: 0`, so the next
        counter mint computed `0 + 1` and reissued `t1` — the id turn 1
        already used. Actual pre-fix sequence: t1, t2, harness-9, **t1**.

        A reused id is worse than a fabricated one. The original #2440 defect
        split one turn into many, which shows up as an implausible 1.00
        calls-per-turn. This one MERGES unrelated turns into one, which shows
        up as a plausible number that is simply too low, with no signal at all.
        """
        self.common.begin_turn("s", None)  # t1
        self.common.begin_turn("s", None)  # t2
        self.common.begin_turn("s", "harness-9")
        third, _ = self.common.begin_turn("s", None)
        self.assertEqual(third, "t3", "harness turn must not rewind the counter")

    def test_ids_never_repeat_across_mixed_harness_and_counter_turns(self) -> None:
        """The general property the case above is one instance of.

        Asserting only that `begin_turn` returns an id, or that the id is
        non-empty, would have passed throughout this defect's life — the ids
        were always well-formed. Only uniqueness across turns separates the
        broken code from the fixed code.
        """
        seen: list[str] = []
        for supplied in (None, None, "harness-9", None, "harness-10", None, None):
            turn, _ = self.common.begin_turn("s", supplied)
            seen.append(turn)
        self.assertEqual(
            len(seen), len(set(seen)), f"turn ids reused across turns: {seen}"
        )

    def test_harness_id_cannot_squat_on_the_counter_namespace(self) -> None:
        """A harness id shaped `t{n}` must not reuse an id the counter minted.

        RED against `545acaf7`: harness ids were stored verbatim with no check
        against the `t{n}` namespace `begin_turn` mints for itself, so the
        sequence below produced ['t1', 't2', 't1', 't3'] — four turns, three
        distinct ids, `t1` used twice.

        This is the rewind defect reached from the other side: the counter no
        longer goes backwards, but nothing stopped a harness id from landing on
        an id it had already issued. Same silent merge, same absence of any
        signal. The earlier uniqueness test used `harness-9`/`harness-10`, which
        cannot collide by construction, so it never pinned this.
        """
        ids = [self.common.begin_turn("s", x)[0] for x in (None, None, "t1", None)]
        self.assertEqual(
            len(ids), len(set(ids)), f"harness id reused a counter id: {ids}"
        )

    def test_namespaced_harness_id_still_groups_the_turn(self) -> None:
        """Namespacing must not break grouping — the turn still has to resolve.

        A fix that rejected colliding harness ids outright would pass the test
        above by losing real identity. This pins that the turn is still
        openable and that later hooks in it read back the same value.
        """
        opened, source = self.common.begin_turn("s", "t1")
        self.assertEqual(source, "harness")
        self.assertNotEqual(opened, "t1", "must not sit in the counter namespace")
        later, later_src = self.common.resolve_turn_id("s", None)
        self.assertEqual(later, opened, "the turn must still group")
        self.assertEqual(later_src, "state")
        self.assertIs(self.common.turn_identity_fields(source)["turn_groupable"], True)

    def test_harness_ids_outside_the_counter_namespace_are_verbatim(self) -> None:
        """Namespacing applies only to the shape that collides."""
        for supplied in ("real-turn-7", "turn-t1", "t1x", "T1"):
            opened, _ = self.common.begin_turn("s", supplied)
            self.assertEqual(opened, supplied, f"{supplied!r} must be used verbatim")

    def test_counter_turns_are_strictly_increasing(self) -> None:
        """Pins the direction, so a fix that avoided collision by wandering
        (random suffixes) would not pass.

        The counter is a high-water mark of ids MINTED, so it advances only on
        counter turns and a harness turn carries it forward untouched — dense
        `t1, t2, t3` rather than gappy. What matters is that it never goes
        backwards, which is the property a harness turn used to break.
        """
        self.common.begin_turn("s", None)  # t1
        self.common.begin_turn("s", "harness-a")  # preserves the mark
        second, _ = self.common.begin_turn("s", None)  # t2
        self.common.begin_turn("s", "harness-b")  # preserves the mark
        last, _ = self.common.begin_turn("s", None)  # t3
        self.assertEqual(second, "t2")
        self.assertEqual(last, "t3", "a harness turn must not rewind or skip the counter")

    # --- begin_turn fails closed when the write cannot be confirmed -------

    def test_begin_turn_returns_ungrouped_when_state_write_fails(self) -> None:
        """RED against the pre-fix line: `begin_turn` ended `return resolved`
        unconditionally, while `_write_turn_state` logged and swallowed.

        Pre-fix, with an unwritable state dir, `begin_turn` returned `t1` and
        `resolve_turn_id` returned `ungrouped` — so `UserPromptSubmit` stamped
        `s:t1` on the user message while every later hook in that same turn
        stamped `s:ungrouped`. The opening row claimed a groupable turn no
        other row shared.

        The write failure is SIMULATED rather than assumed unreachable: the
        state directory is pointed at a path that cannot be created.
        """
        os.environ["NEOTOMA_HOOK_STATE_DIR"] = "/proc/nonexistent-cannot-create"
        importlib.reload(self.common)
        try:
            turn, source = self.common.begin_turn("session-abc", None)
            self.assertEqual(
                turn,
                self.common.UNGROUPED_TURN_ID,
                "an unconfirmed write must not yield a groupable-looking id",
            )
            self.assertEqual(source, "unavailable")
            self.assertIs(
                self.common.turn_identity_fields(source)["turn_groupable"], False
            )
        finally:
            os.environ["NEOTOMA_HOOK_STATE_DIR"] = self._tmp.name
            importlib.reload(self.common)

    def test_opening_row_and_later_rows_agree_when_write_fails(self) -> None:
        """The defect stated as the property that matters to a consumer.

        What went wrong was not a return value in isolation — it was that the
        user-message row and the tool rows of ONE turn disagreed. This asserts
        agreement directly, so it fails on any future fix that makes
        `begin_turn` honest but leaves the two paths out of step.
        """
        os.environ["NEOTOMA_HOOK_STATE_DIR"] = "/proc/nonexistent-cannot-create"
        importlib.reload(self.common)
        try:
            opening, opening_src = self.common.begin_turn("session-abc", None)
            later, later_src = self.common.resolve_turn_id("session-abc", None)
            self.assertEqual(
                opening, later, "every hook in one turn must spell the turn the same way"
            )
            self.assertEqual(opening_src, later_src)
        finally:
            os.environ["NEOTOMA_HOOK_STATE_DIR"] = self._tmp.name
            importlib.reload(self.common)

    def test_harness_id_is_not_trusted_past_an_unconfirmed_write(self) -> None:
        """Fail closed on the harness path too.

        A harness-supplied id is real identity, but if it did not reach the
        state file the later hooks in that turn cannot see it, so the opening
        row must not claim it groups.
        """
        os.environ["NEOTOMA_HOOK_STATE_DIR"] = "/proc/nonexistent-cannot-create"
        importlib.reload(self.common)
        try:
            turn, source = self.common.begin_turn("session-abc", "real-turn-7")
            self.assertEqual(turn, self.common.UNGROUPED_TURN_ID)
            self.assertEqual(source, "unavailable")
        finally:
            os.environ["NEOTOMA_HOOK_STATE_DIR"] = self._tmp.name
            importlib.reload(self.common)

    def test_begin_turn_reports_its_own_source(self) -> None:
        """The caller must not re-derive the source from the payload.

        `user_prompt_submit` used to compute `"harness" if payload.get(
        "turn_id") else "counter"`, which cannot see a failed write and so
        would stamp `turn_groupable=true` on an ungrouped row.
        """
        _, counter_src = self.common.begin_turn("session-abc", None)
        self.assertEqual(counter_src, "counter")
        _, harness_src = self.common.begin_turn("session-abc", "real-turn-7")
        self.assertEqual(harness_src, "harness")
        for src in ("counter", "harness"):
            self.assertIs(self.common.turn_identity_fields(src)["turn_groupable"], True)

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
