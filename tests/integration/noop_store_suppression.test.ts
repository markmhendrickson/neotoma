/**
 * No-op store suppression with a seen-again marker (#2792 point 1).
 *
 * A store whose fields repeat the entity's current top observation appends
 * nothing: it upserts one row in `observation_sightings` against the observation
 * it repeated, and the response says so with `seen_again`. Every case below
 * that must STILL store (a changed value, a changed-back value, another
 * priority, a deletion marker, a correction, the policy switch off, ...) is
 * asserted against the observation rows, so a rule that were reverted turns
 * its test red.
 *
 * Uses its own temporary database: recording a lifecycle cutover is permanent
 * by design and the instance policy is instance-wide.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const dataDir = mkdtempSync(path.join(tmpdir(), "neotoma-noop-store-"));
process.env.NEOTOMA_SQLITE_PATH = path.join(dataDir, "noop_store.db");

const USER = "00000000-0000-0000-0000-000000000000";
const tag = randomBytes(4).toString("hex");

type Mods = {
  db: typeof import("../../src/db.js").db;
  getDb: typeof import("../../src/repositories/db/connection.js").getDb;
  storeStructuredForApi: typeof import("../../src/actions.js").storeStructuredForApi;
  NeotomaServer: typeof import("../../src/server.js").NeotomaServer;
  findRepeatedObservation: typeof import("../../src/services/observation_sightings.js").findRepeatedObservation;
  attachSightings: typeof import("../../src/services/observation_sightings.js").attachSightings;
  getSnapshot: typeof import("../../src/services/snapshot_computation.js").getSnapshot;
  recomputeSnapshot: typeof import("../../src/services/snapshot_computation.js").recomputeSnapshot;
  softDeleteEntity: typeof import("../../src/services/deletion.js").softDeleteEntity;
  restoreEntity: typeof import("../../src/services/deletion.js").restoreEntity;
  isEntityDeleted: typeof import("../../src/services/deletion.js").isEntityDeleted;
  createCorrection: typeof import("../../src/services/correction.js").createCorrection;
  readCurrentEntityFragments: typeof import("../../src/services/current_state_reads.js").readCurrentEntityFragments;
  migrateEntityLifecycleAuthority: typeof import("../../src/services/entity_lifecycle_storage.js").migrateEntityLifecycleAuthority;
  verifyEntityLifecycleStorage: typeof import("../../src/services/entity_lifecycle_storage.js").verifyEntityLifecycleStorage;
  ensureLifecycleAttachedIndex: typeof import("../../src/repositories/sqlite/sqlite_client.js").ensureLifecycleAttachedIndex;
};
let m: Mods;

interface StoreOptions {
  priority?: number;
  source?: "sensor" | "human" | "sync";
}
interface EntityEntry {
  entity_id: string;
  observation_id: string | null;
  seen_again?: boolean;
  seen_count?: number;
  entity_snapshot_after: Record<string, unknown> | null;
}

let pass = 0;
/**
 * One sync pass over the REST store: the record plus a cursor entity whose
 * content differs on every pass, so each pass is its own source and a
 * byte-identical-batch dedup can never hide a missing suppression.
 */
async function restPass(
  type: string,
  fields: Record<string, unknown>,
  entityId: string | undefined,
  options: StoreOptions = {}
): Promise<EntityEntry> {
  pass += 1;
  const result = (await m.storeStructuredForApi({
    userId: USER,
    idempotencyKey: `noop-${tag}-${randomUUID()}`,
    sourcePriority: options.priority ?? 100,
    ...(options.source ? { observationSource: options.source } : { observationSource: "sensor" }),
    entities: [
      { entity_type: type, schema_version: "1.0", name: "Record", ...fields, ...(entityId ? { target_id: entityId } : {}) },
      { entity_type: `${type}_cursor`, schema_version: "1.0", name: "Cursor", pass },
    ],
  })) as { entities: EntityEntry[] };
  return result.entities[0];
}

async function observationRows(entityId: string) {
  return (await m.db
    .from("observations")
    .select("id, source_priority, fields")
    .eq("entity_id", entityId)
    .eq("user_id", USER)
    .order("observed_at", { ascending: true })).data as Array<{
    id: string;
    source_priority: number;
    fields: Record<string, unknown>;
  }>;
}

async function sightingRow(observationId: string) {
  const database = await m.getDb();
  return (await database
    .prepare("SELECT * FROM observation_sightings WHERE observation_id = ? AND user_id = ?")
    .get(observationId, USER)) as
    | { seen_count: number; first_seen_again_at: string; last_seen_at: string; last_source_id: string; entity_id: string }
    | undefined;
}

async function fragmentRows(entityId: string, key: string) {
  return (await m.db
    .from("raw_fragments")
    .select("id, fragment_value, frequency_count, last_seen")
    .eq("entity_id", entityId)
    .eq("fragment_key", key)
    .order("last_seen", { ascending: true })).data as Array<{
    id: string;
    fragment_value: unknown;
    frequency_count: number;
  }>;
}

beforeAll(async () => {
  process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";
  m = {
    db: (await import("../../src/db.js")).db,
    getDb: (await import("../../src/repositories/db/connection.js")).getDb,
    storeStructuredForApi: (await import("../../src/actions.js")).storeStructuredForApi,
    NeotomaServer: (await import("../../src/server.js")).NeotomaServer,
    findRepeatedObservation: (await import("../../src/services/observation_sightings.js"))
      .findRepeatedObservation,
    attachSightings: (await import("../../src/services/observation_sightings.js")).attachSightings,
    getSnapshot: (await import("../../src/services/snapshot_computation.js")).getSnapshot,
    recomputeSnapshot: (await import("../../src/services/snapshot_computation.js")).recomputeSnapshot,
    softDeleteEntity: (await import("../../src/services/deletion.js")).softDeleteEntity,
    restoreEntity: (await import("../../src/services/deletion.js")).restoreEntity,
    isEntityDeleted: (await import("../../src/services/deletion.js")).isEntityDeleted,
    createCorrection: (await import("../../src/services/correction.js")).createCorrection,
    readCurrentEntityFragments: (await import("../../src/services/current_state_reads.js"))
      .readCurrentEntityFragments,
    migrateEntityLifecycleAuthority: (await import("../../src/services/entity_lifecycle_storage.js"))
      .migrateEntityLifecycleAuthority,
    verifyEntityLifecycleStorage: (await import("../../src/services/entity_lifecycle_storage.js"))
      .verifyEntityLifecycleStorage,
    ensureLifecycleAttachedIndex: (await import("../../src/repositories/sqlite/sqlite_client.js"))
      .ensureLifecycleAttachedIndex,
  };
}, 120_000);

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("observation_sightings table", () => {
  it("is created at open, keyed by (observation_id, user_id)", async () => {
    const database = await m.getDb();
    const columns = (await database.prepare("PRAGMA table_info(observation_sightings)").all()) as Array<{
      name: string;
      pk: number;
    }>;
    expect(columns.map((c) => c.name)).toEqual([
      "observation_id",
      "user_id",
      "entity_id",
      "seen_count",
      "first_seen_again_at",
      "last_seen_at",
      "last_source_id",
    ]);
    expect(columns.filter((c) => c.pk > 0).map((c) => c.name)).toEqual(["observation_id", "user_id"]);
  });
});

describe("REST store: an unchanged re-store is a sighting, not an observation", () => {
  it("appends nothing, counts the repeats, and leaves current state and counts as they were", async () => {
    const type = `noop_basic_${tag}`;
    const first = await restPass(type, { status: "active", body: "x" }, undefined);
    expect(first.seen_again).toBeUndefined();
    const entityId = first.entity_id;
    const before = await m.getSnapshot(entityId, USER);

    const repeats: EntityEntry[] = [];
    for (let i = 0; i < 4; i++) repeats.push(await restPass(type, { status: "active", body: "x" }, entityId));

    // Red without suppression: 5 observation rows and no seen_again.
    expect(await observationRows(entityId)).toHaveLength(1);
    repeats.forEach((entry, i) => {
      expect(entry.seen_again).toBe(true);
      expect(entry.seen_count).toBe(i + 1);
      expect(entry.observation_id).toBe(first.observation_id);
    });
    const sighting = await sightingRow(first.observation_id!);
    expect(sighting?.seen_count).toBe(4);
    expect(sighting?.entity_id).toBe(entityId);
    expect(sighting?.last_source_id).toBeTruthy();
    expect(sighting!.last_seen_at >= sighting!.first_seen_again_at).toBe(true);

    // The snapshot a reader sees, and its observation count and
    // last_observation_at (rows, not sightings), are unchanged.
    const after = await m.getSnapshot(entityId, USER);
    expect(after?.snapshot).toEqual(before?.snapshot);
    expect(after?.observation_count).toBe(1);
    expect(after?.last_observation_at).toBe(before?.last_observation_at);
    expect(repeats[3].entity_snapshot_after).toMatchObject({ status: "active", body: "x" });
    // Recomputing from the observation rows gives the same answer.
    const recomputed = await m.recomputeSnapshot(entityId, USER);
    expect(recomputed?.snapshot).toEqual(before?.snapshot);
  });

  it("is independent of the order of keys in the incoming fields", async () => {
    const type = `noop_keyorder_${tag}`;
    const first = await restPass(type, { alpha: 1, beta: { y: 2, x: 1 } }, undefined);
    const again = await restPass(type, { beta: { x: 1, y: 2 }, alpha: 1 }, first.entity_id);
    expect(again.seen_again).toBe(true);
    expect(await observationRows(first.entity_id)).toHaveLength(1);
  });

  it("stores a changed value, and a value that changed back (A, B, A stores all three)", async () => {
    const type = `noop_abab_${tag}`;
    const a1 = await restPass(type, { status: "A" }, undefined);
    const entityId = a1.entity_id;
    const b = await restPass(type, { status: "B" }, entityId);
    // Red if the repeat were compared with ANY earlier observation (A) rather
    // than the newest (B): this third store would be swallowed.
    const a2 = await restPass(type, { status: "A" }, entityId);
    expect([a1, b, a2].map((e) => e.seen_again)).toEqual([undefined, undefined, undefined]);
    expect(await observationRows(entityId)).toHaveLength(3);
    expect((await m.getSnapshot(entityId, USER))?.snapshot).toMatchObject({ status: "A" });
    // ...and now an unchanged A is a repeat of that third observation.
    const a3 = await restPass(type, { status: "A" }, entityId);
    expect(a3.seen_again).toBe(true);
    expect(a3.observation_id).toBe(a2.observation_id);
    expect(await observationRows(entityId)).toHaveLength(3);
  });

  it("stores when the source priority differs from the top observation", async () => {
    const type = `noop_priority_${tag}`;
    const first = await restPass(type, { status: "A" }, undefined, { priority: 100 });
    const entityId = first.entity_id;
    // Same fields, higher priority: a reader's answer could change (highest_priority fields).
    const higher = await restPass(type, { status: "A" }, entityId, { priority: 200 });
    expect(higher.seen_again).toBeUndefined();
    // Same fields, lower priority than the current top: not a repeat of it either.
    const lower = await restPass(type, { status: "A" }, entityId, { priority: 100 });
    expect(lower.seen_again).toBeUndefined();
    expect(await observationRows(entityId)).toHaveLength(3);
    expect(await observationRows(entityId)).toHaveLength(3);
  });

  it("stores when the kind of write (observation_source) differs", async () => {
    const type = `noop_source_${tag}`;
    const first = await restPass(type, { status: "A" }, undefined, { source: "sensor" });
    const human = await restPass(type, { status: "A" }, first.entity_id, { source: "human" });
    expect(human.seen_again).toBeUndefined();
    expect(await observationRows(first.entity_id)).toHaveLength(2);
    const humanAgain = await restPass(type, { status: "A" }, first.entity_id, { source: "human" });
    expect(humanAgain.seen_again).toBe(true);
  });

  it("does not suppress after a deletion and restore, nor change what a reader sees", async () => {
    const type = `noop_delete_${tag}`;
    const first = await restPass(type, { status: "A" }, undefined);
    const entityId = first.entity_id;
    await m.softDeleteEntity(entityId, type, USER, "test");
    expect(await m.isEntityDeleted(entityId, USER)).toBe(true);
    await m.restoreEntity(entityId, type, USER, "test");
    expect(await m.isEntityDeleted(entityId, USER)).toBe(false);
    const rowsBefore = (await observationRows(entityId)).length;
    // The top observation is now the restore marker (priority 1000): an
    // ordinary store must append, as it always did.
    const after = await restPass(type, { status: "A" }, entityId);
    expect(after.seen_again).toBeUndefined();
    expect(await observationRows(entityId)).toHaveLength(rowsBefore + 1);
    expect(await m.isEntityDeleted(entityId, USER)).toBe(false);
  });

  it("does not suppress against a correction", async () => {
    const type = `noop_correction_${tag}`;
    const first = await restPass(type, { status: "A" }, undefined);
    await m.createCorrection({
      entity_id: first.entity_id,
      entity_type: type,
      field: "status",
      value: "B",
      schema_version: "1.0",
      user_id: USER,
      idempotency_key: `noop-correct-${tag}`,
    });
    const rowsBefore = (await observationRows(first.entity_id)).length;
    const after = await restPass(type, { status: "A" }, first.entity_id);
    expect(after.seen_again).toBeUndefined();
    expect(await observationRows(first.entity_id)).toHaveLength(rowsBefore + 1);
  });
});

describe("findRepeatedObservation: each rule that must still store", () => {
  const base = (entity: string, overrides: Record<string, unknown> = {}) => ({
    id: `obs_${entity}_${randomUUID()}`,
    entity_id: entity,
    entity_type: `rule_${tag}`,
    schema_version: "1.0",
    source_id: `src_${randomUUID()}`,
    interpretation_id: null,
    observed_at: "2026-01-01T00:00:00.000Z",
    specificity_score: 1,
    source_priority: 100,
    observation_source: "sensor",
    fields: { name: "n", status: "A" },
    created_at: "2026-01-01T00:00:00.000Z",
    user_id: USER,
    ...overrides,
  });
  const candidate = (entity: string, overrides: Record<string, unknown> = {}) => ({
    userId: USER,
    entityId: entity,
    entityType: `rule_${tag}`,
    schemaVersion: "1.0",
    fields: { status: "A", name: "n" } as Record<string, unknown>,
    sourcePriority: 100,
    specificityScore: 1,
    observationSource: "sensor",
    ...overrides,
  });
  async function seed(entity: string, ...rows: Array<Record<string, unknown>>) {
    for (const row of rows) {
      const { error } = await m.db.from("observations").insert(row);
      if (error) throw new Error(error.message);
    }
  }

  it("baseline: an equal field set at the same priority repeats the top observation", async () => {
    const e = `ent_rule_base_${tag}`;
    const row = base(e);
    await seed(e, row);
    expect((await m.findRepeatedObservation(candidate(e)))?.id).toBe(row.id);
  });

  it("stores when there is no observation yet", async () => {
    expect(await m.findRepeatedObservation(candidate(`ent_rule_none_${tag}`))).toBeNull();
  });

  it("stores when the entity type, schema version or specificity differ", async () => {
    const e = `ent_rule_shape_${tag}`;
    await seed(e, base(e));
    expect(await m.findRepeatedObservation(candidate(e, { entityType: "other_type" }))).toBeNull();
    expect(await m.findRepeatedObservation(candidate(e, { schemaVersion: "2.0" }))).toBeNull();
    expect(await m.findRepeatedObservation(candidate(e, { specificityScore: 0.5 }))).toBeNull();
  });

  it("stores another owner's identical fields", async () => {
    const e = `ent_rule_owner_${tag}`;
    await seed(e, base(e, { user_id: "00000000-0000-0000-0000-0000000000ff" }));
    expect(await m.findRepeatedObservation(candidate(e))).toBeNull();
  });

  it("stores when the newest observation is a lower-priority one (last_write ignores priority)", async () => {
    const e = `ent_rule_newer_low_${tag}`;
    await seed(
      e,
      base(e),
      base(e, { source_priority: 50, observed_at: "2026-02-01T00:00:00.000Z", fields: { name: "n", status: "B" } })
    );
    // Top priority row equals the candidate, but a newer lower-priority row
    // decides last_write fields: a repeat on top would flip status back to A.
    expect(await m.findRepeatedObservation(candidate(e))).toBeNull();
  });

  it("stores when the top row carries a deletion or restoration marker", async () => {
    for (const marker of [{ _deleted: true }, { _deleted: false }]) {
      const e = `ent_rule_deleted_${tag}_${String(marker._deleted)}`;
      await seed(e, base(e, { fields: { name: "n", status: "A", ...marker } }));
      expect(await m.findRepeatedObservation(candidate(e, { fields: { name: "n", status: "A", ...marker } }))).toBeNull();
    }
  });

  it("stores when the incoming fields carry a deletion marker", async () => {
    const e = `ent_rule_in_deleted_${tag}`;
    await seed(e, base(e));
    expect(await m.findRepeatedObservation(candidate(e, { fields: { name: "n", status: "A", _deleted: true } }))).toBeNull();
  });

  it("stores when the top row is encrypted (cryptographic erasure)", async () => {
    const e = `ent_rule_encrypted_${tag}`;
    await seed(e, base(e, { fields: { _encrypted: "abc", _iv: "def" } }));
    expect(await m.findRepeatedObservation(candidate(e, { fields: { _encrypted: "abc", _iv: "def" } }))).toBeNull();
  });

  it("stores when the top row has the shape of a correction", async () => {
    const e = `ent_rule_correction_${tag}`;
    await seed(
      e,
      base(e, { source_id: null, observation_source: null, source_priority: 1000, specificity_score: 1 })
    );
    expect(
      await m.findRepeatedObservation(candidate(e, { sourcePriority: 1000, observationSource: "sensor" }))
    ).toBeNull();
  });

  it("stores when the top row is a conditional write or a peer replay", async () => {
    const conditional = `ent_rule_conditional_${tag}`;
    await seed(conditional, base(conditional, { canonical_hash: "h" }));
    expect(await m.findRepeatedObservation(candidate(conditional))).toBeNull();
    const peer = `ent_rule_peer_${tag}`;
    await seed(peer, base(peer, { source_peer_id: "peer-1" }));
    expect(await m.findRepeatedObservation(candidate(peer))).toBeNull();
    const plain = `ent_rule_peer_in_${tag}`;
    await seed(plain, base(plain));
    expect(await m.findRepeatedObservation(candidate(plain, { sourcePeerId: "peer-1" }))).toBeNull();
  });

  it("stores when the top row has no source of its own", async () => {
    const e = `ent_rule_nosource_${tag}`;
    await seed(e, base(e, { source_id: null }));
    expect(await m.findRepeatedObservation(candidate(e))).toBeNull();
  });
});

describe("lifecycle cutover", () => {
  it("keeps authority sequences intact: suppression before, a delete/restore after, appends resume", async () => {
    const type = `noop_cutover_${tag}`;
    const first = await restPass(type, { status: "A" }, undefined);
    const entityId = first.entity_id;
    expect((await restPass(type, { status: "A" }, entityId)).seen_again).toBe(true);

    const database = await m.getDb();
    await m.migrateEntityLifecycleAuthority(database, async () => {});
    await m.ensureLifecycleAttachedIndex(database);
    // The sightings table existed before the migration, so the executor's
    // before/after schema comparison saw it on both sides.
    expect((await m.verifyEntityLifecycleStorage(database)).state).toBe("committed");

    // The migration attached a baseline authority row to the entity, which is
    // now its newest observation, so the first ordinary store after the cutover
    // appends (as it always did); the next one repeats THAT row.
    const rowsAtCutover = (await observationRows(entityId)).length;
    const post = await restPass(type, { status: "A" }, entityId);
    expect(post.seen_again).toBeUndefined();
    expect(await observationRows(entityId)).toHaveLength(rowsAtCutover + 1);
    const postAgain = await restPass(type, { status: "A" }, entityId);
    expect(postAgain.seen_again).toBe(true);
    expect(postAgain.observation_id).toBe(post.observation_id);
    expect(await observationRows(entityId)).toHaveLength(rowsAtCutover + 1);

    // Lifecycle actions append authority rows; ordinary stores then append
    // again (the top row is authority state) and the sequence still verifies.
    await m.softDeleteEntity(entityId, type, USER, "test");
    expect(await m.isEntityDeleted(entityId, USER)).toBe(true);
    await m.restoreEntity(entityId, type, USER, "test");
    expect(await m.isEntityDeleted(entityId, USER)).toBe(false);
    const rowsBefore = (await observationRows(entityId)).length;
    const after = await restPass(type, { status: "A" }, entityId);
    expect(after.seen_again).toBeUndefined();
    expect(await observationRows(entityId)).toHaveLength(rowsBefore + 1);
    expect(await m.isEntityDeleted(entityId, USER)).toBe(false);
    expect((await m.verifyEntityLifecycleStorage(database)).state).toBe("committed");
  }, 120_000);
});

describe("MCP store: response marker and fragments", () => {
  const type = `noop_mcp_${tag}`;
  let server: InstanceType<Mods["NeotomaServer"]>;
  type StoreFn = (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
  let mcpPass = 0;

  async function mcpStore(fields: Record<string, unknown>, title = "Doc") {
    mcpPass += 1;
    const result = await (server as unknown as { store: StoreFn }).store({
      user_id: USER,
      idempotency_key: `noop-mcp-${tag}-${randomUUID()}`,
      source_priority: 100,
      observation_source: "sensor",
      entities: [
        { entity_type: type, title, ...fields },
        { entity_type: `${type}_cursor`, name: "Cursor", pass: mcpPass },
      ],
    });
    const body = JSON.parse(result.content[0].text) as { entities: Array<Record<string, any>>; error?: unknown };
    expect(body.error).toBeUndefined();
    return body.entities[0];
  }

  beforeAll(async () => {
    await m.db.from("schema_registry").insert({
      entity_type: type,
      schema_version: "1.0",
      schema_definition: {
        fields: { title: { type: "string" }, status: { type: "string" } },
        canonical_name_fields: ["title"],
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          status: { strategy: "last_write" },
        },
      },
      active: true,
      scope: "global",
      user_id: null,
    });
    server = new m.NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER;
  });

  it("marks a repeat with seen_again and the repeated observation id, keeping existing fields", async () => {
    const first = await mcpStore({ status: "A" }, "marker");
    const again = await mcpStore({ status: "A" }, "marker");
    expect(first.seen_again).toBeUndefined();
    expect(again.entity_id).toBe(first.entity_id);
    expect(again.seen_again).toBe(true);
    expect(again.seen_count).toBe(1);
    expect(again.observation_id).toBe(first.observation_id);
    // Existing fields keep their meaning: this is not an idempotency replay.
    expect(again.deduplicated).toBe(false);
    expect(again.entity_snapshot_after).toMatchObject({ status: "A" });
    expect(await observationRows(first.entity_id)).toHaveLength(1);
    expect((await sightingRow(first.observation_id))?.seen_count).toBe(1);
  });

  it("folds repeated unknown fields into one fragment and still stores A, B, A", async () => {
    const first = await mcpStore({ status: "S", extra: "A" }, "frag");
    const entityId = first.entity_id;
    await mcpStore({ status: "S", extra: "A" }, "frag");
    await mcpStore({ status: "S", extra: "A" }, "frag");
    // Red without fragment reuse: one fragment row per pass.
    let rows = await fragmentRows(entityId, "extra");
    expect(rows).toHaveLength(1);
    expect(rows[0].frequency_count).toBe(3);
    expect(await observationRows(entityId)).toHaveLength(1);

    await mcpStore({ status: "S", extra: "B" }, "frag");
    await mcpStore({ status: "S", extra: "A" }, "frag");
    rows = await fragmentRows(entityId, "extra");
    expect(rows.map((r) => r.fragment_value)).toEqual(["A", "B", "A"]);
    expect(await observationRows(entityId)).toHaveLength(3);

    // The current fragment per key is still what the readers pick: the latest.
    const current = await m.readCurrentEntityFragments([entityId], type, USER);
    expect(current.get(entityId)?.get("extra")?.value).toBe("A");
  });

  it("appends the observation when only an unknown field changed, so its new fragment stays current", async () => {
    const first = await mcpStore({ status: "U", extra: "one" }, "fragonly");
    const changed = await mcpStore({ status: "U", extra: "two" }, "fragonly");
    // The observation fields are identical, but the new fragment is only
    // current while its own source has an observation of the entity. Red if
    // such a store were suppressed: the reader would keep showing "one".
    expect(changed.seen_again).toBeUndefined();
    expect(changed.observation_id).not.toBe(first.observation_id);
    expect(await observationRows(first.entity_id)).toHaveLength(2);
    const current = await m.readCurrentEntityFragments([first.entity_id], type, USER);
    expect(current.get(first.entity_id)?.get("extra")?.value).toBe("two");
  });

  it("shows seen-again on the listed observation only", async () => {
    const first = await mcpStore({ status: "L", extra: "x" }, "listed");
    await mcpStore({ status: "L", extra: "x" }, "listed");
    await mcpStore({ status: "L", extra: "x" }, "listed");
    await mcpStore({ status: "L2", extra: "x" }, "listed");
    const result = await (server as unknown as {
      listObservations: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }).listObservations({ entity_id: first.entity_id, limit: 50, offset: 0 });
    const body = JSON.parse(result.content[0].text) as {
      observations: Array<{ id: string; seen_again?: { seen_count: number; last_seen_at: string } }>;
    };
    expect(body.observations).toHaveLength(2);
    const repeated = body.observations.find((o) => o.id === first.observation_id);
    expect(repeated?.seen_again?.seen_count).toBe(2);
    expect(repeated?.seen_again?.last_seen_at).toBeTruthy();
    expect(body.observations.find((o) => o.id !== first.observation_id)?.seen_again).toBeUndefined();
    // attachSightings leaves rows with no sighting untouched (no extra keys).
    const plain = await m.attachSightings([{ id: "obs_without_sighting" }], USER);
    expect(plain).toEqual([{ id: "obs_without_sighting" }]);
  });
});

describe("instance policy switch", () => {
  it("turns suppression off for both transports and fragments, and back on", async () => {
    const type = `noop_switch_${tag}`;
    const policyId = `policy_${tag}`;
    // On by default: no policy row at all.
    const on = await restPass(type, { status: "A" }, undefined);
    expect((await restPass(type, { status: "A" }, on.entity_id)).seen_again).toBe(true);

    const stored = (await m.storeStructuredForApi({
      userId: USER,
      idempotencyKey: `noop-policy-${tag}`,
      sourcePriority: 100,
      entities: [
        {
          entity_type: "instance_policy",
          policy_id: policyId,
          purpose: "synthetic test instance",
          suppress_noop_observations: false,
        },
      ],
    })) as { entities: EntityEntry[] };
    const policyEntityId = stored.entities[0].entity_id;
    const { getInstancePolicyResult } = await import("../../src/services/instance_policy.js");
    expect((await getInstancePolicyResult()).policy?.suppress_noop_observations).toBe(false);

    const rowsBefore = (await observationRows(on.entity_id)).length;
    // Red if the switch were ignored: these would be repeats.
    const off1 = await restPass(type, { status: "A" }, on.entity_id);
    const off2 = await restPass(type, { status: "A" }, on.entity_id);
    expect(off1.seen_again).toBeUndefined();
    expect(off2.seen_again).toBeUndefined();
    expect(await observationRows(on.entity_id)).toHaveLength(rowsBefore + 2);

    // MCP transport and its fragments follow the same switch.
    const mcpType = `noop_switch_mcp_${tag}`;
    await m.db.from("schema_registry").insert({
      entity_type: mcpType,
      schema_version: "1.0",
      schema_definition: { fields: { title: { type: "string" } }, canonical_name_fields: ["title"] },
      reducer_config: { merge_policies: { title: { strategy: "last_write" } } },
      active: true,
      scope: "global",
      user_id: null,
    });
    const server = new m.NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER;
    const storeMcp = async (n: number) => {
      const result = await (server as unknown as {
        store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }).store({
        user_id: USER,
        idempotency_key: `noop-switch-mcp-${tag}-${randomUUID()}`,
        source_priority: 100,
        observation_source: "sensor",
        entities: [
          { entity_type: mcpType, title: "Doc", extra: "same" },
          { entity_type: `${mcpType}_cursor`, name: "Cursor", pass: n },
        ],
      });
      return JSON.parse(result.content[0].text).entities[0] as Record<string, any>;
    };
    const m1 = await storeMcp(1);
    const m2 = await storeMcp(2);
    const m3 = await storeMcp(3);
    expect([m1, m2, m3].map((e) => e.seen_again)).toEqual([undefined, undefined, undefined]);
    expect(await observationRows(m1.entity_id)).toHaveLength(3);
    expect(await fragmentRows(m1.entity_id, "extra")).toHaveLength(3);

    // Switch back on (the policy is read per store, not cached).
    await m.createCorrection({
      entity_id: policyEntityId,
      entity_type: "instance_policy",
      field: "suppress_noop_observations",
      value: true,
      schema_version: "1.0.0",
      user_id: USER,
      idempotency_key: `noop-policy-on-${tag}`,
    });
    const back = await restPass(type, { status: "A" }, on.entity_id);
    // The top row is the last appended one, with the same fields: a repeat again.
    expect(back.seen_again).toBe(true);
    expect(back.observation_id).toBe(off2.observation_id);
  }, 120_000);
});
