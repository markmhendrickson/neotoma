/**
 * Durable substrate-event log round-trip tests (#1464 Tier 2).
 *
 * Covers the contract that makes SSE resume restart-safe:
 *  - persist returns a monotonic durable seq;
 *  - events are recoverable after the in-memory ring is gone (restart sim);
 *  - hasDurableCursor distinguishes "within retention" from "beyond retention";
 *  - pruning drops events older than the retention window and only those.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";
import {
  persistSubstrateEvent,
  getEventsAfterSeq,
  hasDurableCursor,
  pruneEventLog,
} from "../../src/services/subscriptions/event_log.js";
import type { SubstrateEvent } from "../../src/events/types.js";

const USER = "00000000-0000-0000-0000-000000000000";

function ev(entityId: string): SubstrateEvent {
  return {
    event_id: `evt_${entityId}`,
    event_type: "entity.created",
    timestamp: "2026-01-01T00:00:00.000Z",
    user_id: USER,
    entity_id: entityId,
    entity_type: "thing",
    action: "created",
  };
}

describe("durable substrate-event log (#1464 Tier 2)", () => {
  beforeEach(() => {
    getSqliteDb().prepare("DELETE FROM substrate_events").run();
  });
  afterEach(() => {
    getSqliteDb().prepare("DELETE FROM substrate_events").run();
  });

  it("persist returns a monotonically increasing seq", () => {
    const s1 = persistSubstrateEvent(ev("a"), null);
    const s2 = persistSubstrateEvent(ev("b"), null);
    expect(s2).toBeGreaterThan(s1);
  });

  it("recovers events after the cursor even when the ring is gone (restart sim)", () => {
    const s1 = persistSubstrateEvent(ev("r1"), null);
    persistSubstrateEvent(ev("r2"), null);
    persistSubstrateEvent(ev("r3"), null);

    // Simulate a reconnect with a cursor that is no longer in any in-memory
    // ring: read straight from the durable log.
    const recovered = getEventsAfterSeq(USER, s1);
    const ids = recovered.map((d) => d.event.entity_id);
    expect(ids).toEqual(["r2", "r3"]);
    // Returned seqs are strictly greater than the cursor.
    expect(recovered.every((d) => d.seq > s1)).toBe(true);
  });

  it("hasDurableCursor is true within retention, false once pruned away", () => {
    const oldNow = Date.parse("2026-01-01T00:00:00.000Z");
    const seqOld = persistSubstrateEvent(ev("old"), null, new Date(oldNow).toISOString());

    // Cursor is present, so it is recoverable.
    expect(hasDurableCursor(USER, seqOld)).toBe(true);

    // Prune relative to a "now" 8 days after the old event with a 7-day window:
    // the old event falls outside retention and is removed.
    const eightDaysLater = oldNow + 8 * 24 * 60 * 60 * 1000;
    const pruned = pruneEventLog(7, eightDaysLater);
    expect(pruned).toBe(1);

    // With the row gone, the cursor is beyond retention → not recoverable.
    expect(hasDurableCursor(USER, seqOld)).toBe(false);
  });

  it("pruning keeps events inside the window and drops only older ones", () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    // One old (10 days ago) and one recent (1 day ago) relative to `now`.
    const now = base + 10 * 24 * 60 * 60 * 1000;
    persistSubstrateEvent(ev("stale"), null, new Date(base).toISOString());
    const recentSeq = persistSubstrateEvent(
      ev("fresh"),
      null,
      new Date(now - 24 * 60 * 60 * 1000).toISOString()
    );

    const pruned = pruneEventLog(7, now);
    expect(pruned).toBe(1); // only the stale one

    const remaining = getEventsAfterSeq(USER, 0);
    expect(remaining.map((d) => d.event.entity_id)).toEqual(["fresh"]);
    expect(hasDurableCursor(USER, recentSeq)).toBe(true);
  });

  it("preserves NULL user_id / entity_id without crashing", () => {
    const e = ev("n");
    // @ts-expect-error intentional: exercise the NULL-coalescing path
    e.user_id = undefined;
    const seq = persistSubstrateEvent(e, null);
    expect(seq).toBeGreaterThan(0);
    // Stored with NULL user_id; a user-scoped read does not return it.
    expect(getEventsAfterSeq(USER, 0).length).toBe(0);
  });
});
