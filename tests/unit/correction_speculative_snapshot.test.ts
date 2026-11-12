import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import {
  correctionSpeculationStats,
  speculationTestHooks,
  MAX_SPECULATIVE_ATTEMPTS,
  createCorrection,
  createCorrectionWithVersionPrecondition,
  FieldVersionConflictError,
} from "../../src/services/correction.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { buildObservationRow } from "../../src/services/observation_insert.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { fingerprintOwnedObservations } from "../../src/services/attachment_resolution.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { stableSerialize } from "../../src/services/stable_serialize.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { TransactionGate } from "../../src/repositories/db/driver.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_correct_speculative_snapshot";
const BULK_OBSERVATIONS = 2000;
const SAMPLES = 7;

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

async function registerMainSchema(): Promise<void> {
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
}

describe("correct holds the write gate for a short, history-independent time", () => {
  beforeAll(async () => {
    await registerMainSchema();
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
    const { restore } = recordGateHolds();
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
      for (let i = 0; i < SAMPLES; i++) {
        holds.length = 0;
        await database.transaction(() =>
          createCorrection({ ...correction(100 + i), in_transaction: true })
        );
        legacy.push(holds[holds.length - 1]);
      }
      // New path.
      const optimistic: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        holds.length = 0;
        await createCorrection(correction(200 + i));
        optimistic.push(holds[holds.length - 1]);
      }
      const best = (xs: number[]) => Math.min(...xs);
      // eslint-disable-next-line no-console
      console.log(
        `[gate hold, ${BULK_OBSERVATIONS} observations] in-transaction recompute ` +
          `${legacy.map((x) => x.toFixed(0)).join("/")} ms (best ${best(legacy).toFixed(0)}); ` +
          `optimistic ${optimistic.map((x) => x.toFixed(0)).join("/")} ms (best ${best(optimistic).toFixed(0)})`
      );
      // Best of N, not median: a scheduler stall inflates one sample, never all of them.
      expect(best(optimistic)).toBeLessThan(best(legacy) * 0.5);
    } finally {
      restore();
    }
    const persisted = await storedSnapshot(entityId);
    await recomputeSnapshot(entityId, USER_ID);
    expect(persisted).toBe(await storedSnapshot(entityId));
  }, 120_000);
});

describe("optimistic correction path: retries, fallbacks and skip conditions", () => {
  const snap = () => ({
    attempts: correctionSpeculationStats.attempts,
    retries: correctionSpeculationStats.staleRetries,
    fast: correctionSpeculationStats.fastPathPersists,
    fallbacks: { ...correctionSpeculationStats.fallbacks },
  });
  const delta = (before: ReturnType<typeof snap>) => {
    const now = snap();
    const reasons: Record<string, number> = {};
    for (const [k, v] of Object.entries(now.fallbacks)) {
      const d = v - (before.fallbacks[k] ?? 0);
      if (d) reasons[k] = d;
    }
    return {
      attempts: now.attempts - before.attempts,
      retries: now.retries - before.retries,
      fast: now.fast - before.fast,
      reasons,
    };
  };
  const base = (entityId: string, n: string, extra: Record<string, unknown> = {}) => ({
    entity_id: entityId,
    entity_type: TYPE,
    field: "notes",
    value: `value ${n}`,
    schema_version: "1.0",
    user_id: USER_ID,
    idempotency_key: `path-${n}-${Date.now()}-${Math.random()}`,
    ...extra,
  });
  const insertOlder = async (entityId: string, id: string, agoMs: number) => {
    const row = buildObservationRow({
      id,
      entity_id: entityId,
      entity_type: TYPE,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date(Date.now() - agoMs).toISOString(),
      specificity_score: 0.5,
      source_priority: 1,
      observation_source: "workflow_state",
      fields: { status: "interloper" },
      user_id: USER_ID,
    });
    const { error } = await db.from("observations").insert(row).withoutSnapshotMaterialization();
    if (error) throw new Error(error.message);
  };
  const expectSnapshotMatchesFullRecompute = async (entityId: string) => {
    const persisted = await storedSnapshot(entityId);
    await recomputeSnapshot(entityId, USER_ID);
    expect(await storedSnapshot(entityId)).toBe(persisted);
  };
  const withHook = async (
    hook: (attempt: number) => Promise<void>,
    run: () => Promise<unknown>
  ) => {
    speculationTestHooks.afterSpeculate = hook;
    try {
      return await run();
    } finally {
      speculationTestHooks.afterSpeculate = undefined;
    }
  };

  beforeAll(async () => {
    await registerMainSchema();
  });
  afterAll(async () => {
    await cleanupEntityType(TYPE, USER_ID);
    await cleanupTestSchema(TYPE, null);
  });

  it("retries once when the entity changes after the read, then commits on the fast path", async () => {
    const entityId = await seedEntity("retry-once", 30);
    const before = snap();
    await withHook(
      async (attempt) => {
        if (attempt === 0) await insertOlder(entityId, `obs_hook_${entityId}_a`, 5000);
      },
      () => createCorrection(base(entityId, "retry-once"))
    );
    const d = delta(before);
    expect(d).toMatchObject({ attempts: 2, retries: 1, fast: 1, reasons: {} });
    await expectSnapshotMatchesFullRecompute(entityId);
  });

  it("falls back to the in-transaction recompute after MAX_SPECULATIVE_ATTEMPTS stale attempts", async () => {
    const entityId = await seedEntity("stale-always", 30);
    const before = snap();
    await withHook(
      async (attempt) => {
        await insertOlder(entityId, `obs_hook_${entityId}_${attempt}`, 5000 + attempt);
      },
      () => createCorrection(base(entityId, "stale-always"))
    );
    const d = delta(before);
    expect(d.attempts).toBe(MAX_SPECULATIVE_ATTEMPTS);
    expect(d.retries).toBe(MAX_SPECULATIVE_ATTEMPTS);
    expect(d.fast).toBe(0);
    expect(d.reasons).toEqual({ "stale_exhausted:observations_changed": 1 });
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect((after!.snapshot as Record<string, unknown>).notes).toBe("value stale-always");
    await expectSnapshotMatchesFullRecompute(entityId);
  });

  it("deleting an observation between the read and the commit forces a retry", async () => {
    const entityId = await seedEntity("deleted-row", 30);
    const before = snap();
    await withHook(
      async (attempt) => {
        if (attempt === 0) {
          const { error } = await db
            .from("observations")
            .delete()
            .eq("id", `obs_spec_${entityId}_3`);
          if (error) throw new Error(error.message);
        }
      },
      () => createCorrection(base(entityId, "deleted-row"))
    );
    expect(delta(before)).toMatchObject({ attempts: 2, retries: 1, fast: 1 });
    await expectSnapshotMatchesFullRecompute(entityId);
  });

  it("changes the fingerprint when the highest rowid is deleted and one row is inserted", async () => {
    const entityId = await seedEntity("rowid-reuse", 5);
    await insertOlder(entityId, `obs_rowid_last_${entityId}`, 10_000);
    const before = await fingerprintOwnedObservations(entityId, USER_ID);
    const { error } = await db.from("observations").delete().eq("id", `obs_rowid_last_${entityId}`);
    if (error) throw new Error(error.message);
    await insertOlder(entityId, `obs_rowid_other_${entityId}`, 20_000);
    expect(await fingerprintOwnedObservations(entityId, USER_ID)).not.toBe(before);
  });

  it("fingerprints the resolved entity, following the same rule as attachment resolution", async () => {
    const survivor = await seedEntity("fp-survivor", 4);
    const tombstone = await seedEntity("fp-tombstone", 2);
    const survivorFp = await fingerprintOwnedObservations(survivor, USER_ID);
    expect(survivorFp.startsWith(`${survivor}:`)).toBe(true);
    await db.from("entities").update({ merged_to_entity_id: survivor }).eq("id", tombstone);
    const redirected = await fingerprintOwnedObservations(tombstone, USER_ID);
    expect(redirected).toBe(survivorFp);
  });

  describe("skip conditions never persist a speculative snapshot", () => {
    const expectSkip = async (reason: string, run: () => Promise<unknown>, rejects = false) => {
      const before = snap();
      if (rejects) await expect(run()).rejects.toBeDefined();
      else await run();
      const d = delta(before);
      expect(d.fast).toBe(0);
      expect(d.attempts).toBe(0);
      expect(d.reasons).toEqual({ [reason]: 1 });
    };

    it("lifecycle marker", async () => {
      const entityId = await seedEntity("skip-lifecycle", 5);
      await expectSkip("lifecycle_marker", () =>
        createCorrection({ ...base(entityId, "lifecycle"), field: "_deleted", value: true })
      );
    });

    it("grouped receipt", async () => {
      const entityId = await seedEntity("skip-grouped", 5);
      await expectSkip("grouped_receipt", () =>
        createCorrection({
          ...base(entityId, "grouped"),
          canonical_hash: "grouped-hash",
          deferred_events: [],
        })
      );
    });

    it("new observation not strictly newer than a stored one", async () => {
      const entityId = await seedEntity("skip-newer", 5);
      await insertOlder(entityId, `obs_future_${entityId}`, -3_600_000);
      await expectSkip("not_strictly_newer", () => createCorrection(base(entityId, "newer")));
      await expectSnapshotMatchesFullRecompute(entityId);
    });

    it("entity of a different type", async () => {
      const entityId = await seedEntity("skip-type", 5);
      await expectSkip(
        "entity_unavailable",
        () => createCorrection({ ...base(entityId, "type"), entity_type: "some_other_type" }),
        true
      );
    });

    it("entity owned by another user", async () => {
      const entityId = await seedEntity("skip-owner", 5);
      await db.from("entities").update({ user_id: "some-other-owner" }).eq("id", entityId);
      await expectSkip("entity_unavailable", () => createCorrection(base(entityId, "owner")), true);
    });

    it("merged entity", async () => {
      const entityId = await seedEntity("skip-merged", 5);
      const survivor = await seedEntity("skip-merged-survivor", 5);
      await db.from("entities").update({ merged_to_entity_id: survivor }).eq("id", entityId);
      const before = snap();
      await createCorrection(base(entityId, "merged")).catch(() => undefined);
      const d = delta(before);
      expect(d.fast).toBe(0);
      expect(d.reasons).toEqual({ entity_unavailable: 1 });
    });

    it("idempotent replay skips the off-gate read", async () => {
      const entityId = await seedEntity("skip-replay", 5);
      const params = base(entityId, "replay");
      await createCorrection(params);
      const before = snap();
      const replay = await createCorrection(params);
      expect(replay.replayed).toBe(true);
      const d = delta(before);
      expect(d.fast).toBe(0);
      expect(d.attempts).toBe(0);
      expect(d.reasons).toEqual({ replay: 1 });
    });
  });

  it("a same-version schema activated between the read and the transaction is applied", async () => {
    const SCHEMA_TYPE = `${TYPE}_same_version`;
    const definition = (fields: string[]) => ({
      fields: Object.fromEntries(fields.map((f) => [f, { type: "string", required: false }])),
      canonical_name_fields: ["title"],
    });
    const register = (fields: string[]) =>
      schemaRegistry.register({
        entity_type: SCHEMA_TYPE,
        schema_version: "1.0",
        schema_definition: definition(fields),
        reducer_config: {
          merge_policies: Object.fromEntries(
            fields.map((f) => [f, { strategy: "last_write" as const }])
          ),
        },
        activate: true,
      });
    try {
      await register(["title", "notes"]);
      const server = new NeotomaServer();
      (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;
      const stored = await callStore(server, {
        user_id: USER_ID,
        idempotency_key: `seed-same-version-${Date.now()}`,
        commit: true,
        entities: [{ entity_type: SCHEMA_TYPE, title: "same version", notes: "old" }],
      });
      const entityId = (
        JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> }
      ).entities[0].entity_id;

      const before = snap();
      await withHook(
        async (attempt) => {
          // Same version string, different field set: `notes` is no longer declared.
          if (attempt === 0) await register(["title"]);
        },
        () =>
          createCorrection({
            ...base(entityId, "same-version"),
            entity_type: SCHEMA_TYPE,
            field: "title",
            value: "same version, renamed",
          })
      );
      const d = delta(before);
      expect(d.retries).toBe(1);
      expect(d.fast).toBe(1);
      const persistedRaw = await storedSnapshot(entityId);
      expect(JSON.parse(persistedRaw).snapshot).not.toHaveProperty("notes");
      await recomputeSnapshot(entityId, USER_ID);
      expect(await storedSnapshot(entityId)).toBe(persistedRaw);
    } finally {
      await cleanupEntityType(SCHEMA_TYPE, USER_ID);
      await cleanupTestSchema(SCHEMA_TYPE, null);
    }
  });
});
