import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../db.js";
import { getDb } from "../repositories/db/connection.js";
import { recomputeSnapshot } from "./snapshot_computation.js";
import { getEntityWithProvenance } from "./entity_queries.js";
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
});
describe("scoped atomic correction transaction", () => {
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
});
