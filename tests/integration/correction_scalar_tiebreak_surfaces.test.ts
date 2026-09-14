import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_scalar_tiebreak_2394";
const API_PORT = 18294;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

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

async function createEntity(server: TestServer, label: string): Promise<string> {
  const stored = parse(
    await server.store({
      user_id: USER_ID,
      idempotency_key: `seed-2394-${label}-${randomUUID()}`,
      commit: true,
      entities: [
        {
          entity_type: TYPE,
          label,
          notes: "initial notes",
          description: "initial description",
        },
      ],
    })
  );
  const entityId = stored.entities?.[0]?.entity_id;
  expect(typeof entityId).toBe("string");
  return entityId;
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

describe("same-tier scalar corrections update readable snapshots (#2394)", () => {
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
          notes: { type: "string", required: false, preserveCase: true },
          description: { type: "string", required: false, preserveCase: true },
        },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write" },
          notes: { strategy: "highest_priority", tie_breaker: "source_priority" },
          description: { strategy: "highest_priority", tie_breaker: "source_priority" },
        },
      },
      user_id: USER_ID,
      user_specific: true,
      activate: true,
      force: true,
    });

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupType();
  });

  it("MCP correct readback returns the second same-priority scalar correction", async () => {
    const entityId = await createEntity(server, `mcp-${randomUUID()}`);

    await server.correct({
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "notes",
      value: "checkpoint one",
      idempotency_key: `mcp-one-${randomUUID()}`,
    });
    await server.correct({
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "notes",
      value: "checkpoint two",
      idempotency_key: `mcp-two-${randomUUID()}`,
    });

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.notes).toBe("checkpoint two");
    expect(typeof snap.provenance.notes).toBe("string");
    expect(snap.provenance.notes).not.toHaveLength(0);
  });

  it("REST /correct readback returns the second same-priority scalar correction", async () => {
    const entityId = await createEntity(server, `http-correct-${randomUUID()}`);

    for (const value of ["description one", "description two"]) {
      const response = await fetch(`${API_BASE}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          entity_id: entityId,
          entity_type: TYPE,
          field: "description",
          value,
          idempotency_key: `http-correct-${value}-${randomUUID()}`,
        }),
      });
      expect(response.status).toBe(200);
    }

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.description).toBe("description two");
    expect(typeof snap.provenance.description).toBe("string");
    expect(snap.provenance.description).not.toHaveLength(0);
  });

  it("REST batch_correct readback returns the second same-priority scalar correction", async () => {
    const entityId = await createEntity(server, `batch-${randomUUID()}`);

    for (const value of ["batch one", "batch two"]) {
      const before = await snapshot(server, entityId);
      const response = await fetch(
        `${API_BASE}/entities/${encodeURIComponent(entityId)}/batch_correct`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: USER_ID,
            expected_last_observation_at: before.last_observation_at,
            changes: [{ field: "notes", value }],
            idempotency_prefix: `batch-${value}-${randomUUID()}`,
          }),
        }
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        status?: string;
        snapshot?: Record<string, unknown>;
      };
      expect(body.status).toBe("applied");
      expect(body.snapshot?.notes).toBe(value);
    }

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.notes).toBe("batch two");
  });

  it("store still respects a legitimately higher-priority scalar source over a later normal correction", async () => {
    const label = `store-priority-${randomUUID()}`;
    const entityId = await createEntity(server, label);

    const stored = parse(
      await server.store({
        user_id: USER_ID,
        idempotency_key: `store-priority-${randomUUID()}`,
        commit: true,
        source_priority: 1500,
        entities: [
          {
            entity_type: TYPE,
            label,
            notes: "trusted store value",
          },
        ],
      })
    );
    expect(stored.entities?.[0]?.entity_id).toBe(entityId);

    await server.correct({
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "notes",
      value: "later normal correction",
      idempotency_key: `normal-correction-${randomUUID()}`,
    });

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.notes).toBe("trusted store value");
  });
});
