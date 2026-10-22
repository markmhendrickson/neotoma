/** Public validity selection must compose with knowledge cutoffs and lifecycle authority. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { createOperations } from "../../src/core/operations.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { softDeleteEntity } from "../../src/services/deletion.js";
import { repairEntityType } from "../../src/services/schema_lag_repair.js";
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
  // Every row in this fixed type belongs to this owned synthetic fixture,
  // including evidence left by deliberate causal-failure runs.
  for (const table of ["raw_fragments", "observations", "entity_snapshots", "entities"])
    await db.from(table).delete().eq("entity_type", type).eq("user_id", PARITY_USER_ID);
  await seedTestSchema(server, type, { name: { type: "string" }, status: { type: "string" } });
  http = await startOfflineServer();
  // Conditional creation requires a complete declared identity in its test schema.
  const schema = await db
    .from("schema_registry")
    .update({
      schema_definition: {
        fields: { name: { type: "string" }, status: { type: "string" } },
        canonical_name_fields: ["name"],
      },
    })
    .eq("entity_type", type);
  expect(schema.error).toBeNull();
});
afterAll(async () => {
  for (const id of ids) {
    await db.from("raw_fragments").delete().eq("entity_id", id);
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

async function tool(name: string, input: Record<string, unknown>) {
  type Handler = (
    request: unknown,
    extra: unknown
  ) => Promise<{ content: Array<{ text: string }> }>;
  const internal = server as unknown as {
    mcpServer: { server: { _requestHandlers: Map<string, Handler> } };
  };
  const handler = internal.mcpServer.server._requestHandlers.get("tools/call");
  if (!handler) throw new Error("MCP tools/call is not registered");
  const result = await handler({ method: "tools/call", params: { name, arguments: input } }, {});
  return JSON.parse(result.content[0].text) as Record<string, any>;
}

async function physicalCounts() {
  const result: Record<string, number> = {};
  for (const table of ["sources", "entities", "observations", "store_condition_keys"]) {
    const rows = await db
      .from(table)
      .select(table === "entities" ? "id" : table === "store_condition_keys" ? "user_id" : "id")
      .eq("user_id", PARITY_USER_ID);
    expect(rows.error).toBeNull();
    result[table] = rows.data!.length;
  }
  return result;
}

describe("public snapshot valid_at selection", () => {
  it("composes validity with the supported explicit-null winning projection", async () => {
    const id = await entity();
    await assertion(id, "original", "2010-01-01T00:00:00Z");
    const corrected = await tool("correct", {
      entity_id: id,
      entity_type: type,
      field: "status",
      value: null,
      idempotency_key: randomUUID(),
      valid_from: "2020-01-01T00:00:00Z",
      valid_to: "2021-01-01T00:00:00Z",
    });
    const input = {
      entity_id: id,
      valid_at: "2020-01-01T00:00:00Z",
      include_cleared_fields: true,
      format: "json",
    };
    const response = await callHttp(http.base, "/get_entity_snapshot", input);
    expect(response.status).toBe(200);
    for (const result of [response.json, await tool("retrieve_entity_snapshot", input)]) {
      expect(result.cleared_fields_included).toBe(true);
      expect(result.snapshot).toMatchObject({ status: null });
      expect(result.provenance.status).toBe(corrected.observation_id);
    }
    for (const result of await both(id, { valid_at: "2021-01-01T00:00:00Z" }))
      expect(result.snapshot.status).toBe("original");
  });

  it("preserves legacy fragment promotion when no validity intent exists", async () => {
    const id = await entity();
    const field = "legacy_fragment_fixture";
    await tool("correct", {
      entity_id: id,
      entity_type: type,
      field,
      value: "legacy promotion",
      idempotency_key: randomUUID(),
    });
    const updated = await tool("update_schema_incremental", {
      entity_type: type,
      fields_to_add: [{ field_name: field, field_type: "string" }],
      migrate_existing: true,
    });
    expect(updated.migration_result.migrated_count).toBeGreaterThan(0);
    expect(
      updated.migration_result.skipped.some(
        (row: Record<string, unknown>) =>
          row.reason === "state_validity_requires_explicit_assertion"
      )
    ).toBe(false);
  });

  it.each(["bounded", "explicit-null"])(
    "%s validity intent refuses legacy fragment promotion without inventing a fresh interval",
    async (kind) => {
      const id = await entity();
      const field = kind === "bounded" ? "bounded_fragment_fixture" : "nullable_fragment_fixture";
      const input = {
        entity_id: id,
        entity_type: type,
        field,
        value: "original interval evidence",
        idempotency_key: randomUUID(),
        valid_from: kind === "bounded" ? "2020-01-01T00:00:00Z" : null,
        valid_to: kind === "bounded" ? "2021-01-01T00:00:00Z" : null,
      };
      const corrected = await tool("correct", input);
      const before = await db
        .from("observations")
        .select("id,fields,observed_at,valid_from,valid_to,provenance")
        .eq("entity_id", id);
      expect(
        before.data!.find((row) => row.id === corrected.observation_id)?.provenance
      ).toMatchObject({
        state_validity_request: {
          valid_from: kind === "bounded" ? "2020-01-01T00:00:00.000Z" : null,
          valid_to: kind === "bounded" ? "2021-01-01T00:00:00.000Z" : null,
        },
      });
      const updated = await tool("update_schema_incremental", {
        entity_type: type,
        fields_to_add: [{ field_name: field, field_type: "string" }],
        migrate_existing: true,
      });
      expect(updated.migration_result.migrated_count).toBe(0);
      expect(updated.migration_result.skipped).toContainEqual({
        field_name: field,
        reason: "state_validity_requires_explicit_assertion",
        count: 1,
      });
      const repair = await repairEntityType(type, PARITY_USER_ID, randomUUID(), [field]);
      expect(repair.inserted).toBe(0);
      expect(
        repair.errors.some((error) => error.includes("explicit interval-preserving write"))
      ).toBe(true);
      const after = await db
        .from("observations")
        .select("id,fields,observed_at,valid_from,valid_to,provenance")
        .eq("entity_id", id);
      expect(after.data).toEqual(before.data);
    }
  );

  it.each(["mcp", "http"])(
    "%s structured store retains canonical validity and replays through the other transport",
    async (surface) => {
      const input = {
        entities: [{ entity_type: type, name: randomUUID(), status: "bounded state" }],
        idempotency_key: randomUUID(),
        observation_source: "sensor",
        valid_from: "2026-01-01T01:00:00.123456789+01:00",
        valid_to: "2026-02-01T00:00:00Z",
      };
      const response =
        surface === "mcp"
          ? await tool("store", input)
          : (await callHttp(http.base, "/store", input)).json;
      const id = response.entities[0].entity_id;
      ids.push(id);
      const observationId = response.entities[0].observation_id;
      const retry = {
        ...input,
        valid_from: "2026-01-01T00:00:00.123456789Z",
        valid_to: "2026-02-01T00:00:00.000Z",
      };
      const replay =
        surface === "mcp"
          ? (await callHttp(http.base, "/store", retry)).json
          : await tool("store", retry);
      expect(replay.replayed).toBe(true);
      expect(replay.entities[0].observation_id).toBe(observationId);
      const history = (await core.listObservations({ entity_id: id })) as Record<string, any>;
      expect(history.observations).toMatchObject([
        {
          id: observationId,
          valid_from: "2026-01-01T00:00:00.123456789Z",
          valid_to: "2026-02-01T00:00:00.000Z",
        },
      ]);
      for (const result of await both(id, { valid_at: "2026-01-01T00:00:00.123456789Z" })) {
        expect(result.snapshot.status).toBe("bounded state");
        expect(result.provenance.status).toBe(observationId);
      }
      for (const result of await both(id, { valid_at: "2026-02-01T00:00:00Z" }))
        expect(result.snapshot).toEqual({});
      const changed = { ...input, valid_to: null };
      const refused = await callHttp(http.base, "/store", changed);
      expect(refused.status).toBe(400);
      expect((refused.json.error as Record<string, any>).code).toBe("ERR_IDEMPOTENCY_MISMATCH");
      await expect(tool("store", changed)).rejects.toMatchObject({
        code: -32602,
        data: { code: "ERR_IDEMPOTENCY_MISMATCH" },
      });
      const rows = await db.from("observations").select("id").eq("entity_id", id);
      expect(rows.data).toHaveLength(1);
    }
  );

  it("keeps a repeated state with a different interval distinct and differentiates omitted versus explicit null", async () => {
    const entities = [{ entity_type: type, name: randomUUID(), status: "same state" }];
    const legacyInput = { entities, idempotency_key: randomUUID() };
    const legacy = await tool("store", legacyInput);
    const id = legacy.entities[0].entity_id;
    ids.push(id);
    const legacySource = await db
      .from("sources")
      .select("content_hash")
      .eq("id", legacy.source_id)
      .single();
    expect(legacySource.data!.content_hash).toBe(
      createHash("sha256")
        .update(JSON.stringify(entities, null, 2))
        .digest("hex")
    );
    await expect(tool("store", { ...legacyInput, valid_from: null })).rejects.toMatchObject({
      data: { code: "ERR_IDEMPOTENCY_MISMATCH" },
    });
    const first = (await core.store({
      entities,
      idempotency_key: randomUUID(),
      valid_from: "2020-01-01T00:00:00Z",
      valid_to: "2021-01-01T00:00:00Z",
    })) as Record<string, any>;
    const second = await tool("store", {
      entities,
      idempotency_key: randomUUID(),
      valid_from: "2022-01-01T00:00:00Z",
      valid_to: "2023-01-01T00:00:00Z",
    });
    expect(first.entities[0].entity_id).toBe(id);
    expect(second.entities[0].entity_id).toBe(id);
    expect(first.entities[0].observation_id).not.toBe(second.entities[0].observation_id);
    const rows = await db.from("observations").select("id").eq("entity_id", id);
    expect(rows.data).toHaveLength(3);
  });

  it("conditional create includes validity in its immutable operation receipt and observation", async () => {
    const input = {
      entities: [{ entity_type: type, name: randomUUID(), status: "conditional" }],
      expected_entity_absent: true,
      idempotency_key: randomUUID(),
      valid_from: "2020-01-01T00:00:00Z",
      valid_to: "2021-01-01T00:00:00Z",
    };
    const first = await tool("store", input);
    const id = first.entities[0].entity_id;
    ids.push(id);
    const replay = await callHttp(http.base, "/store", {
      ...input,
      valid_from: "2020-01-01T01:00:00+01:00",
    });
    expect(replay.status).toBe(200);
    expect(replay.json.operation_receipt).toEqual({
      ...first.operation_receipt,
      status: "replayed",
    });
    for (const result of await both(id, { valid_at: "2020-01-01T00:00:00Z" }))
      expect(result.snapshot.status).toBe("conditional");
    const changed = await callHttp(http.base, "/store", { ...input, valid_to: null });
    expect(changed.status).toBe(409);
    expect((changed.json.error as Record<string, any>).code).toBe("IDEMPOTENCY_CONFLICT");
    const row = await db
      .from("observations")
      .select("valid_from,valid_to")
      .eq("id", first.entities[0].observation_id)
      .single();
    expect(row.data).toEqual({
      valid_from: "2020-01-01T00:00:00.000Z",
      valid_to: "2021-01-01T00:00:00.000Z",
    });
  });

  it.each(["mcp", "http"])(
    "%s combined file+entities applies validity only to the structured assertions",
    async (surface) => {
      const input = {
        entities: [{ entity_type: type, name: randomUUID(), status: "combined" }],
        idempotency_key: randomUUID(),
        file_idempotency_key: randomUUID(),
        file_content: Buffer.from("synthetic bounded state attachment").toString("base64"),
        mime_type: "text/plain",
        valid_from: "2020-01-01T00:00:00Z",
      };
      const response =
        surface === "mcp"
          ? await tool("store", input)
          : (await callHttp(http.base, "/store", input)).json;
      const id = (response.structured as Record<string, any>).entities[0].entity_id;
      ids.push(id);
      const rows = await db.from("observations").select("valid_from,valid_to").eq("entity_id", id);
      expect(rows.data).toMatchObject([{ valid_from: "2020-01-01T00:00:00.000Z", valid_to: null }]);
      for (const result of await both(id, { valid_at: "2020-01-01T00:00:00Z" }))
        expect(result.snapshot.status).toBe("combined");
    }
  );

  it.each(["mcp", "http"])(
    "%s unfinished end-only store resumes with the recorded original assertion clock across transports",
    async (surface) => {
      const names = [randomUUID(), randomUUID()];
      const input = {
        entities: names.map((name, index) => ({
          entity_type: type,
          name,
          status: index ? "interrupt validity fixture" : "first validity fixture",
        })),
        idempotency_key: randomUUID(),
        valid_to: "2090-01-01T00:00:00Z",
      };
      const native = await getDb();
      await native.exec(
        "CREATE TRIGGER synthetic_validity_resume BEFORE INSERT ON observations WHEN NEW.entity_type = 'synthetic_validity_query' AND json_extract(NEW.fields, '$.status') = 'interrupt validity fixture' BEGIN SELECT RAISE(ABORT, 'synthetic validity interruption'); END"
      );
      try {
        if (surface === "mcp")
          await expect(tool("store", input)).rejects.toThrow(/synthetic validity interruption/);
        else expect((await callHttp(http.base, "/store", input)).status).toBe(500);
      } finally {
        await native.exec("DROP TRIGGER IF EXISTS synthetic_validity_resume");
      }
      const source = await db
        .from("sources")
        .select("id,provenance")
        .eq("idempotency_key", input.idempotency_key)
        .single();
      expect(source.error).toBeNull();
      const clock = (source.data!.provenance as Record<string, any>).validity_asserted_at;
      expect(clock).toBeTypeOf("string");
      try {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2091-01-01T00:00:00Z"));
        const resumed =
          surface === "mcp"
            ? (await callHttp(http.base, "/store", input)).json
            : await tool("store", input);
        expect(resumed.entities).toHaveLength(2);
        for (const row of resumed.entities) ids.push(row.entity_id);
      } finally {
        vi.useRealTimers();
      }
      const rows = await db
        .from("observations")
        .select("observed_at,valid_to")
        .eq("source_id", source.data!.id);
      expect(rows.data).toHaveLength(2);
      for (const row of rows.data!)
        expect(row).toEqual({ observed_at: clock, valid_to: "2090-01-01T00:00:00.000Z" });
    }
  );

  it("standalone interpretation rejects new top-level validity metadata without writing or reclassifying entity fields", async () => {
    const before = await physicalCounts();
    const input = {
      source_id: "synthetic-unavailable-source",
      entities: [
        { entity_type: type, name: randomUUID(), valid_from: "ordinary entity date field" },
      ],
      valid_from: "2020-01-01T00:00:00Z",
    };
    await expect(tool("create_interpretation", input)).rejects.toMatchObject({
      code: -32602,
      data: { code: "VALIDATION_INVALID_FORMAT" },
    });
    expect((await callHttp(http.base, "/interpretations/create", input)).status).toBe(400);
    expect(await physicalCounts()).toEqual(before);
  });

  it("invalid store intervals and unsupported new combinations refuse both legs before any persistence", async () => {
    const before = await physicalCounts();
    const base = {
      entities: [{ entity_type: type, name: randomUUID(), status: "refused" }],
      idempotency_key: randomUUID(),
      file_idempotency_key: randomUUID(),
      file_content: Buffer.from("must not persist").toString("base64"),
      mime_type: "text/plain",
    };
    for (const input of [
      { ...base, valid_from: "2026-02-30T00:00:00Z" },
      { ...base, valid_to: "2000-01-01T00:00:00Z" },
      {
        ...base,
        valid_from: "2020-01-01T00:00:00Z",
        interpretation: { source_ref: "unstructured" },
      },
      { ...base, entities: undefined, valid_from: null },
      { ...base, valid_from: null, intake: { mode: "overflow" } },
    ]) {
      const response = await callHttp(http.base, "/store", input);
      expect(await physicalCounts()).toEqual(before);
      expect(response.status).toBe(400);
      const code = response.json.error_code ?? (response.json.error as Record<string, any>)?.code;
      await expect(tool("store", input)).rejects.toMatchObject({
        data: { code: "intake" in input ? "VALIDATION_ERROR" : code },
      });
      expect(await physicalCounts()).toEqual(before);
    }
  });

  it("low-level HTTP observation writes validate before resolution and expose validity in snapshots", async () => {
    const name = randomUUID();
    const input = {
      entity_type: type,
      entity_identifier: name,
      fields: { name, status: "direct" },
      user_id: PARITY_USER_ID,
      valid_from: "2020-01-01T00:00:00Z",
      valid_to: "2021-01-01T00:00:00Z",
    };
    const response = await callHttp(http.base, "/observations/create", input);
    expect(response.status).toBe(200);
    const row = await db
      .from("observations")
      .select("entity_id,valid_from,valid_to")
      .eq("id", response.json.observation_id)
      .single();
    const id = row.data!.entity_id;
    ids.push(id);
    expect(row.data).toMatchObject({
      valid_from: "2020-01-01T00:00:00.000Z",
      valid_to: "2021-01-01T00:00:00.000Z",
    });
    for (const result of await both(id, { valid_at: "2020-01-01T00:00:00Z" }))
      expect(result.snapshot.status).toBe("direct");
    const before = await physicalCounts();
    const invalid = await callHttp(http.base, "/observations/create", {
      ...input,
      entity_identifier: randomUUID(),
      valid_to: "2010-01-01T00:00:00Z",
    });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error_code).toBe("VALIDATION_INVALID_FORMAT");
    expect(await physicalCounts()).toEqual(before);
  });

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
      const refused = await callHttp(http.base, "/correct", input);
      expect(refused.status).toBe(400);
      expect(refused.json.error_code).toBe("VALIDATION_INVALID_FORMAT");
      await expect(tool("correct", input)).rejects.toMatchObject({
        code: -32602,
        data: { code: "VALIDATION_INVALID_FORMAT" },
      });
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
