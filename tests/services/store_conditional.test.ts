import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { storeConditionalStructured } from "../../src/services/store_conditional.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import { STORE_CONDITION_KEYS_SCHEMA } from "../../src/repositories/db/store_condition_schema.js";
const owner = "test-conditional-native-store";
const schema = {
  id: "test-conditional-native-schema",
  entity_type: "conditional_native_test",
  schema_version: "1.0",
  active: true,
  user_id: owner,
  scope: "user",
  created_at: "2026-01-01T00:00:00.000Z",
  schema_definition: {
    fields: { code: { type: "string" }, status: { type: "string" } },
    canonical_name_fields: ["code"],
  },
  reducer_config: {
    merge_policies: {
      code: { strategy: "highest_priority" },
      status: { strategy: "highest_priority" },
    },
  },
};
const events: unknown[] = [];
const listener = (event: unknown) => events.push(event);
const request = (key = "first") => ({
  userId: owner,
  idempotencyKey: key,
  sourcePriority: 100,
  entities: [{ entity_type: schema.entity_type, code: "ONE", status: "new" }],
});
async function counts() {
  const connection = await getDb();
  const result: Record<string, number> = {};
  for (const table of [
    "sources",
    "entities",
    "observations",
    "entity_snapshots",
    "raw_fragments",
    "store_condition_keys",
  ])
    result[table] = Number(
      (
        (await connection
          .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
          .get(owner)) as { n: number }
      ).n
    );
  return result;
}
beforeEach(async () => {
  const connection = await getDb();
  await connection.exec("DROP TRIGGER IF EXISTS fail_conditional_observation");
  // This owned test DB may retain an older draft-only internal table between runs.
  await connection.exec("DROP TABLE IF EXISTS store_condition_keys");
  await connection.exec(STORE_CONDITION_KEYS_SCHEMA);
  for (const table of [
    "observations",
    "entity_snapshots",
    "entities",
    "raw_fragments",
    "sources",
    "store_condition_keys",
  ])
    await db.from(table).delete().eq("user_id", owner);
  const inserted = await db.from("schema_registry").upsert(schema, { onConflict: "id" });
  expect(inserted.error).toBeNull();
  events.length = 0;
  substrateEventBus.onSubstrateEvent(listener);
});
afterEach(async () => {
  substrateEventBus.removeListener("substrate_event", listener);
  await (await getDb()).exec("DROP TRIGGER IF EXISTS fail_conditional_observation");
  vi.restoreAllMocks();
});
describe("native conditional store effects", () => {
  it("creates one marked observation and replays its immutable receipt without effects", async () => {
    const first = await storeConditionalStructured(request());
    expect(first.operation_receipt.status).toBe("applied");
    expect(first.entities[0].entity_snapshot_after).toEqual({ code: "ONE", status: "new" });
    expect(await counts()).toMatchObject({
      entities: 1,
      sources: 1,
      observations: 1,
      entity_snapshots: 1,
      store_condition_keys: 1,
    });
    expect(events).toHaveLength(2);
    const before = await counts();
    const replay = await storeConditionalStructured(request());
    expect(replay.operation_receipt).toEqual({ ...first.operation_receipt, status: "replayed" });
    expect(await counts()).toEqual(before);
    expect(events).toHaveLength(2);
  });
  it("refuses a present physical identity and changed keyed payload with zero growth", async () => {
    await storeConditionalStructured(request());
    const before = await counts();
    await expect(storeConditionalStructured(request("second"))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      storeConditionalStructured({ ...request(), sourcePriority: 5 })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await counts()).toEqual(before);
    expect(events).toHaveLength(2);
  });
  it("rolls back source/entity/mode on native insert failure and emits nothing", async () => {
    await (
      await getDb()
    ).exec(
      "CREATE TRIGGER fail_conditional_observation BEFORE INSERT ON observations WHEN NEW.user_id = 'test-conditional-native-store' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END"
    );
    const before = await counts();
    await expect(storeConditionalStructured(request())).rejects.toMatchObject({
      committed: false,
      private_storage_residue_possible: true,
    });
    expect(await counts()).toEqual(before);
    expect(events).toHaveLength(0);
  });
  it("refuses missing immutable proof rather than trusting a current snapshot", async () => {
    const first = await storeConditionalStructured(request());
    const altered = await db
      .from("observations")
      .update({ canonical_hash: "tampered" })
      .eq("id", first.operation_receipt.observation_id);
    expect(altered.error).toBeNull();
    const before = await counts();
    await expect(storeConditionalStructured(request())).rejects.toMatchObject({
      code: "STORE_RECEIPT_UNCERTAIN",
    });
    expect(await counts()).toEqual(before);
  });
});
