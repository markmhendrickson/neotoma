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
import { clearCachedDataKey } from "../../src/repositories/sqlite/local_db_adapter.js";
import { isEncryptedColumn } from "../../src/crypto/column_encryption.js";
import { config } from "../../src/config.js";
import type { SubstrateEvent, SubstrateEventType } from "../../src/events/types.js";

const USER = "00000000-0000-0000-0000-000000000000";

function ev(
  entityId: string,
  opts?: { eventType?: SubstrateEventType; entityType?: string }
): SubstrateEvent {
  return {
    event_id: `evt_${entityId}`,
    event_type: opts?.eventType ?? "entity.created",
    timestamp: "2026-01-01T00:00:00.000Z",
    user_id: USER,
    entity_id: entityId,
    entity_type: opts?.entityType ?? "thing",
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

  // --- Advisory 1: SQL-side narrowing (#1482 review) ---

  it("narrows by event_type in SQL without widening the result set", () => {
    persistSubstrateEvent(ev("created-1", { eventType: "entity.created" }), null);
    persistSubstrateEvent(ev("updated-1", { eventType: "entity.updated" }), null);
    persistSubstrateEvent(ev("created-2", { eventType: "entity.created" }), null);

    const filtered = getEventsAfterSeq(USER, 0, 1000, {
      eventTypes: ["entity.updated"],
    });
    expect(filtered.map((d) => d.event.entity_id)).toEqual(["updated-1"]);

    // No filter still returns everything (narrowing never widens or hides).
    expect(getEventsAfterSeq(USER, 0).length).toBe(3);
  });

  it("narrows by entity_id in SQL and combines with event_type", () => {
    persistSubstrateEvent(ev("a", { eventType: "entity.created" }), null);
    persistSubstrateEvent(ev("b", { eventType: "entity.created" }), null);
    persistSubstrateEvent(ev("b", { eventType: "entity.updated" }), null);

    expect(getEventsAfterSeq(USER, 0, 1000, { entityIds: ["b"] }).length).toBe(2);
    const combined = getEventsAfterSeq(USER, 0, 1000, {
      entityIds: ["b"],
      eventTypes: ["entity.updated"],
    });
    expect(combined.length).toBe(1);
    expect(combined[0]!.event.event_type).toBe("entity.updated");
  });

  it("treats an empty filter array as no restriction", () => {
    persistSubstrateEvent(ev("x"), null);
    persistSubstrateEvent(ev("y"), null);
    expect(getEventsAfterSeq(USER, 0, 1000, { eventTypes: [], entityIds: [] }).length).toBe(2);
  });

  // --- Advisory 2: cursor-ahead-of-head false positive (#1482 review) ---

  it("hasDurableCursor is false when the cursor is ahead of the durable head", () => {
    const seq = persistSubstrateEvent(ev("only"), null);
    // Exactly at head: nothing strictly newer to replay, but it is the boundary —
    // recoverable (replay returns empty, then falls through to ring).
    expect(hasDurableCursor(USER, seq)).toBe(true);
    // Ahead of head (e.g. a ring-only id or future seq): NOT durably recoverable,
    // must fall through to the ring rather than silently deliver nothing.
    expect(hasDurableCursor(USER, seq + 1)).toBe(false);
    expect(hasDurableCursor(USER, seq + 50)).toBe(false);
  });

  it("hasDurableCursor is false for a quiet user with no durable events", () => {
    // No rows persisted for this user at all.
    expect(hasDurableCursor("11111111-1111-1111-1111-111111111111", 0)).toBe(false);
    expect(hasDurableCursor("11111111-1111-1111-1111-111111111111", 999)).toBe(false);
  });

  it("hasDurableCursor still accepts a cursor one below the oldest retained seq", () => {
    const seq = persistSubstrateEvent(ev("first"), null);
    // Resuming from just before the oldest event replays it gap-free.
    expect(hasDurableCursor(USER, seq - 1)).toBe(true);
    // Two below the oldest means an event was pruned between cursor and window.
    expect(hasDurableCursor(USER, seq - 2)).toBe(false);
  });
});

// --- Encryption at rest for the durable-log payload ---

describe("durable substrate-event log: payload encryption at rest", () => {
  // A 24-word BIP39 mnemonic (test-only) to drive the data key.
  const TEST_MNEMONIC =
    "test test test test test test test test test test test test " +
    "test test test test test test test test test test test junk";

  beforeEach(() => {
    getSqliteDb().prepare("DELETE FROM substrate_events").run();
  });
  afterEach(() => {
    getSqliteDb().prepare("DELETE FROM substrate_events").run();
    config.encryption.enabled = false;
    config.encryption.mnemonic = "";
    clearCachedDataKey();
  });

  function enableEncryption(): void {
    config.encryption.enabled = true;
    config.encryption.mnemonic = TEST_MNEMONIC;
    config.encryption.mnemonicPassphrase = "";
    config.encryption.keyFilePath = "";
    clearCachedDataKey();
  }

  function rawPayload(seq: number): string {
    const row = getSqliteDb()
      .prepare("SELECT payload FROM substrate_events WHERE seq = ?")
      .get(seq) as { payload: string } | undefined;
    return row?.payload ?? "";
  }

  it("writes the payload as ciphertext on disk when encryption is enabled", () => {
    enableEncryption();
    const seq = persistSubstrateEvent(ev("secret-entity"), null);

    const stored = rawPayload(seq);
    // Stored value is the iv:authTag:ciphertext format, not the plaintext JSON.
    expect(isEncryptedColumn(stored)).toBe(true);
    expect(stored).not.toContain("secret-entity");
    expect(stored).not.toContain("entity.created");
  });

  it("round-trips an encrypted payload back to the original event on read", () => {
    enableEncryption();
    const seq = persistSubstrateEvent(ev("rt"), null);

    const recovered = getEventsAfterSeq(USER, seq - 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.event.entity_id).toBe("rt");
    expect(recovered[0]!.event.event_type).toBe("entity.created");
  });

  it("reads legacy plaintext rows written before encryption was enabled", () => {
    // Write a plaintext row (encryption disabled), then enable encryption.
    const plainSeq = persistSubstrateEvent(ev("legacy"), null);
    expect(isEncryptedColumn(rawPayload(plainSeq))).toBe(false);

    enableEncryption();
    const encSeq = persistSubstrateEvent(ev("modern"), null);
    expect(isEncryptedColumn(rawPayload(encSeq))).toBe(true);

    // Both the legacy-plaintext and the newly-encrypted row read back correctly.
    const recovered = getEventsAfterSeq(USER, plainSeq - 1);
    expect(recovered.map((d) => d.event.entity_id)).toEqual(["legacy", "modern"]);
  });

  it("still writes plaintext when encryption is disabled (no key)", () => {
    const seq = persistSubstrateEvent(ev("plain"), null);
    expect(isEncryptedColumn(rawPayload(seq))).toBe(false);
    const recovered = getEventsAfterSeq(USER, seq - 1);
    expect(recovered[0]!.event.entity_id).toBe("plain");
  });
});
