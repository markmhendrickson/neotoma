import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { storeConditionalStructured } from "../../src/services/store_conditional.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import { STORE_CONDITION_KEYS_SCHEMA } from "../../src/repositories/db/store_condition_schema.js";
import { NeotomaServer } from "../../src/server.js";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "../../src/config.js";
import { computeContentHash } from "../../src/services/raw_storage.js";
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
  await connection.exec("DROP TRIGGER IF EXISTS fail_conditional_receipt");
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
  await (await getDb()).exec("DROP TRIGGER IF EXISTS fail_conditional_receipt");
  vi.restoreAllMocks();
});
describe("native conditional store effects", () => {
  it("retains referenced bytes and honestly identifies private residue after late rollback, with no precommit events", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "conditional-store-bytes-"));
    const oldRoot = config.rawStorageDir;
    const oldReal = process.env.NEOTOMA_TEST_REAL_STORAGE;
    config.rawStorageDir = root;
    process.env.NEOTOMA_TEST_REAL_STORAGE = "1";
    try {
      const first = await storeConditionalStructured(request());
      const bytes = Buffer.from(JSON.stringify(request().entities));
      const originalFile = path.join(root, owner, computeContentHash(bytes));
      expect(readFileSync(originalFile)).toEqual(bytes);
      const before = await counts();
      const changed = {
        ...request("second-bytes"),
        entities: [{ ...request().entities[0], code: "SECOND" }],
      };
      await (
        await getDb()
      ).exec(
        "CREATE TRIGGER fail_conditional_receipt BEFORE UPDATE OF conditional_receipt ON store_condition_keys WHEN NEW.user_id = 'test-conditional-native-store' BEGIN SELECT RAISE(ABORT, 'synthetic late failure'); END"
      );
      events.length = 0;
      await expect(storeConditionalStructured(changed)).rejects.toMatchObject({
        code: "STORE_CONDITIONAL_FAILED",
        committed: false,
        private_storage_residue_possible: true,
      });
      expect(await counts()).toEqual(before);
      expect(events).toHaveLength(0);
      expect(readFileSync(originalFile)).toEqual(bytes);
      expect(
        existsSync(
          path.join(root, owner, computeContentHash(Buffer.from(JSON.stringify(changed.entities))))
        )
      ).toBe(true);
      expect(first.operation_receipt.status).toBe("applied");
    } finally {
      config.rawStorageDir = oldRoot;
      if (oldReal === undefined) delete process.env.NEOTOMA_TEST_REAL_STORAGE;
      else process.env.NEOTOMA_TEST_REAL_STORAGE = oldReal;
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("reports postcommit notification failure without pretending the applied receipt rolled back", async () => {
    vi.spyOn(substrateEventBus, "emitSubstrateEvent").mockImplementationOnce(() => {
      throw new Error("synthetic notification failure");
    });
    const applied = await storeConditionalStructured(request());
    expect(applied.operation_receipt.status).toBe("applied");
    expect(applied.postcommit_notifications).toMatchObject({
      status: "uncertain",
      failed: 1,
      attempted: 2,
    });
    expect(await counts()).toMatchObject({
      entities: 1,
      sources: 1,
      observations: 1,
      store_condition_keys: 1,
    });
    const before = await counts();
    expect((await storeConditionalStructured(request())).postcommit_notifications).toMatchObject({
      status: "not_repeated",
      attempted: 0,
    });
    expect(await counts()).toEqual(before);
  });
  it("keeps a lost commit acknowledgment uncertain and reconciles only by exact receipt replay", async () => {
    const connection = await getDb();
    const transaction = connection.transaction.bind(connection);
    vi.spyOn(connection, "transaction").mockImplementationOnce(async (fn) => {
      await transaction(fn);
      throw new Error("synthetic lost commit acknowledgment");
    });
    await expect(storeConditionalStructured(request())).rejects.toMatchObject({
      code: "STORE_RECEIPT_UNCERTAIN",
      outcome: { committed: "unknown" },
    });
    expect(await counts()).toMatchObject({
      entities: 1,
      sources: 1,
      observations: 1,
      store_condition_keys: 1,
    });
    expect(events).toHaveLength(0);
    const before = await counts();
    const replay = await storeConditionalStructured(request());
    expect(replay.operation_receipt.status).toBe("replayed");
    expect(replay.operation_receipt.original_observation_fields).toEqual({
      code: "ONE",
      status: "new",
    });
    expect(await counts()).toEqual(before);
    expect(events).toHaveLength(0);
  });
  it("uses natural HTTP and MCP arguments, with exact replay and false-mode/file/combined refusals before effects", async () => {
    const api = `http://127.0.0.1:${process.env.NEOTOMA_SESSION_DEV_PORT ?? "19080"}`;
    const input = {
      user_id: owner,
      idempotency_key: "http",
      expected_entity_absent: true,
      entities: request().entities,
    };
    async function post(body: unknown) {
      const response = await fetch(`${api}/store`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    const first = await post(input);
    expect(first.status).toBe(200);
    expect(first.body.operation_receipt.status).toBe("applied");
    const before = await counts();
    expect((await post(input)).body.operation_receipt.status).toBe("replayed");
    expect(await counts()).toEqual(before);
    for (const body of [
      { ...input, expected_entity_absent: false },
      {
        user_id: owner,
        file_idempotency_key: "http",
        file_content: Buffer.from("synthetic").toString("base64"),
        mime_type: "text/plain",
      },
      {
        user_id: owner,
        idempotency_key: "fresh-structured",
        file_idempotency_key: "http",
        entities: [{ ...input.entities[0], code: "TWO" }],
        file_content: Buffer.from("synthetic").toString("base64"),
        mime_type: "text/plain",
      },
    ]) {
      const refused = await post(body);
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe("STORE_KEY_MODE_CONFLICT");
      expect(await counts()).toEqual(before);
    }
    for (const flag of [null, "true", 1, {}]) {
      expect((await post({ ...input, expected_entity_absent: flag })).status).toBe(400);
      expect(await counts()).toEqual(before);
    }
    const server = new NeotomaServer();
    const args = {
      expected_entity_absent: true,
      idempotency_key: "mcp",
      entities: [{ ...input.entities[0], code: "THREE" }],
    };
    const applied = JSON.parse(
      (await server.executeToolForCli("store", args, owner)).content[0].text
    );
    expect(applied.operation_receipt.status).toBe("applied");
    const after = await counts();
    const replay = JSON.parse(
      (await server.executeToolForCli("store", args, owner)).content[0].text
    );
    expect(replay.operation_receipt.status).toBe("replayed");
    expect(await counts()).toEqual(after);
    await expect(
      server.executeToolForCli("store", { ...args, expected_entity_absent: false }, owner)
    ).rejects.toMatchObject({ code: "STORE_KEY_MODE_CONFLICT" });
    expect(await counts()).toEqual(after);
  });
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
