import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../db.js";
import { config } from "../config.js";
import { getDb } from "../repositories/db/connection.js";
import { AsyncSqliteDatabase } from "../repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../repositories/libsql/libsql_driver.js";
import { WorkerFileDatabase } from "../repositories/worker/worker_file_database.js";
import { recomputeSnapshot } from "./snapshot_computation.js";
import {
  getEntityWithProvenance,
  listObservationCountsForVisibleIds,
  listVisibleEntityIdsForType,
  queryEntities,
} from "./entity_queries.js";
import { SchemaRegistryService } from "./schema_registry.js";
import { snapshotSchemaBasis } from "./snapshot_schema_basis.js";
import { createCorrectionWithVersionPrecondition } from "./correction.js";
import { softDeleteEntity } from "./deletion.js";
import { runWithRequestContext } from "./request_context.js";
import * as instancePolicy from "./instance_policy.js";
import { substrateEventBus } from "../events/substrate_event_bus.js";
import {
  applyCorrectionTransaction,
  type CorrectionTransactionOptions,
} from "./correction_transaction.js";
const user = "test-atomic-corrections";
const fields = {
  title: { type: "string" },
  status: { type: "string" },
  remaining: { type: "number" },
};
const schema = {
  id: "test-schema",
  entity_type: "atomic_test",
  schema_version: "1.0",
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  schema_definition: { fields, canonical_name_fields: ["title"] },
  reducer_config: {
    merge_policies: Object.fromEntries(
      Object.keys(fields).map((field) => [
        field,
        { strategy: "highest_priority", tie_breaker: "observed_at" },
      ])
    ),
  },
};
const events: unknown[] = [];
const listener = (event: unknown) => events.push(event);
async function seed(id: string, snapshot: Record<string, unknown>, owner = user) {
  let r = await db
    .from("entities")
    .insert({ id, entity_type: "atomic_test", canonical_name: id, user_id: owner });
  expect(r.error).toBeNull();
  r = await db.from("observations").insert({
    id: `seed-${id}`,
    entity_id: id,
    entity_type: "atomic_test",
    user_id: owner,
    fields: snapshot,
    schema_version: "1.0",
    source_priority: 10,
    observed_at: "2026-01-01T00:00:00.000Z",
  });
  expect(r.error).toBeNull();
  await recomputeSnapshot(id, owner);
}
async function snapshot(id: string) {
  return (await getEntityWithProvenance(id, false, user))?.snapshot;
}
async function revisions(ids: string[]) {
  return Promise.all(
    ids.map(async (entity_id) => {
      const current = await getEntityWithProvenance(entity_id, false, user);
      if (!current?.content_revision) throw new Error(`Missing content revision for ${entity_id}`);
      return {
        entity_id,
        observation_count: current.observation_count,
        content_revision: current.content_revision,
      };
    })
  );
}
function request(key = "approve-1"): CorrectionTransactionOptions {
  return {
    user_id: user,
    idempotency_key: key,
    entities: [
      {
        entity_id: "ent_atomic_draft",
        entity_type: "atomic_test",
        expected_observation_count: 1,
        expected_snapshot: { status: "ready" },
        changes: [{ field: "status", value: "approved" }],
      },
      {
        entity_id: "ent_atomic_source",
        entity_type: "atomic_test",
        expected_observation_count: 1,
        expected_snapshot: { remaining: 1 },
        changes: [{ field: "remaining", value: 0 }],
      },
    ],
  };
}
beforeEach(async () => {
  const registered = await db
    .from("schema_registry")
    .upsert({ ...schema, user_id: user, scope: "user" }, { onConflict: "id" });
  expect(registered.error).toBeNull();
  for (const owner of [user, "test-other-graph"])
    for (const table of ["observations", "entity_snapshots", "entities"])
      await db.from(table).delete().eq("user_id", owner);
  await seed("ent_atomic_draft", { title: "Draft", status: "ready" });
  await seed("ent_atomic_source", { title: "Source", remaining: 1 });
  events.length = 0;
  substrateEventBus.onSubstrateEvent(listener);
});
afterEach(async () => {
  substrateEventBus.removeListener("substrate_event", listener);
  vi.restoreAllMocks();
  const connection = await getDb();
  await connection.exec("DROP TRIGGER IF EXISTS fail_atomic_source");
  await connection.exec("DROP TRIGGER IF EXISTS fail_atomic_second_change");
});
describe("scoped atomic correction transaction", () => {
  it("compares an unchanged participant inside the write transaction without recording it", async () => {
    const input = request("guard-unchanged-source");
    input.entities[1].changes = [];
    const before = await db.from("observations").select("id").eq("user_id", user);
    const applied = await applyCorrectionTransaction(input);
    expect(applied.status).toBe("applied");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "approved" });
    expect(await snapshot("ent_atomic_source")).toMatchObject({ remaining: 1 });
    const after = await db.from("observations").select("id,entity_id").eq("user_id", user);
    expect(after.data).toHaveLength((before.data?.length ?? 0) + 1);
    expect(after.data?.filter((row) => row.entity_id === "ent_atomic_source")).toHaveLength(1);
    expect(events).toHaveLength(2);
    expect((await applyCorrectionTransaction(input)).status).toBe("replayed");
    expect(events).toHaveLength(2);
    const changed = structuredClone(input);
    changed.entities[1].expected_snapshot = { remaining: 0 };
    await expect(applyCorrectionTransaction(changed)).rejects.toThrow(/idempotency/i);
    expect(events).toHaveLength(2);
  });
  it("refuses a stale guard before any writer correction or notification", async () => {
    const input = request("stale-unchanged-source");
    input.entities[1].changes = [];
    const inserted = await db.from("observations").insert({
      id: "test-atomic-guard-advance",
      entity_id: "ent_atomic_source",
      entity_type: "atomic_test",
      user_id: user,
      fields: { remaining: 0 },
      schema_version: "1.0",
      source_priority: 20,
      observed_at: "2026-01-02T00:00:00.000Z",
    });
    expect(inserted.error).toBeNull();
    await recomputeSnapshot("ent_atomic_source", user);
    events.length = 0;
    await expect(applyCorrectionTransaction(input)).rejects.toThrow(/precondition/);
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(events).toHaveLength(0);
    const rows = await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft");
    expect(rows.data).toHaveLength(1);
  });
  it("compares a complete visible type population before correcting the writer", async () => {
    const input = request("population-unchanged");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ["ent_atomic_draft", "ent_atomic_source"],
      },
    ];
    expect((await applyCorrectionTransaction(input)).status).toBe("applied");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "approved" });
    await seed("ent_atomic_later_source", { title: "Later source", remaining: 2 });
    expect((await applyCorrectionTransaction(input)).status).toBe("replayed");
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(2);
    const changed = structuredClone(input);
    changed.populations![0].expected_entity_ids = ["ent_atomic_draft"];
    await expect(applyCorrectionTransaction(changed)).rejects.toThrow(/idempotency/i);
  });

  it("refuses a source inserted after complete inventory, leaving the existing writer untouched", async () => {
    const stale = request("population-inserted");
    stale.entities[1].changes = [];
    stale.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ["ent_atomic_draft", "ent_atomic_source"],
      },
    ];
    await seed("ent_atomic_new_source", { title: "New source", remaining: 2 });
    events.length = 0;
    const outcome = await applyCorrectionTransaction(stale).catch((error: Error) => error);
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
    expect(events).toHaveLength(0);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as { code?: string }).code).toBe("CONFLICT");
  });
  it("refuses an edit to a previously nonselected source across more than 50 visible rows", async () => {
    const ids = ["ent_atomic_draft", "ent_atomic_source"];
    for (let index = 0; index < 49; index++) {
      const id = `ent_atomic_unselected_${index}`;
      await seed(id, { title: `Unselected ${index}`, remaining: 1 });
      ids.push(id);
    }
    expect(ids.length).toBeGreaterThan(50);
    const input = request("population-existing-row-edit");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ids,
        expected_observation_counts: await revisions(ids),
      },
    ];
    const edited = ids[ids.length - 1];
    expect(
      (
        await db.from("observations").insert({
          id: "edit-previously-unselected",
          entity_id: edited,
          entity_type: "atomic_test",
          user_id: user,
          fields: { remaining: 2 },
          schema_version: "1.0",
          source_priority: 20,
          observed_at: "2026-01-02T00:00:00.000Z",
        })
      ).error
    ).toBeNull();
    await recomputeSnapshot(edited, user);
    events.length = 0;
    const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as { code?: string }).code).toBe("CONFLICT");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("accepts a complete unchanged revision set, and binds it into idempotency", async () => {
    const input = request("population-revision-positive");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ["ent_atomic_source", "ent_atomic_draft"],
        expected_observation_counts: await revisions(["ent_atomic_source", "ent_atomic_draft"]),
      },
    ];
    expect((await applyCorrectionTransaction(input)).status).toBe("applied");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "approved" });
    expect((await applyCorrectionTransaction(input)).status).toBe("replayed");
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(2);
    const changed = structuredClone(input);
    changed.populations![0].expected_observation_counts![1].observation_count = 2;
    const outcome = await applyCorrectionTransaction(changed).catch((error: Error) => error);
    expect((outcome as { code?: string }).code).toBe("IDEMPOTENCY_CONFLICT");
  });
  it("refuses an accepted but unmaterialized observation in an unselected population row", async () => {
    await seed("ent_atomic_lagged", { title: "Unselected", remaining: 1 });
    const input = request("population-unmaterialized-observation");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ["ent_atomic_draft", "ent_atomic_lagged", "ent_atomic_source"],
        expected_observation_counts: await revisions([
          "ent_atomic_draft",
          "ent_atomic_lagged",
          "ent_atomic_source",
        ]),
      },
    ];
    // The local adapter normally materializes on insert. Restore the prior
    // materialized row to represent the accepted-observation/failing-upsert
    // state that the interpretation path can persist.
    const connection = await getDb();
    const priorSnapshot = (await connection
      .prepare(
        "SELECT snapshot, provenance, observation_count FROM entity_snapshots WHERE entity_id = ?"
      )
      .get("ent_atomic_lagged")) as {
      snapshot: string;
      provenance: string;
      observation_count: number;
    };
    expect(
      (
        await db.from("observations").insert({
          id: "accepted-but-not-materialized",
          entity_id: "ent_atomic_lagged",
          entity_type: "atomic_test",
          user_id: user,
          fields: { remaining: 2 },
          schema_version: "1.0",
          source_priority: 20,
          observed_at: "2026-01-02T00:00:00.000Z",
        })
      ).error
    ).toBeNull();
    await connection
      .prepare(
        "UPDATE entity_snapshots SET snapshot = ?, provenance = ?, observation_count = ? WHERE entity_id = ?"
      )
      .run(
        priorSnapshot.snapshot,
        priorSnapshot.provenance,
        priorSnapshot.observation_count,
        "ent_atomic_lagged"
      );
    const laggedSnapshot = await db
      .from("entity_snapshots")
      .select("observation_count")
      .eq("entity_id", "ent_atomic_lagged")
      .single();
    expect(laggedSnapshot.data?.observation_count).toBe(1);
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_lagged")).data
    ).toHaveLength(2);
    events.length = 0;
    const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
    expect((outcome as { code?: string }).code).toBe("CONFLICT");
    expect((outcome as Error).message).toContain("population revision");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("refuses a count-preserving projected content change in an unselected row", async () => {
    await seed("ent_atomic_projection", { title: "Unselected", remaining: 1 });
    const ids = ["ent_atomic_draft", "ent_atomic_projection", "ent_atomic_source"];
    const input = request("population-content-change");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ids,
        expected_observation_counts: await revisions(ids),
      },
    ];
    const connection = await getDb();
    await connection
      .prepare(
        "UPDATE entity_snapshots SET snapshot = json_set(snapshot, '$.remaining', 2) WHERE entity_id = ?"
      )
      .run("ent_atomic_projection");
    expect(
      (
        await db
          .from("entity_snapshots")
          .select("observation_count")
          .eq("entity_id", "ent_atomic_projection")
          .single()
      ).data?.observation_count
    ).toBe(1);
    events.length = 0;
    const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
    expect((outcome as { code?: string }).code).toBe("CONFLICT");
    expect((outcome as Error).message).toContain("population revision");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("refuses a changed active reducer basis even when every row count is unchanged", async () => {
    const ids = ["ent_atomic_draft", "ent_atomic_source"];
    const input = request("population-schema-basis-change");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ids,
        expected_observation_counts: await revisions(ids),
      },
    ];
    const connection = await getDb();
    await connection
      .prepare(
        "UPDATE schema_registry SET reducer_config = json_set(reducer_config, '$.merge_policies.remaining.strategy', 'last_write') WHERE id = ? AND user_id = ?"
      )
      .run(schema.id, user);
    events.length = 0;
    const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
    expect((outcome as { code?: string }).code).toBe("CONFLICT");
    expect((outcome as Error).message).toContain("population revision");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("withholds fresh revisions for a prior-version projection after schema activation", async () => {
    const ids = ["ent_atomic_draft", "ent_atomic_source"];
    const input = request("population-stale-projection-version");
    input.entities[1].changes = [];
    input.entities[1].expected_snapshot = { title: "Source" };
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ids,
        expected_observation_counts: await revisions(ids),
      },
    ];
    const previous = await getEntityWithProvenance("ent_atomic_source", false, user);
    expect(previous?.content_revision).toMatch(/^[0-9a-f]{64}$/);
    const next = {
      ...schema,
      id: "test-schema-version-safety-v11",
      schema_version: "1.1",
      active: false,
      user_id: user,
      scope: "user",
      schema_definition: {
        ...schema.schema_definition,
        fields: { title: fields.title, status: fields.status },
      },
      reducer_config: {
        merge_policies: {
          title: schema.reducer_config.merge_policies.title,
          status: schema.reducer_config.merge_policies.status,
        },
      },
    };
    try {
      expect((await db.from("schema_registry").insert(next)).error).toBeNull();
      await new SchemaRegistryService().activate("atomic_test", "1.1", user);
      const active = await new SchemaRegistryService().loadActiveSchema("atomic_test", user);
      expect(active?.schema_version).toBe("1.1");
      await expect(listObservationCountsForVisibleIds(user, ids, active!)).rejects.toThrow(
        /unavailable/
      );
      const current = await getEntityWithProvenance("ent_atomic_source", false, user);
      expect(current?.schema_version).toBe("1.0");
      expect(current?.content_revision).toBeUndefined();
      const page = await queryEntities({
        userId: user,
        entityType: "atomic_test",
        includeSnapshots: true,
      });
      expect(
        page.find((row) => row.entity_id === "ent_atomic_source")?.content_revision
      ).toBeUndefined();
      events.length = 0;
      const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
      expect(outcome).toMatchObject({ code: "CONFLICT" });
      expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
      expect(
        (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
      ).toHaveLength(1);
      expect(events).toHaveLength(0);
    } finally {
      await db.from("schema_registry").delete().eq("id", next.id);
    }
  });
  it("refuses a same-version schema replacement until its prior projection is rematerialized", async () => {
    const ids = ["ent_atomic_draft", "ent_atomic_source"];
    const input = request("population-same-version-stale-projection");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ids,
        expected_observation_counts: await revisions(ids),
      },
    ];
    const original = await db
      .from("schema_registry")
      .select("schema_definition,reducer_config")
      .eq("id", schema.id)
      .single();
    expect(original.error).toBeNull();
    const replacement = {
      ...schema.schema_definition,
      fields: { ...fields, newly_projected: { type: "string" } },
    };
    try {
      expect(
        (
          await db
            .from("schema_registry")
            .update({
              schema_definition: replacement,
              reducer_config: {
                merge_policies: {
                  ...schema.reducer_config.merge_policies,
                  newly_projected: { strategy: "last_write" },
                },
              },
            })
            .eq("id", schema.id)
        ).error
      ).toBeNull();
      const active = await new SchemaRegistryService().loadActiveSchema("atomic_test", user);
      expect(active?.schema_version).toBe("1.0");
      expect(
        (await getEntityWithProvenance("ent_atomic_source", false, user))?.content_revision
      ).toBeUndefined();
      await expect(listObservationCountsForVisibleIds(user, ids, active!)).rejects.toThrow(
        /unavailable/
      );
      const page = await queryEntities({
        userId: user,
        entityType: "atomic_test",
        includeSnapshots: true,
      });
      expect(
        page.find((row) => row.entity_id === "ent_atomic_source")?.content_revision
      ).toBeUndefined();
      events.length = 0;
      const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
      expect(outcome).toMatchObject({ code: "CONFLICT" });
      expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
      expect(
        (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
      ).toHaveLength(1);
      expect(events).toHaveLength(0);
    } finally {
      expect(
        (
          await db
            .from("schema_registry")
            .update({
              schema_definition: original.data!.schema_definition,
              reducer_config: original.data!.reducer_config,
            })
            .eq("id", schema.id)
        ).error
      ).toBeNull();
    }
  });

  it("withholds population authority from a legacy snapshot without materialization basis", async () => {
    const ids = ["ent_atomic_draft", "ent_atomic_source"];
    const input = request("population-legacy-basis-missing");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ids,
        expected_observation_counts: await revisions(ids),
      },
    ];
    const before = await db
      .from("entity_snapshots")
      .select("schema_basis")
      .eq("entity_id", "ent_atomic_source")
      .single();
    expect(before.error).toBeNull();
    try {
      expect(
        (
          await db
            .from("entity_snapshots")
            .update({ schema_basis: null })
            .eq("entity_id", "ent_atomic_source")
        ).error
      ).toBeNull();
      expect(
        (await getEntityWithProvenance("ent_atomic_source", false, user))?.content_revision
      ).toBeUndefined();
      const active = await new SchemaRegistryService().loadActiveSchema("atomic_test", user);
      await expect(listObservationCountsForVisibleIds(user, ids, active!)).rejects.toThrow(
        /unavailable/
      );
      const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
      expect(outcome).toMatchObject({ code: "CONFLICT" });
      expect(
        (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
      ).toHaveLength(1);
    } finally {
      expect(
        (
          await db
            .from("entity_snapshots")
            .update({ schema_basis: before.data!.schema_basis })
            .eq("entity_id", "ent_atomic_source")
        ).error
      ).toBeNull();
    }
  });

  it("refuses incomplete, duplicate, foreign and malformed population revisions without effects", async () => {
    await seed("ent_atomic_foreign", { title: "Foreign", remaining: 1 }, "test-other-graph");
    const [draftRevision, sourceRevision] = await revisions([
      "ent_atomic_draft",
      "ent_atomic_source",
    ]);
    const cases = [
      [draftRevision],
      [draftRevision, draftRevision],
      [draftRevision, { ...sourceRevision, entity_id: "ent_atomic_foreign" }],
      [draftRevision, { ...sourceRevision, observation_count: -1 }],
      [draftRevision, { ...sourceRevision, content_revision: "not-a-revision" }],
    ];
    for (const [index, counts] of cases.entries()) {
      const input = request(`invalid-population-revision-${index}`);
      input.entities[1].changes = [];
      input.populations = [
        {
          entity_type: "atomic_test",
          expected_entity_ids: ["ent_atomic_draft", "ent_atomic_source"],
          expected_observation_counts: counts,
        },
      ];
      const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
      expect((outcome as { code?: string }).code).toBe("VALIDATION_ERROR");
    }
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("refuses a missing nonselected snapshot revision without a writer effect", async () => {
    await seed("ent_atomic_missing_revision", { title: "Unselected", remaining: 1 });
    const ids = ["ent_atomic_draft", "ent_atomic_missing_revision", "ent_atomic_source"];
    const input = request("population-missing-revision");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ids,
        expected_observation_counts: await revisions(ids),
      },
    ];
    expect(
      (
        await db
          .from("entity_snapshots")
          .delete()
          .eq("entity_id", "ent_atomic_missing_revision")
          .eq("user_id", user)
      ).error
    ).toBeNull();
    events.length = 0;
    const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
    expect((outcome as { code?: string }).code).toBe("CONFLICT");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("compares beyond the first 500 visible IDs without accepting a truncated inventory", async () => {
    const extra = Array.from(
      { length: 499 },
      (_, n) => `ent_atomic_page_${String(n).padStart(4, "0")}`
    );
    const inserted = await db.from("entities").insert(
      extra.map((id) => ({
        id,
        entity_type: "atomic_test",
        canonical_name: id,
        user_id: user,
      }))
    );
    expect(inserted.error).toBeNull();
    const input = request("population-page");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: [...extra, "ent_atomic_draft", "ent_atomic_source"].sort(),
      },
    ];
    expect((await applyCorrectionTransaction(input)).status).toBe("applied");

    const stale = request("population-page-stale");
    stale.entities[1].changes = [];
    stale.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: [...extra, "ent_atomic_draft"].sort(),
      },
    ];
    stale.entities[0].expected_observation_count = 2;
    stale.entities[0].expected_snapshot = { status: "approved" };
    stale.entities[0].changes = [{ field: "status", value: "sent" }];
    await expect(applyCorrectionTransaction(stale)).rejects.toThrow(/population precondition/i);
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "approved" });
  });
  it("compares revision counts beyond the first 500 visible IDs", async () => {
    const extra = Array.from(
      { length: 500 },
      (_, n) => `ent_atomic_revision_page_${String(n).padStart(4, "0")}`
    );
    expect(
      (
        await db.from("entities").insert(
          extra.map((id) => ({
            id,
            entity_type: "atomic_test",
            canonical_name: id,
            user_id: user,
          }))
        )
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("observations").insert(
          extra.map((id) => ({
            id: `seed-${id}`,
            entity_id: id,
            entity_type: "atomic_test",
            user_id: user,
            fields: { title: id, remaining: 1 },
            schema_version: "1.0",
            source_priority: 10,
            observed_at: "2026-01-01T00:00:00.000Z",
          }))
        )
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("entity_snapshots").upsert(
          extra.map((id) => ({
            entity_id: id,
            entity_type: "atomic_test",
            user_id: user,
            schema_version: "1.0",
            schema_basis: snapshotSchemaBasis(schema),
            snapshot: JSON.stringify({ title: id, remaining: 1 }),
            provenance: "{}",
            observation_count: 1,
          })),
          { onConflict: "entity_id" }
        )
      ).error
    ).toBeNull();
    const ids = [...extra, "ent_atomic_draft", "ent_atomic_source"].sort();
    expect(ids.length).toBe(502);
    const input = request("population-revision-page");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ids,
        expected_observation_counts: await revisions(ids),
      },
    ];
    const edited = extra[extra.length - 1];
    expect(
      (
        await db.from("observations").insert({
          id: "edit-revision-page-two",
          entity_id: edited,
          entity_type: "atomic_test",
          user_id: user,
          fields: { remaining: 0 },
          schema_version: "1.0",
          source_priority: 20,
          observed_at: "2026-01-02T00:00:00.000Z",
        })
      ).error
    ).toBeNull();
    await recomputeSnapshot(edited, user);
    const outcome = await applyCorrectionTransaction(input).catch((error: Error) => error);
    expect((outcome as { code?: string }).code).toBe("CONFLICT");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
  }, 30_000);
  it("holds the database write reservation from population read through the write boundary", async () => {
    // The production service uses this same connection.transaction envelope for
    // the population scan and createCorrection. A separate file-backed worker
    // must be unable to insert a matching row between those two operations.
    const connection = await getDb();
    const workerFile = connection instanceof WorkerFileDatabase;
    const competitor = workerFile
      ? openLibsqlDatabase(`file:${config.sqlitePath}`, { busyTimeoutMs: 2000 })
      : new AsyncSqliteDatabase(config.sqlitePath);
    const insert = () =>
      competitor
        .prepare(
          "INSERT INTO entities (id, entity_type, canonical_name, user_id) VALUES (?, ?, ?, ?)"
        )
        .run("ent_atomic_concurrent", "atomic_test", "Concurrent", user);
    try {
      if (!workerFile) await competitor.exec("PRAGMA busy_timeout = 50");
      await competitor.prepare("SELECT 1").get();
      const mainFile = (await connection.pragma("database_list")).find(
        (row) => (row as { name?: unknown }).name === "main"
      );
      const competitorFile = (await competitor.pragma("database_list")).find(
        (row) => (row as { name?: unknown }).name === "main"
      );
      expect(mainFile).toBeDefined();
      expect(competitorFile).toBeDefined();
      expect(typeof mainFile?.file).toBe("string");
      expect(mainFile?.file).not.toBe("");
      expect(mainFile).toEqual(competitorFile);
      let deferredInsert: Promise<unknown> | undefined;
      await connection.transaction(async () => {
        expect(await listVisibleEntityIdsForType(user, "atomic_test")).toEqual([
          "ent_atomic_draft",
          "ent_atomic_source",
        ]);
        if (workerFile) {
          deferredInsert = insert();
          expect(
            await Promise.race([
              deferredInsert.then(
                () => "committed",
                () => "failed"
              ),
              new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 75)),
            ])
          ).toBe("pending");
        } else {
          await expect(insert()).rejects.toThrow(/locked|busy/i);
        }
        const insertedRow = await connection
          .prepare("SELECT id FROM entities WHERE id = ?")
          .get("ent_atomic_concurrent");
        expect(insertedRow).toBeUndefined();
        const updated = await db
          .from("entities")
          .update({ canonical_name: "Writer committed" })
          .eq("id", "ent_atomic_draft")
          .eq("user_id", user);
        expect(updated.error).toBeNull();
      });
      if (workerFile) await expect(deferredInsert).resolves.toMatchObject({ changes: 1 });
      else await expect(insert()).resolves.toMatchObject({ changes: 1 });
      expect(await listVisibleEntityIdsForType(user, "atomic_test")).toContain(
        "ent_atomic_concurrent"
      );
    } finally {
      await competitor.close();
    }
  });
  it("refuses a merged or deleted member of a previously complete population", async () => {
    await seed("ent_atomic_extra", { title: "Extra", remaining: 1 });
    const input = request("population-merged");
    input.entities[1].changes = [];
    input.populations = [
      {
        entity_type: "atomic_test",
        expected_entity_ids: ["ent_atomic_draft", "ent_atomic_extra", "ent_atomic_source"],
      },
    ];
    expect(
      (
        await db
          .from("entities")
          .update({ merged_to_entity_id: "ent_atomic_source" })
          .eq("id", "ent_atomic_extra")
          .eq("user_id", user)
      ).error
    ).toBeNull();
    await expect(applyCorrectionTransaction(input)).rejects.toThrow(/population precondition/i);
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });

    expect(
      (
        await db
          .from("entities")
          .update({ merged_to_entity_id: null })
          .eq("id", "ent_atomic_extra")
          .eq("user_id", user)
      ).error
    ).toBeNull();
    expect((await softDeleteEntity("ent_atomic_extra", "atomic_test", user)).success).toBe(true);
    await expect(
      applyCorrectionTransaction({ ...input, idempotency_key: "population-deleted" })
    ).rejects.toThrow(/population precondition/i);
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
  });
  it("rejects duplicate, malformed and unconfigured population guards before writing", async () => {
    const invalid: unknown[] = [
      [
        {
          entity_type: "atomic_test",
          expected_entity_ids: ["ent_atomic_draft", "ent_atomic_draft"],
        },
      ],
      [{ entity_type: "atomic_test", expected_entity_ids: [""] }],
      [
        { entity_type: "atomic_test", expected_entity_ids: [] },
        { entity_type: "atomic_test", expected_entity_ids: [] },
      ],
      [{ entity_type: "unknown_type", expected_entity_ids: [] }],
      [{ entity_type: "atomic_test", expected_entity_ids: [], unchecked: true }],
    ];
    for (const [index, populations] of invalid.entries()) {
      const input = request(`population-invalid-${index}`);
      input.entities[1].changes = [];
      input.populations = populations as CorrectionTransactionOptions["populations"];
      await expect(applyCorrectionTransaction(input)).rejects.toThrow();
      expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    }
  });
  it("requires the caller's correction grant for every guarded population type", async () => {
    const input = request("population-denied-type");
    input.entities[1].changes = [];
    input.populations = [{ entity_type: "ungranted_type", expected_entity_ids: [] }];
    await expect(
      runWithRequestContext(
        {
          agentIdentity: { tier: "software", sub: "population-test" } as never,
          aauthAdmission: {
            admitted: true,
            user_id: user,
            grant_id: "ent_population_test_grant",
            agent_label: "population-test",
            reason: "admitted",
            capabilities: [{ op: "correct", entity_types: ["atomic_test"] }],
          },
        },
        () => applyCorrectionTransaction(input)
      )
    ).rejects.toMatchObject({ code: "capability_denied" });
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
  });
  it("fails closed on absent, cross-tenant, wrong-type, undeclared and malformed guards", async () => {
    await seed(
      "ent_atomic_other_owner_guard",
      { title: "Other", remaining: 1 },
      "test-other-graph"
    );
    for (const mutate of [
      (input: CorrectionTransactionOptions) => {
        input.entities[1].entity_id = "ent_atomic_absent_guard";
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[1].entity_id = "ent_atomic_other_owner_guard";
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[1].entity_type = "wrong_type";
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[1].expected_snapshot = { undeclared: 1 };
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[1].expected_snapshot = {};
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[1].expected_snapshot = { remaining: undefined };
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[1].expected_observation_count = -1;
      },
      (input: CorrectionTransactionOptions) => {
        input.entities.push({ ...input.entities[1] });
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[0].changes = [];
      },
    ]) {
      const input = request("invalid-guard");
      input.entities[1].changes = [];
      mutate(input);
      await expect(applyCorrectionTransaction(input)).rejects.toThrow();
      expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    }
    expect(events).toHaveLength(0);
  });
  it("commits all snapshots and replays an identical request without another observation", async () => {
    const first = await applyCorrectionTransaction(request());
    expect(first.status).toBe("applied");
    const replay = await applyCorrectionTransaction(request());
    expect(replay.status).toBe("replayed");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "approved" });
    expect(await snapshot("ent_atomic_source")).toMatchObject({ remaining: 0 });
    const rows = await db.from("observations").select("id").eq("user_id", user);
    expect(rows.data).toHaveLength(4);
    expect(events).toHaveLength(4);
  });
  it("rolls back the first write and emits nothing when a later write fails", async () => {
    const connection = await getDb();
    await connection.exec(
      "CREATE TRIGGER fail_atomic_source BEFORE INSERT ON observations WHEN NEW.entity_id = 'ent_atomic_source' BEGIN SELECT RAISE(ABORT, 'injected failure'); END"
    );
    await expect(applyCorrectionTransaction(request())).rejects.toThrow();
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(await snapshot("ent_atomic_source")).toMatchObject({ remaining: 1 });
    expect(events).toHaveLength(0);
  });
  it("permits only one concurrent stale approval to consume the final capacity", async () => {
    const results = await Promise.allSettled([
      applyCorrectionTransaction(request("race-a")),
      applyCorrectionTransaction(request("race-b")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await snapshot("ent_atomic_source")).toMatchObject({ remaining: 0 });
  });
  it("rejects changed payload reuse of an idempotency key", async () => {
    await applyCorrectionTransaction(request());
    const changed = request();
    changed.entities[1].changes[0].value = -1;
    await expect(applyCorrectionTransaction(changed)).rejects.toThrow(/idempotency/i);
    expect(await snapshot("ent_atomic_source")).toMatchObject({ remaining: 0 });
  });
  it("rejects an entity outside the requesting graph before writes", async () => {
    const changed = request();
    changed.user_id = "test-other-graph";
    await expect(applyCorrectionTransaction(changed)).rejects.toThrow();
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
  });
  it("shares a single final source unit across different concurrent draft approvals", async () => {
    await seed("ent_atomic_other_draft", { title: "Other draft", status: "ready" });
    const other = request("other-draft");
    other.entities[0].entity_id = "ent_atomic_other_draft";
    const results = await Promise.allSettled([
      applyCorrectionTransaction(request()),
      applyCorrectionTransaction(other),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      [await snapshot("ent_atomic_draft"), await snapshot("ent_atomic_other_draft")].filter(
        (value) => value?.status === "approved"
      )
    ).toHaveLength(1);
  });
  it("returns applied plus replayed for concurrent identical requests", async () => {
    const results = await Promise.all([
      applyCorrectionTransaction(request()),
      applyCorrectionTransaction(request()),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["applied", "replayed"]);
    expect(events).toHaveLength(4);
  });
  it("rolls back if higher-priority stored data prevents requested snapshots", async () => {
    await db.from("observations").insert({
      id: "test-atomic-priority",
      entity_id: "ent_atomic_source",
      entity_type: "atomic_test",
      user_id: user,
      fields: { remaining: 1 },
      schema_version: "1.0",
      source_priority: 2000,
      observed_at: "2026-01-02T00:00:00.000Z",
    });
    await recomputeSnapshot("ent_atomic_source", user);
    const input = request();
    input.entities[1].expected_observation_count = 2;
    await expect(applyCorrectionTransaction(input)).rejects.toThrow(/snapshots/);
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(events).toHaveLength(0);
    expect((await db.from("observations").select("id").eq("user_id", user)).data).toHaveLength(3);
  });
  it("rejects malformed, duplicate or undeclared fields before mutation", async () => {
    for (const mutate of [
      (input: CorrectionTransactionOptions) => {
        input.entities[0].changes.push({ ...input.entities[0].changes[0] });
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[0].changes[0].field = "undeclared";
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[0].expected_snapshot = { status: "outdated" };
      },
      (input: CorrectionTransactionOptions) => {
        input.entities[0].changes[0].value = undefined;
      },
    ]) {
      const input = request();
      mutate(input);
      await expect(applyCorrectionTransaction(input)).rejects.toThrow();
    }
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(events).toHaveLength(0);
  });
  it("dispatches through MCP with the same scoped service and rejects identity spoofing", async () => {
    const { NeotomaServer } = await import("../server.js");
    const server = new NeotomaServer() as unknown as {
      authenticatedUserId: string;
      executeTool: (name: string, args: unknown) => Promise<{ content: { text: string }[] }>;
    };
    server.authenticatedUserId = user;
    const result = await server.executeTool("correct_transaction", request());
    expect(JSON.parse(result.content[0].text).status).toBe("applied");
    await expect(
      server.executeTool("correct_transaction", { ...request(), user_id: "test-other-graph" })
    ).rejects.toThrow(/authenticated user/);
  });
  it("accepts a compare-only guard through MCP without a guard observation", async () => {
    const { NeotomaServer } = await import("../server.js");
    const server = new NeotomaServer() as unknown as {
      authenticatedUserId: string;
      executeTool: (name: string, args: unknown) => Promise<{ content: { text: string }[] }>;
    };
    server.authenticatedUserId = user;
    const input = request("mcp-unchanged-guard");
    input.entities[1].changes = [];
    const result = await server.executeTool("correct_transaction", input);
    expect(JSON.parse(result.content[0].text).status).toBe("applied");
    const replay = await server.executeTool("correct_transaction", input);
    expect(JSON.parse(replay.content[0].text).status).toBe("replayed");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "approved" });
    expect(await snapshot("ent_atomic_source")).toMatchObject({ remaining: 1 });
    const guardRows = await db
      .from("observations")
      .select("id")
      .eq("entity_id", "ent_atomic_source");
    expect(guardRows.data).toHaveLength(1);
    expect(events).toHaveLength(2);
    await expect(
      server.executeTool("correct_transaction", {
        ...input,
        idempotency_key: "mcp-unchanged-guard-stale-writer",
      })
    ).rejects.toThrow(/precondition/);
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(2);
    expect(events).toHaveLength(2);
  });
  it("refuses a stale compare-only guard through MCP without changing its writer", async () => {
    const { NeotomaServer } = await import("../server.js");
    const server = new NeotomaServer() as unknown as {
      authenticatedUserId: string;
      executeTool: (name: string, args: unknown) => Promise<{ content: { text: string }[] }>;
    };
    server.authenticatedUserId = user;
    const input = request("mcp-stale-unchanged-guard");
    input.entities[1].changes = [];
    const inserted = await db.from("observations").insert({
      id: "test-mcp-guard-advance",
      entity_id: "ent_atomic_source",
      entity_type: "atomic_test",
      user_id: user,
      fields: { remaining: 0 },
      schema_version: "1.0",
      source_priority: 20,
      observed_at: "2026-01-02T00:00:00.000Z",
    });
    expect(inserted.error).toBeNull();
    await recomputeSnapshot("ent_atomic_source", user);
    events.length = 0;
    await expect(server.executeTool("correct_transaction", input)).rejects.toThrow(/precondition/);
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_draft")).data
    ).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("rolls back MCP writers when a later writer fails behind a compare-only guard", async () => {
    const { NeotomaServer } = await import("../server.js");
    const server = new NeotomaServer() as unknown as {
      authenticatedUserId: string;
      executeTool: (name: string, args: unknown) => Promise<{ content: { text: string }[] }>;
    };
    server.authenticatedUserId = user;
    await seed("ent_atomic_second_draft", { title: "Second draft", status: "ready" });
    const input = request("mcp-guard-rollback");
    input.entities[1].changes = [];
    input.entities.push({
      entity_id: "ent_atomic_second_draft",
      entity_type: "atomic_test",
      expected_observation_count: 1,
      expected_snapshot: { status: "ready" },
      changes: [{ field: "status", value: "approved" }],
    });
    const connection = await getDb();
    await connection.exec(
      "CREATE TRIGGER fail_atomic_source BEFORE INSERT ON observations WHEN NEW.entity_id = 'ent_atomic_second_draft' BEGIN SELECT RAISE(ABORT, 'injected failure'); END"
    );
    await expect(server.executeTool("correct_transaction", input)).rejects.toThrow();
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ status: "ready" });
    expect(await snapshot("ent_atomic_second_draft")).toMatchObject({ status: "ready" });
    expect(await snapshot("ent_atomic_source")).toMatchObject({ remaining: 1 });
    for (const id of ["ent_atomic_draft", "ent_atomic_second_draft", "ent_atomic_source"])
      expect((await db.from("observations").select("id").eq("entity_id", id)).data).toHaveLength(1);
    expect(events).toHaveLength(0);
    await connection.exec("DROP TRIGGER fail_atomic_source");
    const retry = await server.executeTool("correct_transaction", input);
    expect(JSON.parse(retry.content[0].text).status).toBe("applied");
    expect(
      (await db.from("observations").select("id").eq("entity_id", "ent_atomic_source")).data
    ).toHaveLength(1);
  });
});

describe("group receipts composed with ordinary entity CAS", () => {
  function multi(key = "multi-group") {
    const input = request(key);
    input.entities[0].changes.push({ field: "title", value: "Approved draft" });
    input.entities[1].changes.push({ field: "title", value: "Consumed source" });
    return input;
  }
  async function count() {
    return (await db.from("observations").select("id").eq("user_id", user)).data?.length;
  }
  it("commits two fields on each entity under one group receipt, then replays without events", async () => {
    const input = multi();
    expect((await applyCorrectionTransaction(input)).status).toBe("applied");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({
      status: "approved",
      title: "Approved draft",
    });
    expect(await snapshot("ent_atomic_source")).toMatchObject({
      remaining: 0,
      title: "Consumed source",
    });
    expect(await count()).toBe(6);
    expect(events).toHaveLength(8);
    const receipt = await db
      .from("observations")
      .select("idempotency_key,canonical_hash")
      .eq("user_id", user)
      .eq("source_priority", 1000);
    expect(receipt.data).toHaveLength(4);
    expect(new Set(receipt.data?.map((row) => row.idempotency_key)).size).toBe(1);
    expect(new Set(receipt.data?.map((row) => row.canonical_hash)).size).toBe(1);
    expect((await applyCorrectionTransaction(input)).status).toBe("replayed");
    expect(await count()).toBe(6);
    expect(events).toHaveLength(8);
    const changed = multi();
    changed.entities[0].changes[1].value = "Changed payload";
    await expect(applyCorrectionTransaction(changed)).rejects.toThrow(/idempotency/i);
    expect(await count()).toBe(6);
    expect(events).toHaveLength(8);
  });
  it("keeps queued identical ordinary CAS replay and grouped replay independent", async () => {
    await applyCorrectionTransaction(multi());
    events.length = 0;
    const current = await getEntityWithProvenance("ent_atomic_draft", false, user);
    const params = {
      entity_id: "ent_atomic_draft",
      entity_type: "atomic_test",
      user_id: user,
      schema_version: "1.0",
      field: "status",
      value: "reviewed",
      idempotency_key: "ordinary-after-group",
      expected_version: current!.entity_version!,
    };
    const results = await Promise.all([
      createCorrectionWithVersionPrecondition(params),
      createCorrectionWithVersionPrecondition(params),
    ]);
    expect(results.map((row) => row.replayed).sort()).toEqual([false, true]);
    expect(results[0].observation_id).toBe(results[1].observation_id);
    expect(await count()).toBe(7);
    expect(events).toHaveLength(2);
    expect((await applyCorrectionTransaction(multi())).status).toBe("replayed");
    expect(await snapshot("ent_atomic_draft")).toMatchObject({
      status: "reviewed",
      title: "Approved draft",
    });
    expect(await count()).toBe(7);
    expect(events).toHaveLength(2);
    await expect(
      createCorrectionWithVersionPrecondition({ ...params, value: "another" })
    ).rejects.toThrow(/idempotency/i);
    expect(await count()).toBe(7);
    expect(events).toHaveLength(2);
  });
  it("rolls back the first field when the second sorted field insert fails", async () => {
    const connection = await getDb();
    await connection.exec(
      "CREATE TRIGGER fail_atomic_second_change BEFORE INSERT ON observations WHEN NEW.entity_id = 'ent_atomic_draft' AND json_extract(NEW.fields, '$.title') IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected second field failure'); END"
    );
    await expect(applyCorrectionTransaction(multi())).rejects.toThrow(
      /injected second field failure/
    );
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ title: "Draft", status: "ready" });
    expect(await snapshot("ent_atomic_source")).toMatchObject({ title: "Source", remaining: 1 });
    expect(await count()).toBe(2);
    expect(events).toHaveLength(0);
  });
  it("retains per-field target store-policy enforcement inside the group boundary", async () => {
    let calls = 0;
    vi.spyOn(instancePolicy, "assertStorePolicyAllows").mockImplementation(async () => {
      calls++;
      if (calls === 2) throw new Error("policy denied second field");
    });
    await expect(applyCorrectionTransaction(multi())).rejects.toThrow("policy denied second field");
    expect(calls).toBe(2);
    expect(await snapshot("ent_atomic_draft")).toMatchObject({ title: "Draft", status: "ready" });
    expect(await count()).toBe(2);
    expect(events).toHaveLength(0);
  });
});
