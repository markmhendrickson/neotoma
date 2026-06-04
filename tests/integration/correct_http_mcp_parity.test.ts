/**
 * BLOCKING 3 (#1540): the HTTP `/correct` handler and the MCP `correct` tool MUST
 * return an identical unknown-field response shape. Both flow through the shared
 * `buildCorrectionResponse` / `resolveCorrectionSchema` helpers; this test boots
 * the real Express app for the HTTP path and the real NeotomaServer for the MCP
 * path and asserts the bodies match key-for-key (modulo the HTTP-only `success`
 * and `snapshot` fields).
 *
 * Also covers BLOCKING 2: a `/correct` against an entity_type with no active
 * schema must surface `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` on HTTP (parity with the
 * MCP `InvalidParams` throw) rather than being silently accepted as an
 * undeclared-field correction.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

// HTTP local path resolves the nil-UUID; use the same user for the MCP path so
// both operate against the same seeded entity.
const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_correct_parity_cluster";
const API_PORT = 18241;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

type CorrectBody = Record<string, unknown>;

function callStore(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).store(params);
}

function callCorrect(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      correct: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).correct(params);
}

describe("HTTP /correct ↔ MCP correct response parity (#1540)", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;
  let entityId: string;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    if (!(await schemaRegistry.loadActiveSchema(TYPE))) {
      await schemaRegistry.register({
        entity_type: TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            label: { type: "string", required: false },
            status: { type: "string", required: false },
          },
          canonical_name_fields: ["label"],
        },
        reducer_config: {
          merge_policies: {
            label: { strategy: "last_write" },
            status: { strategy: "last_write" },
          },
        },
        activate: true,
      });
    }

    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `seed-parity-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, label: "Parity target", status: "open" }],
    });
    const body = JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> };
    entityId = body.entities[0].entity_id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupEntityType(TYPE, USER_ID);
    await cleanupTestSchema(TYPE, null);
  });

  it("undeclared-field correction returns the same shape on both transports", async () => {
    // MCP path.
    const mcpResult = await callCorrect(server, {
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "parity_unknown_field_mcp",
      value: "mcp-val",
      idempotency_key: `parity-mcp-${Date.now()}`,
    });
    const mcpBody = JSON.parse(mcpResult.content[0].text) as CorrectBody;

    // HTTP path.
    const httpRes = await fetch(`${API_BASE}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        entity_type: TYPE,
        field: "parity_unknown_field_http",
        value: "http-val",
        idempotency_key: `parity-http-${Date.now()}`,
      }),
    });
    expect(httpRes.status).toBe(200);
    const httpBody = (await httpRes.json()) as CorrectBody;

    // Both must signal the undeclared field identically.
    expect(mcpBody.unknown_field).toBe(true);
    expect(httpBody.unknown_field).toBe(true);

    // The shared keys MUST match. HTTP adds transport-only `success`/`snapshot`.
    const sharedKeys = [
      "observation_id",
      "entity_id",
      "field",
      "value",
      "message",
      "unknown_field",
      "hint",
      "details",
    ].sort();
    const mcpKeys = Object.keys(mcpBody).sort();
    const httpKeys = Object.keys(httpBody)
      .filter((k) => k !== "success" && k !== "snapshot")
      .sort();
    expect(mcpKeys).toEqual(sharedKeys);
    expect(httpKeys).toEqual(sharedKeys);

    // Hint is generic (no interpolated identifiers); details carries them.
    expect(String(mcpBody.hint)).toBe(String(httpBody.hint));
    expect(mcpBody.details).toEqual({ entity_type: TYPE, field: "parity_unknown_field_mcp" });
    expect(httpBody.details).toEqual({ entity_type: TYPE, field: "parity_unknown_field_http" });
  });

  it("declared-field correction returns the same shape on both transports", async () => {
    const mcpResult = await callCorrect(server, {
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "status",
      value: "closed-mcp",
      idempotency_key: `parity-mcp-declared-${Date.now()}`,
    });
    const mcpBody = JSON.parse(mcpResult.content[0].text) as CorrectBody;

    const httpRes = await fetch(`${API_BASE}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        entity_type: TYPE,
        field: "status",
        value: "closed-http",
        idempotency_key: `parity-http-declared-${Date.now()}`,
      }),
    });
    expect(httpRes.status).toBe(200);
    const httpBody = (await httpRes.json()) as CorrectBody;

    expect(mcpBody.unknown_field).toBeUndefined();
    expect(httpBody.unknown_field).toBeUndefined();

    const sharedKeys = ["observation_id", "entity_id", "field", "value", "message"].sort();
    expect(Object.keys(mcpBody).sort()).toEqual(sharedKeys);
    expect(
      Object.keys(httpBody)
        .filter((k) => k !== "success" && k !== "snapshot")
        .sort()
    ).toEqual(sharedKeys);
    expect(String(mcpBody.message)).toBe(String(httpBody.message));
  });

  it("HTTP /correct against a type with no active schema returns ERR_NO_SCHEMA_FOR_ENTITY_TYPE", async () => {
    const httpRes = await fetch(`${API_BASE}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        entity_type: "test_correct_parity_no_schema_zzz",
        field: "any",
        value: "v",
        idempotency_key: `parity-http-noschema-${Date.now()}`,
      }),
    });
    expect(httpRes.status).toBe(400);
    const body = (await httpRes.json()) as { error_code?: string };
    expect(body.error_code).toBe("ERR_NO_SCHEMA_FOR_ENTITY_TYPE");
  });
});
