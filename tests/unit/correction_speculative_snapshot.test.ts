import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import {
  createCorrection,
  createCorrectionWithVersionPrecondition,
  FieldVersionConflictError,
} from "../../src/services/correction.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import {
  buildObservationRow,
  insertObservationRow,
} from "../../src/services/observation_insert.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { stableSerialize } from "../../src/services/stable_serialize.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { TransactionGate } from "../../src/repositories/db/driver.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_correct_speculative_snapshot";
const BULK_OBSERVATIONS = 2000;

function callStore(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).store(params);
}

async function storedSnapshot(entityId: string): Promise<string> {
  const { data } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", USER_ID)
    .single();
  return stableSerialize(data);
}

async function seedEntity(label: string, bulk: number): Promise<string> {
  const server = new NeotomaServer();
  (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;
  const stored = await callStore(server, {
    user_id: USER_ID,
    idempotency_key: `seed-spec-${label}-${Date.now()}-${Math.random()}`,
    commit: true,
    entities: [
      {
        entity_type: TYPE,
        title: `speculative ${label}`,
        status: "open",
        priority: "low",
        tags: ["seed"],
        items: [{ claim_id: "a", state: "queued" }],
      },
    ],
  });
  const body = JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> };
  const entityId = body.entities[0].entity_id;
  // A long history of ordinary writes, all older than "now".
  const base = Date.now() - 3_600_000;
  for (let start = 0; start < bulk; start += 250) {
    const rows = [];
    for (let i = start; i < Math.min(bulk, start + 250); i++) {
      rows.push(
        buildObservationRow({
          id: `obs_spec_${entityId}_${i}`,
          entity_id: entityId,
          entity_type: TYPE,
          schema_version: "1.0",
          source_id: null,
          interpretation_id: null,
          observed_at: new Date(base + i * 10).toISOString(),
          specificity_score: (i % 7) / 7,
          source_priority: i % 5,
          observation_source: "workflow_state",
          fields: {
            status: i % 2 ? "open" : "closed",
            priority: `p${i % 9}`,
            tags: [`t${i % 11}`],
            items: [{ claim_id: `c${i % 13}`, state: `s${i}` }],
          },
          user_id: USER_ID,
        })
      );
    }
    const { error } = await db.from("observations").insert(rows).withoutSnapshotMaterialization();
    if (error) throw new Error(error.message);
  }
  await recomputeSnapshot(entityId, USER_ID);
  return entityId;
}

/** Hold time (gate acquired to released, queue wait excluded) of every transaction run. */
function recordGateHolds(): { holds: number[]; restore: () => void } {
  const holds: number[] = [];
  const original = TransactionGate.prototype.runExclusive;
  const spy = vi.spyOn(TransactionGate.prototype, "runExclusive").mockImplementation(function (
    this: TransactionGate,
    fn,
    describe
  ) {
    return original.call(
      this,
      async () => {
        const startedAt = performance.now();
        try {
          return await fn();
        } finally {
          holds.push(performance.now() - startedAt);
        }
      },
      describe
    );
  });
  return { holds, restore: () => spy.mockRestore() };
}

describe("correct holds the write gate for a short, history-independent time", () => {
  beforeAll(async () => {
    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: false },
          status: { type: "string", required: false },
          priority: { type: "string", required: false },
          notes: { type: "string", required: false },
          tags: { type: "array", required: false },
          items: { type: "array", required: false },
        },
        canonical_name_fields: ["title"],
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          status: { strategy: "last_write" },
          notes: { strategy: "last_write" },
          priority: { strategy: "highest_priority" },
          tags: { strategy: "merge_array" },
          items: { strategy: "merge_array_by_key", key_field: "claim_id" },
        },
      },
      activate: true,
    });
  });

  afterAll(async () => {
    await cleanupEntityType(TYPE, USER_ID);
    await cleanupTestSchema(TYPE, null);
  });

  it("persists the same snapshot a full recompute of the stored observations produces", async () => {
    const entityId = await seedEntity("equivalence", 60);
    const writes: Array<[string, unknown]> = [
      ["notes", "first note"],
      ["priority", "p-corrected"],
      ["tags", ["x", "y"]],
      ["items", [{ claim_id: "a", state: "done" }]],
      ["status", null],
    ];
    for (const [field, value] of writes) {
      const result = await createCorrection({
        entity_id: entityId,
        entity_type: TYPE,
        field,
        value,
        schema_version: "1.0",
        user_id: USER_ID,
        idempotency_key: `eq-${field}-${Date.now()}`,
      });
      expect(result.replayed).toBe(false);
      const persisted = await storedSnapshot(entityId);
      await recomputeSnapshot(entityId, USER_ID);
      expect(persisted).toBe(await storedSnapshot(entityId));
    }
  });

  it("falls back to the in-transaction recompute when the entity changes between read and write", async () => {
    const entityId = await seedEntity("stale", 20);
    const { holds, restore } = recordGateHolds();
    try {
      // A writer that lands between the speculative read and the gate.
      const interloper = createCorrection({
        entity_id: entityId,
        entity_type: TYPE,
        field: "notes",
        value: "interloper",
        schema_version: "1.0",
        user_id: USER_ID,
        idempotency_key: `stale-a-${Date.now()}`,
      });
      const mine = createCorrection({
        entity_id: entityId,
        entity_type: TYPE,
        field: "notes",
        value: "second",
        schema_version: "1.0",
        user_id: USER_ID,
        idempotency_key: `stale-b-${Date.now()}`,
      });
      await Promise.all([interloper, mine]);
    } finally {
      restore();
    }
    const persisted = await storedSnapshot(entityId);
    await recomputeSnapshot(entityId, USER_ID);
    expect(persisted).toBe(await storedSnapshot(entityId));
    const { data } = await db.from("observations").select("id").eq("entity_id", entityId);
    expect((data ?? []).filter((r: { id: string }) => !r.id.startsWith("obs_spec_")).length).toBe(
      3
    );
  });

  it("racing corrections end on the later observation, and stale expected_version still rejects", async () => {
    const entityId = await seedEntity("race", 20);
    const before = await getEntityWithProvenance(entityId, false, USER_ID);
    const version = before!.entity_version!;
    const attempts = await Promise.allSettled(
      [1, 2, 3].map((n) =>
        createCorrectionWithVersionPrecondition({
          entity_id: entityId,
          entity_type: TYPE,
          field: "notes",
          value: `racer ${n}`,
          schema_version: "1.0",
          user_id: USER_ID,
          idempotency_key: `race-${n}-${Date.now()}`,
          expected_version: version,
        })
      )
    );
    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(FieldVersionConflictError);
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ value: unknown }>).value.value;
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect((after!.snapshot as Record<string, unknown>).notes).toBe(winner);
    const persisted = await storedSnapshot(entityId);
    await recomputeSnapshot(entityId, USER_ID);
    expect(persisted).toBe(await storedSnapshot(entityId));
  });

  it("two unconditional corrections racing on one field converge on the later one", async () => {
    const entityId = await seedEntity("race2", 20);
    const results = await Promise.all(
      ["one", "two", "three", "four"].map((v) =>
        createCorrection({
          entity_id: entityId,
          entity_type: TYPE,
          field: "notes",
          value: v,
          schema_version: "1.0",
          user_id: USER_ID,
          idempotency_key: `race2-${v}-${Date.now()}`,
        })
      )
    );
    const latest = [...results].sort(
      (a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at)
    )[0];
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect((after!.snapshot as Record<string, unknown>).notes).toBe(latest.value);
    const persisted = await storedSnapshot(entityId);
    await recomputeSnapshot(entityId, USER_ID);
    expect(persisted).toBe(await storedSnapshot(entityId));
  });

  it(`holds the write gate far shorter than a full in-transaction recompute at ${BULK_OBSERVATIONS} observations`, async () => {
    const entityId = await seedEntity("hold", BULK_OBSERVATIONS);
    const database = await getDb();
    const correction = (n: number) => ({
      entity_id: entityId,
      entity_type: TYPE,
      field: "notes",
      value: `hold ${n}`,
      schema_version: "1.0",
      user_id: USER_ID,
      idempotency_key: `hold-${n}-${Date.now()}`,
    });
    const { holds, restore } = recordGateHolds();
    try {
      // Baseline: no speculation (read and reduce inside the transaction).
      const legacy: number[] = [];
      for (let i = 0; i < 3; i++) {
        holds.length = 0;
        await database.transaction(() =>
          createCorrection({ ...correction(100 + i), in_transaction: true })
        );
        legacy.push(holds[holds.length - 1]);
      }
      // New path.
      const optimistic: number[] = [];
      for (let i = 0; i < 3; i++) {
        holds.length = 0;
        await createCorrection(correction(200 + i));
        optimistic.push(holds[holds.length - 1]);
      }
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      // eslint-disable-next-line no-console
      console.log(
        `[gate hold, ${BULK_OBSERVATIONS} observations] in-transaction recompute ` +
          `${legacy.map((x) => x.toFixed(0)).join("/")} ms (median ${median(legacy).toFixed(0)}); ` +
          `optimistic ${optimistic.map((x) => x.toFixed(0)).join("/")} ms (median ${median(optimistic).toFixed(0)})`
      );
      expect(median(optimistic)).toBeLessThan(median(legacy) * 0.5);
    } finally {
      restore();
    }
    const persisted = await storedSnapshot(entityId);
    await recomputeSnapshot(entityId, USER_ID);
    expect(persisted).toBe(await storedSnapshot(entityId));
  }, 120_000);
});
