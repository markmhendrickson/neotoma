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
import { getDb } from "../../src/repositories/db/connection.js";
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
  beforeEach(async () => {
    await (await getDb()).prepare("DELETE FROM substrate_events").run();
  });
  afterEach(async () => {
    await (await getDb()).prepare("DELETE FROM substrate_events").run();
  });

  it("persist returns a monotonically increasing seq", async () => {
    const s1 = await persistSubstrateEvent(ev("a"), null);
    const s2 = await persistSubstrateEvent(ev("b"), null);
    expect(s2).toBeGreaterThan(s1);
  });

  it("recovers events after the cursor even when the ring is gone (restart sim)", async () => {
    const s1 = await persistSubstrateEvent(ev("r1"), null);
    await persistSubstrateEvent(ev("r2"), null);
    await persistSubstrateEvent(ev("r3"), null);

    // Simulate a reconnect with a cursor that is no longer in any in-memory
    // ring: read straight from the durable log.
    const recovered = await getEventsAfterSeq(USER, s1);
    const ids = recovered.map((d) => d.event.entity_id);
    expect(ids).toEqual(["r2", "r3"]);
    // Returned seqs are strictly greater than the cursor.
    expect(recovered.every((d) => d.seq > s1)).toBe(true);
  });

  it("hasDurableCursor is true within retention, false once pruned away", async () => {
    const oldNow = Date.parse("2026-01-01T00:00:00.000Z");
    const seqOld = await persistSubstrateEvent(ev("old"), null, new Date(oldNow).toISOString());

    // Cursor is present, so it is recoverable.
    expect(await hasDurableCursor(USER, seqOld)).toBe(true);

    // Prune relative to a "now" 8 days after the old event with a 7-day window:
    // the old event falls outside retention and is removed.
    const eightDaysLater = oldNow + 8 * 24 * 60 * 60 * 1000;
    const pruned = await pruneEventLog(7, eightDaysLater);
    expect(pruned).toBe(1);

    // With the row gone, the cursor is beyond retention → not recoverable.
    expect(await hasDurableCursor(USER, seqOld)).toBe(false);
  });

  it("pruning keeps events inside the window and drops only older ones", async () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    // One old (10 days ago) and one recent (1 day ago) relative to `now`.
    const now = base + 10 * 24 * 60 * 60 * 1000;
    await persistSubstrateEvent(ev("stale"), null, new Date(base).toISOString());
    const recentSeq = await persistSubstrateEvent(
      ev("fresh"),
      null,
      new Date(now - 24 * 60 * 60 * 1000).toISOString()
    );

    const pruned = await pruneEventLog(7, now);
    expect(pruned).toBe(1); // only the stale one

    const remaining = await getEventsAfterSeq(USER, 0);
    expect(remaining.map((d) => d.event.entity_id)).toEqual(["fresh"]);
    expect(await hasDurableCursor(USER, recentSeq)).toBe(true);
  });

  it("preserves NULL user_id / entity_id without crashing", async () => {
    const e = ev("n");
    // @ts-expect-error intentional: exercise the NULL-coalescing path
    e.user_id = undefined;
    const seq = await persistSubstrateEvent(e, null);
    expect(seq).toBeGreaterThan(0);
    // Stored with NULL user_id; a user-scoped read does not return it.
    expect((await getEventsAfterSeq(USER, 0)).length).toBe(0);
  });

  // --- Advisory 1: SQL-side narrowing (#1482 review) ---

  it("narrows by event_type in SQL without widening the result set", async () => {
    await persistSubstrateEvent(ev("created-1", { eventType: "entity.created" }), null);
    await persistSubstrateEvent(ev("updated-1", { eventType: "entity.updated" }), null);
    await persistSubstrateEvent(ev("created-2", { eventType: "entity.created" }), null);

    const filtered = await getEventsAfterSeq(USER, 0, 1000, {
      eventTypes: ["entity.updated"],
    });
    expect(filtered.map((d) => d.event.entity_id)).toEqual(["updated-1"]);

    // No filter still returns everything (narrowing never widens or hides).
    expect((await getEventsAfterSeq(USER, 0)).length).toBe(3);
  });

  it("narrows by entity_id in SQL and combines with event_type", async () => {
    await persistSubstrateEvent(ev("a", { eventType: "entity.created" }), null);
    await persistSubstrateEvent(ev("b", { eventType: "entity.created" }), null);
    await persistSubstrateEvent(ev("b", { eventType: "entity.updated" }), null);

    expect((await getEventsAfterSeq(USER, 0, 1000, { entityIds: ["b"] })).length).toBe(2);
    const combined = await getEventsAfterSeq(USER, 0, 1000, {
      entityIds: ["b"],
      eventTypes: ["entity.updated"],
    });
    expect(combined.length).toBe(1);
    expect(combined[0]!.event.event_type).toBe("entity.updated");
  });

  it("treats an empty filter array as no restriction", async () => {
    await persistSubstrateEvent(ev("x"), null);
    await persistSubstrateEvent(ev("y"), null);
    expect(
      (await getEventsAfterSeq(USER, 0, 1000, { eventTypes: [], entityIds: [] })).length
    ).toBe(2);
  });

  // --- Advisory 2: cursor-ahead-of-head false positive (#1482 review) ---

  it("hasDurableCursor is false when the cursor is ahead of the durable head", async () => {
    const seq = await persistSubstrateEvent(ev("only"), null);
    // Exactly at head: nothing strictly newer to replay, but it is the boundary —
    // recoverable (replay returns empty, then falls through to ring).
    expect(await hasDurableCursor(USER, seq)).toBe(true);
    // Ahead of head (e.g. a ring-only id or future seq): NOT durably recoverable,
    // must fall through to the ring rather than silently deliver nothing.
    expect(await hasDurableCursor(USER, seq + 1)).toBe(false);
    expect(await hasDurableCursor(USER, seq + 50)).toBe(false);
  });

  it("hasDurableCursor is false for a quiet user with no durable events", async () => {
    // No rows persisted for this user at all.
    expect(await hasDurableCursor("11111111-1111-1111-1111-111111111111", 0)).toBe(false);
    expect(await hasDurableCursor("11111111-1111-1111-1111-111111111111", 999)).toBe(false);
  });

  it("hasDurableCursor still accepts a cursor one below the oldest retained seq", async () => {
    const seq = await persistSubstrateEvent(ev("first"), null);
    // Resuming from just before the oldest event replays it gap-free.
    expect(await hasDurableCursor(USER, seq - 1)).toBe(true);
    // Two below the oldest means an event was pruned between cursor and window.
    expect(await hasDurableCursor(USER, seq - 2)).toBe(false);
  });
});

// --- Encryption at rest for the durable-log payload ---

describe("durable substrate-event log: payload encryption at rest", () => {
  // A 24-word BIP39 mnemonic (test-only) to drive the data key.
  const TEST_MNEMONIC =
    "test test test test test test test test test test test test " +
    "test test test test test test test test test test test junk";

  beforeEach(async () => {
    await (await getDb()).prepare("DELETE FROM substrate_events").run();
  });
  afterEach(async () => {
    await (await getDb()).prepare("DELETE FROM substrate_events").run();
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

  async function rawPayload(seq: number): Promise<string> {
    const row = (await (await getDb())
      .prepare("SELECT payload FROM substrate_events WHERE seq = ?")
      .get(seq)) as { payload: string } | undefined;
    return row?.payload ?? "";
  }

  it("writes the payload as ciphertext on disk when encryption is enabled", async () => {
    enableEncryption();
    const seq = await persistSubstrateEvent(ev("secret-entity"), null);

    const stored = await rawPayload(seq);
    // Stored value is the iv:authTag:ciphertext format, not the plaintext JSON.
    expect(isEncryptedColumn(stored)).toBe(true);
    expect(stored).not.toContain("secret-entity");
    expect(stored).not.toContain("entity.created");
  });

  it("round-trips an encrypted payload back to the original event on read", async () => {
    enableEncryption();
    const seq = await persistSubstrateEvent(ev("rt"), null);

    const recovered = await getEventsAfterSeq(USER, seq - 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.event.entity_id).toBe("rt");
    expect(recovered[0]!.event.event_type).toBe("entity.created");
  });

  it("reads legacy plaintext rows written before encryption was enabled", async () => {
    // Write a plaintext row (encryption disabled), then enable encryption.
    const plainSeq = await persistSubstrateEvent(ev("legacy"), null);
    expect(isEncryptedColumn(await rawPayload(plainSeq))).toBe(false);

    enableEncryption();
    const encSeq = await persistSubstrateEvent(ev("modern"), null);
    expect(isEncryptedColumn(await rawPayload(encSeq))).toBe(true);

    // Both the legacy-plaintext and the newly-encrypted row read back correctly.
    const recovered = await getEventsAfterSeq(USER, plainSeq - 1);
    expect(recovered.map((d) => d.event.entity_id)).toEqual(["legacy", "modern"]);
  });

  it("still writes plaintext when encryption is disabled (no key)", async () => {
    const seq = await persistSubstrateEvent(ev("plain"), null);
    expect(isEncryptedColumn(await rawPayload(seq))).toBe(false);
    const recovered = await getEventsAfterSeq(USER, seq - 1);
    expect(recovered[0]!.event.entity_id).toBe("plain");
  });
});
