import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { LOCAL_DEV_USER_ID as owner } from "../../src/services/local_auth.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";
const kind = "null_projection_" + randomUUID().replaceAll("-", "");
const ids: string[] = [];
let server: ReturnType<typeof createServer>, base: string;
async function request(endpoint: string, body?: unknown) {
  const r = await fetch(
    base + endpoint,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
  );
  return { status: r.status, body: await r.json() };
}
beforeAll(async () => {
  expect(process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest")).toBe(true);
  server = createServer(app);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const a = server.address();
  if (!a || typeof a === "string") throw Error("Owned loopback required");
  base = "http://127.0.0.1:" + a.port;
  const fields = {
    title: { type: "string", required: true, preserveCase: true },
    reason: { type: "string", preserveCase: true },
    absent: { type: "string" },
    flag: { type: "boolean" },
    count: { type: "number" },
    payload: { type: "object" },
    items: { type: "array" },
  };
  expect(
    (
      await request("/register_schema", {
        entity_type: kind,
        schema_version: "1.0",
        activate: true,
        schema_definition: { canonical_name_fields: ["title"], identity_fields: ["title"], fields },
        reducer_config: {
          merge_policies: Object.fromEntries(
            Object.keys(fields).map((f) => [f, { strategy: "last_write" }])
          ),
        },
      })
    ).status
  ).toBe(200);
});
afterAll(async () => {
  vi.restoreAllMocks();
  if (server) await new Promise<void>((ok) => server.close(() => ok()));
  for (const id of ids) {
    for (const t of ["raw_fragments", "timeline_events", "entity_snapshots", "observations"])
      await db.from(t).delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  }
  await db.from("schema_registry").delete().eq("entity_type", kind).eq("user_id", owner);
});
async function target(fields: Record<string, unknown> = {}) {
  const s = await request("/store", {
    entities: [{ entity_type: kind, title: randomUUID(), reason: "initial", ...fields }],
    strict: true,
    idempotency_key: randomUUID(),
  });
  expect(s.status).toBe(200);
  const id = s.body.entities[0].entity_id;
  ids.push(id);
  return (await request("/entities/" + id)).body;
}
function transaction(row: any, changes: { field: string; value: unknown }[], key = randomUUID()) {
  return {
    idempotency_key: key,
    entities: [
      {
        entity_id: row.entity_id,
        entity_type: kind,
        expected_observation_count: row.observation_count,
        expected_snapshot: row.snapshot,
        changes,
      },
    ],
  };
}
async function nullable(id: string, extra = {}) {
  return request("/get_entity_snapshot", { entity_id: id, include_cleared_fields: true, ...extra });
}
it("atomic null commits with an exact null winner while default omitted and false responses stay equal", async () => {
  const row = await target();
  const r = await request(
    "/corrections/transaction",
    transaction(row, [{ field: "reason", value: null }])
  );
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  expect(r.body.status).toBe("applied");
  const result = r.body.entities[0];
  expect(result.cleared_fields_included).toBe(true);
  expect(result.snapshot).toHaveProperty("reason", null);
  const defaultRead = (await request("/get_entity_snapshot", { entity_id: row.entity_id })).body;
  const falseRead = (
    await request("/get_entity_snapshot", {
      entity_id: row.entity_id,
      include_cleared_fields: false,
    })
  ).body;
  expect(defaultRead).toEqual(falseRead);
  expect(defaultRead.snapshot).not.toHaveProperty("reason");
  expect(defaultRead.provenance).not.toHaveProperty("reason");
  expect(defaultRead).not.toHaveProperty("cleared_fields_included");
  const visible = (await nullable(row.entity_id)).body;
  expect(visible.snapshot).toHaveProperty("reason", null);
  expect(visible.provenance.reason).toBe(result.provenance.reason);
  const origin = (
    await db.from("observations").select("*").eq("id", visible.provenance.reason).single()
  ).data!;
  expect(origin).toMatchObject({
    entity_id: row.entity_id,
    user_id: owner,
    fields: { reason: null },
  });
  expect(origin.idempotency_key).toMatch(/^correction-transaction:/);
  expect(visible.snapshot).not.toHaveProperty("absent");
});
it("binds explicit null in a subsequent CAS baseline without conflating false, zero or empty", async () => {
  const row = await target({ flag: false, count: 0 });
  expect(
    (
      await request(
        "/corrections/transaction",
        transaction(row, [{ field: "reason", value: null }])
      )
    ).status
  ).toBe(200);
  const next = (await nullable(row.entity_id)).body;
  expect(next.snapshot).toMatchObject({ reason: null, flag: false, count: 0 });
  const r = await request(
    "/corrections/transaction",
    transaction(next, [{ field: "reason", value: "" }])
  );
  expect(r.status).toBe(200);
  expect(r.body.entities[0].snapshot.reason).toBe("");
});
it("clears a required string and declared object/array using their existing last-write strategy", async () => {
  const row = await target({ payload: { k: 1 }, items: [1] });
  const r = await request(
    "/corrections/transaction",
    transaction(row, [
      { field: "title", value: null },
      { field: "payload", value: null },
      { field: "items", value: null },
    ])
  );
  expect(r.status).toBe(200);
  expect(r.body.entities[0].snapshot).toMatchObject({ title: null, payload: null, items: null });
});
it("replays the exact durable request without growth and reports later current foreign winner honestly", async () => {
  const row = await target();
  const args = transaction(row, [{ field: "reason", value: null }]);
  const first = await request("/corrections/transaction", args);
  expect(first.status).toBe(200);
  const replay = await request("/corrections/transaction", args);
  expect(replay.body.status).toBe("replayed");
  expect(replay.body.entities[0].observation_count).toBe(first.body.entities[0].observation_count);
  expect(
    (
      await request("/corrections/transaction", {
        ...args,
        entities: [{ ...args.entities[0], changes: [{ field: "reason", value: "changed" }] }],
      })
    ).status
  ).toBe(409);
  const later = await request(
    "/corrections/transaction",
    transaction(first.body.entities[0], [{ field: "reason", value: "human later" }])
  );
  expect(later.status).toBe(200);
  const superseded = await request("/corrections/transaction", args);
  expect(superseded.body.status).toBe("replayed");
  expect(superseded.body.entities[0].snapshot.reason).toBe("human later");
  expect(superseded.body.entities[0].provenance.reason).not.toBe(
    first.body.entities[0].provenance.reason
  );
});
it("stale and undeclared requests refuse with no partial observation growth", async () => {
  const row = await target();
  const before = row.observation_count;
  const stale = transaction(row, [{ field: "reason", value: null }]);
  stale.entities[0].expected_observation_count++;
  expect((await request("/corrections/transaction", stale)).status).toBe(409);
  expect(
    (
      await request(
        "/corrections/transaction",
        transaction(row, [{ field: "undeclared", value: null }])
      )
    ).status
  ).toBe(400);
  expect((await request("/entities/" + row.entity_id)).body.observation_count).toBe(before);
});
it("rolls back a null first write when a second write fails", async () => {
  const row = await target();
  const conn = await getDb();
  await conn.exec(
    "CREATE TRIGGER owned_null_second_failure BEFORE INSERT ON observations WHEN NEW.entity_id = '" +
      row.entity_id +
      "' AND json_extract(NEW.fields, '$.title') = 'fail second' BEGIN SELECT RAISE(ABORT, 'owned failure'); END"
  );
  try {
    const r = await request(
      "/corrections/transaction",
      transaction(row, [
        { field: "reason", value: null },
        { field: "title", value: "fail second" },
      ])
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
    const after = (await request("/entities/" + row.entity_id)).body;
    expect(after.snapshot).toEqual(row.snapshot);
    expect(after.observation_count).toBe(row.observation_count);
  } finally {
    await conn.exec("DROP TRIGGER owned_null_second_failure");
  }
});
it("strict HTTP and modern MCP booleans cannot be stripped or coerced", async () => {
  const row = await target();
  for (const value of ["true", 1, null, {}, []]) {
    expect(
      (
        await request("/get_entity_snapshot", {
          entity_id: row.entity_id,
          include_cleared_fields: value,
        })
      ).status
    ).toBe(400);
    const r = await modernPost(base, {
      id: 1,
      method: "tools/call",
      params: {
        name: "retrieve_entity_snapshot",
        arguments: { entity_id: row.entity_id, format: "json", include_cleared_fields: value },
      },
    });
    expect(r.body.error || r.body.result?.isError).toBeTruthy();
  }
});
it("modern MCP exposes null and the support marker, and default keeps omission", async () => {
  const row = await target();
  expect(
    (
      await request(
        "/corrections/transaction",
        transaction(row, [{ field: "reason", value: null }])
      )
    ).status
  ).toBe(200);
  const r = await modernPost(base, {
    id: 2,
    method: "tools/call",
    params: {
      name: "retrieve_entity_snapshot",
      arguments: { entity_id: row.entity_id, format: "json", include_cleared_fields: true },
    },
  });
  expect(toolResultJson(r.body)).toMatchObject({
    cleared_fields_included: true,
    snapshot: { reason: null },
  });
});
it("compiled generic request carries opt-in and refuses a malformed flag", async () => {
  const row = await target();
  expect(
    (
      await request(
        "/corrections/transaction",
        transaction(row, [{ field: "reason", value: null }])
      )
    ).status
  ).toBe(200);
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NEOTOMA_BASE_URL: base,
    NEOTOMA_REPO_ROOT: process.cwd(),
    NEOTOMA_ENV: "development",
    NODE_OPTIONS: process.env.NODE_OPTIONS,
  };
  const run = (value: unknown) =>
    promisify(execFile)(
      process.execPath,
      [
        path.join(process.cwd(), "dist/cli/index.js"),
        "--api-only",
        "--base-url",
        base,
        "--no-log-file",
        "request",
        "--operation",
        "getEntitySnapshot",
        "--body",
        JSON.stringify({ entity_id: row.entity_id, include_cleared_fields: value }),
        "--json",
      ],
      { env, timeout: 30_000 }
    );
  const result = await run(true);
  expect(JSON.parse(result.stdout)).toMatchObject({
    cleared_fields_included: true,
    snapshot: { reason: null },
  });
  await expect(run("true")).rejects.toThrow();
});
it("reuses event/ingestion filters and never reports future clears as earlier knowledge", async () => {
  const row = await target();
  const now = "2026-01-01T00:00:00.000Z";
  expect(
    (
      await db
        .from("observations")
        .update({ observed_at: now, created_at: now })
        .eq("entity_id", row.entity_id)
    ).error
  ).toBeNull();
  expect(
    (
      await db.from("observations").insert({
        id: randomUUID(),
        entity_id: row.entity_id,
        entity_type: kind,
        user_id: owner,
        schema_version: "1.0",
        source_priority: 100,
        fields: { reason: null },
        observed_at: "2026-02-01T00:00:00.000Z",
        created_at: "2026-03-01T00:00:00.000Z",
      })
    ).error
  ).toBeNull();
  await recomputeSnapshot(row.entity_id, owner);
  const event = (await nullable(row.entity_id, { at: "2026-02-15T00:00:00Z" })).body;
  const ingestion = (await nullable(row.entity_id, { at_ingested: "2026-02-15T00:00:00Z" })).body;
  const mixed = (
    await nullable(row.entity_id, {
      at: "2026-02-15T00:00:00Z",
      at_ingested: "2026-02-15T00:00:00Z",
    })
  ).body;
  expect(event.snapshot.reason).toBeNull();
  expect(ingestion.snapshot.reason).toBe("initial");
  expect(mixed.snapshot.reason).toBe("initial");
});
it("requires explicit owner and an actual active schema without default fallback", async () => {
  const row = await target();
  await expect(
    getEntityWithProvenance(row.entity_id, false, undefined, { includeClearedFields: true })
  ).rejects.toThrow(/owner/);
  expect(
    await getEntityWithProvenance(row.entity_id, false, randomUUID(), {
      includeClearedFields: true,
    })
  ).toBeNull();
  const load = vi.spyOn(schemaRegistry, "loadActiveSchema").mockResolvedValue(null);
  try {
    expect((await nullable(row.entity_id)).status).toBe(500);
  } finally {
    load.mockRestore();
  }
});
