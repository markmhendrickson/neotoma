import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import {
  installEntityLifecycleStorage,
  migrateEntityLifecycleAuthority,
} from "../../src/services/entity_lifecycle_storage.js";
import { legacyMembershipDigest } from "../../src/services/entity_lifecycle_authority.js";

describe("owned local lifecycle cutover", () => {
  let dir: string;
  let database: AsyncSqliteDatabase;
  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "neotoma-synthetic-lifecycle-"));
    database = new AsyncSqliteDatabase(path.join(dir, "synthetic.sqlite"));
    await database.exec(`CREATE TABLE entities(id TEXT PRIMARY KEY, user_id TEXT, entity_type TEXT, merged_to_entity_id TEXT);
      CREATE TABLE observations(id TEXT PRIMARY KEY, entity_id TEXT, user_id TEXT, entity_type TEXT, schema_version TEXT, observed_at TEXT, created_at TEXT, source_priority INTEGER, observation_source TEXT, fields TEXT);`);
    await database
      .prepare(
        "INSERT INTO entities(id, user_id, entity_type) VALUES ('ent_one', 'owner', 'synthetic')"
      )
      .run();
    await database
      .prepare(
        "INSERT INTO observations(id, entity_id, user_id, entity_type, schema_version, observed_at, created_at, source_priority, fields) VALUES ('fact_one', 'ent_one', 'owner', 'synthetic', '1.0', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', 10, '{\"title\":\"Synthetic fact\"}')"
      )
      .run();
  });
  afterEach(async () => {
    await database.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it("requires materialization for stores with snapshots and rolls back a failed callback", async () => {
    await database.exec(
      "CREATE TABLE entity_snapshots(entity_id TEXT PRIMARY KEY,snapshot TEXT);INSERT INTO entity_snapshots VALUES ('ent_one','{\"title\":\"Synthetic fact\"}');"
    );
    await expect(migrateEntityLifecycleAuthority(database)).rejects.toThrow(/acquisition/);
    expect(
      await database
        .prepare("SELECT name FROM sqlite_master WHERE name='entity_lifecycle_cutovers'")
        .get()
    ).toBeUndefined();
    await expect(
      migrateEntityLifecycleAuthority(database, async (tx, targets) => {
        expect(targets).toHaveLength(1);
        await tx.prepare("DELETE FROM entity_snapshots").run();
        throw new Error("Synthetic materialization fault");
      })
    ).rejects.toThrow(/Synthetic materialization fault/);
    expect(await database.prepare("SELECT * FROM entity_snapshots").all()).toEqual([
      { entity_id: "ent_one", snapshot: '{"title":"Synthetic fact"}' },
    ]);
    expect(
      await database
        .prepare("SELECT name FROM sqlite_master WHERE name='entity_lifecycle_cutovers'")
        .get()
    ).toBeUndefined();
  });
  it("captures truthful legacy membership while original row values remain byte-exact", async () => {
    const original = (await database.prepare("SELECT * FROM observations").get()) as Record<
      string,
      unknown
    >;
    expect(await migrateEntityLifecycleAuthority(database)).toEqual({
      baselines: 1,
      members: 1,
      replay: false,
    });
    const row = (await database
      .prepare("SELECT * FROM observations WHERE id = 'fact_one'")
      .get()) as Record<string, unknown>;
    for (const [key, value] of Object.entries(original)) expect(row[key]).toEqual(value);
    const baseline = (await database
      .prepare("SELECT * FROM observations WHERE entity_lifecycle_sequence = 0")
      .get()) as Record<string, unknown>;
    expect(baseline.entity_lifecycle_kind).toBe("legacy_visible");
    expect(baseline.entity_lifecycle_target_id).toBe("ent_one");
    expect(JSON.parse(String(baseline.fields))).toMatchObject({
      selected_legacy_observation_id: "fact_one",
      legacy_deleted: false,
      legacy_membership_count: 1,
      legacy_membership_sha256: legacyMembershipDigest(["fact_one"]),
    });
    const before = readFileSync(path.join(dir, "synthetic.sqlite"));
    expect(await migrateEntityLifecycleAuthority(database)).toEqual({
      baselines: 1,
      members: 1,
      replay: true,
    });
    expect(readFileSync(path.join(dir, "synthetic.sqlite"))).toEqual(before);
  });
  it("captures a population beyond one keyset batch with measured metadata growth and no truncation", async () => {
    await database.transaction(async (tx) => {
      for (let i = 0; i < 250; i++) {
        const id = "ent_population_" + String(i).padStart(4, "0");
        await tx
          .prepare("INSERT INTO entities(id,user_id,entity_type) VALUES (?,'owner','synthetic')")
          .run(id);
        await tx
          .prepare(
            "INSERT INTO observations(id,entity_id,user_id,entity_type,schema_version,observed_at,created_at,source_priority,fields) VALUES (?,?,'owner','synthetic','1.0','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z',10,'{}')"
          )
          .run("obs_population_" + i, id);
      }
    });
    const pagesBefore = (await database.prepare("PRAGMA page_count").get()) as {
      page_count: number;
    };
    expect(await migrateEntityLifecycleAuthority(database)).toEqual({
      baselines: 251,
      members: 251,
      replay: false,
    });
    const pagesAfter = (await database.prepare("PRAGMA page_count").get()) as {
      page_count: number;
    };
    const size = (await database.prepare("PRAGMA page_size").get()) as { page_size: number };
    expect((pagesAfter.page_count - pagesBefore.page_count) * size.page_size).toBeGreaterThan(0);
    expect(
      (await database
        .prepare("SELECT COUNT(*) AS n FROM entity_lifecycle_legacy_membership")
        .get()) as { n: number }
    ).toEqual({ n: 251 });
    expect(
      (await database.prepare("SELECT COUNT(*) AS n FROM observations").get()) as { n: number }
    ).toEqual({ n: 502 });
    expect(
      (await database
        .prepare(
          "SELECT COUNT(DISTINCT entity_lifecycle_target_id) AS n FROM observations WHERE entity_lifecycle_sequence=0"
        )
        .get()) as { n: number }
    ).toEqual({ n: 251 });
    expect(await migrateEntityLifecycleAuthority(database)).toEqual({
      baselines: 251,
      members: 251,
      replay: true,
    });
  });
  it("preserves a pre-cutover ordinary marker as observed compatibility rather than asserting old actor authority", async () => {
    await database
      .prepare(
        "UPDATE observations SET source_priority = 10000, fields = '{\"_deleted\":true}' WHERE id = 'fact_one'"
      )
      .run();
    await migrateEntityLifecycleAuthority(database);
    const row = (await database
      .prepare(
        "SELECT entity_lifecycle_kind, fields FROM observations WHERE entity_lifecycle_sequence = 0"
      )
      .get()) as Record<string, unknown>;
    expect(row.entity_lifecycle_kind).toBe("legacy_hidden");
    const fields = JSON.parse(String(row.fields));
    expect(fields.legacy_deleted).toBe(true);
    expect(fields.deleted_by).toBeUndefined();
    expect(
      (
        (await database
          .prepare("SELECT entity_lifecycle_kind FROM observations WHERE id = 'fact_one'")
          .get()) as Record<string, unknown>
      ).entity_lifecycle_kind
    ).toBeNull();
  });
  it("empty canonical entities get visible baselines; merged redirects get no independent baseline", async () => {
    await database
      .prepare(
        "INSERT INTO entities(id, user_id, entity_type, merged_to_entity_id) VALUES ('ent_alias', 'owner', 'synthetic', 'ent_one'), ('ent_empty', 'owner', 'synthetic', NULL)"
      )
      .run();
    expect(await migrateEntityLifecycleAuthority(database)).toEqual({
      baselines: 2,
      members: 1,
      replay: false,
    });
    const rows = await database
      .prepare(
        "SELECT entity_lifecycle_target_id FROM observations WHERE entity_lifecycle_sequence = 0 ORDER BY entity_lifecycle_target_id"
      )
      .all();
    expect(rows).toEqual([
      { entity_lifecycle_target_id: "ent_empty" },
      { entity_lifecycle_target_id: "ent_one" },
    ]);
  });
  it("foreign observation and invalid comparator input roll back registry/baselines and DDL", async () => {
    await database
      .prepare("UPDATE observations SET user_id = 'foreign' WHERE id = 'fact_one'")
      .run();
    await expect(migrateEntityLifecycleAuthority(database)).rejects.toThrow(/acquisition/);
    expect(
      await database
        .prepare("SELECT name FROM sqlite_master WHERE name = 'entity_lifecycle_cutovers'")
        .get()
    ).toBeUndefined();
    expect(
      ((await database.prepare("SELECT COUNT(*) AS n FROM observations").get()) as { n: number }).n
    ).toBe(1);
    await database
      .prepare(
        "UPDATE observations SET user_id = 'owner', observed_at = 'invalid' WHERE id = 'fact_one'"
      )
      .run();
    await expect(migrateEntityLifecycleAuthority(database)).rejects.toThrow(/acquisition/);
    expect(
      ((await database.prepare("SELECT COUNT(*) AS n FROM observations").get()) as { n: number }).n
    ).toBe(1);
  });
  it("a later ordinary write does not cause re-baselining on migration replay", async () => {
    await migrateEntityLifecycleAuthority(database);
    await database
      .prepare(
        "INSERT INTO observations(id, entity_id, user_id, entity_type, schema_version, observed_at, created_at, source_priority, fields) VALUES ('new_fact', 'ent_one', 'owner', 'synthetic', '1.0', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 20, '{}')"
      )
      .run();
    expect(await migrateEntityLifecycleAuthority(database)).toEqual({
      baselines: 1,
      members: 1,
      replay: true,
    });
    expect(
      (
        (await database
          .prepare("SELECT COUNT(*) AS n FROM entity_lifecycle_legacy_membership")
          .get()) as { n: number }
      ).n
    ).toBe(1);
  });
  it("missing captured original evidence refuses replay rather than certifying an empty past", async () => {
    await migrateEntityLifecycleAuthority(database);
    await database.prepare("DELETE FROM observations WHERE id = 'fact_one'").run();
    await expect(migrateEntityLifecycleAuthority(database)).rejects.toThrow(/acquisition/);
  });
  it("SQL rejects partial tuples, unsafe sequences and immutable changes with ordinary insert positive", async () => {
    await database.transaction(async (tx) => installEntityLifecycleStorage(tx));
    await expect(
      database
        .prepare("INSERT INTO observations(id, entity_lifecycle_sequence) VALUES ('partial',1)")
        .run()
    ).rejects.toThrow(/Invalid entity/);
    await expect(
      database
        .prepare(
          "INSERT INTO observations(id, user_id, entity_lifecycle_kind, entity_lifecycle_sequence, entity_lifecycle_target_id) VALUES ('invalid','owner','delete',9007199254740992,'ent_one')"
        )
        .run()
    ).rejects.toThrow(/Invalid entity/);
    await database
      .prepare(
        "INSERT INTO observations(id, user_id, entity_lifecycle_kind, entity_lifecycle_sequence, entity_lifecycle_target_id) VALUES ('valid','owner','delete',1,'ent_one')"
      )
      .run();
    await expect(
      database
        .prepare("UPDATE observations SET entity_lifecycle_sequence = 2 WHERE id = 'valid'")
        .run()
    ).rejects.toThrow(/immutable/);
    await expect(
      database
        .prepare(
          "INSERT INTO observations(id, user_id, entity_lifecycle_kind, entity_lifecycle_sequence, entity_lifecycle_target_id) VALUES ('duplicate','owner','restore',1,'ent_one')"
        )
        .run()
    ).rejects.toThrow(/UNIQUE/);
    await database.prepare("INSERT INTO observations(id) VALUES ('ordinary')").run();
    expect(
      (
        (await database
          .prepare("SELECT COUNT(*) AS n FROM observations WHERE id = 'ordinary'")
          .get()) as { n: number }
      ).n
    ).toBe(1);
  });
  it("populated authority without a cutover refuses migration; it is not authenticated by row shape", async () => {
    await database.transaction(async (tx) => installEntityLifecycleStorage(tx));
    await database
      .prepare(
        "INSERT INTO observations(id, user_id, entity_lifecycle_kind, entity_lifecycle_sequence, entity_lifecycle_target_id) VALUES ('untrusted','owner','delete',1,'ent_one')"
      )
      .run();
    await expect(migrateEntityLifecycleAuthority(database)).rejects.toThrow(/acquisition/);
    expect(await database.prepare("SELECT * FROM entity_lifecycle_cutovers").all()).toEqual([]);
  });
});
