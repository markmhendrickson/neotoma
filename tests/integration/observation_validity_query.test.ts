/** Public validity selection must compose with knowledge cutoffs and lifecycle authority. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { createOperations } from "../../src/core/operations.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { softDeleteEntity } from "../../src/services/deletion.js";
import { seedTestSchema, cleanupTestSchema } from "../helpers/test_schema_helpers.js";
import {
  PARITY_USER_ID,
  callHttp,
  makeMcpServer,
  startOfflineServer,
  stopServer,
} from "../helpers/transport_parity_matrix.js";

const type = "synthetic_validity_query";
const ids: string[] = [];
const server = makeMcpServer();
const core = createOperations({ userId: PARITY_USER_ID, server });
let http: Awaited<ReturnType<typeof startOfflineServer>>;

beforeAll(async () => {
  await seedTestSchema(server, type, { name: { type: "string" }, status: { type: "string" } });
  http = await startOfflineServer();
});
afterAll(async () => {
  for (const id of ids) {
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  }
  await cleanupTestSchema(type);
  await stopServer(http.server);
  await core.dispose();
});

async function entity() {
  const result = await core.store({
    entities: [{ entity_type: type, name: randomUUID() }],
    idempotency_key: randomUUID(),
  });
  const id = (result.entities as Array<{ entity_id: string }>)[0].entity_id;
  ids.push(id);
  return id;
}

async function assertion(
  id: string,
  status: string,
  observed_at: string,
  validity: Record<string, string | null> = {}
) {
  const row = await createObservation({
    entity_id: id,
    entity_type: type,
    schema_version: "1.0",
    source_id: null,
    interpretation_id: null,
    observed_at,
    specificity_score: 1,
    source_priority: 100,
    fields: { status },
    user_id: PARITY_USER_ID,
    idempotency_key: randomUUID(),
    ...validity,
  });
  await recomputeSnapshot(id, PARITY_USER_ID);
  return row;
}

async function both(id: string, query: Record<string, string>) {
  const input = { entity_id: id, format: "json", ...query };
  const mcp = (await core.retrieveEntitySnapshot(input)) as Record<string, any>;
  const response = await callHttp(http.base, "/get_entity_snapshot", input);
  expect(response.status).toBe(200);
  return [mcp, response.json] as Array<Record<string, any>>;
}

describe("public snapshot valid_at selection", () => {
  it("writes correction validity through core/MCP and HTTP, replays canonical bounds, and reduces only eligible assertions", async () => {
    const id = await entity();
    const original = await assertion(id, "original", "2010-01-01T00:00:00Z");
    const input = {
      entity_id: id,
      entity_type: type,
      field: "status",
      value: "temporary correction",
      idempotency_key: randomUUID(),
      valid_from: "2026-01-01T01:00:00.123456789+01:00",
      valid_to: "2026-02-01T00:00:00Z",
    };
    const corrected = (await core.correct(input)) as Record<string, any>;
    expect(corrected.observation_id).toBeTypeOf("string");
    const retry = await callHttp(http.base, "/correct", {
      ...input,
      valid_from: "2026-01-01T00:00:00.123456789Z",
      expected_version: "stale-but-replayed",
    });
    expect(retry.status).toBe(200);
    expect(retry.json.observation_id).toBe(corrected.observation_id);
    expect(retry.json.replayed).toBe(true);
    const history = (await core.listObservations({ entity_id: id })) as Record<string, any>;
    expect(
      history.observations.find((row: Record<string, any>) => row.id === corrected.observation_id)
    ).toMatchObject({
      valid_from: "2026-01-01T00:00:00.123456789Z",
      valid_to: "2026-02-01T00:00:00.000Z",
      observation_source: "correction",
    });
    for (const result of await both(id, { valid_at: "2026-01-01T00:00:00.123456789Z" })) {
      expect(result.snapshot.status).toBe(input.value);
      expect(result.provenance.status).toBe(corrected.observation_id);
    }
    for (const result of await both(id, { valid_at: "2026-02-01T00:00:00Z" })) {
      expect(result.snapshot.status).toBe("original");
      expect(result.provenance.status).toBe(original.id);
    }
    for (const result of await both(id, {})) expect(result.snapshot.status).toBe(input.value);
    const mismatch = await callHttp(http.base, "/correct", { ...input, valid_to: null });
    expect(mismatch.status).toBe(400);
    expect(mismatch.json.error_code).toBe("ERR_IDEMPOTENCY_MISMATCH");
    await expect(core.correct({ ...input, valid_from: null })).rejects.toThrow(/different payload/);
    const rows = await db
      .from("observations")
      .select("id")
      .eq("idempotency_key", input.idempotency_key);
    expect(rows.data).toHaveLength(1);
  });

  it("HTTP correction inputs survive transport parsing and explicit null retains ordinary-row fallback", async () => {
    const id = await entity();
    await assertion(id, "original", "2010-01-01T00:00:00Z");
    const response = await callHttp(http.base, "/correct", {
      entity_id: id,
      entity_type: type,
      field: "status",
      value: "ordinary fallback",
      idempotency_key: randomUUID(),
      valid_from: null,
      valid_to: null,
    });
    expect(response.status).toBe(200);
    const rows = await db
      .from("observations")
      .select("observed_at,valid_from,valid_to")
      .eq("id", response.json.observation_id)
      .single();
    expect(rows.data).toMatchObject({ valid_from: null, valid_to: null });
    for (const result of await both(id, { valid_at: "2010-01-01T00:00:00Z" }))
      expect(result.snapshot.status).toBe("original");
    for (const result of await both(id, { valid_at: rows.data!.observed_at }))
      expect(result.snapshot.status).toBe("ordinary fallback");
  });

  it("replays an end-only correction using its original clock after the interval has ended", async () => {
    const id = await entity();
    const input = {
      entity_id: id,
      entity_type: type,
      field: "status",
      value: "bounded",
      idempotency_key: randomUUID(),
      valid_to: "2090-01-01T00:00:00Z",
    };
    const first = (await core.correct(input)) as Record<string, any>;
    try {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2091-01-01T00:00:00Z"));
      const retry = (await core.correct(input)) as Record<string, any>;
      expect(retry.observation_id).toBe(first.observation_id);
      expect(retry.replayed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    const rows = await db.from("observations").select("observed_at").eq("id", first.observation_id);
    expect(rows.data).toHaveLength(1);
    expect(rows.data![0].observed_at).not.toMatch(/^2091-/);
  });

  it("refuses malformed/empty correction intervals without appending an observation", async () => {
    const id = await entity();
    const before = await db.from("observations").select("id").eq("entity_id", id);
    for (const bounds of [
      { valid_from: "2026-02-30T00:00:00Z" },
      { valid_from: "2026-01-01T00:00:00Z", valid_to: "2026-01-01T00:00:00Z" },
      { valid_to: "2000-01-01T00:00:00Z" },
    ]) {
      const input = {
        entity_id: id,
        entity_type: type,
        field: "status",
        value: "refused",
        idempotency_key: randomUUID(),
        ...bounds,
      };
      expect((await callHttp(http.base, "/correct", input)).status).toBe(400);
      await expect(core.correct(input)).rejects.toThrow(/Invalid valid_/);
    }
    const after = await db.from("observations").select("id").eq("entity_id", id);
    expect(after.data).toEqual(before.data);
  });

  it("selects inclusive/exclusive bounds without rounding fractional precision and retains provenance", async () => {
    const id = await entity();
    const old = await assertion(id, "old", "2026-10-10T00:00:00Z", {
      valid_from: "2026-10-01T00:00:00.123456788Z",
      valid_to: "2026-10-01T00:00:00.123456789Z",
    });
    const next = await assertion(id, "new", "2026-10-11T00:00:00Z", {
      valid_from: "2026-10-01T00:00:00.123456789Z",
    });
    for (const result of await both(id, { valid_at: "2026-10-01T01:00:00.123456788+01:00" })) {
      expect(result.snapshot.status).toBe("old");
      expect(result.provenance.status).toBe(old.id);
    }
    for (const result of await both(id, { valid_at: "2026-10-01T00:00:00.123456789Z" })) {
      expect(result.snapshot.status).toBe("new");
      expect(result.provenance.status).toBe(next.id);
    }
    for (const result of await both(id, {})) expect(result.snapshot.status).toBe("new");
  });

  it("knowledge cutoffs exclude a late assertion even when its validity starts earlier", async () => {
    const id = await entity();
    const original = await assertion(id, "original", "2026-10-02T00:00:00Z", {
      valid_from: "2026-10-01T00:00:00Z",
    });
    await assertion(id, "late", "2026-10-20T00:00:00Z", { valid_from: "2026-10-01T00:00:00Z" });
    for (const result of await both(id, {
      valid_at: "2026-10-03T00:00:00Z",
      at: "2026-10-10T00:00:00Z",
    })) {
      expect(result.snapshot.status).toBe("original");
      expect(result.provenance.status).toBe(original.id);
    }
    for (const result of await both(id, {
      valid_at: "2026-10-03T00:00:00Z",
      at_ingested: "2020-01-01T00:00:00Z",
    }))
      expect(result.snapshot).toEqual({});
    for (const result of await both(id, { valid_at: "2026-10-03T00:00:00Z" }))
      expect(result.snapshot.status).toBe("late");
  });

  it("uses observed_at as legacy/null lower bound and does not filter deletion controls", async () => {
    const id = await entity();
    await assertion(id, "legacy", "2010-01-01T00:00:00Z");
    for (const result of await both(id, { valid_at: "2009-12-31T23:59:59Z" }))
      expect(result.snapshot).toEqual({});
    for (const result of await both(id, { valid_at: "2010-01-01T00:00:00Z" }))
      expect(result.snapshot.status).toBe("legacy");
    expect((await softDeleteEntity(id, type, PARITY_USER_ID)).success).toBe(true);
    for (const result of await both(id, { valid_at: "2010-01-01T00:00:00Z" }))
      expect(result.snapshot).toEqual({});
  });

  it("refuses malformed or impossible query instants at both public boundaries", async () => {
    const id = await entity();
    for (const valid_at of ["yesterday", "2026-02-30T00:00:00Z", "2026-10-01"]) {
      const response = await callHttp(http.base, "/get_entity_snapshot", {
        entity_id: id,
        valid_at,
      });
      expect(response.status).toBe(400);
      await expect(
        core.retrieveEntitySnapshot({ entity_id: id, valid_at, format: "json" })
      ).rejects.toThrow();
    }
  });
});
