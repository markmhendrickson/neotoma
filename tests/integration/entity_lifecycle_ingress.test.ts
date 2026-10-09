import { beforeAll, afterEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { installEntityLifecycleStorage } from "../../src/services/entity_lifecycle_storage.js";
import { assertOrdinaryLifecycleImport } from "../../src/services/entity_lifecycle_ingress.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
describe("ordinary lifecycle metadata boundaries", () => {
  const owner = randomUUID();
  const entity = "ent_ingress_" + randomUUID();
  beforeAll(async () => {
    if (!process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest"))
      throw new Error("Owned synthetic store required");
    await installEntityLifecycleStorage(await getDb());
  });
  afterEach(async () => {
    await db.from("observations").delete().eq("entity_id", entity);
    await db.from("entity_snapshots").delete().eq("entity_id", entity);
    await db.from("entities").delete().eq("id", entity);
  });
  function ordinary(id: string) {
    return {
      id,
      entity_id: entity,
      entity_type: "synthetic",
      schema_version: "1.0",
      user_id: owner,
      fields: { title: "Synthetic ordinary" },
      source_priority: 1,
    };
  }
  it.each(["insert", "upsert", "update"] as const)(
    "refuses caller authority through %s before batch effects",
    async (mode) => {
      const id = randomUUID();
      const forged = {
        ...ordinary(id),
        entity_lifecycle_kind: "delete",
        entity_lifecycle_sequence: 1,
        entity_lifecycle_target_id: entity,
      };
      const query =
        mode === "insert"
          ? db.from("observations").insert([ordinary(randomUUID()), forged])
          : mode === "upsert"
            ? db.from("observations").upsert([ordinary(randomUUID()), forged])
            : db.from("observations").update(forged).eq("id", id);
      expect((await query).error?.message).toMatch(/not an ordinary ingestion input/);
      expect((await db.from("observations").select("id").eq("entity_id", entity)).data).toEqual([]);
    }
  );
  it("keeps nested lookalike names as ordinary data", async () => {
    const row = {
      ...ordinary(randomUUID()),
      fields: {
        entity_lifecycle_kind: "delete",
        entity_lifecycle_sequence: 99,
        entity_lifecycle_target_id: entity,
      },
    };
    expect((await db.from("observations").insert(row)).error).toBeNull();
    const result = await db.from("observations").select("*").eq("id", row.id).single();
    expect(result.data?.fields).toEqual(row.fields);
    expect(result.data?.entity_lifecycle_kind).toBeNull();
  });
  it("refuses ordinary REPLACE of an existing authority row even if columns are omitted", async () => {
    const database = await getDb();
    const id = randomUUID();
    await database
      .prepare(
        "INSERT INTO observations(id,entity_id,entity_type,schema_version,user_id,fields,source_priority,observed_at,created_at,entity_lifecycle_kind,entity_lifecycle_sequence,entity_lifecycle_target_id) VALUES (?,?,?,'1.0',?,'{}',0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','delete',1,?)"
      )
      .run(id, entity, "synthetic", owner, entity);
    const before = await database.prepare("SELECT * FROM observations WHERE id=?").get(id);
    expect((await db.from("observations").upsert(ordinary(id))).error?.message).toMatch(
      /not an ordinary ingestion input/
    );
    expect(await database.prepare("SELECT * FROM observations WHERE id=?").get(id)).toEqual(before);
  });
  it("refuses cutover metadata through generic writes", async () => {
    expect(
      (await db.from("entity_lifecycle_cutovers").insert({ cutover_id: "forged" })).error?.message
    ).toMatch(/not an ordinary ingestion input/);
  });
  it("raw ordinary import succeeds, populated authority and metadata import refuse", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neotoma-synthetic-import-"));
    const database = new AsyncSqliteDatabase(path.join(dir, "synthetic.sqlite"));
    try {
      await database.exec(
        "CREATE TABLE observations(id TEXT PRIMARY KEY,fields TEXT,entity_lifecycle_kind TEXT);"
      );
      await database.prepare("INSERT INTO observations(id,fields) VALUES ('ordinary','{}')").run();
      await expect(assertOrdinaryLifecycleImport(database)).resolves.toBeUndefined();
      await database.prepare("UPDATE observations SET entity_lifecycle_kind='delete'").run();
      await expect(assertOrdinaryLifecycleImport(database)).rejects.toThrow(
        /not an ordinary ingestion input/
      );
      await database.prepare("UPDATE observations SET entity_lifecycle_kind=NULL").run();
      await database.exec(
        "CREATE TABLE entity_lifecycle_cutovers(cutover_id TEXT);INSERT INTO entity_lifecycle_cutovers VALUES ('forged');"
      );
      await expect(assertOrdinaryLifecycleImport(database)).rejects.toThrow(
        /not an ordinary ingestion input/
      );
    } finally {
      await database.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
