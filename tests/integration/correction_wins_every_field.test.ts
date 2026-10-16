/**
 * End-to-end: a correction stays authoritative until a later correction
 * replaces it, whatever the field's declared merge rule (issue #2033).
 *
 * Drives the real write paths (MCP `store`, MCP `correct`, REST `/correct`)
 * against the local database and reads the materialised snapshot back. It also
 * pins, against real rows, the one fact the reducer relies on to recognise a
 * correction: that `createCorrection`'s row satisfies `isCorrectionObservation`
 * and that no row written through the public store path does, even at
 * `source_priority: 1000` (the spoofing guard).
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { resolveOwnedObservations } from "../../src/services/attachment_resolution.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

vi.mock("../../src/embeddings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings.js")>();
  return {
    ...original,
    generateEmbedding: vi.fn().mockResolvedValue(null),
  };
});

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_corrections_win_2033";
let apiBase: string;

type McpTextResult = { content: Array<{ type?: string; text: string }> };

type TestServer = NeotomaServer & {
  authenticatedUserId?: string | null;
  store: (args: Record<string, unknown>) => Promise<McpTextResult>;
  correct: (args: Record<string, unknown>) => Promise<McpTextResult>;
  retrieveEntitySnapshot: (args: Record<string, unknown>) => Promise<McpTextResult>;
};

function parse(result: McpTextResult): Record<string, any> {
  return JSON.parse(result.content.find((c) => c.text)?.text ?? "{}");
}

async function snapshot(server: TestServer, entityId: string): Promise<Record<string, any>> {
  return parse(await server.retrieveEntitySnapshot({ entity_id: entityId, format: "json" }));
}

async function store(
  server: TestServer,
  label: string,
  fields: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const stored = parse(
    await server.store({
      user_id: USER_ID,
      idempotency_key: `store-2033-${randomUUID()}`,
      commit: true,
      entities: [{ entity_type: TYPE, label, ...fields }],
      ...extra,
    })
  );
  const entityId = stored.entities?.[0]?.entity_id;
  expect(typeof entityId).toBe("string");
  return entityId;
}

async function correct(
  server: TestServer,
  entityId: string,
  field: string,
  value: unknown
): Promise<void> {
  await server.correct({
    user_id: USER_ID,
    entity_id: entityId,
    entity_type: TYPE,
    field,
    value,
    idempotency_key: `correct-2033-${randomUUID()}`,
  });
}

/** observed_at has millisecond resolution; make the later write strictly later. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function cleanupType(): Promise<void> {
  const { data: entities } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", TYPE)
    .eq("user_id", USER_ID);
  const entityIds = (entities ?? []).map((e: { id: string }) => e.id);
  if (entityIds.length > 0) {
    const { data: observations } = await db
      .from("observations")
      .select("source_id")
      .in("entity_id", entityIds);
    const sourceIds = Array.from(
      new Set(
        (observations ?? [])
          .map((r: { source_id?: string | null }) => r.source_id)
          .filter((v: unknown): v is string => typeof v === "string")
      )
    );
    await db.from("timeline_events").delete().in("entity_id", entityIds);
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("raw_fragments").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);
    if (sourceIds.length > 0) await db.from("sources").delete().in("id", sourceIds);
  }
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
}

describe("a correction wins on every field until a later correction replaces it (#2033)", () => {
  let server: TestServer;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    await cleanupType();
    server = new NeotomaServer() as TestServer;
    server.authenticatedUserId = USER_ID;

    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          label: { type: "string", required: true },
          last_write_field: { type: "string", required: false, preserveCase: true },
          priority_field: { type: "string", required: false, preserveCase: true },
          specific_field: { type: "string", required: false, preserveCase: true },
        },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write" },
          last_write_field: { strategy: "last_write" },
          priority_field: { strategy: "highest_priority" },
          specific_field: { strategy: "most_specific" },
        },
      },
      user_id: USER_ID,
      user_specific: true,
      activate: true,
      force: true,
    });

    httpServer = createServer(app);
    await new Promise<void>((resolveListen, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolveListen());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected TCP listen address");
    apiBase = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupType();
  });

  it("keeps an MCP correction when a later ordinary store rewrites the field, under last_write, highest_priority and most_specific", async () => {
    const label = `mcp-${randomUUID()}`;
    const entityId = await store(server, label, {
      last_write_field: "original",
      priority_field: "original",
      specific_field: "original",
    });

    for (const field of ["last_write_field", "priority_field", "specific_field"]) {
      await tick();
      await correct(server, entityId, field, "corrected");
    }

    await tick();
    await store(server, label, {
      last_write_field: "re-ingested",
      priority_field: "re-ingested",
      specific_field: "re-ingested",
    });

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.last_write_field).toBe("corrected");
    expect(snap.snapshot.priority_field).toBe("corrected");
    expect(snap.snapshot.specific_field).toBe("corrected");
  });

  it("keeps a correction against a later store at a higher source_priority on a last_write field", async () => {
    const label = `higher-${randomUUID()}`;
    const entityId = await store(server, label, { last_write_field: "original" });
    await tick();
    await correct(server, entityId, "last_write_field", "corrected");

    await tick();
    await store(
      server,
      label,
      { last_write_field: "assertive re-ingest" },
      { source_priority: 5000 }
    );

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.last_write_field).toBe("corrected");
  });

  it("lets a later correction replace an earlier one even after an ordinary write between them", async () => {
    const label = `replace-${randomUUID()}`;
    const entityId = await store(server, label, { last_write_field: "original" });
    await tick();
    await correct(server, entityId, "last_write_field", "first correction");
    await tick();
    await store(server, label, { last_write_field: "ordinary between" });
    await tick();
    await correct(server, entityId, "last_write_field", "second correction");
    await tick();
    await store(server, label, { last_write_field: "ordinary after" });

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.last_write_field).toBe("second correction");
  });

  it("keeps a REST /correct correction against a later ordinary store", async () => {
    const label = `rest-${randomUUID()}`;
    const entityId = await store(server, label, { last_write_field: "original" });
    await tick();
    const response = await fetch(`${apiBase}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        entity_id: entityId,
        entity_type: TYPE,
        field: "last_write_field",
        value: "rest corrected",
        idempotency_key: `rest-correct-${randomUUID()}`,
      }),
    });
    expect(response.status).toBe(200);

    await tick();
    await store(server, label, { last_write_field: "re-ingested" });

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.last_write_field).toBe("rest corrected");
  });

  it("recognises the row createCorrection writes, and no row the public store path writes, even at priority 1000", async () => {
    const label = `pin-${randomUUID()}`;
    const entityId = await store(server, label, { last_write_field: "original" });
    await tick();
    await correct(server, entityId, "last_write_field", "corrected");
    await tick();
    // The public path, asking for the correction's own priority. It must not
    // be mistaken for a correction: observation_source is always stamped.
    await store(server, label, { last_write_field: "forged" }, { source_priority: 1000 });

    // Imported here so the rest of this file still runs against a tree that
    // lacks the module, which is how the red results in the PR were captured.
    const { isCorrectionObservation } = await import("../../src/services/correction_identity.js");
    const rows = (await resolveOwnedObservations(entityId, USER_ID)) ?? [];
    const corrections = rows.filter((row) => isCorrectionObservation(row));
    const ordinary = rows.filter((row) => !isCorrectionObservation(row));

    expect(corrections).toHaveLength(1);
    expect(corrections[0].fields).toEqual({ last_write_field: "corrected" });
    expect(ordinary.map((row) => row.fields.last_write_field).sort()).toEqual(
      ["forged", "original"].sort()
    );
    expect(ordinary.every((row) => !!row.observation_source)).toBe(true);
  });

  it("an explicit recompute repairs a snapshot an earlier version left reverted", async () => {
    const label = `recompute-${randomUUID()}`;
    const entityId = await store(server, label, { last_write_field: "original" });
    await tick();
    await correct(server, entityId, "last_write_field", "corrected");
    await tick();
    await store(server, label, { last_write_field: "re-ingested" });

    // Put back the snapshot the pre-fix reducer would have materialised.
    const current = await snapshot(server, entityId);
    const { error } = await db
      .from("entity_snapshots")
      .update({ snapshot: { ...current.snapshot, last_write_field: "re-ingested" } })
      .eq("entity_id", entityId)
      .eq("user_id", USER_ID);
    expect(error).toBeNull();
    expect((await snapshot(server, entityId)).snapshot.last_write_field).toBe("re-ingested");

    const response = await fetch(`${apiBase}/recompute_snapshots_by_type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: TYPE }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { recomputed?: number; errors?: number };
    expect(body.errors).toBe(0);

    expect((await snapshot(server, entityId)).snapshot.last_write_field).toBe("corrected");
  });
});
