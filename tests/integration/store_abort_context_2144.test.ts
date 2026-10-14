/**
 * #2144: once a `/store` starts writing, the client's abort signal must not be
 * able to cancel it.
 *
 * `dbAbortContext` binds the request's AbortSignal ambiently so abandoned READS
 * free their reader slot (#2217), and states that writes are never abandoned.
 * But the store's write loop is read -> write -> read -> write, and the reads
 * inside it inherited the signal; a client hang-up rejected one of them and
 * ended the loop part way through the batch.
 *
 * The default test backend ignores abort contexts, so this asserts the cause
 * rather than the symptom: while observations are being written, no abort
 * signal may be bound to the async context. The real worker-database
 * consequence is covered in `tests/unit/db_worker_file_database.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { runKeyedStoreWrite } from "../../src/services/store_write_state.js";
import {
  currentDbAbortSignal,
  withDbAbortSignal,
} from "../../src/repositories/worker/worker_file_database.js";

const signalSeenDuringWrite: Array<AbortSignal | undefined> = [];

vi.mock("../../src/services/observation_storage.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/observation_storage.js")>();
  return {
    ...original,
    createObservation: (params: Parameters<typeof original.createObservation>[0]) => {
      signalSeenDuringWrite.push(currentDbAbortSignal());
      return original.createObservation(params);
    },
  };
});

const ENTITY_TYPE = "store_abort_context_2144_note";
const userId = randomUUID();

afterEach(async () => {
  signalSeenDuringWrite.length = 0;
  const { data: ents } = await db.from("entities").select("id").eq("user_id", userId);
  const entityIds = (ents ?? []).map((e: { id: string }) => e.id);
  const { data: sources } = await db.from("sources").select("id").eq("user_id", userId);
  const sourceIds = (sources ?? []).map((s: { id: string }) => s.id);
  if (entityIds.length > 0) await db.from("entity_snapshots").delete().in("entity_id", entityIds);
  await db.from("observations").delete().eq("user_id", userId);
  if (sourceIds.length > 0) {
    await db.from("raw_fragments").delete().in("source_id", sourceIds);
    await db.from("sources").delete().in("id", sourceIds);
  }
  if (entityIds.length > 0) await db.from("entities").delete().in("id", entityIds);
});

describe("runKeyedStoreWrite: the in-flight key is a (user, key) pair, not a string join (#2144)", () => {
  // Each pair concatenates to the same text under the usual joins, so a key
  // built by joining the two strings would make them serialise against each
  // other. They are different writes and must not.
  const ambiguous: Array<[[string, string], [string, string]]> = [
    [
      ["ab", "c"],
      ["a", "bc"],
    ],
    [
      ["a:b", "c"],
      ["a", "b:c"],
    ],
    [
      ["a|b", "c"],
      ["a", "b|c"],
    ],
    [
      ["a", ""],
      ["", "a"],
    ],
  ];

  it.each(ambiguous)("does not serialise %j against %j", async (first, second) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const held = runKeyedStoreWrite(first[0], first[1], () => gate.then(() => "held"));

    // If the two pairs shared a flight key this would wait for `held` and the
    // race below would be lost to the timeout.
    const outcome = await Promise.race([
      runKeyedStoreWrite(second[0], second[1], async () => "ran"),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 200)),
    ]);

    release();
    await held;
    expect(outcome).toBe("ran");
  });

  it("still serialises two calls for the same pair", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const a = runKeyedStoreWrite("u", "k", async () => {
      await gate;
      order.push("a");
    });
    const b = runKeyedStoreWrite("u", "k", async () => {
      order.push("b");
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual([]);
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(["a", "b"]);
  });
});

describe("store: the write phase is not cancellable by the request's abort signal (#2144)", () => {
  it("runs every observation write outside the ambient abort signal", async () => {
    const controller = new AbortController();
    const entities = Array.from({ length: 5 }, (_, seq) => ({
      entity_type: ENTITY_TYPE,
      title: `abort context ${seq}`,
    }));

    // Precondition: the context really is bound here, so a green result below
    // is the store detaching it rather than the context never being set.
    await withDbAbortSignal(controller.signal, async () => {
      expect(currentDbAbortSignal()).toBe(controller.signal);
      await storeStructuredForApi({
        userId,
        entities,
        sourcePriority: 100,
        idempotencyKey: `abort-ctx-${randomUUID()}`,
      });
    });

    expect(signalSeenDuringWrite).toHaveLength(5);
    expect(signalSeenDuringWrite.every((signal) => signal === undefined)).toBe(true);
  });

  it("completes the whole batch even when the signal has already fired", async () => {
    const controller = new AbortController();
    controller.abort();
    const entities = Array.from({ length: 5 }, (_, seq) => ({
      entity_type: ENTITY_TYPE,
      title: `abort fired ${seq}`,
    }));

    const result = await withDbAbortSignal(controller.signal, () =>
      storeStructuredForApi({
        userId,
        entities,
        sourcePriority: 100,
        idempotencyKey: `abort-fired-${randomUUID()}`,
      })
    );

    expect(result.observations_created ?? result.entities.length).toBeGreaterThanOrEqual(5);
    const { data: obs } = await db.from("observations").select("id").eq("user_id", userId);
    expect(obs).toHaveLength(5);
  });

  describe("a queued same-key call honours its own cancellation", () => {
    function deferred() {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      return { promise, resolve };
    }

    it("stops waiting when its request is cancelled and never starts its write", async () => {
      const key = `waiter-cancel-${randomUUID()}`;
      const gate = deferred();
      const first = runKeyedStoreWrite(userId, key, () => gate.promise.then(() => "first"));

      const controller = new AbortController();
      let waiterWrites = 0;
      const waiter = withDbAbortSignal(controller.signal, () =>
        runKeyedStoreWrite(userId, key, async () => {
          waiterWrites += 1;
          return "waiter";
        })
      );
      const settled = waiter.then(
        () => "resolved",
        () => "rejected"
      );

      controller.abort();
      // The waiter gives up while the first write is still running.
      expect(await settled).toBe("rejected");
      expect(waiterWrites).toBe(0);

      gate.resolve();
      expect(await first).toBe("first");
      // Nothing is left queued behind it: a later call runs immediately.
      expect(await runKeyedStoreWrite(userId, key, async () => "later")).toBe("later");
      expect(waiterWrites).toBe(0);
    });

    it("does not start a write for a waiter that was cancelled while the first write failed", async () => {
      const key = `waiter-cancel-fail-${randomUUID()}`;
      const gate = deferred();
      const first = runKeyedStoreWrite(userId, key, () =>
        gate.promise.then(() => {
          throw new Error("first write failed");
        })
      );
      const firstSettled = first.then(
        () => "resolved",
        () => "rejected"
      );

      const controller = new AbortController();
      let waiterWrites = 0;
      const waiter = withDbAbortSignal(controller.signal, () =>
        runKeyedStoreWrite(userId, key, async () => {
          waiterWrites += 1;
          return "waiter";
        })
      );
      const waiterSettled = waiter.then(
        () => "resolved",
        () => "rejected"
      );

      controller.abort();
      gate.resolve();
      expect(await firstSettled).toBe("rejected");
      expect(await waiterSettled).toBe("rejected");
      expect(waiterWrites).toBe(0);
    });

    it("does not start a write for a waiter whose hang-up landed after its wait ended", async () => {
      // The hang-up arrives in the window where the wait has already been
      // satisfied, so the wait's own abort listener can no longer reject it.
      // Suppressing the listener models exactly that window with a real signal.
      const key = `waiter-race-${randomUUID()}`;
      const gate = deferred();
      const first = runKeyedStoreWrite(userId, key, () => gate.promise.then(() => "first"));

      const controller = new AbortController();
      vi.spyOn(controller.signal, "addEventListener").mockImplementation(() => undefined);
      let waiterWrites = 0;
      const waiter = withDbAbortSignal(controller.signal, () =>
        runKeyedStoreWrite(userId, key, async () => {
          waiterWrites += 1;
          return "waiter";
        })
      );
      const waiterSettled = waiter.then(
        () => "resolved",
        () => "rejected"
      );

      controller.abort();
      gate.resolve();
      expect(await first).toBe("first");
      expect(await waiterSettled).toBe("rejected");
      expect(waiterWrites).toBe(0);
      // Nothing is left queued behind it.
      expect(await runKeyedStoreWrite(userId, key, async () => "later")).toBe("later");
    });

    it("still runs a waiter whose request is alive", async () => {
      const key = `waiter-alive-${randomUUID()}`;
      const gate = deferred();
      const first = runKeyedStoreWrite(userId, key, () => gate.promise.then(() => "first"));
      const controller = new AbortController();
      const waiter = withDbAbortSignal(controller.signal, () =>
        runKeyedStoreWrite(userId, key, async () => "waiter")
      );

      gate.resolve();
      expect(await first).toBe("first");
      expect(await waiter).toBe("waiter");
    });
  });
});
