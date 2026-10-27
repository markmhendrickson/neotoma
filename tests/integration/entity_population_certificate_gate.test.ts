/**
 * The deciding-observation certification path is a fast path for stores with no
 * lifecycle authority. Any store that has a recorded cutover, or any observation
 * carrying lifecycle authority columns, must keep the exhaustive path, because
 * there visibility is decided by authority rows and not by the legacy comparator
 * alone.
 *
 * This file points the process at a private database BEFORE any source module is
 * imported: it migrates the store to a recorded cutover, which is permanent and
 * must not touch the database other test files share.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-cert-gate-"));
process.env["NEOTOMA_SQLITE_PATH"] = path.join(dir, "gate.sqlite");
process.env["NEOTOMA_DATA_DIR"] = dir;

const userId = randomUUID();
const type = `gate_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
// A type whose only snapshot-less member was restored above its deletion (visible).
const visibleType = `${type}_visible`;

type Mods = {
  getDb: typeof import("../../src/repositories/db/connection.js").getDb;
  certifySnapshotPopulation: typeof import("../../src/services/entity_population_certificate.js").certifySnapshotPopulation;
  certifyVia: typeof import("../../src/services/entity_population_certificate.js").certifySnapshotPopulationVia;
  legacyOnlyStore: typeof import("../../src/services/entity_population_certificate.js").legacyOnlyStore;
  migrate: typeof import("../../src/services/entity_lifecycle_storage.js").migrateEntityLifecycleAuthority;
  install: typeof import("../../src/services/entity_lifecycle_storage.js").installEntityLifecycleStorage;
};
let m: Mods;

async function statements(run: () => Promise<unknown>): Promise<string[]> {
  const database = await m.getDb();
  const original = database.prepare.bind(database);
  const seen: string[] = [];
  (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
    seen.push(sql);
    return original(sql);
  };
  try {
    await run();
  } finally {
    (database as { prepare: typeof database.prepare }).prepare = original;
  }
  return seen;
}

/** The exhaustive path loads each hidden entity's observations one entity at a time. */
const perEntityFetches = (sql: string[]) =>
  sql.filter((s) => /FROM observations WHERE entity_id = \?/.test(s)).length;
/** The deciding-observation path asks for comparator inputs by IN list. */
const winnerEnumerations = (sql: string[]) =>
  sql.filter((s) => /SELECT entity_id, source_priority, observed_at FROM observations/.test(s))
    .length;

beforeAll(async () => {
  const certificate = await import("../../src/services/entity_population_certificate.js");
  const storage = await import("../../src/services/entity_lifecycle_storage.js");
  m = {
    getDb: (await import("../../src/repositories/db/connection.js")).getDb,
    certifySnapshotPopulation: certificate.certifySnapshotPopulation,
    certifyVia: certificate.certifySnapshotPopulationVia,
    legacyOnlyStore: certificate.legacyOnlyStore,
    migrate: storage.migrateEntityLifecycleAuthority,
    install: storage.installEntityLifecycleStorage,
  };
  const database = await m.getDb();
  const now = "2026-01-01T00:00:00Z";
  const insertObservation = database.prepare(
    "INSERT INTO observations (id, entity_id, entity_type, schema_version, source_id, observed_at, created_at, source_priority, fields, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  for (let i = 0; i < 5; i++) {
    const id = `ent_${type}_${i}`;
    await database
      .prepare(
        "INSERT INTO entities (id, entity_type, canonical_name, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?)"
      )
      .run(id, type, id, userId, now, now);
    await insertObservation.run(
      `fact_${id}`,
      id,
      type,
      "1.0",
      null,
      now,
      now,
      10,
      '{"subject":"x"}',
      userId
    );
    await insertObservation.run(
      `del_${id}`,
      id,
      type,
      "1.0",
      null,
      "2026-02-01T00:00:00Z",
      "2026-02-01T00:00:00Z",
      1000,
      '{"_deleted":true}',
      userId
    );
  }
  const visibleId = `ent_${visibleType}_0`;
  await database
    .prepare(
      "INSERT INTO entities (id, entity_type, canonical_name, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    )
    .run(visibleId, visibleType, visibleId, userId, now, now);
  for (const [suffix, at, priority, fields] of [
    ["a", now, 10, '{"subject":"x"}'],
    ["d", "2026-02-01T00:00:00Z", 1000, '{"_deleted":true}'],
    ["r", "2026-03-01T00:00:00Z", 1001, '{"_deleted":false}'],
  ] as const) {
    await insertObservation.run(
      `${suffix}_${visibleId}`,
      visibleId,
      visibleType,
      "1.0",
      null,
      at,
      at,
      priority,
      fields,
      userId
    );
  }
});

afterAll(async () => {
  try {
    await (await m.getDb()).close();
  } catch {
    // best effort
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("certification path selection", () => {
  it("a plain store takes the deciding-observation path", async () => {
    let verdict: boolean | undefined;
    const sql = await statements(async () => {
      verdict = await m.certifySnapshotPopulation(userId, [type]);
    });
    expect(verdict).toBe(true);
    expect(winnerEnumerations(sql)).toBeGreaterThan(0);
    expect(perEntityFetches(sql)).toBe(0);
    expect(await m.certifySnapshotPopulation(userId, [visibleType])).toBe(false);
  });

  it("a store with a recorded cutover takes the exhaustive path and gives the same results", async () => {
    const database = await m.getDb();
    // Reference verdicts from the exhaustive path before the cutover is recorded.
    const before = {
      hidden: await m.certifyVia("exhaustive", userId, [type]),
      visible: await m.certifyVia("exhaustive", userId, [visibleType]),
    };
    expect(before).toEqual({ hidden: true, visible: false });
    await m.migrate(database, async () => {});
    expect(await m.legacyOnlyStore(database)).toBe(false);
    let verdict: boolean | undefined;
    const sql = await statements(async () => {
      verdict = await m.certifySnapshotPopulation(userId, [type]);
    });
    expect(verdict).toBe(before.hidden);
    expect(await m.certifySnapshotPopulation(userId, [visibleType])).toBe(before.visible);
    expect(winnerEnumerations(sql)).toBe(0);
    expect(perEntityFetches(sql)).toBeGreaterThanOrEqual(5);
  });
});

describe("legacyOnlyStore gate", () => {
  it("is false for lifecycle authority rows without a recorded cutover", async () => {
    const { AsyncSqliteDatabase } = await import("../../src/repositories/sqlite/sqlite_driver.js");
    const { ensureSchema } = await import("../../src/repositories/sqlite/sqlite_client.js");
    const raw = new AsyncSqliteDatabase(path.join(dir, "gate_probe.sqlite"));
    try {
      await ensureSchema(raw);
      // No lifecycle columns at all: legacy only.
      expect(await m.legacyOnlyStore(raw)).toBe(true);
      // Storage installed (columns, empty cutover table), nothing populated: still legacy only.
      await raw.transaction(async (tx) => m.install(tx));
      expect(await m.legacyOnlyStore(raw)).toBe(true);
      // One observation carrying lifecycle authority, anywhere in the store.
      await raw
        .prepare(
          "INSERT INTO observations (id, entity_id, entity_type, schema_version, observed_at, source_priority, fields, user_id, entity_lifecycle_kind, entity_lifecycle_sequence, entity_lifecycle_target_id) VALUES ('auth_1','ent_other','t','1.0','2026-01-01T00:00:00Z',0,'{}',?,'legacy_visible',0,'ent_other')"
        )
        .run(userId);
      expect(await m.legacyOnlyStore(raw)).toBe(false);
    } finally {
      await raw.close();
    }
  });
});
