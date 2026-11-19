import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { TransactionGate } from "../../src/repositories/db/driver.js";
import { ObservationReducer, observationReducer } from "../../src/reducers/observation_reducer.js";
import { resolveOwnedObservations } from "../../src/services/attachment_resolution.js";
import { createCorrection } from "../../src/services/correction.js";
import { cryptographicErasure } from "../../src/services/gdpr_deletion.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { buildObservationRow } from "../../src/services/observation_insert.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import {
  forgetSnapshotCertificates,
  planIncrementalCorrection,
  resetSnapshotIncrementalStats,
  snapshotIncrementalStats,
  snapshotRowDigest,
} from "../../src/services/snapshot_incremental.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_snapshot_incremental_correction";
const SAME_VERSION_TYPE = `${TYPE}_same_version`;

const FIELDS = ["title", "status", "priority", "rank", "tags", "items"] as const;
const CORRECTABLE = [...FIELDS, "extra"] as const;

/** Deterministic PRNG (mulberry32) so a failing seed can be replayed. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, values: readonly T[]): T {
  return values[Math.floor(rand() * values.length)];
}

function randomValue(rand: () => number, field: string): unknown {
  if (rand() < 0.2) return null;
  switch (field) {
    case "tags":
      return Array.from({ length: Math.floor(rand() * 3) }, () => `t${Math.floor(rand() * 6)}`);
    case "items":
      return Array.from({ length: 1 + Math.floor(rand() * 2) }, () => ({
        claim_id: `c${Math.floor(rand() * 4)}`,
        state: `s${Math.floor(rand() * 100)}`,
      }));
    default:
      return `${field}-${Math.floor(rand() * 1000)}`;
  }
}

async function registerSchema(): Promise<void> {
  await schemaRegistry.register({
    entity_type: TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        title: { type: "string", required: false },
        status: { type: "string", required: false },
        priority: { type: "string", required: false },
        rank: { type: "string", required: false },
        tags: { type: "array", required: false },
        items: { type: "array", required: false },
      },
      canonical_name_fields: ["title"],
    },
    reducer_config: {
      merge_policies: {
        title: { strategy: "last_write" },
        status: { strategy: "last_write" },
        priority: { strategy: "highest_priority", tie_breaker: "source_priority" },
        rank: { strategy: "most_specific" },
        tags: { strategy: "merge_array" },
        items: { strategy: "merge_array_by_key", key_field: "claim_id" },
      },
    },
    activate: true,
  });
}

let entityCounter = 0;

/**
 * Seed an entity with `rows` built by `makeRow(i)`, written directly (without
 * a rebuild per row), then rebuilt once in full, which certifies it.
 */
async function seedEntity(
  label: string,
  count: number,
  makeRow: (i: number, entityId: string) => Record<string, unknown>,
  entityType: string = TYPE
): Promise<string> {
  entityCounter += 1;
  const entityId = `ent_incr_${label}_${process.pid}_${entityCounter}_${Date.now()}`;
  const first = buildObservationRow({
    id: `obs_${entityId}_seed`,
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1.0",
    source_id: null,
    interpretation_id: null,
    observed_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    specificity_score: 0.5,
    source_priority: 0,
    observation_source: "workflow_state",
    fields: { title: `incremental ${label} ${entityCounter}` },
    user_id: USER_ID,
  });
  const { error } = await db.from("observations").insert(first);
  if (error) throw new Error(error.message);
  const raw = await getDb();
  for (let i = 0; i < count; i++) {
    const row = makeRow(i, entityId);
    const columns = Object.keys(row);
    await raw
      .prepare(
        `INSERT INTO observations (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`
      )
      .run(
        ...columns.map((c) =>
          c === "fields" ? JSON.stringify(row[c]) : (row[c] as string | number | null)
        )
      );
  }
  await recomputeSnapshot(entityId, USER_ID);
  return entityId;
}

function randomHistoryRow(rand: () => number) {
  return (i: number, entityId: string): Record<string, unknown> => {
    const isCorrection = rand() < 0.15;
    const fields: Record<string, unknown> = {};
    const carried = isCorrection
      ? [pick(rand, CORRECTABLE)]
      : CORRECTABLE.filter(() => rand() < 0.45);
    for (const field of carried) fields[field] = randomValue(rand, field);
    if (Object.keys(fields).length === 0) fields.status = randomValue(rand, "status");
    // A narrow time range, so equal observed_at values (ties) occur.
    const observedAt = new Date(
      Date.now() - 86_400_000 + Math.floor(rand() * 40) * 1000
    ).toISOString();
    return {
      id: `obs_${entityId}_${i}`,
      entity_id: entityId,
      entity_type: TYPE,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: observedAt,
      created_at: observedAt,
      specificity_score: isCorrection ? 1.0 : pick(rand, [0, 0.3, 0.7, 1.0]),
      source_priority: isCorrection ? 1000 : pick(rand, [0, 1, 2, 5, 2000]),
      observation_source: isCorrection
        ? null
        : pick(rand, ["workflow_state", "llm_summary", "sensor", "human", null]),
      fields,
      user_id: USER_ID,
    };
  };
}

const REDUCED_COLUMNS = [
  "entity_id",
  "entity_type",
  "schema_version",
  "snapshot",
  "provenance",
  "computed_at",
  "observation_count",
  "last_observation_at",
  "user_id",
] as const;

function project(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of REDUCED_COLUMNS) out[column] = row[column] ?? null;
  return JSON.parse(JSON.stringify(out));
}

async function storedRow(entityId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", USER_ID)
    .single();
  if (error || !data) throw new Error(`no snapshot for ${entityId}`);
  return data as Record<string, unknown>;
}

/** A full rebuild of the stored observations, computed without writing. */
async function fullRebuild(entityId: string): Promise<Record<string, unknown>> {
  const observations = await resolveOwnedObservations(entityId, USER_ID);
  const computed = await observationReducer.computeSnapshot(entityId, observations ?? []);
  if (!computed) throw new Error(`full rebuild of ${entityId} returned no snapshot`);
  return computed as unknown as Record<string, unknown>;
}

async function expectEqualsFullRebuild(entityId: string): Promise<void> {
  const stored = await storedRow(entityId);
  const full = await fullRebuild(entityId);
  expect(project(stored)).toEqual(project(full));
  expect(snapshotRowDigest(stored)).toBe(snapshotRowDigest(full));
}

let keyCounter = 0;
async function correct(entityId: string, field: string, value: unknown, entityType: string = TYPE) {
  keyCounter += 1;
  // A correction is stamped with the current millisecond. Two in the same
  // millisecond tie, and a tie (correctly) takes the full rebuild; space them
  // so a test that counts incremental updates is not decided by the clock.
  await new Promise((resolve) => setTimeout(resolve, 2));
  return createCorrection({
    entity_id: entityId,
    entity_type: entityType,
    field,
    value,
    schema_version: "1.0",
    user_id: USER_ID,
    idempotency_key: `incr-${process.pid}-${keyCounter}-${Date.now()}`,
  });
}

/** Hold time (gate acquired to released, queue wait excluded) of each transaction. */
function recordGateHolds(): { holds: number[]; restore: () => void } {
  const holds: number[] = [];
  const original = TransactionGate.prototype.runExclusive;
  const spy = vi.spyOn(TransactionGate.prototype, "runExclusive").mockImplementation(function (
    this: TransactionGate,
    fn,
    describe,
    kind
  ) {
    return original.call(
      this,
      async () => {
        const startedAt = performance.now();
        try {
          return await fn();
        } finally {
          if (kind !== "statement") holds.push(performance.now() - startedAt);
        }
      },
      describe,
      kind
    );
  });
  return { holds, restore: () => spy.mockRestore() };
}

describe("a correction updates the snapshot without re-reducing the history", () => {
  beforeAll(async () => {
    await registerSchema();
  });

  afterAll(async () => {
    await cleanupEntityType(TYPE, USER_ID);
    await cleanupEntityType(SAME_VERSION_TYPE, USER_ID);
    await cleanupTestSchema(TYPE, null);
    await cleanupTestSchema(SAME_VERSION_TYPE, null);
  });

  it("matches a full rebuild after every correction, over randomized histories", async () => {
    resetSnapshotIncrementalStats();
    for (const seed of [1, 7, 42, 1234, 98765]) {
      const rand = prng(seed);
      const entityId = await seedEntity(`random${seed}`, 40, randomHistoryRow(rand));
      await expectEqualsFullRebuild(entityId);
      for (let step = 0; step < 14; step++) {
        const field = pick(rand, CORRECTABLE);
        await correct(entityId, field, randomValue(rand, field));
        await expectEqualsFullRebuild(entityId);
      }
    }
    // The comparison is only meaningful if the incremental path actually ran.
    expect(snapshotIncrementalStats.applied).toBeGreaterThan(30);
    // merge_array_by_key fields always rebuild in full.
    expect(snapshotIncrementalStats.fallbacks.strategy ?? 0).toBeGreaterThan(0);
    const unexpected = Object.keys(snapshotIncrementalStats.fallbacks).filter(
      (reason) => !["strategy", "not_strictly_newer"].includes(reason)
    );
    expect(unexpected).toEqual([]);
  }, 120_000);

  it("does not re-reduce a long history inside the write transaction", async () => {
    const note = "n".repeat(2000);
    const base = Date.now() - 3_600_000;
    const entityId = await seedEntity("long", 2000, (i, id) => {
      const at = new Date(base + i * 10).toISOString();
      return {
        id: `obs_${id}_${i}`,
        entity_id: id,
        entity_type: TYPE,
        schema_version: "1.0",
        observed_at: at,
        created_at: at,
        specificity_score: (i % 7) / 7,
        source_priority: i % 5,
        observation_source: "workflow_state",
        fields: { status: `s${i}`, priority: `p${i % 9}`, tags: [`t${i % 11}`], title: note },
        user_id: USER_ID,
      };
    });
    resetSnapshotIncrementalStats();
    const reductions = vi.spyOn(ObservationReducer.prototype, "computeSnapshot");
    const gate = recordGateHolds();
    let reductionCalls: number;
    try {
      for (let i = 0; i < 5; i++) await correct(entityId, i % 2 ? "status" : "title", `v${i}`);
    } finally {
      // Read before restoring: mockRestore also clears the recorded calls.
      reductionCalls = reductions.mock.calls.length;
      gate.restore();
      reductions.mockRestore();
    }
    // Neither the insert-time materialization nor the service rebuild ran.
    expect(reductionCalls).toBe(0);
    expect(snapshotIncrementalStats.applied).toBe(5);
    expect(gate.holds.length).toBe(5);
    await expectEqualsFullRebuild(entityId);
  }, 120_000);

  it("rebuilds in full when this process holds no certificate, then certifies", async () => {
    const entityId = await seedEntity("nocert", 5, randomHistoryRow(prng(3)));
    forgetSnapshotCertificates();
    resetSnapshotIncrementalStats();
    await correct(entityId, "status", "after restart");
    expect(snapshotIncrementalStats.fallbacks.no_certificate).toBe(1);
    expect(snapshotIncrementalStats.applied).toBe(0);
    await expectEqualsFullRebuild(entityId);
    await correct(entityId, "status", "certified again");
    expect(snapshotIncrementalStats.applied).toBe(1);
    await expectEqualsFullRebuild(entityId);
  });

  it("rebuilds in full when an observation was added without a rebuild", async () => {
    const entityId = await seedEntity("added", 5, randomHistoryRow(prng(4)));
    const raw = await getDb();
    const at = new Date(Date.now() - 60_000).toISOString();
    await raw
      .prepare(
        "INSERT INTO observations (id, entity_id, entity_type, schema_version, observed_at, created_at, specificity_score, source_priority, observation_source, fields, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
      )
      .run(
        `obs_${entityId}_unseen`,
        entityId,
        TYPE,
        "1.0",
        at,
        at,
        0.5,
        3,
        "sensor",
        JSON.stringify({ rank: "unseen" }),
        USER_ID
      );
    resetSnapshotIncrementalStats();
    await correct(entityId, "status", "after unseen write");
    expect(snapshotIncrementalStats.fallbacks.observations_changed).toBe(1);
    await expectEqualsFullRebuild(entityId);
  });

  it("rebuilds in full when another writer replaced the stored snapshot", async () => {
    const entityId = await seedEntity("replaced", 5, randomHistoryRow(prng(5)));
    const raw = await getDb();
    await raw
      .prepare("UPDATE entity_snapshots SET snapshot = ? WHERE entity_id = ?")
      .run(JSON.stringify({ title: "tampered" }), entityId);
    resetSnapshotIncrementalStats();
    await correct(entityId, "status", "after replacement");
    expect(snapshotIncrementalStats.fallbacks.snapshot_changed).toBe(1);
    await expectEqualsFullRebuild(entityId);
  });

  it("rebuilds in full when a stored observation is not older than the correction", async () => {
    const entityId = await seedEntity("future", 3, (i, id) => {
      const at = new Date(Date.now() + 3_600_000 + i).toISOString();
      return {
        id: `obs_${id}_${i}`,
        entity_id: id,
        entity_type: TYPE,
        schema_version: "1.0",
        observed_at: at,
        created_at: at,
        specificity_score: 0.5,
        source_priority: 1,
        observation_source: "sensor",
        fields: { status: `future${i}` },
        user_id: USER_ID,
      };
    });
    resetSnapshotIncrementalStats();
    await correct(entityId, "status", "older than the history");
    expect(snapshotIncrementalStats.fallbacks.not_strictly_newer).toBe(1);
    await expectEqualsFullRebuild(entityId);
  });

  it("rebuilds in full for a merge_array_by_key field", async () => {
    const entityId = await seedEntity("bykey", 5, randomHistoryRow(prng(6)));
    resetSnapshotIncrementalStats();
    await correct(entityId, "items", [{ claim_id: "c1", state: "corrected" }]);
    expect(snapshotIncrementalStats.fallbacks.strategy).toBe(1);
    await expectEqualsFullRebuild(entityId);
  });

  it("never plans an incremental update for the lifecycle marker or other reserved fields", async () => {
    const entityId = await seedEntity("reserved", 2, randomHistoryRow(prng(8)));
    resetSnapshotIncrementalStats();
    const row = buildObservationRow({
      id: `obs_${entityId}_marker`,
      entity_id: entityId,
      entity_type: TYPE,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 1.0,
      source_priority: 1000,
      fields: { _deleted: true },
      user_id: USER_ID,
    });
    const plan = await planIncrementalCorrection({
      entityId,
      entityType: TYPE,
      userId: USER_ID,
      field: "_deleted",
      row,
    });
    expect(plan).toBeNull();
    expect(snapshotIncrementalStats.fallbacks.reserved_field).toBe(1);
  });

  it("rebuilds in full after a same-version schema change", async () => {
    const register = (fields: string[]) =>
      schemaRegistry.register({
        entity_type: SAME_VERSION_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: Object.fromEntries(fields.map((f) => [f, { type: "string", required: false }])),
          canonical_name_fields: ["title"],
        },
        reducer_config: {
          merge_policies: Object.fromEntries(
            fields.map((f) => [f, { strategy: "last_write" as const }])
          ),
        },
        activate: true,
      });
    await register(["title", "status"]);
    const entityId = await seedEntity(
      "sameversion",
      3,
      (i, id) => {
        const at = new Date(Date.now() - 60_000 + i).toISOString();
        return {
          id: `obs_${id}_${i}`,
          entity_id: id,
          entity_type: SAME_VERSION_TYPE,
          schema_version: "1.0",
          observed_at: at,
          created_at: at,
          specificity_score: 0.5,
          source_priority: 1,
          observation_source: "sensor",
          fields: { status: `s${i}`, notes: `kept in history ${i}` },
          user_id: USER_ID,
        };
      },
      SAME_VERSION_TYPE
    );
    expect((await storedRow(entityId)).snapshot).not.toHaveProperty("notes");
    // Same version string, one more declared field: the history's `notes`
    // values now belong in the snapshot, which only a full rebuild can find.
    await register(["title", "status", "notes"]);
    resetSnapshotIncrementalStats();
    await correct(entityId, "status", "after schema change", SAME_VERSION_TYPE);
    expect(snapshotIncrementalStats.fallbacks.schema_changed).toBe(1);
    expect((await storedRow(entityId)).snapshot).toHaveProperty("notes");
    await expectEqualsFullRebuild(entityId);
  });

  it("forgets the certificates of a user whose observations were erased in place", async () => {
    const entityId = await seedEntity("erased", 3, randomHistoryRow(prng(9)));
    await cryptographicErasure(USER_ID, entityId);
    resetSnapshotIncrementalStats();
    await correct(entityId, "status", "after erasure");
    expect(snapshotIncrementalStats.fallbacks.no_certificate).toBe(1);
    await expectEqualsFullRebuild(entityId);
  });
});
