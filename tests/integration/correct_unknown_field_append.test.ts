/**
 * Integration test for #1540: correct() must accept a field that is not declared
 * on the entity's schema (append path), mirroring store()'s behavior, instead of
 * throwing "Unknown field for entity type <type>".
 *
 * The undeclared field is recorded on a correction observation, mirrored to
 * raw_fragments, and the response carries `unknown_field: true` + a hint. A
 * declared field still behaves as an ordinary priority-1000 correction.
 *
 * Exercises the real MCP correct() path (server.correct) against the local DB.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TYPE = "test_correct_append_cluster";

type CorrectResponse = {
  observation_id?: string;
  entity_id?: string;
  field?: string;
  value?: unknown;
  unknown_field?: boolean;
  hint?: string;
  message?: string;
  details?: { entity_type?: string; field?: string };
  error?: unknown;
};

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

describe("correct() append path for undeclared fields (#1540)", () => {
  let server: NeotomaServer;
  let entityId: string;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;

    // Register globally: server.correct() loads the active schema without a
    // user_id scope, so the test schema must be global to be found.
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

    // Seed one entity to correct.
    const stored = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `seed-correct-append-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, label: "Append target", status: "open" }],
    });
    const body = JSON.parse(stored.content[0].text) as {
      entities: Array<{ entity_id: string }>;
    };
    entityId = body.entities[0].entity_id;
  });

  afterAll(async () => {
    await cleanupEntityType(TYPE, TEST_USER_ID);
    await cleanupTestSchema(TYPE, null);
  });

  it("accepts an undeclared field instead of throwing, and signals unknown_field", async () => {
    const result = await callCorrect(server, {
      user_id: TEST_USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "owner_handle_qqq", // not declared on the schema
      value: "alice",
      idempotency_key: `correct-unknown-${Date.now()}`,
    });

    const body = JSON.parse(result.content[0].text) as CorrectResponse;
    expect(body.error).toBeUndefined();
    expect(body.observation_id).toBeDefined();
    expect(body.unknown_field).toBe(true);
    expect(body.hint).toBeDefined();
    // The interpolated entity_type/field live in structured `details`, NOT in
    // the free-text hint (advisory: keep hint switchable-by-callers).
    expect(body.hint).not.toContain("owner_handle_qqq");
    expect(body.details?.field).toBe("owner_handle_qqq");
    expect(body.details?.entity_type).toBe(TYPE);
    // The human-readable message still names the field.
    expect(body.message).toContain("owner_handle_qqq");

    // The correction observation must exist and carry the field.
    const { data: obs } = await db
      .from("observations")
      .select("fields")
      .eq("id", body.observation_id!)
      .single();
    expect(obs).toBeTruthy();
    const fields = (obs!.fields ?? {}) as Record<string, unknown>;
    expect(fields.owner_handle_qqq).toBe("alice");

    // The value must be mirrored to raw_fragments for recoverability.
    const { data: fragments } = await db
      .from("raw_fragments")
      .select("fragment_key, entity_id")
      .eq("entity_id", entityId)
      .eq("fragment_key", "owner_handle_qqq");
    expect(Array.isArray(fragments)).toBe(true);
    expect((fragments ?? []).length).toBeGreaterThan(0);
  });

  it("a declared field still behaves as an ordinary correction (no unknown_field signal)", async () => {
    const result = await callCorrect(server, {
      user_id: TEST_USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "status", // declared
      value: "closed",
      idempotency_key: `correct-declared-${Date.now()}`,
    });

    const body = JSON.parse(result.content[0].text) as CorrectResponse;
    expect(body.error).toBeUndefined();
    expect(body.observation_id).toBeDefined();
    expect(body.unknown_field).toBeUndefined();
    expect(body.message).toContain("priority 1000");
  });

  // Regression: the OLD behavior threw "Unknown field for entity type <type>"
  // for an undeclared correction field. The new contract replaces that throw
  // with a successful `unknown_field: true` envelope. Guard against a revert.
  it("does NOT throw the old 'Unknown field for entity type' error", async () => {
    const result = await callCorrect(server, {
      user_id: TEST_USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "regression_no_old_throw_field",
      value: "v",
      idempotency_key: `correct-no-old-throw-${Date.now()}`,
    });
    const text = result.content[0].text;
    expect(text).not.toContain("Unknown field for entity type");
    const body = JSON.parse(text) as CorrectResponse;
    expect(body.error).toBeUndefined();
    expect(body.unknown_field).toBe(true);
  });

  // BLOCKING 2 parity: a correct() against a type with no active schema must
  // surface an error (MCP throws InvalidParams) rather than silently coercing
  // the field to "declared". The HTTP path mirrors this with
  // ERR_NO_SCHEMA_FOR_ENTITY_TYPE (asserted in the parity test).
  it("rejects correct() for an entity_type with no active schema", async () => {
    await expect(
      callCorrect(server, {
        user_id: TEST_USER_ID,
        entity_id: entityId,
        entity_type: "test_correct_no_such_schema_zzz",
        field: "any",
        value: "v",
        idempotency_key: `correct-no-schema-${Date.now()}`,
      })
    ).rejects.toThrow(/No active entity schema for entity type/);
  });
});
