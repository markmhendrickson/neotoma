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
import { generateEmbedding } from "../../src/embeddings.js";
vi.mock("../../src/embeddings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/embeddings.js")>()),
  generateEmbedding: vi.fn(async () => null),
}));
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
async function counts(scope = owner) {
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
          .get(scope)) as { n: number }
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
  it.each(["unowned", "legacy-unowned", "foreign", "merged"] as const)(
    "refuses the physical %s row without adopting or redirecting it",
    async (kind) => {
      const first = await storeConditionalStructured(request());
      const changes =
        kind === "merged"
          ? { merged_to_entity_id: "synthetic-merge-target" }
          : {
              user_id:
                kind === "unowned"
                  ? null
                  : kind === "legacy-unowned"
                    ? "00000000-0000-0000-0000-000000000000"
                    : owner + "-physical-foreign",
            };
      const updated = await db
        .from("entities")
        .update(changes)
        .eq("id", first.operation_receipt.entity_id);
      expect(updated.error).toBeNull();
      const before = await counts();
      try {
        await expect(storeConditionalStructured(request("physical-other"))).rejects.toMatchObject({
          code: kind === "foreign" ? "entity_owner_conflict" : "CONFLICT",
        });
        expect(await counts()).toEqual(before);
        const physical = await db
          .from("entities")
          .select("user_id,merged_to_entity_id")
          .eq("id", first.operation_receipt.entity_id)
          .single();
        expect(physical.data).toMatchObject(changes);
      } finally {
        await db
          .from("entities")
          .update({ user_id: owner, merged_to_entity_id: null })
          .eq("id", first.operation_receipt.entity_id);
      }
    }
  );
  it.each(["κλειδί🔒", "\ud800"])(
    "preserves native Unicode key replay and mode arbitration for %j",
    async (key) => {
      const first = await storeConditionalStructured(request(key));
      const before = await counts();
      const second = await storeConditionalStructured(request(key));
      expect(second.operation_receipt).toEqual({ ...first.operation_receipt, status: "replayed" });
      const { storeStructuredForApi } = await import("../../src/actions.js");
      await expect(storeStructuredForApi(request(key))).rejects.toMatchObject({
        code: "STORE_KEY_MODE_CONFLICT",
      });
      expect(await counts()).toEqual(before);
    }
  );
  it("refuses deterministic foreign ownership before fresh source and claim effects, while legacy replay remains first", async () => {
    const original = await storeConditionalStructured(request());
    const { storeStructuredForApi } = await import("../../src/actions.js");
    const changedOwner = owner + "-different";
    const update = await db
      .from("entities")
      .update({ user_id: changedOwner })
      .eq("id", original.operation_receipt.entity_id);
    expect(update.error).toBeNull();
    const before = await counts();
    try {
      await expect(
        storeStructuredForApi({ ...request("owner-refusal"), expectedEntityAbsent: false })
      ).rejects.toMatchObject({
        code: "ERR_STORE_RESOLUTION_FAILED",
        issues: [{ code: "entity_owner_conflict" }],
      });
      expect(await counts()).toEqual(before);
      await expect(
        new NeotomaServer().executeToolForCli(
          "store",
          {
            entities: request().entities,
            idempotency_key: "mcp-owner-refusal",
          },
          owner
        )
      ).rejects.toMatchObject({ code: "entity_owner_conflict" });
      expect(await counts()).toEqual(before);
      const { claimCombinedStoreKeys } =
        await import("../../src/services/store_combined_admission.js");
      await expect(
        claimCombinedStoreKeys(request("combined-owner-refusal"), {
          key: "file-owner-refusal",
          content: Buffer.from("synthetic").toString("base64"),
        })
      ).rejects.toMatchObject({ code: "ERR_STORE_RESOLUTION_FAILED" });
      expect(await counts()).toEqual(before);
    } finally {
      await db
        .from("entities")
        .update({ user_id: owner })
        .eq("id", original.operation_receipt.entity_id);
    }
    const legacyRequest = {
      ...request("legacy-allowed"),
      entities: [{ entity_type: schema.entity_type, code: "LEGACY", status: "old" }],
      expectedEntityAbsent: false,
    };
    const legacy = await storeStructuredForApi(legacyRequest);
    const legacyEntityId = (legacy.entities as Array<{ entity_id: string }>)[0].entity_id;
    // Legacy source replay precedes new ownership admission by existing contract.
    await db.from("entities").update({ user_id: changedOwner }).eq("id", legacyEntityId);
    const replayBefore = await counts();
    try {
      const replay = await storeStructuredForApi(legacyRequest);
      expect(replay.source_id).toBe(legacy.source_id);
      expect(await counts()).toEqual(replayBefore);
    } finally {
      await db.from("entities").update({ user_id: owner }).eq("id", legacyEntityId);
    }
  });
  it("refuses legacy cross-owner targets before reserving metadata or uploading a source", async () => {
    const original = await storeConditionalStructured(request());
    const foreign = owner + "-foreign";
    const { storeStructuredForApi } = await import("../../src/actions.js");
    const before = await counts(foreign);
    try {
      await expect(
        storeStructuredForApi({
          userId: foreign,
          idempotencyKey: "foreign-refusal",
          sourcePriority: 100,
          entities: [
            {
              entity_type: schema.entity_type,
              target_id: original.operation_receipt.entity_id,
              code: "DIFFERENT",
              status: "overwrite",
            },
          ],
        })
      ).rejects.toMatchObject({ code: "ERR_STORE_RESOLUTION_FAILED" });
      expect(await counts(foreign)).toEqual(before);
    } finally {
      for (const table of [
        "observations",
        "entity_snapshots",
        "entities",
        "raw_fragments",
        "sources",
        "store_condition_keys",
      ])
        await db.from(table).delete().eq("user_id", foreign);
    }
  });
  it("never overwrites a later business correction with the original embedding basis", async () => {
    vi.mocked(generateEmbedding).mockImplementationOnce(async () => {
      const rows = await db.from("entities").select("id").eq("user_id", owner).single();
      expect(rows.error).toBeNull();
      const { createCorrection } = await import("../../src/services/correction.js");
      await createCorrection({
        entity_id: rows.data.id,
        entity_type: schema.entity_type,
        field: "status",
        value: "competitor",
        schema_version: schema.schema_version,
        user_id: owner,
        idempotency_key: "embedding-interleave",
      });
      return Array.from({ length: 1536 }, () => 0.25);
    });
    const applied = await storeConditionalStructured(request());
    expect(applied.operation_receipt.original_observation_fields.status).toBe("new");
    expect(applied.entities[0].entity_snapshot_after?.status).toBe("competitor");
    expect(applied.postcommit_notifications).toMatchObject({ status: "uncertain", failed: 1 });
    expect((await counts()).observations).toBe(2);
  });
  it("performs embedding work only after commit and retains the applied receipt on provider failure", async () => {
    vi.mocked(generateEmbedding).mockImplementationOnce(async (_text, trace) => {
      expect(await counts()).toMatchObject({
        entities: 1,
        observations: 1,
        store_condition_keys: 1,
      });
      if (trace) trace.reason = "embedding_unavailable";
      return null;
    });
    const applied = await storeConditionalStructured(request());
    expect(applied.operation_receipt.status).toBe("applied");
    expect(applied.postcommit_notifications).toMatchObject({ status: "uncertain", failed: 1 });
    const calls = vi.mocked(generateEmbedding).mock.calls.length;
    const before = await counts();
    await storeConditionalStructured(request());
    expect(await counts()).toEqual(before);
    expect(vi.mocked(generateEmbedding).mock.calls.length).toBe(calls);
  });
  it("replays the immutable original after schema drift and a later winning correction", async () => {
    const original = await storeConditionalStructured(request());
    const { createCorrection } = await import("../../src/services/correction.js");
    await createCorrection({
      entity_id: original.operation_receipt.entity_id,
      entity_type: schema.entity_type,
      field: "status",
      value: "later",
      schema_version: schema.schema_version,
      user_id: owner,
      idempotency_key: "later-correction",
    });
    await db
      .from("schema_registry")
      .update({
        schema_definition: {
          ...schema.schema_definition,
          derived_entities: [
            { conditions: [], derived_entity_type: "synthetic_child", derived_fields: {} },
          ],
        },
      })
      .eq("id", schema.id);
    const before = await counts();
    const replay = await storeConditionalStructured(request());
    expect(replay.operation_receipt).toEqual({ ...original.operation_receipt, status: "replayed" });
    expect(replay.entities[0].entity_snapshot_after?.status).toBe("later");
    expect(await counts()).toEqual(before);
    await expect(
      storeConditionalStructured({
        ...request("new-key"),
        entities: [{ ...request().entities[0], code: "FRESH" }],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await counts()).toEqual(before);
  });
  it("refuses incomplete identity, unavailable/ambiguous schemas and malformed native inputs without a claim", async () => {
    const before = await counts();
    await expect(
      storeConditionalStructured({
        ...request(),
        entities: [{ entity_type: schema.entity_type, status: "no-identity" }],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const sparse = new Array(1);
    await expect(
      storeConditionalStructured({ ...request(), entities: sparse })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await db.from("schema_registry").update({ active: false }).eq("id", schema.id);
    await expect(storeConditionalStructured(request())).rejects.toThrow(
      "authoritative active schema"
    );
    await db.from("schema_registry").update({ active: true }).eq("id", schema.id);
    await db
      .from("schema_registry")
      .upsert({ ...schema, id: schema.id + "-duplicate", schema_version: "2.0" });
    try {
      await expect(storeConditionalStructured(request())).rejects.toThrow(
        "authoritative active schema"
      );
      expect(await counts()).toEqual(before);
      expect(events).toHaveLength(0);
    } finally {
      await db
        .from("schema_registry")
        .delete()
        .eq("id", schema.id + "-duplicate");
    }
  });
  it("preserves valid unknown domain data as advisory fragments and verifies its original diagnostics", async () => {
    const input = {
      ...request(),
      entities: [{ ...request().entities[0], extension: { useful: true } }],
    };
    const applied = await storeConditionalStructured(input);
    expect(applied.unknown_fields_count).toBe(1);
    expect(applied.operation_receipt.diagnostics.unknown_fields).toEqual(["extension"]);
    expect(applied.operation_receipt.original_observation_fields).toEqual({
      code: "ONE",
      status: "new",
    });
    const fragments = await db
      .from("raw_fragments")
      .select("fragment_key,fragment_value")
      .eq("user_id", owner);
    expect(fragments.error).toBeNull();
    expect(fragments.data).toEqual([expect.objectContaining({ fragment_key: "extension" })]);
    const before = await counts();
    expect((await storeConditionalStructured(input)).operation_receipt.status).toBe("replayed");
    expect(await counts()).toEqual(before);
  });
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
      const embeddingCalls = vi.mocked(generateEmbedding).mock.calls.length;
      await expect(storeConditionalStructured(changed)).rejects.toMatchObject({
        code: "STORE_CONDITIONAL_FAILED",
        committed: false,
        private_storage_residue_possible: true,
      });
      expect(await counts()).toEqual(before);
      expect(events).toHaveLength(0);
      expect(vi.mocked(generateEmbedding).mock.calls.length).toBe(embeddingCalls);
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
      attempted: 3,
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
    const pending = storeConditionalStructured(request());
    await expect(pending).resolves.toMatchObject({ operation_receipt: { status: "replayed" } });
    const replay = await pending;
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
