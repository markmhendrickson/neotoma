import { afterEach, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// Cutover is an explicit owned fixture action, never a mutation of the suite's
// shared pre-migration database or of the global HTTP fixture.
const isolated = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const original = process.env.NEOTOMA_DATA_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-synthetic-lifecycle-native-"));
  process.env.NEOTOMA_DATA_DIR = path.join(root, ".vitest");
  fs.mkdirSync(process.env.NEOTOMA_DATA_DIR, { recursive: true });
  vi.resetModules();
  return { original, root };
});

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { StubDriver } from "../../packages/eval-harness/src/drivers/stub.js";
import { loadScenarioFile } from "../../packages/eval-harness/src/scenario.js";
import { app } from "../../src/actions.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";
import { db } from "../../src/db.js";
import { softDeleteEntity, restoreEntity, isEntityDeleted } from "../../src/services/deletion.js";
import { createCorrection } from "../../src/services/correction.js";
import { computeEntitySnapshotAtTime } from "../../src/services/entity_snapshot_at_time.js";

import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
import { splitEntity } from "../../src/services/entity_split.js";
import { storeConditionalStructured } from "../../src/services/store_conditional.js";
import { queryEntities } from "../../src/services/entity_queries.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import { createGrant, AgentGrantPinConflictError } from "../../src/services/agent_grants.js";
import { exportEntitySnapshots } from "../../src/services/snapshot_export.js";
import { exportMemory } from "../../src/services/memory_export.js";
import { getDashboardStats } from "../../src/services/dashboard_stats.js";
import { migrateEntityLifecycleAuthority } from "../../src/services/entity_lifecycle_storage.js";

// These exercise the natural SQLite services. The three regressions are
// exercised after owned synthetic cutover; the temporal control
// binds the existing independent event/ingestion axes that must survive.
describe("authenticated entity lifecycle", () => {
  const owner = LOCAL_DEV_USER_ID;
  let server: ReturnType<typeof createServer>, base: string;
  async function post(operation: string, body: Record<string, unknown>) {
    const response = await fetch(base + "/" + operation, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as any };
  }
  async function tool(name: string, args: Record<string, unknown>) {
    const response = await modernPost(base, {
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });
    expect(response.body?.error).toBeUndefined();
    return toolResultJson(response.body) as any;
  }
  const type = "synthetic_lifecycle_authority";
  let id: string;
  beforeAll(async () => {
    if (!process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest"))
      throw new Error("Owned synthetic database required");
    server = createServer(app);
    await new Promise<void>((ok, fail) => {
      server.once("error", fail);
      server.listen(0, "127.0.0.1", ok);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Owned loopback required");
    base = "http://127.0.0.1:" + address.port;
    await migrateEntityLifecycleAuthority(await getDb(), async (_tx, targets) => {
      for (const target of targets) await recomputeSnapshot(target.id, target.user_id, true);
    });
  });
  beforeEach(async () => {
    if (!process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest")) {
      throw new Error("Owned synthetic database required");
    }
    id = "ent_lifecycle_authority_" + randomUUID();
    expect(
      (
        await db
          .from("entities")
          .insert({ id, user_id: owner, entity_type: type, canonical_name: "Synthetic lifecycle" })
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("observations").insert({
          id: randomUUID(),
          entity_id: id,
          user_id: owner,
          entity_type: type,
          schema_version: "1.0",
          fields: { title: "Synthetic factual value" },
          observed_at: "2025-01-01T00:00:00Z",
          source_priority: 10,
        })
      ).error
    ).toBeNull();
  });
  afterEach(async () => {
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  });
  afterAll(async () => {
    if (server) await new Promise<void>((ok) => server.close(() => ok()));
  });
  it("HTTP cycles expose exact committed receipts and retain supported historical axes", async () => {
    const receipts: string[] = [];
    for (const operation of [
      "delete_entity",
      "restore_entity",
      "delete_entity",
      "restore_entity",
    ]) {
      const result = await post(operation, {
        entity_id: id,
        entity_type: type,
        reason: "Synthetic action",
      });
      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      receipts.push(result.body.observation_id);
      const row = await db
        .from("observations")
        .select("*")
        .eq("id", result.body.observation_id)
        .single();
      expect(row.data?.entity_lifecycle_target_id).toBe(id);
      expect(row.data?.entity_lifecycle_kind).toBe(
        operation === "delete_entity" ? "delete" : "restore"
      );
    }
    expect(new Set(receipts).size).toBe(4);
    expect((await post("get_entity_snapshot", { entity_id: id })).body.snapshot.title).toBe(
      "Synthetic factual value"
    );
    const history = await post("get_entity_snapshot", {
      entity_id: id,
      at: "2025-12-31T00:00:00Z",
      at_ingested: "2999-01-01T00:00:00Z",
    });
    expect(history.status).toBe(200);
    expect(history.body.snapshot.title).toBe("Synthetic factual value");
    const before = (await db.from("observations").select("id").eq("entity_id", id)).data;
    expect(
      (await post("delete_entity", { entity_id: id, entity_type: "foreign_type" })).status
    ).toBe(404);
    expect((await db.from("observations").select("id").eq("entity_id", id)).data).toEqual(before);
  });
  it("current export, memory, dashboard and count reject a stale hidden materialization then expose restored facts", async () => {
    await recomputeSnapshot(id, owner);
    const initial = (await db.from("entity_snapshots").select("*").eq("entity_id", id).single())
      .data;
    expect(initial?.snapshot.title).toBe("Synthetic factual value");
    expect(
      (await exportEntitySnapshots({ user_id: owner, entity_types: [type] })).total_entities
    ).toBe(1);
    const memoryPath = path.join(isolated.root, "synthetic-memory.md");
    expect(
      (await exportMemory({ user_id: owner, include_types: [type], path: memoryPath }))
        .total_entities
    ).toBe(1);
    expect((await getDashboardStats(owner)).entities_by_type[type]).toBe(1);
    expect((await softDeleteEntity(id, type, owner)).success).toBe(true);
    expect((await db.from("entity_snapshots").select("*").eq("entity_id", id)).data).toEqual([]);
    // Derived state may be stale; it is not lifecycle authority. Controlled
    // synthetic insertion tests the consumers without changing the receipt.
    expect((await db.from("entity_snapshots").upsert(initial)).error).toBeNull();
    expect(
      (await exportEntitySnapshots({ user_id: owner, entity_types: [type] })).total_entities
    ).toBe(0);
    expect(
      (await exportMemory({ user_id: owner, include_types: [type], path: memoryPath }))
        .total_entities
    ).toBe(0);
    expect(readFileSync(memoryPath, "utf8")).not.toContain(id);
    expect((await getDashboardStats(owner)).entities_by_type[type]).toBeUndefined();
    const query = await queryEntitiesWithCount({ userId: owner, entityType: type, limit: 100 });
    expect(query.entities).toEqual([]);
    expect(query.total).toBe(0);
    expect((await restoreEntity(id, type, owner)).success).toBe(true);
    expect(
      (await exportEntitySnapshots({ user_id: owner, entity_types: [type] })).entities[0].snapshot
        .title
    ).toBe("Synthetic factual value");
    expect(
      (await exportMemory({ user_id: owner, include_types: [type], path: memoryPath }))
        .total_entities
    ).toBe(1);
    expect(
      (await queryEntitiesWithCount({ userId: owner, entityType: type, limit: 100 })).total
    ).toBe(1);
  });
  it("modern MCP cycles and historical retrieval do not confuse present hiding with past visibility", async () => {
    const first = await tool("delete_entity", { entity_id: id, entity_type: type });
    expect(first.success).toBe(true);
    const history = await tool("retrieve_entity_snapshot", {
      entity_id: id,
      format: "json",
      at: "2025-12-31T00:00:00Z",
      at_ingested: "2999-01-01T00:00:00Z",
    });
    expect(history.snapshot.title).toBe("Synthetic factual value");
    const restored = await tool("restore_entity", { entity_id: id, entity_type: type });
    expect(restored.success).toBe(true);
    expect(restored.observation_id).not.toBe(first.observation_id);
    const next = await tool("delete_entity", { entity_id: id, entity_type: type });
    expect(next.success).toBe(true);
    expect(await isEntityDeleted(id, owner)).toBe(true);
    const counted = await tool("retrieve_entities", { entity_type: type, limit: 100 });
    expect(counted.total).toBe(0);
    expect(counted.entities).toEqual([]);
  });
  it("current HTTP snapshot refuses malformed authority despite a previously materialized fact", async () => {
    expect((await post("get_entity_snapshot", { entity_id: id })).body.snapshot.title).toBe(
      "Synthetic factual value"
    );
    const database = await getDb();
    await database
      .prepare(
        "INSERT INTO observations(id,entity_id,entity_type,schema_version,user_id,fields,source_priority,observed_at,created_at,entity_lifecycle_kind,entity_lifecycle_sequence,entity_lifecycle_target_id) VALUES (?,?,?,'1.0',?,'{\"_deleted\":true}',0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','delete',1,?)"
      )
      .run(randomUUID(), id, type, owner, "ent_synthetic_missing_target");
    const response = await post("get_entity_snapshot", { entity_id: id });
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("snapshot");
  });
  it("compiled CLI lifecycle actions use actual HTTP service guards and receipts", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const env = {
      PATH: process.env.PATH,
      HOME: isolated.root,
      NODE_ENV: "test",
      NEOTOMA_ENV: "development",
      NEOTOMA_DATA_DIR: process.env.NEOTOMA_DATA_DIR,
      NODE_OPTIONS:
        "--require " + JSON.stringify(path.join(root, "tests/helpers/owned_loopback_only.cjs")),
    };
    const command = async (args: string[]) => {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          path.join(root, "dist/cli/bootstrap.js"),
          "--api-only",
          "--base-url",
          base,
          "--json",
          "--no-log-file",
          ...args,
        ],
        { cwd: isolated.root, env, timeout: 15000, maxBuffer: 1024 * 1024 }
      );
      return JSON.parse(stdout) as any;
    };
    const deleted = await command(["entities", "delete", id, type]);
    expect(deleted.success).toBe(true);
    expect(await isEntityDeleted(id, owner)).toBe(true);
    const restored = await command(["entities", "restore", id, type]);
    expect(restored.success).toBe(true);
    expect(restored.observation_id).not.toBe(deleted.observation_id);
    const listed = await command(["entities", "list", "--type", type]);
    expect(listed.entities.map((r: any) => r.entity_id)).toEqual([id]);
    expect(listed.entities[0].snapshot.title).toBe("Synthetic factual value");
  }, 60000);
  it("split excludes authority while moving genuine selected facts and retaining source hiding", async () => {
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: id,
      user_id: owner,
      entity_type: type,
      schema_version: "1.0",
      fields: { title: "Synthetic movable fact", move: "yes" },
      source_priority: 20,
      observed_at: "2026-01-01T00:00:00Z",
    });
    const deleted = await softDeleteEntity(id, type, owner);
    expect(deleted.success).toBe(true);
    const args = {
      sourceEntityId: id,
      userId: owner,
      newEntity: { entity_type: type, canonical_name: "Synthetic split target" },
      idempotencyKey: randomUUID(),
      splitBy: "synthetic-owned-fixture",
    };
    await expect(
      splitEntity({
        ...args,
        predicate: { observation_field_equals: { field: "_deleted", value: "true" } },
      })
    ).rejects.toThrow(/matched zero/);
    const split = await splitEntity({
      ...args,
      idempotencyKey: randomUUID(),
      predicate: { observation_field_equals: { field: "move", value: "yes" } },
    });
    try {
      expect(split.observations_moved).toBe(1);
      expect(
        (
          await db
            .from("observations")
            .select("entity_id,entity_lifecycle_target_id")
            .eq("id", deleted.observation_id!)
            .single()
        ).data
      ).toEqual({ entity_id: id, entity_lifecycle_target_id: id });
      expect(await isEntityDeleted(id, owner)).toBe(true);
      expect(await isEntityDeleted(split.new_entity_id, owner)).toBe(false);
      expect(
        (
          await queryEntities({ userId: owner, entityType: type, includeDeleted: true, limit: 100 })
        ).find((r) => r.entity_id === split.new_entity_id)?.snapshot.title
      ).toBe("Synthetic movable fact");
    } finally {
      await db.from("observations").delete().eq("entity_id", split.new_entity_id);
      await db.from("entity_snapshots").delete().eq("entity_id", split.new_entity_id);
      await db.from("entities").delete().eq("id", split.new_entity_id);
    }
  });
  it("merge attachment cannot transfer source authority to its live survivor", async () => {
    const survivor = "ent_lifecycle_survivor_" + randomUUID();
    await db.from("entities").insert({
      id: survivor,
      user_id: owner,
      entity_type: type,
      canonical_name: "Synthetic survivor",
    });
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: survivor,
      user_id: owner,
      entity_type: type,
      schema_version: "1.0",
      fields: { survivor: "kept" },
      source_priority: 10,
      observed_at: "2025-01-01T00:00:00Z",
    });
    const deleted = await softDeleteEntity(id, type, owner);
    expect(deleted.success).toBe(true);
    try {
      await mergeEntities({
        fromEntityId: id,
        toEntityId: survivor,
        userId: owner,
        mergedBy: "synthetic-owned-fixture",
      });
      expect(
        (
          await db
            .from("observations")
            .select("entity_id,entity_lifecycle_target_id")
            .eq("id", deleted.observation_id!)
            .single()
        ).data
      ).toEqual({ entity_id: survivor, entity_lifecycle_target_id: id });
      expect(await isEntityDeleted(survivor, owner)).toBe(false);
      await recomputeSnapshot(survivor, owner, true);
      const snapshot = (
        await db.from("entity_snapshots").select("snapshot").eq("entity_id", survivor).single()
      ).data?.snapshot;
      expect(snapshot).toMatchObject({ title: "Synthetic factual value", survivor: "kept" });
    } finally {
      await db.from("observations").delete().eq("entity_id", survivor);
      await db.from("entity_snapshots").delete().eq("entity_id", survivor);
      await db.from("entities").delete().eq("id", survivor);
    }
  });
  it("current conditional create remains ordinary, preserves receipt replay and resists field spoof", async () => {
    const entityType = "synthetic_lifecycle_conditional";
    const schemaId = randomUUID();
    await db.from("schema_registry").insert({
      id: schemaId,
      user_id: owner,
      entity_type: entityType,
      schema_version: "1.0",
      active: true,
      scope: "user",
      schema_definition: {
        fields: { code: { type: "string" }, _deleted: { type: "boolean" } },
        canonical_name_fields: ["code"],
      },
      reducer_config: {
        merge_policies: {
          code: { strategy: "highest_priority" },
          _deleted: { strategy: "highest_priority" },
        },
      },
    });
    const request = {
      userId: owner,
      idempotencyKey: randomUUID(),
      sourcePriority: 100,
      entities: [{ entity_type: entityType, code: randomUUID(), _deleted: true }],
    };
    const created = await storeConditionalStructured(request);
    const target = created.operation_receipt.entity_id;
    try {
      expect(await isEntityDeleted(target, owner)).toBe(false);
      const before = await db.from("observations").select("*").eq("entity_id", target);
      expect(before.data).toHaveLength(1);
      expect(before.data?.[0].entity_lifecycle_kind).toBeNull();
      const replay = await storeConditionalStructured(request);
      expect(replay.operation_receipt.status).toBe("replayed");
      expect((await db.from("observations").select("*").eq("entity_id", target)).data).toEqual(
        before.data
      );
    } finally {
      await db.from("observations").delete().eq("entity_id", target);
      await db.from("entity_snapshots").delete().eq("entity_id", target);
      await db.from("entities").delete().eq("id", target);
      await db.from("schema_registry").delete().eq("id", schemaId);
    }
  });
  it.each(["HTTP", "MCP"])(
    "natural %s ordinary store preserves hiding and carries authority into inline reduction",
    async (surface) => {
      const entityType = "synthetic_lifecycle_store_" + randomUUID().replaceAll("-", "");
      const schema = {
        entity_type: entityType,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            title: { type: "string" },
            status: { type: "string" },
            entity_lifecycle_kind: { type: "string" },
          },
          canonical_name_fields: ["title"],
        },
        reducer_config: {
          merge_policies: {
            title: { strategy: "highest_priority" },
            status: { strategy: "highest_priority" },
            entity_lifecycle_kind: { strategy: "highest_priority" },
          },
        },
        activate: true,
      };
      await tool("register_schema", schema);
      const store = async (status: string) => {
        const body = {
          entities: [
            {
              entity_type: entityType,
              title: "Synthetic persistent identity",
              status,
              entity_lifecycle_kind: "ordinary-field-lookalike",
            },
          ],
          idempotency_key: randomUUID(),
          source_priority: 2000,
        };
        if (surface === "MCP") return tool("store", body);
        const response = await post("store", body);
        expect(response.status).toBe(200);
        return response.body;
      };
      const first = await store("first");
      const target = first.entities[0].entity_id;
      try {
        expect((await softDeleteEntity(target, entityType, owner)).success).toBe(true);
        const next = await store("second");
        expect(next.entities[0].entity_id).toBe(target);
        expect(
          (await db.from("entity_snapshots").select("*").eq("entity_id", target)).data
        ).toEqual([]);
        expect(await isEntityDeleted(target, owner)).toBe(true);
        expect((await restoreEntity(target, entityType, owner)).success).toBe(true);
        expect(
          (await post("get_entity_snapshot", { entity_id: target })).body.snapshot
        ).toMatchObject({
          title: "Synthetic persistent identity",
          status: "second",
          entity_lifecycle_kind: "ordinary-field-lookalike",
        });
      } finally {
        await db.from("observations").delete().eq("entity_id", target);
        await db.from("entity_snapshots").delete().eq("entity_id", target);
        await db.from("entities").delete().eq("id", target);
        await db.from("schema_registry").delete().eq("entity_type", entityType);
      }
    }
  );
  it("Tier 2 named-tool replay executes real post-cutover cycles rather than canned tool results", async () => {
    const fixture = fileURLToPath(new URL("../fixtures/lifecycle_authority/", import.meta.url));
    const scenario = loadScenarioFile(path.join(fixture, "named_tools.scenario.yaml"));
    const cassette = JSON.parse(
      readFileSync(path.join(fixture, "named_tools.cassette.json"), "utf8")
    );
    for (const call of cassette.tool_calls)
      if (call.input.entity_id === "$OWNED_FIXTURE_ENTITY") call.input.entity_id = id;
    const cassettePath = path.join(isolated.root, "owned-native-named-tools.json");
    writeFileSync(cassettePath, JSON.stringify(cassette));
    const result = await new StubDriver().runOnce({
      scenario,
      model: { provider: "stub", model: "replay-only" },
      neotomaBaseUrl: base,
      neotomaToken: "",
      effectiveProfile: "auto",
      mode: "replay",
      cassettePath,
    });
    expect(result.toolCalls).toHaveLength(8);
    expect(result.toolCalls.map((c) => c.error)).toEqual(Array(8).fill(undefined));
    for (const index of [1, 5])
      expect(result.toolCalls[index].output).toMatchObject({ entities: [], total: 0 });
    for (const index of [3, 7])
      expect(result.toolCalls[index].output).toMatchObject({
        snapshot: { title: "Synthetic factual value" },
      });
    const receipts = [0, 2, 4, 6].map((i) => (result.toolCalls[i].output as any).observation_id);
    expect(new Set(receipts).size).toBe(4);
    expect(await isEntityDeleted(id, owner)).toBe(false);
  });
  it("separate equal-time actions serialize and preserve factual read/count semantics", async () => {
    const notifications: Array<{ event_id: string; observation_id: string }> = [];
    const listener = (ev: any) => {
      if (ev.entity_id === id && ["entity.deleted", "entity.restored"].includes(ev.event_type))
        notifications.push({ event_id: ev.event_id, observation_id: ev.observation_id });
    };
    substrateEventBus.onSubstrateEvent(listener);
    let outcomes;
    try {
      outcomes = await Promise.all([
        softDeleteEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z"),
        restoreEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z"),
        softDeleteEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z"),
      ]);
    } finally {
      substrateEventBus.off("substrate_event", listener);
    }
    expect(outcomes.every((o) => o.success)).toBe(true);
    expect(new Set(outcomes.map((o) => o.observation_id)).size).toBe(3);
    expect(notifications).toHaveLength(3);
    expect(new Set(notifications.map((ev) => ev.event_id)).size).toBe(3);
    expect(notifications.map((ev) => ev.observation_id).sort()).toEqual(
      outcomes.map((o) => o.observation_id).sort()
    );
    const rows = await db
      .from("observations")
      .select("*")
      .eq("entity_id", id)
      .order("entity_lifecycle_sequence", { ascending: true });
    expect(
      rows.data?.filter((r) => r.entity_lifecycle_kind).map((r) => r.entity_lifecycle_sequence)
    ).toEqual([1, 2, 3]);
    expect(await isEntityDeleted(id, owner)).toBe(true);
    const hidden = await queryEntitiesWithCount({ userId: owner, entityType: type, limit: 100 });
    expect(hidden.total).toBe(0);
    expect(hidden.entities).toEqual([]);
    const audit = await queryEntities({
      userId: owner,
      entityType: type,
      limit: 100,
      includeDeleted: true,
    });
    expect(audit).toHaveLength(1);
    expect((await restoreEntity(id, type, owner)).success).toBe(true);
    const visible = await queryEntitiesWithCount({ userId: owner, entityType: type, limit: 100 });
    expect(visible.total).toBe(1);
    expect(visible.entities[0].snapshot.title).toBe("Synthetic factual value");
  });
  it("materialization failure rolls back append, snapshot and lifecycle notification", async () => {
    const database = await getDb();
    const before = await database.prepare("SELECT * FROM observations WHERE entity_id=?").all(id);
    const snapshot = await database
      .prepare("SELECT * FROM entity_snapshots WHERE entity_id=?")
      .get(id);
    const events: string[] = [];
    const listener = (ev: any) => {
      if (ev.entity_id === id && ["entity.deleted", "entity.restored"].includes(ev.event_type))
        events.push(ev.event_id);
    };
    substrateEventBus.onSubstrateEvent(listener);
    await database.exec(
      `CREATE TRIGGER synthetic_lifecycle_materialize_failure BEFORE DELETE ON entity_snapshots WHEN OLD.entity_id='${id}' BEGIN SELECT RAISE(ABORT,'Synthetic materialization failure'); END;`
    );
    try {
      expect((await softDeleteEntity(id, type, owner)).success).toBe(false);
      expect(
        await database.prepare("SELECT * FROM observations WHERE entity_id=?").all(id)
      ).toEqual(before);
      expect(
        await database.prepare("SELECT * FROM entity_snapshots WHERE entity_id=?").get(id)
      ).toEqual(snapshot);
      expect(events).toEqual([]);
    } finally {
      await database.exec("DROP TRIGGER synthetic_lifecycle_materialize_failure");
      substrateEventBus.off("substrate_event", listener);
    }
  });
  it("stored type, ownership and sequence exhaustion refuse without append", async () => {
    const database = await getDb();
    const before = (await db.from("observations").select("id").eq("entity_id", id)).data;
    expect((await softDeleteEntity(id, "foreign_type", owner)).success).toBe(false);
    expect((await restoreEntity(id, type, "foreign_owner")).not_found).toBe(true);
    expect((await db.from("observations").select("id").eq("entity_id", id)).data).toEqual(before);
    await database
      .prepare(
        "INSERT INTO observations(id,entity_id,entity_type,schema_version,user_id,observed_at,created_at,fields,source_priority,entity_lifecycle_kind,entity_lifecycle_sequence,entity_lifecycle_target_id) VALUES (?,?,?,'1.0',?,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','{\"_deleted\":false}',0,'restore',9007199254740991,?)"
      )
      .run(randomUUID(), id, type, owner, id);
    const full = await database.prepare("SELECT * FROM observations WHERE entity_id=?").all(id);
    expect((await softDeleteEntity(id, type, owner)).success).toBe(false);
    expect(await database.prepare("SELECT * FROM observations WHERE entity_id=?").all(id)).toEqual(
      full
    );
  });
  it("post-cutover restoration preserves native grant pin refusal with zero append", async () => {
    const pin = "synthetic-pin-" + randomUUID();
    const mine = await createGrant(owner, {
      label: "Synthetic lifecycle grant",
      capabilities: [{ op: "retrieve", entity_types: ["task"] }],
      match_thumbprint: pin,
    });
    const otherOwner = randomUUID();
    const theirs = await createGrant(otherOwner, {
      label: "Synthetic other grant",
      capabilities: [{ op: "retrieve", entity_types: ["task"] }],
      match_thumbprint: "synthetic-other-" + randomUUID(),
    });
    expect((await softDeleteEntity(mine.grant_id, "agent_grant", owner)).success).toBe(true);
    // Model an existing duplicate from before the uniqueness control. This is
    // owned fixture data, not a bypass available on the natural grant entrance.
    expect(
      (
        await db.from("observations").insert({
          id: randomUUID(),
          entity_id: theirs.grant_id,
          entity_type: "agent_grant",
          user_id: otherOwner,
          schema_version: "1.0.0",
          source_priority: 1000,
          observed_at: new Date().toISOString(),
          fields: { match_thumbprint: pin },
        })
      ).error
    ).toBeNull();
    await recomputeSnapshot(theirs.grant_id, otherOwner);
    const before = (await db.from("observations").select("*").eq("entity_id", mine.grant_id)).data;
    await expect(restoreEntity(mine.grant_id, "agent_grant", owner)).rejects.toBeInstanceOf(
      AgentGrantPinConflictError
    );
    const response = await post("restore_entity", {
      entity_id: mine.grant_id,
      entity_type: "agent_grant",
    });
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("agent_grant_pin_conflict");
    expect((await db.from("observations").select("*").eq("entity_id", mine.grant_id)).data).toEqual(
      before
    );
    expect(await isEntityDeleted(mine.grant_id, owner)).toBe(true);
  });
  it("the second delete hides again after a restore", async () => {
    expect(
      (await softDeleteEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z")).success
    ).toBe(true);
    expect(await isEntityDeleted(id, owner)).toBe(true);
    expect((await restoreEntity(id, type, owner, undefined, "2026-01-02T00:00:00Z")).success).toBe(
      true
    );
    expect(await isEntityDeleted(id, owner)).toBe(false);
    expect(
      (await softDeleteEntity(id, type, owner, undefined, "2026-01-03T00:00:00Z")).success
    ).toBe(true);
    expect(await isEntityDeleted(id, owner)).toBe(true);
  });
  it("a higher-priority ordinary fact cannot restore a deleted entity", async () => {
    expect(
      (await softDeleteEntity(id, type, owner, undefined, "2026-01-01T00:00:00Z")).success
    ).toBe(true);
    expect(await isEntityDeleted(id, owner)).toBe(true);
    expect(
      (
        await db.from("observations").insert({
          id: randomUUID(),
          entity_id: id,
          user_id: owner,
          entity_type: type,
          schema_version: "1.0",
          fields: { title: "Synthetic later fact" },
          observed_at: "2026-01-02T00:00:00Z",
          source_priority: 2000,
        })
      ).error
    ).toBeNull();
    expect(await isEntityDeleted(id, owner)).toBe(true);
  });
  it("an ordinary correction retains marker data without gaining lifecycle authority", async () => {
    await createCorrection({
      entity_id: id,
      entity_type: type,
      user_id: owner,
      schema_version: "1.0",
      field: "_deleted",
      value: true,
      idempotency_key: "synthetic-lifecycle-" + randomUUID(),
    });
    const rows = await db
      .from("observations")
      .select("fields")
      .eq("entity_id", id)
      .eq("source_priority", 1000);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0].fields).toEqual({ _deleted: true });
    expect(await isEntityDeleted(id, owner)).toBe(false);
  });
  it("event-only and ingestion-only filters remain independent and mixed filters use AND", async () => {
    expect(
      (
        await db
          .from("observations")
          .update({ created_at: "2024-01-01T00:00:00Z" })
          .eq("entity_id", id)
      ).error
    ).toBeNull();
    expect(
      (await softDeleteEntity(id, type, owner, undefined, "2024-02-01T00:00:00Z")).success
    ).toBe(true);
    const eventOnly = await computeEntitySnapshotAtTime(id, owner, "2025-12-31T00:00:00Z");
    const ingestionOnly = await computeEntitySnapshotAtTime(
      id,
      owner,
      undefined,
      "2025-12-31T00:00:00Z"
    );
    const both = await computeEntitySnapshotAtTime(
      id,
      owner,
      "2025-12-31T00:00:00Z",
      "2025-12-31T00:00:00Z"
    );
    expect(eventOnly?.snapshot).toEqual({});
    expect(eventOnly?.observation_count).toBe(0);
    expect(ingestionOnly?.snapshot.title).toBe("Synthetic factual value");
    expect(ingestionOnly?.observation_count).toBe(1);
    expect(both?.snapshot.title).toBe("Synthetic factual value");
    expect(both?.observation_count).toBe(1);
  });
  it("post-cutover backdated ordinary fields cannot invent captured historical authority", async () => {
    expect(
      (
        await db.from("observations").insert({
          id: randomUUID(),
          entity_id: id,
          entity_type: type,
          schema_version: "1.0",
          user_id: owner,
          observed_at: "2020-01-01T00:00:00Z",
          created_at: "2020-01-01T00:00:00Z",
          source_priority: 99999,
          fields: { _deleted: true, title: "Synthetic backdated ordinary fact" },
        })
      ).error
    ).toBeNull();
    const args = { entity_id: id, at: "2021-01-01T00:00:00Z", at_ingested: "2021-01-01T00:00:00Z" };
    const native = await computeEntitySnapshotAtTime(id, owner, args.at, args.at_ingested);
    expect(native?.snapshot.title).toBe("Synthetic backdated ordinary fact");
    expect(native?.observation_count).toBe(1);
    const http = await post("get_entity_snapshot", args);
    expect(http.status).toBe(200);
    expect(http.body.snapshot.title).toBe("Synthetic backdated ordinary fact");
    const mcp = await tool("retrieve_entity_snapshot", { ...args, format: "json" });
    expect(mcp.snapshot.title).toBe("Synthetic backdated ordinary fact");
    expect(await isEntityDeleted(id, owner)).toBe(false);
  });
});

afterAll(async () => {
  await (await getDb()).close();
  if (isolated.original === undefined) delete process.env.NEOTOMA_DATA_DIR;
  else process.env.NEOTOMA_DATA_DIR = isolated.original;
  const { rmSync } = await import("node:fs");
  rmSync(isolated.root, { recursive: true, force: true });
});
