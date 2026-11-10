/**
 * Bounded current-state readers (#2792) return the same answers as the
 * exhaustive history reads they replace on list, count and snapshot paths.
 *
 * Runs against its own temporary database: the cutover cases record a
 * lifecycle cutover, which is permanent by design.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

const dataDir = mkdtempSync(path.join(tmpdir(), "neotoma-current-state-"));
process.env.NEOTOMA_SQLITE_PATH = path.join(dataDir, "current_state.db");

const USER = "00000000-0000-0000-0000-000000000000";
const OTHER = "11111111-2222-3333-4444-555555555555";
const tag = randomBytes(4).toString("hex");
const TYPE = `csr_${tag}`;
const HISTORY = 80; // more than DECIDING_ROW_LIMIT, so the long-run paths run

type Db = Awaited<ReturnType<typeof import("../../src/repositories/db/connection.js").getDb>>;
let database: Db;
let mods: {
  queryEntitiesWithCount: typeof import("../../src/shared/action_handlers/entity_handlers.js").queryEntitiesWithCount;
  getEntityWithProvenance: typeof import("../../src/services/entity_queries.js").getEntityWithProvenance;
  isEntityDeleted: typeof import("../../src/services/deletion.js").isEntityDeleted;
  certifySnapshotPopulation: typeof import("../../src/services/entity_population_certificate.js").certifySnapshotPopulation;
  readers: typeof import("../../src/services/current_state_reads.js");
  storage: typeof import("../../src/services/entity_lifecycle_storage.js");
};

const iso = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();

async function entity(id: string, opts: { snapshot?: boolean; owner?: string } = {}) {
  const owner = opts.owner ?? USER;
  await database
    .prepare(
      "INSERT INTO entities (id, entity_type, canonical_name, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    )
    .run(id, TYPE, id, owner, iso(0), iso(0));
  if (opts.snapshot !== false)
    await database
      .prepare(
        "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot, computed_at, observation_count, last_observation_at, provenance, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(id, TYPE, "1.0", id, JSON.stringify({ name: id }), iso(0), 1, iso(0), "{}", owner);
}

async function observation(
  id: string,
  entityId: string,
  opts: {
    source?: string | null;
    at?: string;
    priority?: number;
    fields?: Record<string, unknown>;
    owner?: string;
  } = {}
) {
  await database
    .prepare(
      "INSERT INTO observations (id, entity_id, entity_type, schema_version, source_id, observed_at, source_priority, fields, created_at, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(
      id,
      entityId,
      TYPE,
      "1.0",
      opts.source === undefined ? `src_${id}` : opts.source,
      opts.at ?? iso(1),
      opts.priority ?? 100,
      JSON.stringify(opts.fields ?? { name: entityId }),
      opts.at ?? iso(1),
      opts.owner ?? USER
    );
}

async function fragment(
  id: string,
  entityId: string | null,
  source: string,
  key: string,
  value: unknown,
  lastSeen: string,
  owner: string | null = USER
) {
  await database
    .prepare(
      "INSERT INTO raw_fragments (id, source_id, entity_id, entity_type, fragment_key, fragment_value, frequency_count, first_seen, last_seen, user_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    )
    .run(
      id,
      source,
      entityId,
      TYPE,
      key,
      JSON.stringify(value),
      1,
      lastSeen,
      lastSeen,
      owner,
      lastSeen
    );
}

/** A long run of ordinary stores, one per sync pass, then optional deletion. */
async function longHistory(id: string, deleted: boolean) {
  await entity(id, { snapshot: !deleted });
  for (let p = 0; p < HISTORY; p++)
    await observation(`${id}_p${p}`, id, { source: `sync_${tag}_${p}`, at: iso(p + 1) });
  if (deleted)
    await observation(`${id}_del`, id, {
      source: null,
      at: iso(HISTORY + 2),
      priority: 1000,
      fields: { _deleted: true },
    });
}

beforeAll(async () => {
  process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";
  database = await (await import("../../src/repositories/db/connection.js")).getDb();
  mods = {
    queryEntitiesWithCount: (await import("../../src/shared/action_handlers/entity_handlers.js"))
      .queryEntitiesWithCount,
    getEntityWithProvenance: (await import("../../src/services/entity_queries.js"))
      .getEntityWithProvenance,
    isEntityDeleted: (await import("../../src/services/deletion.js")).isEntityDeleted,
    certifySnapshotPopulation: (await import("../../src/services/entity_population_certificate.js"))
      .certifySnapshotPopulation,
    readers: await import("../../src/services/current_state_reads.js"),
    storage: await import("../../src/services/entity_lifecycle_storage.js"),
  };
});

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("current unknown-field fragments", () => {
  it("returns, per key, the newest fragment whose source still observed the entity", async () => {
    const id = `ent_frag_${tag}`;
    await entity(id);
    await observation(`${id}_a`, id, { source: `s_old_${tag}` });
    await observation(`${id}_b`, id, { source: `s_new_${tag}` });
    await fragment(`${id}_f1`, id, `s_old_${tag}`, "cursor", "old", iso(10));
    await fragment(`${id}_f2`, id, `s_new_${tag}`, "cursor", "new", iso(20));
    // Newest of all, but its source holds no observation of this entity.
    await fragment(`${id}_f3`, id, `s_orphan_${tag}`, "cursor", "orphaned", iso(30));
    // Another owner's fragment for the same entity id is never returned.
    await fragment(`${id}_f4`, id, `s_new_${tag}`, "secret", "other-owner", iso(40), OTHER);
    // Shadowed by the snapshot's own field.
    await fragment(`${id}_f5`, id, `s_new_${tag}`, "name", "shadowed", iso(40));
    await fragment(`${id}_f6`, id, `s_old_${tag}`, "extra", 7, iso(5));
    // The default owner also reads fragments written without an owner.
    await fragment(`${id}_f7`, id, `s_old_${tag}`, "unowned", "n", iso(6), null);

    const listed = await mods.queryEntitiesWithCount({
      userId: USER,
      entityType: TYPE,
      limit: 100,
      offset: 0,
    });
    expect(listed.entities.find((e) => e.entity_id === id)?.raw_fragments).toEqual({
      cursor: "new",
      extra: 7,
      unowned: "n",
    });
    const single = await mods.getEntityWithProvenance(id, false, USER);
    expect(single?.raw_fragments).toEqual({ cursor: "new", extra: 7, unowned: "n" });
  });

  it("still attributes legacy fragments through a single-entity source", async () => {
    const id = `ent_legacy_${tag}`;
    await entity(id);
    await observation(`${id}_a`, id, { source: `s_legacy_${tag}` });
    await fragment(`${id}_lf`, null, `s_legacy_${tag}`, "legacy_key", "legacy", iso(10));
    const single = await mods.getEntityWithProvenance(id, false, USER);
    expect(single?.raw_fragments).toEqual({ legacy_key: "legacy" });
  });
});

describe("pre-cutover visibility from deciding rows", () => {
  it("matches the exhaustive facade for long visible and deleted histories", async () => {
    const visible = `ent_pre_vis_${tag}`;
    const deleted = `ent_pre_del_${tag}`;
    await longHistory(visible, false);
    await longHistory(deleted, true);
    for (const id of [visible, deleted]) {
      const bounded = await mods.readers.legacyHiddenFromDecidingRows(id, USER);
      expect(bounded).toBe(await mods.isEntityDeleted(id, USER));
    }
    expect(await mods.getEntityWithProvenance(visible, false, USER)).not.toBeNull();
    expect(await mods.getEntityWithProvenance(deleted, false, USER)).toBeNull();
  });

  it("defers to the exhaustive path when text order and time order can disagree", async () => {
    // The newest observation by time is a deletion written with a space
    // separator, which sorts BEFORE the canonical rows as text. Ordering by
    // text alone would call the entity visible.
    const id = `ent_pre_odd_${tag}`;
    await longHistory(id, false);
    await observation(`${id}_odd`, id, {
      source: null,
      at: "2026-01-01 23:00:00Z",
      fields: { _deleted: true },
    });
    expect(await mods.isEntityDeleted(id, USER)).toBe(true);
    expect(await mods.readers.legacyHiddenFromDecidingRows(id, USER)).toBeUndefined();
    expect(await mods.getEntityWithProvenance(id, false, USER)).toBeNull();
  });

  it("certifies a population whose hidden entities have long histories", async () => {
    // The snapshot-less entity is the deleted long history; its deletion row is
    // the whole deciding set, so the proof never reads the 80 earlier passes.
    const read: string[] = [];
    const original = database.prepare.bind(database);
    (database as { prepare: typeof database.prepare }).prepare = (sql: string) => {
      if (/FROM observations/.test(sql)) read.push(sql);
      return original(sql);
    };
    try {
      expect(await mods.certifySnapshotPopulation(USER, [TYPE])).toBe(true);
    } finally {
      (database as { prepare: typeof database.prepare }).prepare = original;
    }
    expect(
      read.some((sql) =>
        /SELECT \* FROM observations WHERE entity_id = \? AND user_id = \? AND source_priority/.test(
          sql
        )
      )
    ).toBe(true);
    expect(
      read.some((sql) =>
        /^SELECT \* FROM observations WHERE entity_id = \?( AND user_id = \?)?( ORDER BY observed_at DESC)?$/.test(
          sql
        )
      )
    ).toBe(false);
  });
});

describe("recorded-cutover visibility from lifecycle authority", () => {
  it("agrees with the exhaustive acquisition for baseline, delete and restore", async () => {
    const restored = `ent_cut_restored_${tag}`;
    const deletedAfter = `ent_cut_deleted_${tag}`;
    await longHistory(restored, false);
    await longHistory(deletedAfter, false);
    await longHistory(`ent_cut_foreign_${tag}`, false); // used by the next case
    await mods.storage.migrateEntityLifecycleAuthority(database, async () => {});
    for (const [id, kinds] of [
      [restored, ["delete", "restore"]],
      [deletedAfter, ["delete"]],
    ] as const) {
      for (const [n, kind] of kinds.entries())
        await database.transaction(async (tx) =>
          mods.storage.appendEntityLifecycleAction(
            tx,
            { id, user_id: USER, entity_type: TYPE },
            kind,
            { _deleted: kind === "delete" },
            iso(HISTORY + 10 + n)
          )
        );
    }
    const targets = (
      (await database
        .prepare(
          "SELECT id, user_id, entity_type FROM entities WHERE entity_type = ? AND merged_to_entity_id IS NULL"
        )
        .all(TYPE)) as Array<{ id: string; user_id: string; entity_type: string }>
    ).filter((t) => t.user_id === USER);
    const hidden = await mods.readers.selectHiddenAfterCutover(targets);
    for (const target of targets) {
      const exhaustive = await mods.isEntityDeleted(target.id, USER);
      expect(hidden.has(target.id), target.id).toBe(exhaustive);
      // The current-snapshot endpoint's check agrees as well.
      expect(await mods.readers.isOwnedEntityHiddenAfterCutover(target.id, USER), target.id).toBe(
        exhaustive
      );
    }
    expect(hidden.has(deletedAfter)).toBe(true);
    expect(hidden.has(restored)).toBe(false);
    expect(hidden.has(`ent_pre_del_${tag}`)).toBe(true); // legacy_hidden baseline
    expect(await mods.certifySnapshotPopulation(USER, [TYPE])).toBe(true);
  });

  it("ignores lifecycle authority written under another owner", async () => {
    // A delete authority row for this entity id, but under another owner, in
    // that owner's own sequence space. It cannot hide this owner's entity.
    const id = `ent_cut_foreign_${tag}`;
    await database
      .prepare(
        "INSERT INTO observations (id, entity_id, entity_type, schema_version, source_id, observed_at, created_at, source_priority, fields, user_id, entity_lifecycle_kind, entity_lifecycle_sequence, entity_lifecycle_target_id) VALUES (?,?,?,'1.0',NULL,?,?,0,?,?,?,?,?)"
      )
      .run(
        `${id}_foreign_delete`,
        id,
        TYPE,
        iso(HISTORY + 20),
        iso(HISTORY + 20),
        JSON.stringify({ _deleted: true }),
        OTHER,
        "delete",
        1,
        id
      );
    const target = { id, user_id: USER, entity_type: TYPE };
    expect((await mods.readers.selectHiddenAfterCutover([target])).has(id)).toBe(false);
    expect(await mods.readers.isOwnedEntityHiddenAfterCutover(id, USER)).toBe(false);
    const listed = await mods.queryEntitiesWithCount({
      userId: USER,
      entityType: TYPE,
      limit: 100,
      offset: 0,
    });
    expect(listed.entities.map((e) => e.entity_id)).toContain(id);
  });

  it("reads attached authority through its partial index, not the history index", async () => {
    const plan = (await database
      .prepare(
        "EXPLAIN QUERY PLAN SELECT * FROM observations WHERE entity_id IN (?,?) AND user_id = ? AND entity_lifecycle_kind IS NOT NULL"
      )
      .all("a", "b", USER)) as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join("\n")).toContain("idx_entity_lifecycle_attached");
  });
});
