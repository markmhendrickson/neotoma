/**
 * Public-surface regression tests for issue #2033.
 *
 * The reserved-source guard binds the client transport boundary (HTTP
 * `POST /store` and the MCP `store` tool), not the internal
 * `storeStructuredForApi` service, so it is exercised here through the
 * natural call shapes an agent uses:
 *
 * - durability effect, end to end: seed A -> real `correct` to B -> later
 *   ordinary write of A -> snapshot stays B (HTTP and MCP);
 * - reject-not-strip: a client claiming `observation_source: "correction"`
 *   or `source_priority: 1000` gets a 4xx `RESERVED_OBSERVATION_SOURCE`
 *   envelope and nothing is persisted, including the file leg of a combined
 *   file+entities request and the `expected_entity_absent` branch;
 * - internal privileged writers (sync prefer_remote) are not refused.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { app, storeStructuredForApi } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { cleanupTestSchema, seedTestSchema } from "../helpers/test_schema_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
let API_BASE: string;
const ENTITY_TYPE = "correction_surface_2033";

type ToolCallHandler = (
  request: { method: string; params: { name: string; arguments: unknown } },
  extra: Record<string, unknown>
) => Promise<{ content: Array<{ type: string; text: string }> }>;

function mcpToolCall(server: NeotomaServer): ToolCallHandler {
  const internal = server as unknown as {
    authenticatedUserId: string;
    mcpServer: { server: { _requestHandlers: Map<string, ToolCallHandler> } };
  };
  internal.authenticatedUserId = TEST_USER_ID;
  const handler = internal.mcpServer.server._requestHandlers.get("tools/call");
  if (!handler) throw new Error("tools/call handler not registered");
  return handler;
}

async function callTool(server: NeotomaServer, name: string, args: Record<string, unknown>) {
  const result = await mcpToolCall(server)(
    { method: "tools/call", params: { name, arguments: args } },
    {}
  );
  return JSON.parse(result.content[0].text) as Record<string, any>;
}

async function postJson(route: string, body: Record<string, unknown>) {
  const resp = await fetch(`${API_BASE}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: resp.status, body: (await resp.json()) as Record<string, any> };
}

async function observationCount(idempotencyKey: string): Promise<number> {
  const { data } = await db
    .from("observations")
    .select("id")
    .eq("user_id", TEST_USER_ID)
    .eq("idempotency_key", idempotencyKey);
  return (data ?? []).length;
}

async function sourceCount(): Promise<number> {
  const { data } = await db.from("sources").select("id").eq("user_id", TEST_USER_ID);
  return (data ?? []).length;
}

async function snapshotField(entityId: string, field: string): Promise<unknown> {
  const { data } = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .eq("user_id", TEST_USER_ID)
    .single();
  return (data?.snapshot as Record<string, unknown> | undefined)?.[field];
}

describe("correction durability across public surfaces (#2033)", () => {
  let httpServer: ReturnType<typeof createServer>;
  const createdEntityIds: string[] = [];
  const tempDirs: string[] = [];

  beforeAll(async () => {
    // Every seeded field resolves under last_write, the policy #2033 is about.
    await seedTestSchema(new NeotomaServer(), ENTITY_TYPE, {
      name: { type: "string", required: false },
      status: { type: "string", required: false },
      revision: { type: "number", required: false },
    });
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("No test TCP address");
    API_BASE = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (createdEntityIds.length > 0) {
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
    }
    await cleanupTestSchema(ENTITY_TYPE);
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("HTTP: seed A -> POST /correct B -> later POST /store A keeps B", async () => {
    const name = `http-durability-${randomUUID()}`;
    const seeded = await postJson("/store", {
      user_id: TEST_USER_ID,
      idempotency_key: `${name}-seed`,
      entities: [{ entity_type: ENTITY_TYPE, name, status: "A" }],
    });
    expect(seeded.status).toBe(200);
    const entityId = seeded.body.entities[0].entity_id as string;
    createdEntityIds.push(entityId);

    const corrected = await postJson("/correct", {
      user_id: TEST_USER_ID,
      entity_id: entityId,
      entity_type: ENTITY_TYPE,
      field: "status",
      value: "B",
      idempotency_key: `${name}-correct`,
    });
    expect(corrected.status).toBe(200);

    const reingested = await postJson("/store", {
      user_id: TEST_USER_ID,
      idempotency_key: `${name}-reingest`,
      // A distinct revision makes this a new, later observation rather than
      // a content-addressed replay of the seed write.
      entities: [{ entity_type: ENTITY_TYPE, name, status: "A", revision: 2 }],
    });
    expect(reingested.status).toBe(200);
    expect(reingested.body.entities[0].entity_id).toBe(entityId);

    const snapshot = await postJson("/get_entity_snapshot", { entity_id: entityId });
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.snapshot.revision).toBe(2);
    expect(snapshot.body.snapshot.status).toBe("B");
  });

  it("MCP: seed A -> correct B -> later store A keeps B", async () => {
    const server = new NeotomaServer();
    const name = `mcp-durability-${randomUUID()}`;
    const seeded = await callTool(server, "store", {
      idempotency_key: `${name}-seed`,
      entities: [{ entity_type: ENTITY_TYPE, name, status: "A" }],
    });
    const entityId = seeded.entities[0].entity_id as string;
    createdEntityIds.push(entityId);

    await callTool(server, "correct", {
      entity_id: entityId,
      entity_type: ENTITY_TYPE,
      field: "status",
      value: "B",
      idempotency_key: `${name}-correct`,
    });

    const reingested = await callTool(server, "store", {
      idempotency_key: `${name}-reingest`,
      // A distinct revision makes this a new, later observation rather than
      // a content-addressed replay of the seed write.
      entities: [{ entity_type: ENTITY_TYPE, name, status: "A", revision: 2 }],
    });
    expect(reingested.entities[0].entity_id).toBe(entityId);

    const snapshot = await callTool(server, "retrieve_entity_snapshot", {
      entity_id: entityId,
      format: "json",
    });
    expect(snapshot.snapshot.revision).toBe(2);
    expect(snapshot.snapshot.status).toBe("B");
  });

  for (const claim of [
    { label: "observation_source: correction", body: { observation_source: "correction" } },
    { label: "source_priority: 1000", body: { source_priority: 1000 } },
  ]) {
    it(`HTTP /store rejects ${claim.label} with RESERVED_OBSERVATION_SOURCE and persists nothing`, async () => {
      const key = `http-reserved-${randomUUID()}`;
      const { status, body } = await postJson("/store", {
        user_id: TEST_USER_ID,
        idempotency_key: key,
        entities: [{ entity_type: ENTITY_TYPE, name: key, status: "forged" }],
        ...claim.body,
      });
      expect(status).toBe(400);
      expect(body.error_code).toBe("RESERVED_OBSERVATION_SOURCE");
      expect(body.details.hint).toContain("correct({ entity_id, field, value })");
      expect(await observationCount(key)).toBe(0);
    });

    it(`MCP store rejects ${claim.label} with the same envelope and persists nothing`, async () => {
      const key = `mcp-reserved-${randomUUID()}`;
      await expect(
        mcpToolCall(new NeotomaServer())(
          {
            method: "tools/call",
            params: {
              name: "store",
              arguments: {
                idempotency_key: key,
                entities: [{ entity_type: ENTITY_TYPE, name: key, status: "forged" }],
                ...claim.body,
              },
            },
          },
          {}
        )
      ).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        data: {
          error_code: "RESERVED_OBSERVATION_SOURCE",
          details: { hint: expect.stringContaining("correct({ entity_id, field, value })") },
        },
      });
      expect(await observationCount(key)).toBe(0);
    });
  }

  it.each([{ source_priority: 1000 }, { observation_source: "correction" }])(
    "HTTP /observations/create rejects reserved authority %j and persists nothing",
    async (claim) => {
      const name = `obs-create-reserved-${randomUUID()}`;
      const { status, body } = await postJson("/observations/create", {
        user_id: TEST_USER_ID,
        entity_type: ENTITY_TYPE,
        entity_identifier: name,
        fields: { name, status: "forged" },
        ...claim,
      });
      expect(status).toBe(400);
      expect(body.error_code).toBe("RESERVED_OBSERVATION_SOURCE");
      const { data } = await db
        .from("observations")
        .select("fields")
        .eq("user_id", TEST_USER_ID)
        .eq("entity_type", ENTITY_TYPE);
      const forged = (data ?? []).filter(
        (row: { fields?: Record<string, unknown> }) => row.fields?.name === name
      );
      expect(forged).toHaveLength(0);
    }
  );

  it("HTTP and MCP return the same envelope for the same reserved claim", async () => {
    const httpKey = `parity-http-${randomUUID()}`;
    const http = await postJson("/store", {
      user_id: TEST_USER_ID,
      idempotency_key: httpKey,
      observation_source: "correction",
      entities: [{ entity_type: ENTITY_TYPE, name: httpKey }],
    });
    let mcpData: Record<string, any> | undefined;
    try {
      await mcpToolCall(new NeotomaServer())(
        {
          method: "tools/call",
          params: {
            name: "store",
            arguments: {
              idempotency_key: `parity-mcp-${randomUUID()}`,
              observation_source: "correction",
              entities: [{ entity_type: ENTITY_TYPE, name: "parity" }],
            },
          },
        },
        {}
      );
    } catch (error) {
      mcpData = (error as { data?: Record<string, any> }).data;
    }
    const strip = ({ timestamp: _t, ...rest }: Record<string, any>) => rest;
    expect(mcpData).toBeDefined();
    expect(strip(mcpData!)).toEqual(strip(http.body));
  });

  it("HTTP combined file+entities with a reserved claim stores neither the file nor the entities", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-2033-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "forged.txt");
    fs.writeFileSync(filePath, `forged-${randomUUID()}`, "utf-8");
    const key = `http-reserved-combined-${randomUUID()}`;
    const sourcesBefore = await sourceCount();

    const { status, body } = await postJson("/store", {
      user_id: TEST_USER_ID,
      idempotency_key: key,
      file_idempotency_key: `${key}-file`,
      file_path: filePath,
      mime_type: "text/plain",
      observation_source: "correction",
      entities: [{ entity_type: ENTITY_TYPE, name: key }],
    });

    expect(status).toBe(400);
    expect(body.error_code).toBe("RESERVED_OBSERVATION_SOURCE");
    expect(await observationCount(key)).toBe(0);
    expect(await sourceCount()).toBe(sourcesBefore);
  });

  it("MCP store with expected_entity_absent cannot bypass the guard", async () => {
    const key = `mcp-reserved-absent-${randomUUID()}`;
    await expect(
      mcpToolCall(new NeotomaServer())(
        {
          method: "tools/call",
          params: {
            name: "store",
            arguments: {
              idempotency_key: key,
              expected_entity_absent: true,
              source_priority: 1000,
              entities: [{ entity_type: ENTITY_TYPE, name: key }],
            },
          },
        },
        {}
      )
    ).rejects.toMatchObject({ data: { error_code: "RESERVED_OBSERVATION_SOURCE" } });
    expect(await observationCount(key)).toBe(0);
  });

  it("internal privileged writers (sync prefer_remote shape) are not refused", async () => {
    const key = `internal-priority-${randomUUID()}`;
    const result = await storeStructuredForApi({
      userId: TEST_USER_ID,
      entities: [{ entity_type: ENTITY_TYPE, name: key, status: "remote" }],
      sourcePriority: 1000,
      observationSource: "human",
      idempotencyKey: key,
    });
    const entityId = (result as { entities: Array<{ entity_id: string }> }).entities[0].entity_id;
    createdEntityIds.push(entityId);
    expect(await snapshotField(entityId, "status")).toBe("remote");
  });
});
