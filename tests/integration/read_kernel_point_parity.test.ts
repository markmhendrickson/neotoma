/** Real current point effects; private admission is narrower than legacy transports. */
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { db } from "../../src/db.js";
import { config } from "../../src/config.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { EmbeddedRuntimeContext } from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";
import { initializeFreshEmbeddedDatabase } from "../../src/core/runtime_database.js";
import { createInternalReadKernel } from "../../src/core/read_kernel.js";
import { migrateEntityLifecycleAuthority } from "../../src/services/entity_lifecycle_storage.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
import { softDeleteEntity, restoreEntity } from "../../src/services/deletion.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { createOperations } from "../../src/core/operations.js";
import {
  PARITY_USER_ID as USER,
  makeMcpServer,
  startOfflineServer,
  stopServer,
  callHttp,
} from "../helpers/transport_parity_matrix.js";
vi.mock("../../src/embeddings.js", async (original) => ({
  ...(await original<typeof import("../../src/embeddings.js")>()),
  generateEmbedding: vi.fn().mockResolvedValue(null),
}));
const FOREIGN = "00000000-0000-4000-8000-000000000099";
const TYPE = "runtime_point_" + randomUUID().replaceAll("-", "");
const RESERVED = TYPE + "_reserved";
const mcp = makeMcpServer();
const created: Array<{ id: string; source: string }> = [];
const extraObs: string[] = [],
  fragments: string[] = [];
let context: EmbeddedRuntimeContext,
  kernel: ReturnType<typeof createInternalReadKernel>,
  api: Awaited<ReturnType<typeof startOfflineServer>>,
  home: string;
async function tool(name: string, input: unknown) {
  const handler = (mcp as any).mcpServer.server._requestHandlers.get("tools/call");
  const r = await handler({ method: "tools/call", params: { name, arguments: input } }, {});
  return JSON.parse(r.content[0].text);
}
function runtime(database: any, user = USER) {
  return new EmbeddedRuntimeContext({
    database,
    configuration: createEmbeddedRuntimeConfiguration({
      dataDirectory: resolve(".vitest/private-point"),
      packageRoot: process.cwd(),
    }),
    legacyIdentityPolicy: { tenantScopedEntityIds: false },
    attributionPolicy: { anonymous_writes: "allow" },
    adapters: { label: user },
  });
}
const definition = {
  fields: { title: { type: "string" }, value: { type: "number" }, status: { type: "string" } },
  canonical_name_fields: ["title"],
};
const reducer = {
  merge_policies: {
    title: { strategy: "last_write" },
    value: { strategy: "last_write" },
    status: { strategy: "last_write" },
  },
};
async function mutate(table: string, payload: unknown, id: string) {
  expect(
    (
      await db
        .from(table)
        .update(payload)
        .eq(table === "entity_snapshots" ? "entity_id" : "id", id)
    ).error
  ).toBeNull();
}
async function cli(mode: "offline" | "api", operation: string, body: unknown) {
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    USERPROFILE: home,
    NODE_ENV: "test",
    NEOTOMA_ENV: "development",
    NEOTOMA_DATA_DIR: config.dataDir,
    NEOTOMA_SQLITE_PATH: config.sqlitePath,
    NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
    NEOTOMA_FORCE_MODE: "refuse",
    OPENAI_API_KEY: "",
  };
  for (const name of [
    "PATH",
    "TMPDIR",
    "NODE_OPTIONS",
    "SCHEMA_GATE_NETWORK_JOURNAL",
    "SCHEMA_GATE_IPC_ROOT",
    "ICON_GENERATION_ENABLED",
    "TUNNEL_AUTO_DISCOVER",
  ])
    if (process.env[name] !== undefined) env[name] = process.env[name];
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      resolve("dist/cli/index.js"),
      "--env",
      "dev",
      "--json",
      "--no-log-file",
      ...(mode === "offline" ? ["--offline"] : ["--api-only", "--base-url", api.base]),
      "request",
      "--operation",
      operation,
      "--path",
      JSON.stringify(body),
    ],
    { env, timeout: 20000, maxBuffer: 2 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}
async function cliRefusal(mode: "offline" | "api", id: string, code: string) {
  let failure: any;
  try {
    await cli(mode, "getEntityById", { id });
  } catch (error) {
    failure = error;
  }
  expect(failure?.code).toBe(1);
  expect(failure.stdout).toBe("");
  const line = failure.stderr
    .trim()
    .split("\n")
    .reverse()
    .find((line: string) => line.startsWith('{"error":'));
  expect(line, failure.stderr).toBeDefined();
  expect(JSON.parse(line!).error).toContain(code);
  expect(JSON.parse(line!).error).not.toContain("PRIVATE_DRIVER_DETAIL");
}
beforeAll(async () => {
  api = await startOfflineServer();
  home = await mkdtemp(join(tmpdir(), "private-point-"));
  await tool("register_schema", {
    entity_type: TYPE,
    schema_version: "1.0",
    activate: true,
    user_specific: true,
    schema_definition: definition,
    reducer_config: reducer,
  });
  await tool("register_schema", {
    entity_type: RESERVED,
    schema_version: "1.0",
    activate: false,
    user_specific: true,
    schema_definition: {
      fields: { code: { type: "string" } },
      canonical_name_fields: ["code"],
      identity_contract: {
        version: "2",
        mode: "exact_utf8",
        namespace: RESERVED,
        canonical_name_fields: ["code"],
      },
    },
    reducer_config: { merge_policies: { code: { strategy: "last_write" } } },
  });
  for (let i = 0; i < 3; i++) {
    const r = await tool("store", {
      entities: [
        { entity_type: TYPE, title: `Synthetic ${i}`, value: i, status: i < 2 ? "open" : "closed" },
      ],
      idempotency_key: randomUUID(),
      valid_from: "2020-01-01T00:00:00Z",
    });
    created.push({ id: r.entities[0].entity_id, source: r.source_id });
  }
  await tool("correct", {
    entity_id: created[0].id,
    entity_type: TYPE,
    field: "value",
    value: 42,
    idempotency_key: randomUUID(),
  });
  context = runtime(await getDb());
  kernel = createInternalReadKernel({ runtime: context, userId: USER });
});
afterAll(async () => {
  await kernel?.dispose();
  await context?.dispose();
  for (const id of fragments) await db.from("raw_fragments").delete().eq("id", id);
  for (const id of extraObs) await db.from("observations").delete().eq("id", id);
  for (const { id, source } of created) {
    await db.from("entity_merges").delete().eq("from_entity_id", id);
    for (const table of ["timeline_events", "observations", "entity_snapshots"])
      await db.from(table).delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
    if (source) await db.from("sources").delete().eq("id", source);
  }
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
  // Accepted reservation is immutable; retain it in this owned synthetic DB.
  if (api) await stopServer(api.server);
  if (home) await rm(home, { recursive: true, force: true });
});

const common = (x: any) => ({
  entity_id: x.entity_id,
  entity_type: x.entity_type,
  schema_version: x.schema_version,
  snapshot: x.snapshot,
  raw_fragments: x.raw_fragments ?? {},
  provenance: x.provenance,
  observation_count: x.observation_count,
  last_observation_at: x.last_observation_at,
});
async function point(id = created[0].id) {
  const result = await kernel.execute("retrieve_entity_snapshot", { entity_id: id });
  const http = await fetch(api.base + "/entities/" + id);
  expect(http.status).toBe(200);
  expect(await http.json()).toEqual(result);
  const wire = await tool("retrieve_entity_snapshot", { entity_id: id, format: "json" });
  expect(common(wire)).toEqual(common(result));
  return result;
}
async function refused(input: any, code = "FEATURE_UNAVAILABLE") {
  await expect(kernel.execute("retrieve_entity_snapshot", input)).rejects.toSatisfy(
    (e: any) => e.toErrorEnvelope().error_code === code
  );
}
describe("private current structured point acquisition", () => {
  it("shares real corrected current point values with MCP JSON/HTTP and both compiled CLI modes", async () => {
    expect((await point()).snapshot.value).toBe(42);
    for (const mode of ["offline", "api"] as const)
      expect(common(await cli(mode, "getEntityById", { id: created[0].id }))).toEqual(
        common(await point())
      );
    expect(
      common(
        await kernel.execute("retrieve_entity_snapshot", {
          entity_id: created[0].id,
          format: "json",
        })
      )
    ).toEqual(common(await point()));
  });
  it("refuses unconverted projections before database effects and gives identical missing/foreign404", async () => {
    const prepare = vi.fn(() => {
      throw Error("PRIVATE_DETAIL");
    });
    const ctx = runtime({ prepare, close: vi.fn() });
    const read = createInternalReadKernel({ runtime: ctx, userId: USER });
    try {
      for (const args of [
        { entity_id: "x", at: "2000-01-01" },
        { entity_id: "x", valid_at: "2000-01-01" },
        { entity_id: "x", at_ingested: "2000" },
        { entity_id: "x", format: "markdown" },
        { entity_id: "x", include_cleared_fields: false },
        { entity_id: "x", user_id: FOREIGN },
        { entity_id: "x", unknown: true },
        Object.defineProperty({ entity_id: "x" }, "at", { value: "2000-01-01", enumerable: false }),
        Object.assign(Object.create({ user_id: FOREIGN }), { entity_id: "x" }),
        { entity_id: "x", [Symbol("unknown")]: true },
      ])
        await expect(read.execute("retrieve_entity_snapshot", args)).rejects.toSatisfy(
          (e: any) => e.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
        );
      await expect(read.execute("retrieve_entity_snapshot", { entity_id: "" })).rejects.toSatisfy(
        (e: any) => e.toErrorEnvelope().error_code === "VALIDATION_INVALID_FORMAT"
      );
      expect(prepare).not.toHaveBeenCalled();
    } finally {
      await read.dispose();
      await ctx.dispose();
    }
    for (const mode of ["offline", "api"] as const)
      await cliRefusal(mode, "ent_missing", "RESOURCE_NOT_FOUND");
    const foreign = createInternalReadKernel({ runtime: context, userId: FOREIGN });
    try {
      for (const promise of [
        kernel.execute("retrieve_entity_snapshot", { entity_id: "ent_missing" }),
        foreign.execute("retrieve_entity_snapshot", { entity_id: created[0].id }),
      ])
        await expect(promise).rejects.toSatisfy(
          (e: any) => e.statusCode === 404 && e.toErrorEnvelope().message === "Entity not found"
        );
    } finally {
      await foreign.dispose();
    }
  });
  it("rejects actual reserved physical snapshot metadata but allows JSON type/identity decoys", async () => {
    const id = created[0].id;
    const { data: saved } = await db
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", id)
      .single();
    try {
      await mutate(
        "entity_snapshots",
        {
          snapshot: { ...saved.snapshot, entity_type: RESERVED, identity_record: { decoy: true } },
        },
        id
      );
      await point();
      await mutate("entity_snapshots", { entity_type: RESERVED }, id);
      await refused({ entity_id: id }, "VALIDATION_INVALID_FORMAT");
      await expect(
        tool("retrieve_entity_snapshot", { entity_id: id, format: "json" })
      ).rejects.toMatchObject({ data: { error_code: "VALIDATION_INVALID_FORMAT" } });
      expect((await fetch(api.base + "/entities/" + id)).status).toBe(400);
      for (const mode of ["offline", "api"] as const)
        await cliRefusal(mode, id, "VALIDATION_INVALID_FORMAT");
    } finally {
      await mutate("entity_snapshots", { snapshot: saved.snapshot, entity_type: TYPE }, id);
    }
  });
  it("uses same acquired metadata even after a reserved snapshot is restored before admission", async () => {
    const database = await getDb();
    let interceptions = 0;
    const id = created[0].id;
    const wrapped = {
      prepare(sql: string) {
        const statement = database.prepare(sql);
        return new Proxy(statement, {
          get(target, key) {
            const value = Reflect.get(target, key);
            if (typeof value !== "function") return value;
            return async (...args: unknown[]) => {
              if (!interceptions && /FROM\s+"?entity_snapshots"?/i.test(sql) && key === "all") {
                interceptions++;
                await database
                  .prepare("UPDATE entity_snapshots SET entity_type=? WHERE entity_id=?")
                  .run(RESERVED, id);
                try {
                  return await value.apply(target, args);
                } finally {
                  await database
                    .prepare("UPDATE entity_snapshots SET entity_type=? WHERE entity_id=?")
                    .run(TYPE, id);
                }
              }
              return value.apply(target, args);
            };
          },
        });
      },
    };
    const ctx = runtime(wrapped);
    const read = createInternalReadKernel({ runtime: ctx, userId: USER });
    try {
      await expect(read.retrieveCurrentEntity({ entity_id: id })).rejects.toSatisfy(
        (e: any) => e.toErrorEnvelope().error_code === "VALIDATION_INVALID_FORMAT"
      );
      expect(interceptions).toBe(1);
      expect(
        (
          (await database
            .prepare("SELECT entity_type FROM entity_snapshots WHERE entity_id=?")
            .get(id)) as any
        ).entity_type
      ).toBe(TYPE);
    } finally {
      await read.dispose();
      await ctx.dispose();
    }
  });
  it.each(["missing", "undefined", "original"])(
    "fails closed on %s original identity metadata in the acquired entity",
    async (mode) => {
      const database = await getDb();
      let interceptions = 0;
      const wrapped = {
        prepare(sql: string) {
          const statement = database.prepare(sql);
          return new Proxy(statement, {
            get(target, key) {
              const value = Reflect.get(target, key);
              if (typeof value !== "function") return value;
              return async (...args: unknown[]) => {
                const rows = await value.apply(target, args);
                if (/FROM\s+"?entities"?/i.test(sql) && key === "get") {
                  interceptions++;
                  if (!rows) return rows;
                  const copy = { ...rows };
                  if (mode === "missing") delete copy.identity_record;
                  else if (mode === "undefined") copy.identity_record = undefined;
                  else copy.identity_record = "OPAQUE-ORIGINAL-RECORD";
                  return copy;
                }
                return rows;
              };
            },
          });
        },
      };
      const ctx = runtime(wrapped);
      const read = createInternalReadKernel({ runtime: ctx, userId: USER });
      try {
        await expect(read.retrieveCurrentEntity({ entity_id: created[0].id })).rejects.toSatisfy(
          (e: any) =>
            e.toErrorEnvelope().error_code ===
            (mode === "original" ? "VALIDATION_INVALID_FORMAT" : "DB_QUERY_FAILED")
        );
        expect(interceptions).toBeGreaterThan(0);
      } finally {
        await read.dispose();
        await ctx.dispose();
      }
    }
  );
  it("binds original metadata from the same owned merge-hop acquisition", async () => {
    const native = await getDb();
    const id = created[2].id,
      targetId = created[1].id;
    await mutate("entities", { merged_to_entity_id: targetId }, id);
    let captured = 0;
    const wrapped = {
      prepare(sql: string) {
        const statement = native.prepare(sql);
        return new Proxy(statement, {
          get(target, key) {
            const value = Reflect.get(target, key);
            if (typeof value !== "function") return value;
            return async (...args: unknown[]) => {
              const row = await value.apply(target, args);
              if (
                key === "get" &&
                /SELECT \* FROM entities/.test(sql) &&
                args[0] === targetId &&
                row
              ) {
                captured++;
                return { ...row, identity_record: "OPAQUE-HOP-ORIGINAL" };
              }
              return row;
            };
          },
        });
      },
    };
    const ctx = runtime(wrapped),
      read = createInternalReadKernel({ runtime: ctx, userId: USER });
    try {
      await expect(read.retrieveCurrentEntity({ entity_id: id })).rejects.toSatisfy(
        (e: any) => e.toErrorEnvelope().error_code === "VALIDATION_INVALID_FORMAT"
      );
      expect(captured).toBeGreaterThan(0);
    } finally {
      await read.dispose();
      await ctx.dispose();
      await mutate("entities", { merged_to_entity_id: null }, id);
    }
  });
  it("never exposes a foreign snapshot or same-ID same-source fragments", async () => {
    const target = created[0];
    const { data: saved } = await db
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", target.id)
      .single();
    await mutate(
      "entity_snapshots",
      { user_id: FOREIGN, snapshot: { status: "FOREIGN-SNAPSHOT" } },
      target.id
    );
    try {
      expect(JSON.stringify(await point())).not.toContain("FOREIGN-SNAPSHOT");
    } finally {
      await mutate("entity_snapshots", { user_id: USER, snapshot: saved.snapshot }, target.id);
    }
    const observation = randomUUID(),
      fragment = randomUUID();
    extraObs.push(observation);
    fragments.push(fragment);
    await (await getDb())
      .prepare(
        "INSERT INTO observations (id,entity_id,source_id,entity_type,schema_version,user_id,observed_at,created_at,source_priority,fields) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(
        observation,
        target.id,
        target.source,
        TYPE,
        "1.0",
        FOREIGN,
        new Date().toISOString(),
        new Date().toISOString(),
        100,
        "{}"
      );
    await db.from("raw_fragments").insert({
      id: fragment,
      source_id: target.source,
      entity_id: target.id,
      entity_type: TYPE,
      user_id: FOREIGN,
      fragment_key: "foreign_only",
      fragment_value: "FOREIGN-FRAGMENT",
      last_seen: new Date().toISOString(),
    });
    expect(JSON.stringify(await point())).not.toContain("FOREIGN-FRAGMENT");
  });
  it("keeps source links owner-scoped and acquires beyond100 sources without truncation", async () => {
    const id = created[0].id;
    const native = await getDb();
    for (let i = 0; i < 102; i++) {
      const observation = randomUUID(),
        source = randomUUID();
      extraObs.push(observation);
      await native
        .prepare(
          "INSERT INTO observations (id,entity_id,source_id,entity_type,schema_version,user_id,observed_at,created_at,source_priority,fields) VALUES (?,?,?,?,?,?,?,?,?,?)"
        )
        .run(
          observation,
          id,
          source,
          TYPE,
          "1.0",
          USER,
          new Date().toISOString(),
          new Date().toISOString(),
          100,
          "{}"
        );
      if (i === 101) {
        const fragment = randomUUID();
        fragments.push(fragment);
        await db.from("raw_fragments").insert({
          id: fragment,
          source_id: source,
          entity_id: null,
          entity_type: TYPE,
          user_id: USER,
          fragment_key: "beyond_sample",
          fragment_value: "COMPLETE-SOURCE-CANARY",
          last_seen: new Date().toISOString(),
        });
      }
    }
    const foreignId = randomUUID();
    extraObs.push(foreignId);
    await native
      .prepare(
        "INSERT INTO observations (id,entity_id,source_id,entity_type,schema_version,user_id,observed_at,created_at,source_priority,fields) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(
        foreignId,
        "ent_foreign_link",
        created[0].source,
        TYPE,
        "1.0",
        FOREIGN,
        new Date().toISOString(),
        new Date().toISOString(),
        100,
        "{}"
      );
    const fragment = randomUUID();
    fragments.push(fragment);
    await db.from("raw_fragments").insert({
      id: fragment,
      source_id: created[0].source,
      entity_id: null,
      entity_type: TYPE,
      user_id: USER,
      fragment_key: "owned_fragment",
      fragment_value: "OWNED-LINK",
      last_seen: new Date().toISOString(),
    });
    const result = await point();
    expect(result.raw_fragments.beyond_sample).toBe("COMPLETE-SOURCE-CANARY");
    expect(result.raw_fragments.owned_fragment).toBe("OWNED-LINK");
  });
  it("refuses actual source/snapshot acquisition errors without partial success or raw details", async () => {
    const database = await getDb();
    for (const target of ["entity_snapshots", "source_id", "lifecycle"]) {
      let failed = 0;
      const wrapped = {
        prepare(sql: string) {
          if (
            (target === "entity_snapshots" && /FROM\s+"?entity_snapshots"?/i.test(sql)) ||
            (target === "source_id" &&
              /FROM\s+"?observations"?/i.test(sql) &&
              sql.includes("source_id")) ||
            (target === "lifecycle" &&
              /FROM\s+"?observations"?/i.test(sql) &&
              sql.includes("source_priority") &&
              sql.includes("fields"))
          ) {
            failed++;
            throw Error("PRIVATE_DRIVER_DETAIL");
          }
          return database.prepare(sql);
        },
      };
      const ctx = runtime(wrapped);
      const read = createInternalReadKernel({ runtime: ctx, userId: USER });
      try {
        await expect(
          read.execute("retrieve_entity_snapshot", { entity_id: created[0].id })
        ).rejects.toSatisfy(
          (e: any) =>
            e.statusCode === 500 &&
            e.toErrorEnvelope().error_code === "DB_QUERY_FAILED" &&
            !e.message.includes("PRIVATE_DRIVER_DETAIL")
        );
        expect(failed).toBeGreaterThan(0);
      } finally {
        await read.dispose();
        await ctx.dispose();
      }
    }
  });
  it("returns the same safe actual database-fault error through native/MCP/HTTP/API CLI without writes", async () => {
    const native = await getDb();
    const before = await native.prepare("SELECT total_changes() AS n").get();
    const original = native.prepare.bind(native);
    let intercepted = 0;
    const spy = vi.spyOn(native, "prepare").mockImplementation((sql: string) => {
      if (/FROM\s+"?entity_snapshots"?/i.test(sql)) {
        intercepted++;
        throw new Error("PRIVATE_DRIVER_DETAIL");
      }
      return original(sql);
    });
    try {
      await refused({ entity_id: created[0].id }, "DB_QUERY_FAILED");
      const http = await fetch(api.base + "/entities/" + created[0].id);
      expect(http.status).toBe(500);
      const body = await http.json();
      expect(body.error_code).toBe("DB_QUERY_FAILED");
      expect(JSON.stringify(body)).not.toContain("PRIVATE_DRIVER_DETAIL");
      await expect(
        tool("retrieve_entity_snapshot", { entity_id: created[0].id, format: "json" })
      ).rejects.toMatchObject({ data: { error_code: "DB_QUERY_FAILED" } });
      await cliRefusal("api", created[0].id, "DB_QUERY_FAILED");
      expect(intercepted).toBeGreaterThanOrEqual(4);
    } finally {
      spy.mockRestore();
    }
    expect(await native.prepare("SELECT total_changes() AS n").get()).toEqual(before);
  });
  it("preserves current hiding/restore and bounded merge acquisition with restrictive corrupt targets", async () => {
    const id = created[2].id;
    await tool("delete_entity", { entity_id: id, entity_type: TYPE });
    await refused({ entity_id: id }, "RESOURCE_NOT_FOUND");
    expect((await fetch(api.base + "/entities/" + id)).status).toBe(404);
    await tool("restore_entity", { entity_id: id, entity_type: TYPE });
    await point(id);
    await mutate("entities", { merged_to_entity_id: created[1].id }, id);
    await mutate("entities", { merged_to_entity_id: id }, created[1].id);
    try {
      await refused({ entity_id: id }, "DB_QUERY_FAILED");
    } finally {
      await mutate("entities", { merged_to_entity_id: null }, created[1].id);
      await mutate("entities", { merged_to_entity_id: null }, id);
    }
    await mutate("entities", { merged_to_entity_id: "ent_missing_target" }, id);
    try {
      await refused({ entity_id: id }, "DB_QUERY_FAILED");
    } finally {
      await mutate("entities", { merged_to_entity_id: null }, id);
    }
    await mergeEntities({
      fromEntityId: id,
      toEntityId: created[1].id,
      userId: USER,
      mergeReason: "synthetic",
      mergedBy: "synthetic",
    });
    expect((await point(id)).entity_id).toBe(created[1].id);
  });
  it("isolates same-ID stores and legacy callers while honoring recorded hiding over stale snapshots", async () => {
    const resources: any[] = [];
    try {
      for (const [i, user] of [USER, FOREIGN].entries()) {
        const database = new AsyncSqliteDatabase(":memory:");
        const ctx = runtime(database, user);
        const ops = createOperations({ userId: user });
        const read = createInternalReadKernel({ runtime: ctx, userId: user });
        const r = { database, ctx, ops, read, id: "" };
        resources.push(r);
        await initializeFreshEmbeddedDatabase(ctx);
        await ctx.run(() =>
          ops.executeTool("register_schema", {
            entity_type: TYPE,
            schema_version: i ? "2.0" : "1.0",
            activate: true,
            user_specific: true,
            schema_definition: definition,
            reducer_config: reducer,
          })
        );
        const stored: any = await ctx.run(() =>
          ops.store({
            entities: [
              { entity_type: TYPE, title: "Same local point", value: i, status: `runtime-${i}` },
            ],
            idempotency_key: "same-point-key",
          })
        );
        r.id = stored.entities[0].entity_id;
      }
      expect(resources[0].id).toBe(resources[1].id);
      const results = await Promise.all([
        resources[0].read.retrieveCurrentEntity({ entity_id: resources[0].id }),
        tool("retrieve_entity_snapshot", { entity_id: created[0].id, format: "json" }),
        resources[1].read.retrieveCurrentEntity({ entity_id: resources[1].id }),
      ]);
      expect(results[0].snapshot.status).toBe("runtime-0");
      expect(results[2].snapshot.status).toBe("runtime-1");
      expect(results[1].snapshot.value).toBe(42);
      const r = resources[1];
      await r.ctx.run(() =>
        migrateEntityLifecycleAuthority(r.database, async (_tx: any, targets: any[]) => {
          for (const target of targets) await recomputeSnapshot(target.id, target.user_id, true);
        })
      );
      const saved = await r.database
        .prepare("SELECT * FROM entity_snapshots WHERE entity_id=?")
        .get(r.id);
      await r.ctx.run(() => softDeleteEntity(r.id, TYPE, FOREIGN));
      await r.database
        .prepare(
          "INSERT INTO entity_snapshots (entity_id,entity_type,user_id,snapshot,provenance,computed_at,schema_version) VALUES (?,?,?,?,?,?,?)"
        )
        .run(
          r.id,
          TYPE,
          FOREIGN,
          saved.snapshot,
          saved.provenance,
          saved.computed_at,
          saved.schema_version
        );
      await expect(r.read.retrieveCurrentEntity({ entity_id: r.id })).rejects.toSatisfy(
        (e: any) => e.toErrorEnvelope().error_code === "RESOURCE_NOT_FOUND"
      );
      await r.ctx.run(() => restoreEntity(r.id, TYPE, FOREIGN));
      expect((await r.read.retrieveCurrentEntity({ entity_id: r.id })).snapshot.status).toBe(
        "runtime-1"
      );
    } finally {
      for (const r of resources) {
        await r.read.dispose();
        await r.ops.dispose();
        await r.ctx.dispose();
        expect(await r.database.prepare("SELECT 1 AS alive").get()).toEqual({ alive: 1 });
        await r.database.close();
      }
    }
  });
  it("drains an actual point call and leaves borrowed handles usable", async () => {
    const database = await getDb();
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((r) => (release = r)),
      seen = new Promise<void>((r) => (entered = r));
    let first = true;
    const wrapped = {
      prepare(sql: string) {
        const statement = database.prepare(sql);
        return new Proxy(statement, {
          get(target, key) {
            const value = Reflect.get(target, key);
            if (typeof value !== "function") return value;
            return async (...args: unknown[]) => {
              if (first) {
                first = false;
                entered();
                await held;
              }
              return value.apply(target, args);
            };
          },
        });
      },
    };
    const ctx = runtime(wrapped);
    const read = createInternalReadKernel({ runtime: ctx, userId: USER });
    try {
      const order: string[] = [];
      const pending = read.retrieveCurrentEntity({ entity_id: created[0].id }).then((value) => {
        order.push("operation");
        return value;
      });
      await seen;
      let done = false;
      const closing = read.dispose().then(() => {
        done = true;
        order.push("disposed");
      });
      await Promise.resolve();
      expect(done).toBe(false);
      await expect(read.retrieveCurrentEntity({ entity_id: created[0].id })).rejects.toSatisfy(
        (e: any) => e.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
      );
      release();
      expect((await pending).snapshot.value).toBe(42);
      await closing;
      expect(done).toBe(true);
      expect(order).toEqual(["operation", "disposed"]);
    } finally {
      release();
      await read.dispose();
      await ctx.dispose();
      expect(await database.prepare("SELECT 1 AS alive").get()).toEqual({ alive: 1 });
    }
  });
  it("bounds depth and refuses a cross-owner merge target without disclosing it", async () => {
    const native = await getDb();
    const ids = Array.from({ length: 34 }, () => "ent_point_depth_" + randomUUID());
    for (let i = 0; i < ids.length; i++) {
      created.push({ id: ids[i], source: "" });
      await native
        .prepare(
          "INSERT INTO entities (id,entity_type,user_id,canonical_name,merged_to_entity_id) VALUES (?,?,?,?,?)"
        )
        .run(ids[i], TYPE, USER, "Synthetic hop", ids[i + 1] ?? null);
    }
    await refused({ entity_id: ids[0] }, "DB_QUERY_FAILED");
    const foreignId = "ent_foreign_target_" + randomUUID();
    created.push({ id: foreignId, source: "" });
    await native
      .prepare("INSERT INTO entities (id,entity_type,user_id,canonical_name) VALUES (?,?,?,?)")
      .run(foreignId, TYPE, FOREIGN, "FOREIGN-TARGET-CANARY");
    await mutate("entities", { merged_to_entity_id: foreignId }, created[0].id);
    try {
      await refused({ entity_id: created[0].id }, "DB_QUERY_FAILED");
      expect((await fetch(api.base + "/entities/" + created[0].id)).status).toBe(500);
    } finally {
      await mutate("entities", { merged_to_entity_id: null }, created[0].id);
    }
  });
});
