import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const state = vi.hoisted(() => ({ connection: null as any, events: [] as any[] }));
vi.mock("../../src/repositories/db/connection.js", () => ({
  getDb: async () => state.connection,
  clearDbCache: () => {
    throw Error("fixture never resets application DB");
  },
}));
vi.mock("../../src/config.js", () => ({
  config: { encryption: { enabled: false }, dataDir: "/synthetic-not-used", rawStorageDir: null },
}));
vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));
vi.mock("../../src/services/entity_snapshot_embedding.js", () => ({
  prepareEntitySnapshotWithEmbedding: () => {
    throw Error("unexpected entity embedding");
  },
  upsertEntitySnapshotWithEmbedding: () => {
    throw Error("unexpected entity embedding");
  },
}));
vi.mock("../../src/services/schema_definitions.js", () => ({ ENTITY_SCHEMAS: {} }));
vi.mock("../../src/services/entity_lifecycle_ingress.js", () => ({
  assertOrdinaryLifecyclePayload: (table: string) => {
    if (table !== "schema_registry") throw Error("fixture only permits registry metadata");
  },
  assertOrdinaryLifecycleUpsert: () => {
    throw Error("unexpected entity upsert");
  },
}));
vi.mock("child_process", () => ({
  spawn: () => {
    throw Error("fixture forbids process spawn");
  },
}));
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";
let dir: string, writer: AsyncSqliteDatabase, reader: AsyncSqliteDatabase;
const own: SchemaRegistryService[] = [];
function service() {
  const s = new SchemaRegistryService();
  vi.spyOn(s as any, "generateIconAsync").mockImplementation(() => {});
  vi.spyOn(s as any, "exportSnapshotsAsync").mockImplementation(() => {});
  own.push(s);
  return s;
}
const baseline = {
  entity_type: "email_message",
  schema_version: "1.1.0",
  schema_definition: {
    fields: {
      graph_message_id: { type: "string", required: true },
      subject: { type: "string", required: false },
    },
    canonical_name_fields: ["graph_message_id"],
  },
  reducer_config: {
    observation_source_priority: ["human", "import"],
    merge_policies: {
      graph_message_id: { strategy: "last_write", tie_breaker: "observed_at" },
      subject: { strategy: "last_write", tie_breaker: "observed_at" },
    },
  },
  metadata: { icon: "synthetic-icon", guest_access_policy: "closed", synthetic_keep: "preserved" },
  user_specific: false,
};
const add = (name: string) => ({
  entity_type: "email_message",
  fields_to_add: [
    {
      field_name: name,
      field_type: "object" as const,
      required: false,
      reducer_strategy: "last_write" as const,
    },
  ],
  user_specific: false,
  activate: true,
  migrate_existing: false,
});
async function active() {
  return (await reader
    .prepare(
      "SELECT id,schema_version,schema_definition,reducer_config,metadata FROM schema_registry WHERE entity_type='email_message' AND scope='global' AND active=1"
    )
    .all()) as any[];
}
async function fields() {
  const rows = await active();
  expect(rows).toHaveLength(1);
  return JSON.parse(rows[0].schema_definition).fields;
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "atomic-schema-fixture-"));
  writer = new AsyncSqliteDatabase(join(dir, "synthetic.db"));
  await writer.pragma("journal_mode=WAL");
  reader = new AsyncSqliteDatabase(join(dir, "synthetic.db"));
  state.connection = writer;
  state.events = [];
  await writer.exec(
    "CREATE TABLE schema_registry (id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,schema_version TEXT NOT NULL,schema_definition TEXT NOT NULL,reducer_config TEXT NOT NULL,active INTEGER,created_at TEXT,user_id TEXT,scope TEXT,metadata TEXT)"
  );
  await service().register({ ...baseline, activate: true } as any);
  // A real second SQLite connection observes committed states after each write.
  const original = writer.prepare.bind(writer);
  writer.prepare = ((sql: string) => {
    const s = original(sql);
    return {
      ...s,
      get: s.get.bind(s),
      all: s.all.bind(s),
      run: async (...args: any[]) => {
        const r = await s.run(...args);
        if (/^(INSERT|UPDATE)/i.test(sql.trim()))
          state.events.push({
            sql_role: sql.trim().split(/\s+/)[0],
            active_rows: (await active()).length,
          });
        return r;
      },
    };
  }) as any;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await reader.close();
  await writer.close();
  rmSync(dir, { recursive: true, force: true });
  own.length = 0;
});
describe("atomic registry metadata changes (#2373 / #2545)", () => {
  it("preserves fields, identity, reducers and metadata across serial and repeated additions", async () => {
    const s = service();
    await s.updateSchemaIncremental(add("mailbox_membership"));
    await s.updateSchemaIncremental(add("synthetic_other"));
    await s.updateSchemaIncremental(add("mailbox_membership"));
    const a = (await active())[0];
    expect(a.schema_version).toBe("1.4.0");
    expect(Object.keys(await fields()).sort()).toEqual([
      "graph_message_id",
      "mailbox_membership",
      "subject",
      "synthetic_other",
    ]);
    expect(JSON.parse(a.schema_definition).canonical_name_fields).toEqual(["graph_message_id"]);
    expect(JSON.parse(a.metadata)).toEqual(baseline.metadata);
    expect(JSON.parse(a.reducer_config).merge_policies.subject).toEqual(
      baseline.reducer_config.merge_policies.subject
    );
    expect(JSON.parse(a.reducer_config).observation_source_priority).toEqual(
      baseline.reducer_config.observation_source_priority
    );
  });
  it("never exposes a committed dual-active registration or zero-active incremental interval", async () => {
    await service().register({ ...baseline, schema_version: "1.2.0", activate: true } as any);
    await service().updateSchemaIncremental(add("mailbox_membership"));
    expect(state.events.length).toBeGreaterThan(0);
    expect(state.events.every((e) => e.active_rows === 1)).toBe(true);
    expect((await fields()).mailbox_membership).toBeDefined();
  });
  it("serializes concurrent additive callers through baseline resolution and activation", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        service().updateSchemaIncremental(add("synthetic_field_" + i))
      )
    );
    const f = await fields();
    for (let i = 0; i < 8; i++) expect(f["synthetic_field_" + i]).toBeDefined();
    expect((await active())[0].schema_version).toBe("1.9.0");
    expect(state.events.every((e) => e.active_rows === 1)).toBe(true);
  });
  it("activates the exact newly registered row despite an existing inactive same-version row", async () => {
    const competitor = await service().register({
      ...baseline,
      schema_version: "1.2.0",
      activate: false,
    } as any);
    const returned = await service().updateSchemaIncremental(add("mailbox_membership"));
    const rows = await active();
    expect(rows[0].id).toBe(returned.id);
    expect(rows[0].id).not.toBe(competitor.id);
    expect((await fields()).mailbox_membership).toBeDefined();
  });
  it("rolls back registration and deactivation on activation failure and dispatches no effects", async () => {
    const s = service();
    await writer.exec(
      "CREATE TRIGGER refuse_activation BEFORE UPDATE OF active ON schema_registry WHEN NEW.active=1 AND NEW.schema_version='1.2.0' BEGIN SELECT RAISE(FAIL,'synthetic activation failure'); END"
    );
    await expect(s.updateSchemaIncremental(add("mailbox_membership"))).rejects.toThrow(/activate/);
    expect((await active())[0].schema_version).toBe("1.1.0");
    expect(
      ((await reader.prepare("SELECT COUNT(*) AS n FROM schema_registry").get()) as any).n
    ).toBe(1);
    expect((await fields()).mailbox_membership).toBeUndefined();
    expect((s as any).generateIconAsync).not.toHaveBeenCalled();
    expect((s as any).exportSnapshotsAsync).not.toHaveBeenCalled();
    await writer.exec("DROP TRIGGER refuse_activation");
    await s.updateSchemaIncremental(add("mailbox_membership"));
    expect((await fields()).mailbox_membership).toBeDefined();
    expect((s as any).exportSnapshotsAsync).toHaveBeenCalledTimes(2);
  });
  it("rolls back active registration when prior-row deactivation is refused", async () => {
    const s = service();
    await writer.exec(
      "CREATE TRIGGER refuse_deactivation BEFORE UPDATE OF active ON schema_registry WHEN NEW.active=0 BEGIN SELECT RAISE(FAIL,'synthetic deactivation failure'); END"
    );
    await expect(
      s.register({ ...baseline, schema_version: "1.2.0", activate: true } as any)
    ).rejects.toThrow(/deactivate/);
    expect((await active())[0].schema_version).toBe("1.1.0");
    expect(
      ((await reader.prepare("SELECT COUNT(*) AS n FROM schema_registry").get()) as any).n
    ).toBe(1);
    expect((s as any).generateIconAsync).not.toHaveBeenCalled();
    expect((s as any).exportSnapshotsAsync).not.toHaveBeenCalled();
  });
  it("keeps global and distinct user overrides isolated, including equal version strings", async () => {
    const s = service();
    for (const user_id of ["synthetic-user-a", "synthetic-user-b"])
      await s.register({ ...baseline, user_specific: true, user_id, activate: true } as any);
    await Promise.all([
      s.updateSchemaIncremental(add("global_field")),
      s.updateSchemaIncremental({
        ...add("user_field"),
        user_specific: true,
        user_id: "synthetic-user-a",
      }),
    ]);
    const rows = (await reader
      .prepare("SELECT scope,user_id,schema_definition FROM schema_registry WHERE active=1")
      .all()) as any[];
    expect(rows).toHaveLength(3);
    const global = rows.find((r) => r.scope === "global"),
      a = rows.find((r) => r.user_id === "synthetic-user-a"),
      b = rows.find((r) => r.user_id === "synthetic-user-b");
    expect(JSON.parse(global.schema_definition).fields.global_field).toBeDefined();
    expect(JSON.parse(global.schema_definition).fields.user_field).toBeUndefined();
    expect(JSON.parse(a.schema_definition).fields.user_field).toBeDefined();
    expect(JSON.parse(a.schema_definition).fields.global_field).toBeUndefined();
    expect(JSON.parse(b.schema_definition).fields.user_field).toBeUndefined();
  });
  it("commits before registration effects execute", async () => {
    const s = service(),
      observed: number[] = [];
    vi.mocked((s as any).exportSnapshotsAsync).mockImplementation(() => {
      observed.push(
        (
          reader
            .rawDb()
            .prepare("SELECT COUNT(*) AS n FROM schema_registry WHERE active=1")
            .get() as any
        ).n
      );
    });
    await s.updateSchemaIncremental(add("mailbox_membership"));
    expect(observed).toEqual([1, 1]);
  });
});
