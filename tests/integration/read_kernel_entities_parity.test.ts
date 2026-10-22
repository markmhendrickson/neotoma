/** Real shared plain-list effects; private admission is narrower than legacy transports. */
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
const TYPE = "runtime_plain_" + randomUUID().replaceAll("-", "");
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
      dataDirectory: resolve(".vitest/private-list"),
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
const meaning = (x: any) => ({
  entities: x.entities,
  total: x.total,
  search_mode: x.search_mode,
  next_cursor: x.next_cursor,
  coverage: x.read_contract.coverage,
  scope: x.read_contract.applied_scope,
});
async function parity(input: any = {}) {
  const body = { entity_type: TYPE, ...input };
  const native = await kernel.execute("retrieve_entities", body);
  const transport = await tool("retrieve_entities", body);
  const http = await callHttp(api.base, "/entities/query", body);
  expect(http.status).toBe(200);
  expect(meaning(native)).toEqual(meaning(transport));
  expect(meaning(native)).toEqual(meaning(http.json));
  return native;
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
      "--body",
      JSON.stringify(body),
    ],
    { env, timeout: 20000, maxBuffer: 2 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}
beforeAll(async () => {
  api = await startOfflineServer();
  home = await mkdtemp(join(tmpdir(), "private-list-"));
  await tool("register_schema", {
    entity_type: TYPE,
    schema_version: "1.0",
    activate: true,
    user_specific: true,
    schema_definition: definition,
    reducer_config: reducer,
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
describe("private typed plain entity listing", () => {
  it("shares actual owned rows/count/order/filters and cursor behavior with MCP/HTTP", async () => {
    const all = await parity();
    expect(
      meaning(await kernel.execute("retrieve_entities", { entity_type: TYPE, user_id: FOREIGN }))
    ).toEqual(meaning(all));
    expect(all.total).toBe(3);
    expect(all.entities).toHaveLength(3);
    expect(all.entities.find((x: any) => x.entity_id === created[0].id).snapshot.value).toBe(42);
    expect(
      (await parity({ entity_types: [TYPE], include_snapshots: false })).entities.every(
        (x: any) => Object.keys(x.snapshot).length === 1 && x.snapshot.status
      )
    ).toBe(true);
    expect(
      (await parity({ snapshot_filters: { status: { op: "eq", value: "open" } } })).total
    ).toBe(2);
    await parity({ identity_basis: "schema_rule" });
    await parity({ sort_by: "last_observation_at", sort_order: "desc", limit: 1, offset: 1 });
    const page = await parity({ limit: 2 });
    expect(page.next_cursor).toBeTruthy();
    const end = await parity({ limit: 2, cursor: page.next_cursor });
    expect(end.entities).toHaveLength(1);
    expect(end.next_cursor).toBeUndefined();
    const union = new Set([...page.entities, ...end.entities].map((e: any) => e.entity_id));
    expect(union.size).toBe(3);
    expect((await parity({ updated_since: "2100-01-01T00:00:00Z" })).entities).toEqual([]);
    expect((await parity({ created_since: "2100-01-01T00:00:00Z" })).total).toBe(0);
    const got = await fetch(api.base + "/entities?entity_type=" + TYPE + "&limit=2");
    expect(got.status).toBe(200);
    expect(meaning(await got.json())).toEqual(meaning(page));
  });
  it.each(["offline", "api"] as const)(
    "executes mapped natural CLI plain query effects, %s",
    async (mode) => {
      const result = await cli(mode, "queryEntities", { entity_type: TYPE, limit: 2 });
      const natural = await parity({ limit: 2 });
      expect(meaning(result)).toEqual(meaning(natural));
      const filtered = await cli(mode, "queryEntities", {
        entity_type: TYPE,
        snapshot_filters: { status: { op: "eq", value: "open" } },
      });
      expect(filtered.total).toBe(2);
      expect(filtered.entities).toHaveLength(2);
    }
  );
  it("preserves owned current deletion/restore and merged listing population semantics", async () => {
    const target = created[2].id;
    await tool("delete_entity", { entity_id: target, entity_type: TYPE });
    const hidden = await parity();
    expect(hidden.entities.map((e: any) => e.entity_id)).not.toContain(target);
    expect(hidden.total).toBe(2);
    await tool("restore_entity", { entity_id: target, entity_type: TYPE });
    expect((await parity()).total).toBe(3);
  });
  it.each([
    { label: "sort", input: { sort_by: "snapshot." } },
    {
      label: "filter",
      input: {
        snapshot_filters: { "private.rejected": { op: "eq", value: "PRIVATE-REJECTED-VALUE" } },
      },
    },
  ])(
    "maps rejected $label query fields to canonical 400 guidance across natural surfaces without writes",
    async ({ input }) => {
      const database = await getDb();
      async function state() {
        const tables = (await database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
          )
          .all()) as { name: string }[];
        const result: Record<string, unknown> = {};
        for (const { name } of tables) {
          const rows = await database
            .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
            .all();
          result[name] = rows.map((row) => JSON.stringify(row)).sort();
        }
        return result;
      }
      const before = await state();
      const body = { entity_type: TYPE, ...input };
      let failure: any;
      try {
        await kernel.execute("retrieve_entities", body);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeDefined();
      expect(failure.statusCode).toBe(400);
      const envelope = failure.toErrorEnvelope();
      expect(envelope).toMatchObject({
        error_code: "INVALID_QUERY_FIELD",
        message: "Invalid query field name.",
        details: {
          hint: expect.stringContaining("bare identifiers"),
          detail: expect.stringContaining("bare identifiers"),
        },
      });
      expect(JSON.stringify(envelope)).not.toMatch(/private\.rejected|PRIVATE-REJECTED-VALUE/);
      const http = await callHttp(api.base, "/entities/query", body);
      expect(http.status).toBe(400);
      expect({
        error_code: http.json.error_code,
        message: http.json.message,
        details: http.json.details,
      }).toEqual(envelope);
      await expect(tool("retrieve_entities", body)).rejects.toMatchObject({
        code: -32602,
        data: envelope,
      });
      for (const mode of ["offline", "api"] as const)
        await expect(cli(mode, "queryEntities", body)).rejects.toSatisfy((error: any) => {
          const text = error.stderr || error.stdout || "";
          return (
            error.code === 1 &&
            text.includes(envelope.error_code) &&
            text.includes(envelope.message) &&
            text.includes(envelope.details.hint) &&
            !/private\.rejected|PRIVATE-REJECTED-VALUE/.test(text)
          );
        });
      const query = new URLSearchParams({ entity_type: TYPE });
      for (const [key, value] of Object.entries(input))
        if (value !== undefined)
          query.set(key, typeof value === "string" ? value : JSON.stringify(value));
      const get = await fetch(api.base + "/entities?" + query);
      expect(get.status).toBe(400);
      const getBody = await get.json();
      expect({
        error_code: getBody.error_code,
        message: getBody.message,
        details: getBody.details,
      }).toEqual(envelope);
      expect(await state()).toEqual(before);
      // Shared Zod admission remains a separate caller failure, never a retryable DB error.
      expect(
        (await callHttp(api.base, "/entities/query", { entity_type: TYPE, limit: 0 })).status
      ).toBe(400);
    }
  );
  it("refuses unsupported selectors before DB calls and reports validation/query errors canonically", async () => {
    const prepare = vi.fn(() => {
      throw new Error("PRIVATE_DB_DETAIL");
    });
    const ctx = runtime({ prepare, close: vi.fn() });
    const privateKernel = createInternalReadKernel({ runtime: ctx, userId: USER });
    try {
      for (const body of [
        {},
        { entity_types: [] },
        { entity_type: TYPE, search: "x" },
        { entity_type: TYPE, query: "x" },
        { entity_type: TYPE, search_query: "" },
        { entity_type: TYPE, collapse_by: "canonical_key" },
        { entity_type: TYPE, valid_at: "2020-01-01T00:00:00Z" },
        { entity_type: TYPE, unknown: true },
      ])
        await expect(privateKernel.execute("retrieve_entities", body)).rejects.toSatisfy(
          (e: any) => e.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
        );
      expect(prepare).not.toHaveBeenCalled();
      await expect(
        privateKernel.execute("retrieve_entities", { entity_type: TYPE, limit: 0 })
      ).rejects.toSatisfy(
        (e: any) => e.toErrorEnvelope().error_code === "VALIDATION_INVALID_FORMAT"
      );
      expect(prepare).not.toHaveBeenCalled();
      await expect(privateKernel.retrieveEntities({ entity_type: TYPE })).rejects.toSatisfy(
        (e: any) =>
          e.toErrorEnvelope().error_code === "DB_QUERY_FAILED" &&
          !e.message.includes("PRIVATE_DB_DETAIL")
      );
    } finally {
      await privateKernel.dispose();
      await ctx.dispose();
    }
    await expect(
      kernel.execute("retrieve_entities", { entity_type: TYPE, cursor: "bad" })
    ).rejects.toSatisfy((e: any) => e.toErrorEnvelope().error_code === "INVALID_CURSOR");
  });
  it("retains a genuine closed SQLite failure as a safe retryable 500", async () => {
    const database = new AsyncSqliteDatabase(":memory:");
    expect(await database.prepare("SELECT 1 AS alive").get()).toEqual({ alive: 1 });
    await database.close();
    const ctx = runtime(database);
    const read = createInternalReadKernel({ runtime: ctx, userId: USER });
    try {
      await expect(read.retrieveEntities({ entity_type: TYPE })).rejects.toSatisfy(
        (error: any) =>
          error.statusCode === 500 &&
          error.toErrorEnvelope().error_code === "DB_QUERY_FAILED" &&
          error.toErrorEnvelope().details.hint.startsWith("Retry") &&
          !/closed|SQLITE|database|prepare/i.test(error.message)
      );
    } finally {
      await read.dispose();
      await ctx.dispose();
    }
  });
  it("never leaks foreign snapshot/observation metadata sharing an owned legacy ID and scopes source links", async () => {
    const target = created[0];
    const { data: saved } = await db
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", target.id)
      .single();
    await mutate(
      "entity_snapshots",
      { user_id: FOREIGN, snapshot: { status: "FOREIGN-SNAPSHOT-CANARY" } },
      target.id
    );
    try {
      const listed = await parity();
      expect(JSON.stringify(listed)).not.toContain("FOREIGN-SNAPSHOT-CANARY");
      expect(listed.read_contract.coverage.total.relation).toBe("unknown");
    } finally {
      await mutate("entity_snapshots", { user_id: USER, snapshot: saved.snapshot }, target.id);
    }
    const foreignSource = randomUUID();
    for (const row of [
      { id: randomUUID(), entity_id: target.id, source_id: foreignSource },
      { id: randomUUID(), entity_id: "ent_foreign_link_fixture", source_id: target.source },
    ]) {
      extraObs.push(row.id);
      // Deliberate legacy corruption fixture through native SQL with every native
      // trigger retained. Ordinary guarded writer correctly refuses this owner collision.
      await (await getDb())
        .prepare(
          "INSERT INTO observations (id,entity_id,source_id,entity_type,schema_version,user_id,observed_at,created_at,source_priority,fields) VALUES (?,?,?,?,?,?,?,?,?,?)"
        )
        .run(
          row.id,
          row.entity_id,
          row.source_id,
          TYPE,
          "1.0",
          FOREIGN,
          new Date().toISOString(),
          new Date().toISOString(),
          100,
          JSON.stringify({ status: "FOREIGN-OBSERVATION-CANARY" })
        );
    }
    for (const row of [
      {
        source_id: target.source,
        fragment_key: "foreign_fragment",
        fragment_value: "FOREIGN-FRAGMENT-CANARY",
        user_id: FOREIGN,
      },
      {
        source_id: target.source,
        fragment_key: "owned_fragment",
        fragment_value: "OWNED-FRAGMENT",
        user_id: USER,
      },
    ]) {
      const id = randomUUID();
      fragments.push(id);
      expect(
        (
          await db.from("raw_fragments").insert({
            ...row,
            id,
            entity_id: null,
            entity_type: TYPE,
            last_seen: new Date().toISOString(),
          })
        ).error
      ).toBeNull();
    }
    const result = await parity();
    expect(JSON.stringify(result)).not.toContain("FOREIGN-FRAGMENT-CANARY");
    expect(
      result.entities.find((x: any) => x.entity_id === target.id).raw_fragments.owned_fragment
    ).toBe("OWNED-FRAGMENT");
  });
  it("uses physical types for existing inactive-namespace refusal and ignores payload type decoys", async () => {
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
    await expect(kernel.retrieveEntities({ entity_type: RESERVED })).rejects.toSatisfy(
      (e: any) =>
        e.toErrorEnvelope().error_code === "VALIDATION_INVALID_FORMAT" &&
        e.toErrorEnvelope().details.hint
    );
    for (const mode of ["offline", "api"] as const) {
      await expect(cli(mode, "queryEntities", { entity_type: RESERVED })).rejects.toSatisfy(
        (error: any) => {
          const text = error.stdout || error.stderr || "";
          return (
            text.includes("VALIDATION_INVALID_FORMAT") &&
            text.includes("immutable identity declaration")
          );
        }
      );
    }
    const target = created[0].id;
    const { data: saved } = await db
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", target)
      .single();
    try {
      await mutate(
        "entity_snapshots",
        { snapshot: { ...saved.snapshot, entity_type: RESERVED } },
        target
      );
      await parity();
      await mutate("entity_snapshots", { entity_type: RESERVED }, target);
      await expect(kernel.retrieveEntities({ entity_type: TYPE })).rejects.toSatisfy(
        (e: any) => e.toErrorEnvelope().error_code === "VALIDATION_INVALID_FORMAT"
      );
      await expect(tool("retrieve_entities", { entity_type: TYPE })).rejects.toMatchObject({
        data: { error_code: "VALIDATION_INVALID_FORMAT" },
      });
      expect(
        (await callHttp(api.base, "/entities/query", { entity_type: TYPE })).json.error_code
      ).toBe("VALIDATION_INVALID_FORMAT");
    } finally {
      await mutate("entity_snapshots", { snapshot: saved.snapshot, entity_type: TYPE }, target);
    }
  });
  it("drains an actual list call while refusing new work and retaining caller-owned handles", async () => {
    const database = await getDb();
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((r) => (release = r)),
      seen = new Promise<void>((r) => (entered = r));
    let first = true;
    const borrowed = {
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
    const ctx = runtime(borrowed);
    const read = createInternalReadKernel({ runtime: ctx, userId: USER });
    try {
      const pending = read.retrieveEntities({ entity_type: TYPE });
      await seen;
      let disposed = false;
      const draining = read.dispose().then(() => (disposed = true));
      await Promise.resolve();
      expect(disposed).toBe(false);
      await expect(read.retrieveEntities({ entity_type: TYPE })).rejects.toSatisfy(
        (e: any) => e.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
      );
      release();
      expect((await pending).entities).toHaveLength(3);
      await draining;
      expect(disposed).toBe(true);
      expect(await database.prepare("SELECT 1 AS alive").get()).toEqual({ alive: 1 });
    } finally {
      release();
      await read.dispose();
      await ctx.dispose();
    }
  });
  it("isolates two explicit stores with the same legacy ID across principals while a legacy caller interleaves", async () => {
    const resources = [];
    try {
      for (const [i, user] of [USER, FOREIGN].entries()) {
        const database = new AsyncSqliteDatabase(":memory:");
        const ctx = runtime(database, user);
        resources.push({
          database,
          ctx,
          read: createInternalReadKernel({ runtime: ctx, userId: user }),
          id: "",
          ops: createOperations({ userId: user }),
        });
        const r = resources.at(-1)!;
        await initializeFreshEmbeddedDatabase(ctx);
        await ctx.run(() =>
          r.ops.executeTool("register_schema", {
            entity_type: TYPE,
            schema_version: i ? "2.0" : "1.0",
            activate: true,
            user_specific: true,
            schema_definition: definition,
            reducer_config: reducer,
          })
        );
        const stored: any = await ctx.run(() =>
          r.ops.store({
            entities: [
              { entity_type: TYPE, title: "Equal legacy ID", value: i, status: `runtime-${i}` },
            ],
            idempotency_key: "same-key",
          })
        );
        r.id = stored.entities[0].entity_id;
      }
      await resources[1].ctx.run(() =>
        migrateEntityLifecycleAuthority(resources[1].database, async (_tx, targets) => {
          for (const target of targets) await recomputeSnapshot(target.id, target.user_id, true);
        })
      );
      expect(resources[0].id).toBe(resources[1].id);
      const results = await Promise.all([
        resources[0].read.retrieveEntities({ entity_type: TYPE }),
        tool("retrieve_entities", { entity_type: TYPE }),
        resources[1].read.retrieveEntities({ entity_type: TYPE }),
      ]);
      expect(results[0].entities[0].snapshot.status).toBe("runtime-0");
      expect(results[2].entities[0].snapshot.status).toBe("runtime-1");
      expect(results[1].entities).toHaveLength(3);
      const r = resources[1];
      await r.database
        .prepare("UPDATE entity_snapshots SET user_id=?,snapshot=? WHERE entity_id=?")
        .run(USER, JSON.stringify({ status: "FOREIGN-RECORDED-SNAPSHOT-CANARY" }), r.id);
      expect(JSON.stringify(await r.read.retrieveEntities({ entity_type: TYPE }))).not.toContain(
        "FOREIGN-RECORDED-SNAPSHOT-CANARY"
      );
      await r.database
        .prepare("UPDATE entity_snapshots SET user_id=?,snapshot=? WHERE entity_id=?")
        .run(
          FOREIGN,
          JSON.stringify({ title: "Equal legacy ID", value: 1, status: "runtime-1" }),
          r.id
        );
      const saved = (await r.database
        .prepare("SELECT * FROM entity_snapshots WHERE entity_id=?")
        .get(r.id)) as any;
      await r.ctx.run(() => softDeleteEntity(r.id, TYPE, FOREIGN));
      // Fault-inject only stale materialized data, retaining native authority/guards.
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
      const hidden = await r.read.retrieveEntities({ entity_type: TYPE });
      expect(hidden.entities).toEqual([]);
      expect(hidden.total).toBe(0);
      await r.ctx.run(() => restoreEntity(r.id, TYPE, FOREIGN));
      expect(
        (await r.read.retrieveEntities({ entity_type: TYPE })).entities[0].snapshot.status
      ).toBe("runtime-1");
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
  it("keeps merged attachment population/count and source fragments through the shared service", async () => {
    const id = randomUUID();
    fragments.push(id);
    expect(
      (
        await db.from("raw_fragments").insert({
          id,
          source_id: created[2].source,
          entity_id: null,
          entity_type: TYPE,
          user_id: USER,
          fragment_key: "merged_note",
          fragment_value: "MERGED-ATTACHMENT",
          last_seen: new Date().toISOString(),
        })
      ).error
    ).toBeNull();
    await mergeEntities({
      fromEntityId: created[2].id,
      toEntityId: created[0].id,
      userId: USER,
      mergeReason: "synthetic",
      mergedBy: "synthetic",
    });
    const normal = await parity();
    expect(normal.total).toBe(2);
    expect(normal.entities.map((x: any) => x.entity_id)).not.toContain(created[2].id);
    expect(
      normal.entities.find((x: any) => x.entity_id === created[0].id).raw_fragments.merged_note
    ).toBe("MERGED-ATTACHMENT");
    const withMerged = await parity({ include_merged: true });
    expect(withMerged.total).toBe(3);
    expect(withMerged.entities.map((x: any) => x.entity_id)).toContain(created[2].id);
  });
});
