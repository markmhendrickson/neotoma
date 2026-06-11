/**
 * Regression for issue ent_99e0bfda4a16202bedc57b68:
 * `correct()` with an OBJECT value on a `type: object` field must store a real
 * object in the snapshot, not a JSON-stringified copy.
 *
 * Reproduction shape (from the bug report): correcting `gate_status` (declared
 * `type: object`) with `{pm:"pending"}` must yield `snapshot.gate_status` as the
 * object `{pm:"pending"}`, NOT the string `'{"pm":"pending"}'`.
 *
 * We assert parity across both transports (MCP `correct` tool and HTTP
 * `/correct`) and confirm the store append path (the documented workaround)
 * still produces an object too, so the three write paths agree.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_correct_object_roundtrip";
const API_PORT = 18242;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

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

async function snapshotField(entityId: string, field: string): Promise<unknown> {
  const snap = await recomputeSnapshot(entityId, USER_ID);
  const s = (snap?.snapshot as Record<string, unknown> | null | undefined) ?? {};
  return s[field];
}

describe("correct() object-valued field round-trip (#99e0bfda)", () => {
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
            gate_status: { type: "object", required: false },
          },
          canonical_name_fields: ["label"],
        },
        reducer_config: {
          merge_policies: {
            label: { strategy: "last_write" },
            gate_status: { strategy: "highest_priority" },
          },
        },
        activate: true,
      });
    }

    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `seed-obj-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, label: "Object target" }],
    });
    const body = JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> };
    entityId = body.entities[0].entity_id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupEntityType(TYPE, USER_ID);
    await cleanupTestSchema(TYPE, null);
  });

  it("MCP correct() stores an object, not a JSON string", async () => {
    const value = { pm: "pending", qa: "pending" };
    await callCorrect(server, {
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "gate_status",
      value,
      idempotency_key: `obj-mcp-${Date.now()}`,
    });

    const got = await snapshotField(entityId, "gate_status");
    expect(typeof got).toBe("object");
    expect(got).toEqual(value);
    // Guard against the exact corruption in the bug report.
    expect(typeof got).not.toBe("string");
  });

  it("HTTP /correct stores an object, not a JSON string", async () => {
    const value = { pm: "approved", qa: "pending", security: "pending" };
    const res = await fetch(`${API_BASE}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        entity_type: TYPE,
        field: "gate_status",
        value,
        idempotency_key: `obj-http-${Date.now()}`,
      }),
    });
    expect(res.status).toBe(200);

    const got = await snapshotField(entityId, "gate_status");
    expect(typeof got).toBe("object");
    expect(got).toEqual(value);
    expect(typeof got).not.toBe("string");
  });
});
