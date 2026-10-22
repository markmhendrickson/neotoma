import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EmbeddedRuntimeContext } from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import { runKeyedStoreWrite } from "../../src/services/store_write_state.js";
import { getDataKey, clearCachedDataKey } from "../../src/repositories/sqlite/local_db_adapter.js";

function make(database = {} as DbDatabase, keyFilePath = "") {
  const configuration = createEmbeddedRuntimeConfiguration({
    dataDirectory: join(process.cwd(), ".vitest", "scoped-state"),
    packageRoot: process.cwd(),
  });
  return new EmbeddedRuntimeContext({
    legacyIdentityPolicy: { tenantScopedEntityIds: false },
    attributionPolicy: { anonymous_writes: "allow" },
    database,
    configuration: {
      ...configuration,
      encryption: { ...configuration.encryption, enabled: Boolean(keyFilePath), keyFilePath },
    },
    adapters: {},
  });
}
const event = {
  event_type: "entity.updated" as const,
  timestamp: "2026-10-22T12:00:00.000Z",
  user_id: "same-user",
  entity_id: "same-entity",
  entity_type: "note",
  action: "updated" as const,
};

describe("embedded runtime state isolation", () => {
  it("isolates event listeners from another runtime and legacy callers, including saved methods and chaining", async () => {
    const a = make(),
      b = make(),
      legacy = vi.fn(),
      listenerA = vi.fn(),
      listenerB = vi.fn();
    substrateEventBus.onSubstrateEvent(legacy);
    const emit = substrateEventBus.emitSubstrateEvent;
    try {
      await a.run(() => substrateEventBus.onSubstrateEvent(listenerA));
      await b.run(() => substrateEventBus.onSubstrateEvent(listenerB));
      await Promise.all([
        a.run(async () => {
          await Promise.resolve();
          emit(event);
        }),
        b.run(async () => {
          await Promise.resolve();
          substrateEventBus.onSubstrateEvent(() => {}).emitSubstrateEvent(event);
        }),
      ]);
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
      expect(legacy).not.toHaveBeenCalled();
      emit(event);
      expect(legacy).toHaveBeenCalledTimes(1);
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    } finally {
      substrateEventBus.off("substrate_event", legacy);
      await a.dispose();
      await b.dispose();
    }
  });

  it("serializes the same key on one database while another database and legacy callers proceed", async () => {
    const database = {} as DbDatabase;
    const a = make(database),
      sameDatabase = make(database),
      b = make();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const held = a.run(() =>
      runKeyedStoreWrite("same-user", "same-key", async () => {
        order.push("a-start");
        await gate;
        order.push("a-end");
      })
    );
    const queued = sameDatabase.run(() =>
      runKeyedStoreWrite("same-user", "same-key", async () => {
        order.push("same-database");
      })
    );
    try {
      const other = b.run(() =>
        runKeyedStoreWrite("same-user", "same-key", async () => {
          order.push("b");
        })
      );
      const legacy = runKeyedStoreWrite("same-user", "same-key", async () => {
        order.push("legacy");
      });
      await Promise.race([
        Promise.all([other, legacy]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("different stores blocked")), 500)
        ),
      ]);
      expect(order).toEqual(["a-start", "b", "legacy"]);
    } finally {
      release();
      await Promise.all([held, queued]);
      await a.dispose();
      await sameDatabase.dispose();
      await b.dispose();
    }
    expect(order).toEqual(["a-start", "b", "legacy", "a-end", "same-database"]);
  });

  it("keeps derived keys and cache clearing scoped with synthetic key files", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "neotoma-scoped-keys-"));
    const pathA = join(temporary, "a"),
      pathB = join(temporary, "b");
    writeFileSync(pathA, "11".repeat(32));
    writeFileSync(pathB, "22".repeat(32));
    const a = make(undefined, pathA),
      b = make(undefined, pathB);
    try {
      const keyA = await a.run(getDataKey),
        keyB = await b.run(getDataKey);
      expect(keyA).not.toEqual(keyB);
      writeFileSync(pathA, "33".repeat(32));
      expect(await a.run(getDataKey)).toEqual(keyA);
      await a.run(clearCachedDataKey);
      expect(await a.run(getDataKey)).not.toEqual(keyA);
      expect(await b.run(getDataKey)).toEqual(keyB);
    } finally {
      await a.dispose();
      await b.dispose();
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
