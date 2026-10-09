import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { migrateEntityLifecycleAuthority } from "../../src/services/entity_lifecycle_storage.js";
import { getDb, withExistingLifecycleDatabase } from "../../src/repositories/db/connection.js";
import {
  parseLifecycleExecutorArguments,
  runLifecycleExecutor,
} from "../../src/maintenance/entity_lifecycle_migration.js";

describe("strict lifecycle executor recoverable boundary", () => {
  let dir: string;
  let database: AsyncSqliteDatabase;
  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "owned-lifecycle-boundary-"));
    database = new AsyncSqliteDatabase(path.join(dir, "owned.sqlite"));
    await database.exec(`CREATE TABLE entities(id TEXT PRIMARY KEY,user_id TEXT,entity_type TEXT,merged_to_entity_id TEXT);
      CREATE TABLE observations(id TEXT PRIMARY KEY,entity_id TEXT,user_id TEXT,entity_type TEXT,schema_version TEXT,observed_at TEXT,created_at TEXT,source_priority INTEGER,observation_source TEXT,fields TEXT);
      INSERT INTO entities VALUES('ent_owned','owner','synthetic',NULL);
      INSERT INTO observations VALUES('fact_owned','ent_owned','owner','synthetic','1.0','2020-01-01','2020-01-01',10,NULL,'{"title":"Owned"}');`);
  });
  afterEach(async () => {
    await database.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it("existing read-only open neither creates missing files nor allows actual writes", async () => {
    const missing = path.join(dir, "missing.sqlite");
    expect(() => new AsyncSqliteDatabase(missing, { existing: true, readOnly: true })).toThrow();
    expect(existsSync(missing)).toBe(false);
    const file = path.join(dir, "owned.sqlite");
    const before = readFileSync(file);
    const readonly = new AsyncSqliteDatabase(file, { existing: true, readOnly: true });
    try {
      expect(await readonly.prepare("SELECT id FROM entities").all()).toEqual([
        { id: "ent_owned" },
      ]);
      let refused = false;
      try {
        await readonly.prepare("DELETE FROM entities").run();
      } catch {
        refused = true;
      }
      expect(await database.prepare("SELECT id FROM entities").all()).toEqual([
        { id: "ent_owned" },
      ]);
      expect(refused).toBe(true);
    } finally {
      await readonly.close();
    }
    expect(readFileSync(file)).toEqual(before);
    expect(await database.prepare("SELECT id FROM entities").all()).toEqual([{ id: "ent_owned" }]);
  });
  it("writable isolated existing open never creates a missing file and escapes URI metacharacters", async () => {
    const missing = path.join(dir, "missing?#owned.sqlite");
    expect(() => new AsyncSqliteDatabase(missing, { existing: true, readOnly: false })).toThrow();
    expect(existsSync(missing)).toBe(false);
    const file = path.join(dir, "copy?#owned.sqlite");
    writeFileSync(file, readFileSync(path.join(dir, "owned.sqlite")));
    const copy = new AsyncSqliteDatabase(file, { existing: true, readOnly: false });
    try {
      await copy.prepare("UPDATE entities SET entity_type='changed' WHERE id='ent_owned'").run();
      expect(await copy.prepare("SELECT entity_type FROM entities").get()).toEqual({
        entity_type: "changed",
      });
      expect(await database.prepare("SELECT entity_type FROM entities").get()).toEqual({
        entity_type: "synthetic",
      });
    } finally {
      await copy.close();
    }
    expect(existsSync(path.join(dir, "copy"))).toBe(false);
  });
  it("read-only inspection refuses symlinks and directory targets", () => {
    const alias = path.join(dir, "alias.sqlite");
    symlinkSync(path.join(dir, "owned.sqlite"), alias);
    expect(() => new AsyncSqliteDatabase(alias, { existing: true, readOnly: true })).toThrow();
    expect(() => new AsyncSqliteDatabase(dir, { existing: true, readOnly: true })).toThrow();
  });
  it("scoped adapter and migration share actual rollback and do not initialize another DB", async () => {
    const original = await database.prepare("SELECT * FROM observations").all();
    await expect(
      withExistingLifecycleDatabase(database, () =>
        migrateEntityLifecycleAuthority(database, async () => {
          expect(await getDb()).toBe(database);
          await (
            await getDb()
          ).exec("CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES('owned');");
          throw new Error("synthetic rollback");
        })
      )
    ).rejects.toThrow("synthetic rollback");
    expect(
      await database
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN('marker','entity_lifecycle_cutovers')"
        )
        .all()
    ).toEqual([]);
    expect(await database.prepare("SELECT * FROM observations").all()).toEqual(original);
    await withExistingLifecycleDatabase(database, async () => {
      expect(await getDb()).toBe(database);
    });
  });
  it("rejects nested scope and unrelated concurrent default opening", async () => {
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((r) => {
      entered = r;
    });
    const wait = new Promise<void>((r) => {
      release = r;
    });
    const held = withExistingLifecycleDatabase(database, async () => {
      entered();
      await wait;
    });
    await enteredPromise;
    await expect(withExistingLifecycleDatabase(database, async () => undefined)).rejects.toThrow(
      /UNAVAILABLE/
    );
    await expect(getDb()).rejects.toThrow(/UNAVAILABLE/);
    release();
    await held;
  });
  it("invalidates detached async descendants when the binding completes", async () => {
    let later!: () => Promise<unknown>;
    await withExistingLifecycleDatabase(database, async () => {
      const { AsyncResource } = await import("node:async_hooks");
      const resource = new AsyncResource("owned-descendant");
      later = () => resource.runInAsyncScope(() => getDb());
    });
    await expect(later()).rejects.toThrow(/EXPIRED/);
  });
  it("before validation runs before schema installation; after failure rolls everything back", async () => {
    await expect(
      migrateEntityLifecycleAuthority(database, undefined, {
        before: async () => {
          throw new Error("before refusal");
        },
        after: async () => undefined,
      })
    ).rejects.toThrow("before refusal");
    expect(
      await database
        .prepare("SELECT name FROM sqlite_master WHERE name='entity_lifecycle_cutovers'")
        .all()
    ).toEqual([]);
    const original = await database.prepare("SELECT * FROM observations").all();
    let failure: unknown;
    try {
      await migrateEntityLifecycleAuthority(database, undefined, {
        before: async () => undefined,
        after: async (tx, outcome) => {
          expect(outcome).toEqual({ baselines: 1, members: 1, replay: false });
          expect(tx).toBe(database);
          throw new Error("after refusal");
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(await database.prepare("SELECT * FROM observations").all()).toEqual(original);
    expect(
      await database
        .prepare("SELECT name FROM sqlite_master WHERE name='entity_lifecycle_cutovers'")
        .all()
    ).toEqual([]);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("after refusal");
  });
  it("replay still runs actual before and after validation without new observations", async () => {
    await migrateEntityLifecycleAuthority(database);
    const before = await database.prepare("SELECT * FROM observations ORDER BY id").all();
    let calls = 0;
    await expect(
      migrateEntityLifecycleAuthority(database, undefined, {
        before: async () => {
          calls++;
        },
        after: async (_, outcome) => {
          calls++;
          expect(outcome.replay).toBe(true);
          throw new Error("replay drift");
        },
      })
    ).rejects.toThrow("replay drift");
    expect(calls).toBe(2);
    expect(await database.prepare("SELECT * FROM observations ORDER BY id").all()).toEqual(before);
  });
  it("closed arguments reject defaults, duplicates, unknown options and modes", () => {
    for (const args of [
      [],
      ["--mode", "preview"],
      ["--manifest", "x", "--mode", "force", "--output", "y"],
      ["--manifest", "x", "--mode", "apply", "--output", "y", "--force", "1"],
      ["--manifest", "x", "--manifest", "z", "--mode", "apply", "--output", "y"],
    ])
      expect(() => parseLifecycleExecutorArguments(args)).toThrow(/arguments_invalid/);
  });
  it("apply refuses before any database or output path is opened", async () => {
    const manifest = path.join(dir, "manifest.json");
    const output = path.join(dir, "output.json");
    const absent = path.join(dir, "never-created.sqlite");
    writeFileSync(
      manifest,
      JSON.stringify({
        version: "entity_lifecycle_executor_v1",
        candidate: {},
        target: { database: absent },
        expected_before: {},
        backup: {},
        maintenance: {},
        action_binding: {},
        expected_after: {},
        evidence: {},
      })
    );
    const original = readFileSync(path.join(dir, "owned.sqlite"));
    await expect(
      runLifecycleExecutor(["--manifest", manifest, "--mode", "apply", "--output", output])
    ).rejects.toThrow(/action_method_unavailable/);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(absent)).toBe(false);
    expect(readFileSync(path.join(dir, "owned.sqlite"))).toEqual(original);
  });
});
