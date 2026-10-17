import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../db.js";
import { getDb } from "../repositories/db/connection.js";
import { recomputeSnapshot } from "./snapshot_computation.js";
import { getEntityWithProvenance } from "./entity_queries.js";
import { createCorrectionWithVersionPrecondition } from "./correction.js";
import * as instancePolicy from "./instance_policy.js";
import { substrateEventBus } from "../events/substrate_event_bus.js";
import { nativeSchemaReducerHash } from "./native_transition_projection.js";
import type { NativeTransitionRequest } from "./native_transition_request.js";
import { canonicalStoreRequest } from "./store_condition_keys.js";
import { createServer } from "node:http";
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

function nativeRequest() {
  const registryHash = "a".repeat(64);
  return {
    protocol: "native-record-transition-v1",
    idempotency_key: "native-test-resolution",
    expected: {
      recipe_version: "native-readset-v1",
      schema_reducer_sha256: nativeSchemaReducerHash(registryHash),
      groups: [
        {
          selector: {
            registry: {
              entity_types: ["checkpoint"],
              relationship_types: ["CHECKPOINTS"],
              reducer_versions: ["native-test"],
            },
          },
          count: 1,
          rows_sha256: registryHash,
        },
      ],
    },
    transition: {
      name: "checkpoint.resolve",
      checkpoint_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
      subject: { entity_type: "task", entity_id: "ent_bbbbbbbbbbbbbbbbbbbbbbbb" },
      decision: "approved",
      self_resolved: false,
      resolution_note: "Synthetic decision",
    },
  };
}

type SelectorFamily = "entity" | "edges" | "slot" | "mixed";
function nativeReadIds(count: number, family: SelectorFamily, repeatAcrossFamilies = false) {
  const request = nativeRequest() as NativeTransitionRequest;
  for (let i = 0; i < count; i++) {
    const entityId = "ent_" + i.toString(16).padStart(24, "0");
    const families: Array<Exclude<SelectorFamily, "mixed">> = repeatAcrossFamilies
      ? ["entity", "edges", "slot"]
      : [family === "mixed" ? (["entity", "edges", "slot"] as const)[i % 3] : family];
    for (const kind of families) {
      const selector =
        kind === "entity"
          ? { entity: { entity_id: entityId } }
          : kind === "edges"
            ? { edges: { entity_id: entityId, direction: "both" as const, types: [] } }
            : { slot: { target_type: "task" as const, target_id: entityId, step_name: null } };
      request.expected.groups.push({ selector, count: 0, rows_sha256: "a".repeat(64) });
    }
  }
  request.expected.groups.sort((a, b) =>
    Buffer.compare(
      Buffer.from(canonicalStoreRequest(a.selector), "utf8"),
      Buffer.from(canonicalStoreRequest(b.selector), "utf8")
    )
  );
  return request;
}

async function nativeCensus() {
  const connection = await getDb();
  return Promise.all(
    ["entities", "observations", "relationship_observations", "entity_snapshots"].map((table) =>
      connection.prepare(`SELECT count(*) AS n FROM ${table}`).get()
    )
  );
}
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
  await connection.exec("DROP TRIGGER IF EXISTS fail_atomic_second_change");
});
describe("scoped atomic correction transaction", () => {
  it("retains native v2 service refusal without storage writes/events or ordinary fallback", async () => {
    const request = nativeRequest() as any;
    request.expected.recipe_version = "native-readset-v2";
    request.expected.groups.unshift({
      selector: {
        bindings: { credential_kind: "aauth_sub", credential_key_sha256: "b".repeat(64) },
      },
      count: 0,
      rows_sha256: "b".repeat(64),
    });
    const before = await nativeCensus();
    expect(before.every((r) => Number(r?.n) === 2 || Number(r?.n) === 0)).toBe(true);
    expect(Number(before[0]?.n)).toBe(2);
    expect(Number(before[1]?.n)).toBe(2);
    const transaction = vi.spyOn(await getDb(), "transaction");
    await expect(applyCorrectionTransaction(request, user)).rejects.toMatchObject({
      code: "NATIVE_DEPENDENCY_UNAVAILABLE",
      details: { dependency: "native_principal_binding_resolution" },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(await nativeCensus()).toEqual(before);
    expect(events).toHaveLength(0);
  });
  it.each<SelectorFamily>(["entity", "edges", "slot", "mixed"])(
    "refuses 257 distinct %s read IDs before storage without acquiring authority",
    async (family) => {
      const before = await nativeCensus();
      const connection = await getDb();
      const transaction = vi.spyOn(connection, "transaction");
      const prepare = vi.spyOn(connection, "prepare");
      await expect(
        applyCorrectionTransaction(nativeReadIds(257, family), user)
      ).rejects.toMatchObject({
        code: "NATIVE_DEPENDENCY_UNAVAILABLE",
        details: { dependency: "complete_readset_bound", observed_lower_bound: 257, limit: 256 },
      });
      expect(transaction).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
      expect(await nativeCensus()).toEqual(before);
      expect(events).toHaveLength(0);
    }
  );
  it("counts shared selector IDs once, including the exact 256-ID boundary, without admitting effects", async () => {
    const before = await nativeCensus();
    const transaction = vi.spyOn(await getDb(), "transaction");
    const request = nativeReadIds(256, "mixed", true);
    expect(request.expected.groups).toHaveLength(769);
    await expect(applyCorrectionTransaction(request, user)).rejects.toMatchObject({
      code: "NATIVE_DEPENDENCY_UNAVAILABLE",
      details: { dependency: "native_principal_binding_resolution" },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(await nativeCensus()).toEqual(before);
    expect(events).toHaveLength(0);
  });
  it.each(["native-readset-v1", "native-readset-v2"])(
    "preserves the %s read-ID bound through actual HTTP and MCP without storage or events",
    async (version) => {
      const { app } = await import("../actions.js");
      const { NeotomaServer } = await import("../server.js");
      const mcp = new NeotomaServer() as unknown as {
        authenticatedUserId: string;
        executeTool: (name: string, args: unknown) => Promise<unknown>;
      };
      mcp.authenticatedUserId = user;
      const server = createServer(app);
      try {
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string")
          throw Error("Owned loopback binding required.");
        const before = await nativeCensus();
        const transaction = vi.spyOn(await getDb(), "transaction");
        const request = nativeReadIds(257, "mixed") as any;
        request.expected.recipe_version = version;
        if (version === "native-readset-v2")
          request.expected.groups.unshift({
            selector: {
              bindings: { credential_kind: "aauth_sub", credential_key_sha256: "b".repeat(64) },
            },
            count: 0,
            rows_sha256: "b".repeat(64),
          });
        const response = await fetch(`http://127.0.0.1:${address.port}/corrections/transaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
          error_code: "NATIVE_DEPENDENCY_UNAVAILABLE",
          details: { dependency: "complete_readset_bound", observed_lower_bound: 257, limit: 256 },
        });
        await expect(mcp.executeTool("correct_transaction", request)).rejects.toMatchObject({
          data: {
            error_code: "NATIVE_DEPENDENCY_UNAVAILABLE",
            details: {
              dependency: "complete_readset_bound",
              observed_lower_bound: 257,
              limit: 256,
            },
          },
        });
        expect(transaction).not.toHaveBeenCalled();
        expect(await nativeCensus()).toEqual(before);
        expect(events).toHaveLength(0);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    }
  );
  it("recognizes a structurally valid native request without inventing principal authority", async () => {
    const before = await nativeCensus();
    const transaction = vi.spyOn(await getDb(), "transaction");
    // Unknown boundary input is intentional: this exercises the real service,
    // not a mocked native handler or an assertion about a future ready fixture.
    const invoke = applyCorrectionTransaction as (body: unknown, owner: string) => Promise<unknown>;
    await expect(invoke(nativeRequest(), user)).rejects.toMatchObject({
      code: "NATIVE_DEPENDENCY_UNAVAILABLE",
      details: { dependency: "native_principal_binding_resolution" },
    });
    expect(await nativeCensus()).toEqual(before);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
  });
  it.each(["native-readset-v1", "native-readset-v2"])(
    "returns the same %s dependency through actual HTTP/MCP without native rows or events",
    async (version) => {
      const { app } = await import("../actions.js");
      const { NeotomaServer } = await import("../server.js");
      const mcp = new NeotomaServer() as unknown as {
        authenticatedUserId: string;
        executeTool: (name: string, args: unknown) => Promise<unknown>;
      };
      mcp.authenticatedUserId = user;
      const request = nativeRequest() as any;
      request.expected.recipe_version = version;
      if (version === "native-readset-v2")
        request.expected.groups.unshift({
          selector: {
            bindings: { credential_kind: "aauth_sub", credential_key_sha256: "b".repeat(64) },
          },
          count: 0,
          rows_sha256: "b".repeat(64),
        });
      const server = createServer(app);
      try {
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string")
          throw Error("Owned loopback binding required.");
        const before = await nativeCensus();
        const response = await fetch(`http://127.0.0.1:${address.port}/corrections/transaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const result = await response.json();
        expect(response.status).toBe(503);
        expect(result).toMatchObject({
          error_code: "NATIVE_DEPENDENCY_UNAVAILABLE",
          details: { dependency: "native_principal_binding_resolution" },
        });
        await expect(mcp.executeTool("correct_transaction", request)).rejects.toMatchObject({
          data: {
            error_code: "NATIVE_DEPENDENCY_UNAVAILABLE",
            details: { dependency: "native_principal_binding_resolution" },
          },
        });
        expect(await nativeCensus()).toEqual(before);
        expect(events).toHaveLength(0);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    }
  );
  it("rejects mixed/native authority fields before a transaction rather than falling back", async () => {
    const invoke = applyCorrectionTransaction as (body: unknown, owner: string) => Promise<unknown>;
    const transaction = vi.spyOn(await getDb(), "transaction");
    const before = await nativeCensus();
    for (const extra of [{ entities: [] }, { user_id: user }, { actor: "synthetic-principal" }]) {
      await expect(invoke({ ...nativeRequest(), ...extra }, user)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    }
    expect(transaction).not.toHaveBeenCalled();
    expect(await nativeCensus()).toEqual(before);
    expect(events).toHaveLength(0);
  });
  it("preserves the typed native dependency through the existing MCP adapter", async () => {
    const { NeotomaServer } = await import("../server.js");
    const server = new NeotomaServer() as unknown as {
      authenticatedUserId: string;
      executeTool: (name: string, args: unknown) => Promise<unknown>;
    };
    server.authenticatedUserId = user;
    const before = await nativeCensus();
    await expect(server.executeTool("correct_transaction", nativeRequest())).rejects.toMatchObject({
      data: {
        code: "NATIVE_DEPENDENCY_UNAVAILABLE",
        error_code: "NATIVE_DEPENDENCY_UNAVAILABLE",
        details: { dependency: "native_principal_binding_resolution" },
      },
    });
    expect(await nativeCensus()).toEqual(before);
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
