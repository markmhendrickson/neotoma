import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from "vitest";
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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
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
  it.each(["ordinary_positive", "authority_input", "ordinary_replace"])(
    "compiled merge-import %s uses real source preflight and preserves target authority",
    async (kind) => {
      const dir = mkdtempSync(path.join(tmpdir(), "neotoma-synthetic-cli-import-"));
      const sourcePath = path.join(dir, "source.sqlite"),
        targetPath = path.join(dir, "target.sqlite");
      const source = new AsyncSqliteDatabase(sourcePath),
        target = new AsyncSqliteDatabase(targetPath);
      const schema =
        "CREATE TABLE observations(id TEXT PRIMARY KEY,entity_id TEXT,entity_type TEXT,schema_version TEXT,user_id TEXT,fields TEXT,source_priority INTEGER,observed_at TEXT,created_at TEXT);";
      try {
        await source.exec(schema);
        await target.exec(schema);
        await installEntityLifecycleStorage(target);
        const row = [
          "synthetic-existing-authority",
          "synthetic-target",
          "synthetic",
          "1.0",
          "synthetic-owner",
          '{"_deleted":true}',
          0,
          "2026-01-01T00:00:00Z",
          "2026-01-01T00:00:00Z",
        ];
        await target
          .prepare(
            "INSERT INTO observations(id,entity_id,entity_type,schema_version,user_id,fields,source_priority,observed_at,created_at,entity_lifecycle_kind,entity_lifecycle_sequence,entity_lifecycle_target_id) VALUES (?,?,?,?,?,?,?,?,?,'delete',1,'synthetic-target')"
          )
          .run(...row);
        const before = await target.prepare("SELECT * FROM observations").all();
        const input = [...row];
        input[0] = kind === "ordinary_replace" ? row[0] : "synthetic-new-input";
        input[5] = "{}";
        if (kind === "authority_input") {
          await installEntityLifecycleStorage(source);
          await source
            .prepare(
              "INSERT INTO observations(id,entity_id,entity_type,schema_version,user_id,fields,source_priority,observed_at,created_at,entity_lifecycle_kind,entity_lifecycle_sequence,entity_lifecycle_target_id) VALUES (?,?,?,?,?,?,?,?,?,'restore',1,'synthetic-target')"
            )
            .run(...input);
        } else
          await source.prepare("INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?)").run(...input);
        const root = fileURLToPath(new URL("../../", import.meta.url));
        const result = await promisify(execFile)(
          process.execPath,
          [
            path.join(root, "dist/cli/bootstrap.js"),
            "--json",
            "--no-log-file",
            "storage",
            "merge-db",
            "--source",
            sourcePath,
            "--target",
            targetPath,
            "--mode",
            "keep-source",
            "--no-recompute-snapshots",
          ],
          {
            cwd: dir,
            env: {
              PATH: process.env.PATH,
              HOME: dir,
              NODE_ENV: "test",
              NEOTOMA_ENV: "development",
              NEOTOMA_DATA_DIR: path.join(dir, "data"),
              NODE_OPTIONS:
                "--require " +
                JSON.stringify(path.join(root, "tests/helpers/owned_loopback_only.cjs")),
            },
            timeout: 15000,
          }
        ).then(
          () => ({ refused: false }),
          () => ({ refused: true })
        );
        expect(result.refused).toBe(kind !== "ordinary_positive");
        if (kind === "ordinary_positive") {
          expect(await target.prepare("SELECT * FROM observations WHERE id=?").get(row[0])).toEqual(
            before[0]
          );
          expect(
            await target
              .prepare("SELECT fields FROM observations WHERE id='synthetic-new-input'")
              .get()
          ).toEqual({ fields: "{}" });
        } else expect(await target.prepare("SELECT * FROM observations").all()).toEqual(before);
      } finally {
        await source.close();
        await target.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60000
  );
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

afterAll(async () => {
  await (await getDb()).close();
  if (isolated.original === undefined) delete process.env.NEOTOMA_DATA_DIR;
  else process.env.NEOTOMA_DATA_DIR = isolated.original;
  const { rmSync } = await import("node:fs");
  rmSync(isolated.root, { recursive: true, force: true });
});
