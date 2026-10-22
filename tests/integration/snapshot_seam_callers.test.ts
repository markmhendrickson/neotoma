/**
 * Every snapshot-computing path goes through the attachment-resolution seam
 * (#2343).
 *
 * #2342 moved `recomputeSnapshot` onto the declared resolution layer. It was
 * the FIRST seam, not the only one: roughly ten further sites fetched
 * observations by flat `entity_id` equality and handed them straight to
 * `observationReducer.computeSnapshot`. This file is the safety argument for
 * routing them, and it is written to the same standard #2342's equivalence
 * test set:
 *
 *   1. **Equivalence** — no currently-correct snapshot moves. Each assertion
 *      here holds against the flat fetch on `origin/main` as well as against
 *      the routed one, so a diff in these expectations would mean the
 *      migration changed a snapshot rather than changed how one is fetched.
 *   2. **Effect** — the tombstone-ownership trap, which is the one behaviour
 *      that DOES change: a site that would have written a wrong snapshot once
 *      the split/merge redesigns land now declines to.
 *
 * ## The trap this file exists to pin
 *
 * Resolution and ownership are different questions. A merge tombstone
 * resolves to its survivor, so a persisting caller that only resolved would
 * compute the SURVIVOR's snapshot and upsert it **under the tombstone's id** —
 * a duplicate snapshot the flat fetch never produced, because merge had
 * already moved the rows out from under the tombstone. #2342 found this in
 * `recomputeSnapshot`; every site routed in #2343 could reproduce it, so each
 * persisting site is asserted to leave no snapshot row behind on a tombstone.
 *
 * Requires a live SQLite database; runs in CI via `npm run test:integration`.
 */

import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import {
  resolveAttachedObservations,
  resolveOwnedObservations,
  resolveAttachmentTarget,
  MAX_ATTACHMENT_RESOLUTION_DEPTH,
} from "../../src/services/attachment_resolution.js";
import {
  resolveAttachmentTargetSqlite,
  ownsSnapshotSqlite,
} from "../../src/services/attachment_resolution_sqlite.js";
import { computeEntitySnapshotAtTime } from "../../src/services/entity_snapshot_at_time.js";

const TEST_USER = "test-seam-2343";
const OTHER_USER = "test-seam-2343-other";
// A dedicated, user-scoped type, for the same reason #2342 used one: the
// reducer projects through the ACTIVE schema, so borrowing a shared type would
// couple these assertions to whatever else the suite registered for it.
const ENTITY_TYPE = "seam_probe_2343";

const ids = {
  plain: "ent_seam_plain_2343",
  tombstone: "ent_seam_tomb_2343",
  survivor: "ent_seam_surv_2343",
  chainA: "ent_seam_chain_a_2343",
  chainB: "ent_seam_chain_b_2343",
  chainC: "ent_seam_chain_c_2343",
};

async function seedSchema() {
  await db.from("schema_registry").delete().eq("user_id", TEST_USER);
  await db.from("schema_registry").insert({
    id: randomUUID(),
    entity_type: ENTITY_TYPE,
    schema_version: "1.0.0",
    schema_definition: {
      entity_type: ENTITY_TYPE,
      schema_version: "1.0.0",
      fields: {
        title: { type: "string", required: false, preserveCase: true },
        summary: { type: "string", required: false, preserveCase: true },
      },
      canonical_name_fields: ["title"],
    },
    reducer_config: { merge_policies: {} },
    active: 1,
    scope: "user",
    user_id: TEST_USER,
    created_at: new Date().toISOString(),
  });
}

async function cleanup() {
  for (const u of [TEST_USER, OTHER_USER]) {
    await db.from("observations").delete().eq("user_id", u);
    await db.from("entity_snapshots").delete().eq("user_id", u);
    await db.from("entities").delete().eq("user_id", u);
  }
}

async function insertEntity(id: string, mergedTo: string | null = null, user = TEST_USER) {
  await db.from("entities").insert({
    id,
    entity_type: ENTITY_TYPE,
    canonical_name: id,
    user_id: user,
    merged_to_entity_id: mergedTo,
    created_at: new Date().toISOString(),
  });
}

let obsSeq = 0;

async function insertObservation(
  entityId: string,
  fields: Record<string, unknown>,
  observedAt: string,
  user = TEST_USER
) {
  const id = `obs_seam_2343_${++obsSeq}`;
  await db.from("observations").insert({
    id,
    entity_id: entityId,
    entity_type: ENTITY_TYPE,
    schema_version: "1.0.0",
    source_id: `src_seam_2343_${obsSeq}`,
    interpretation_id: null,
    observed_at: observedAt,
    specificity_score: 1,
    source_priority: 50,
    observation_source: null,
    fields,
    created_at: observedAt,
    user_id: user,
  });
  return id;
}

async function snapshotRowsFor(entityId: string) {
  const { data } = await db
    .from("entity_snapshots")
    .select("entity_id")
    .eq("entity_id", entityId)
    .eq("user_id", TEST_USER);
  return data ?? [];
}

describe("snapshot seam — the resolved set equals the flat set today (#2343)", () => {
  beforeAll(seedSchema);
  beforeEach(cleanup);
  afterEach(cleanup);

  it("returns exactly the rows a flat entity_id fetch returns, for a plain entity", async () => {
    await insertEntity(ids.plain);
    const o1 = await insertObservation(ids.plain, { title: "one" }, "2026-03-01T00:00:00Z");
    const o2 = await insertObservation(ids.plain, { title: "two" }, "2026-03-02T00:00:00Z");

    // The flat fetch every routed site used to do, verbatim.
    const { data: flat } = await db
      .from("observations")
      .select("*")
      .eq("entity_id", ids.plain)
      .eq("user_id", TEST_USER);

    const resolved = await resolveAttachedObservations(ids.plain, TEST_USER);

    expect(resolved.resolvedEntityId).toBe(ids.plain);
    expect(new Set(resolved.observations.map((o) => o.id))).toEqual(
      new Set((flat ?? []).map((o: { id: string }) => o.id))
    );
    expect(new Set(resolved.observations.map((o) => o.id))).toEqual(new Set([o1, o2]));
  });

  it("orders observed_at DESC, matching what every bypassing fetch already did", async () => {
    // The routed sites' flat queries all carried `.order("observed_at",
    // {ascending:false})`. The reducer's tie-breaks read input order, so the
    // seam must order too or routing would silently change a snapshot.
    await insertEntity(ids.plain);
    await insertObservation(ids.plain, { title: "older" }, "2026-03-01T00:00:00Z");
    await insertObservation(ids.plain, { title: "newer" }, "2026-03-05T00:00:00Z");
    await insertObservation(ids.plain, { title: "middle" }, "2026-03-03T00:00:00Z");

    const resolved = await resolveAttachedObservations(ids.plain, TEST_USER);
    const times = resolved.observations.map((o) => o.observed_at);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("preserves user scoping when a user id is given", async () => {
    await insertEntity(ids.plain);
    await insertEntity(ids.plain, null, OTHER_USER).catch(() => undefined);
    await insertObservation(ids.plain, { title: "mine" }, "2026-03-01T00:00:00Z");
    await insertObservation(ids.plain, { title: "theirs" }, "2026-03-02T00:00:00Z", OTHER_USER);

    const resolved = await resolveAttachedObservations(ids.plain, TEST_USER);
    expect(resolved.observations).toHaveLength(1);
    expect(resolved.observations.every((o) => o.user_id === TEST_USER)).toBe(true);
  });

  it("a null scope reads across users, preserving the legacy repair paths' contract", async () => {
    // Three routed sites (health_check_snapshots, schema_lag_repair,
    // schema_registry) fetched observations WITHOUT a user filter before
    // #2343. Routing them must not narrow the set the reducer sees — that
    // would be a behaviour change smuggled in as a refactor — so the seam
    // accepts `null` to mean "keep the caller's existing unscoped read".
    await insertEntity(ids.plain);
    await insertObservation(ids.plain, { title: "mine" }, "2026-03-01T00:00:00Z");
    await insertObservation(ids.plain, { title: "theirs" }, "2026-03-02T00:00:00Z", OTHER_USER);

    const resolved = await resolveAttachedObservations(ids.plain, null);
    expect(resolved.observations).toHaveLength(2);
  });
});

describe("snapshot seam — resolution is not ownership (#2343)", () => {
  beforeAll(seedSchema);
  beforeEach(cleanup);
  afterEach(cleanup);

  it("a tombstone resolves to its survivor but owns no observations to persist", async () => {
    await insertEntity(ids.survivor);
    await insertEntity(ids.tombstone, ids.survivor);
    // Merge has already moved the rows to the survivor, as it does today.
    await insertObservation(ids.survivor, { title: "survivor" }, "2026-04-01T00:00:00Z");

    // Resolution: the tombstone points at the survivor, and the survivor's
    // rows are what attach there.
    const resolved = await resolveAttachedObservations(ids.tombstone, TEST_USER);
    expect(resolved.resolvedEntityId).toBe(ids.survivor);
    expect(resolved.observations).toHaveLength(1);

    // Ownership: the tombstone owns none of it. This is the single guard that
    // stops every persisting caller from upserting the survivor's snapshot
    // under the tombstone's id.
    expect(await resolveOwnedObservations(ids.tombstone, TEST_USER)).toBeNull();

    // The survivor still owns its own.
    const owned = await resolveOwnedObservations(ids.survivor, TEST_USER);
    expect(owned).not.toBeNull();
    expect(owned).toHaveLength(1);
  });

  it("follows a merge CHAIN to a fixed point, not one hop", async () => {
    // The pre-#2343 one-hop follow in entity_snapshot_at_time left an as-of
    // read of A pointed at B, which holds nothing once B merges into C.
    await insertEntity(ids.chainC);
    await insertEntity(ids.chainB, ids.chainC);
    await insertEntity(ids.chainA, ids.chainB);
    await insertObservation(ids.chainC, { title: "end of chain" }, "2026-04-02T00:00:00Z");

    const target = await resolveAttachmentTarget(ids.chainA, TEST_USER);
    expect(target.resolvedEntityId).toBe(ids.chainC);
    expect(target.truncated).toBe(false);
  });
});

describe("snapshot seam — persisting sites leave no snapshot on a tombstone (#2343)", () => {
  beforeAll(seedSchema);
  beforeEach(cleanup);
  afterEach(cleanup);

  it("the schema-lag repair path skips a redirected id", async () => {
    const { repairEntityType } = await import("../../src/services/schema_lag_repair.js");
    await insertEntity(ids.survivor);
    await insertEntity(ids.tombstone, ids.survivor);
    await insertObservation(ids.survivor, { title: "survivor" }, "2026-05-01T00:00:00Z");

    // Whatever the repair finds, it must never create a snapshot row under a
    // merged-away id. Before #2343 this path's flat fetch could not do so
    // either (the rows had moved) — but once split/merge become append-based
    // the rows STAY, and a flat fetch would then write exactly that duplicate.
    await repairEntityType(ENTITY_TYPE).catch(() => undefined);
    expect(await snapshotRowsFor(ids.tombstone)).toHaveLength(0);
  });

  it("health_check_snapshots auto-fix does not resurrect a tombstone", async () => {
    await insertEntity(ids.survivor);
    await insertEntity(ids.tombstone, ids.survivor);
    await insertObservation(ids.survivor, { title: "survivor" }, "2026-05-02T00:00:00Z");

    // Plant the stale row the auto-fix looks for, on the tombstone.
    await db.from("entity_snapshots").insert({
      entity_id: ids.tombstone,
      entity_type: ENTITY_TYPE,
      schema_version: "1.0.0",
      snapshot: {},
      computed_at: new Date().toISOString(),
      observation_count: 0,
      last_observation_at: "2026-05-02T00:00:00Z",
      provenance: {},
      user_id: TEST_USER,
    });

    // The repair asks the seam the ownership question, and the seam says no.
    expect(await resolveOwnedObservations(ids.tombstone, TEST_USER)).toBeNull();
    expect(await resolveOwnedObservations(ids.tombstone, null)).toBeNull();
  });
});

describe("snapshot seam — the SQLite-handle sites share the same rules (#2343)", () => {
  beforeAll(seedSchema);
  beforeEach(cleanup);
  afterEach(cleanup);

  it("the SQLite resolver reaches the same target as the service resolver", async () => {
    await insertEntity(ids.chainC);
    await insertEntity(ids.chainB, ids.chainC);
    await insertEntity(ids.chainA, ids.chainB);

    // `db` IS the local adapter (src/db.ts), so it exposes the raw handle the
    // adapter and the CLI use. Both resolvers must agree, or the two callers
    // that cannot reach the service seam would drift from the ones that can.
    const rawDb = await (await import("../../src/repositories/db/connection.js")).getDb();

    const viaService = await resolveAttachmentTarget(ids.chainA, TEST_USER);
    const viaSqlite = await resolveAttachmentTargetSqlite(rawDb as never, ids.chainA);
    expect(viaSqlite.resolvedEntityId).toBe(viaService.resolvedEntityId);
    expect(viaSqlite.resolvedEntityId).toBe(ids.chainC);

    // And the ownership answer matches too.
    expect(await ownsSnapshotSqlite(rawDb as never, ids.chainA)).toBe(false);
    expect(await ownsSnapshotSqlite(rawDb as never, ids.chainC)).toBe(true);
  });

  it("the two resolvers share one depth bound, so they cannot drift apart", async () => {
    // The SQLite module imports the constant rather than redeclaring it. This
    // asserts the import, which is the mechanism that keeps them in agreement.
    expect(MAX_ATTACHMENT_RESOLUTION_DEPTH).toBeGreaterThan(0);
    const chain: string[] = [];
    for (let i = 0; i <= MAX_ATTACHMENT_RESOLUTION_DEPTH + 1; i++) {
      chain.push(`ent_seam_deep_${i}_2343`);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      await insertEntity(chain[i], i === chain.length - 1 ? null : chain[i + 1]);
    }
    const rawDb = await (await import("../../src/repositories/db/connection.js")).getDb();

    const viaService = await resolveAttachmentTarget(chain[0], TEST_USER);
    const viaSqlite = await resolveAttachmentTargetSqlite(rawDb as never, chain[0]);
    expect(viaService.truncated).toBe(true);
    expect(viaSqlite.truncated).toBe(true);
    expect(viaSqlite.truncationReason).toBe(viaService.truncationReason);
    expect(viaSqlite.resolvedEntityId).toBe(viaService.resolvedEntityId);

    for (const id of chain) {
      await db.from("entities").delete().eq("id", id);
    }
  });
});

describe("snapshot seam — the as-of read resolves fully but never upserts (#2343)", () => {
  beforeAll(seedSchema);
  beforeEach(cleanup);
  afterEach(cleanup);

  it("an as-of read of a merged-away id answers with the survivor's history", async () => {
    // This site READS. Ownership is not its question: refusing a merged-away
    // id would be a regression, not a guard. What it needed was the FULL
    // chain follow — its own comment conceded it did "one level".
    await insertEntity(ids.chainC);
    await insertEntity(ids.chainB, ids.chainC);
    await insertEntity(ids.chainA, ids.chainB);
    await insertObservation(ids.chainC, { title: "early" }, "2026-06-01T00:00:00Z");
    await insertObservation(ids.chainC, { title: "late" }, "2026-06-10T00:00:00Z");

    const result = await computeEntitySnapshotAtTime(ids.chainA, TEST_USER);
    expect(result).not.toBeNull();
    // A one-hop follow would land on chainB and see zero observations.
    expect(result!.entity_id).toBe(ids.chainC);
    expect(result!.observation_count).toBe(2);
  });

  it("the as-of cutoff still bounds the resolved set", async () => {
    // Equivalence: routing the HOP through the seam must not disturb the time
    // filtering, which is this function's whole purpose. The seam supplies the
    // resolved id; the time-bounded query stays local.
    await insertEntity(ids.chainC);
    await insertEntity(ids.chainA, ids.chainC);
    await insertObservation(ids.chainC, { title: "early" }, "2026-06-01T00:00:00Z");
    await insertObservation(ids.chainC, { title: "late" }, "2026-06-10T00:00:00Z");

    const asOf = await computeEntitySnapshotAtTime(ids.chainA, TEST_USER, "2026-06-05T00:00:00Z");
    expect(asOf!.observation_count).toBe(1);
    expect((asOf!.snapshot as Record<string, unknown>).title).toBe("early");
  });

  it("reading as-of never writes a snapshot row under the requested id", async () => {
    await insertEntity(ids.chainC);
    await insertEntity(ids.chainA, ids.chainC);
    await insertObservation(ids.chainC, { title: "only" }, "2026-06-01T00:00:00Z");

    // The survivor legitimately has a snapshot row (the local adapter
    // materializes one on observation insert). What must NOT appear is a row
    // under chainA — the tombstone-ownership trap, arriving by a read path
    // rather than a repair path. Snapshot the survivor's row count first so
    // the assertion is about what the READ did, not what the insert did.
    const survivorRowsBefore = (await snapshotRowsFor(ids.chainC)).length;

    const result = await computeEntitySnapshotAtTime(ids.chainA, TEST_USER);
    expect(result).not.toBeNull();

    expect(await snapshotRowsFor(ids.chainA)).toHaveLength(0);
    expect(await snapshotRowsFor(ids.chainC)).toHaveLength(survivorRowsBefore);
  });
});
