/**
 * Regression tests for update_schema_incremental error envelope (issue #370).
 *
 * The fallback error paths previously returned a non-standard envelope
 * (`{ success: false, error_code, hint }`) with codes that, while documented,
 * did not match the canonical `{ error: { error_code, message, hint, details } }`
 * shape. CLI/MCP error handlers pattern-match the canonical envelope, so these
 * responses were effectively invisible. The handler now emits the canonical
 * envelope.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

const TEST_USER_ID = "00000000-0000-0000-0000-0000000003ee";

function parseEnvelope(result: {
  content: Array<{ type: string; text: string }>;
}): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("update_schema_incremental canonical error envelope (#370)", () => {
  let server: NeotomaServer;
  const noSchemaType = `no_schema_type_${Date.now()}`;
  const missingIdentityType = `missing_identity_type_${Date.now()}`;

  beforeAll(async () => {
    server = new NeotomaServer();
  });

  afterAll(async () => {
    await db.from("schema_registry").delete().eq("entity_type", missingIdentityType);
  });

  it("emits ERR_NO_SCHEMA_FOR_ENTITY_TYPE in the canonical envelope", async () => {
    const result = await server.executeToolForCli(
      "update_schema_incremental",
      {
        entity_type: noSchemaType,
        fields_to_add: [{ field_name: "amount", field_type: "number" }],
      },
      TEST_USER_ID
    );

    const body = parseEnvelope(result);
    expect(body).toHaveProperty("error");
    const error = body.error as Record<string, unknown>;
    expect(error.error_code).toBe("ERR_NO_SCHEMA_FOR_ENTITY_TYPE");
    expect(typeof error.message).toBe("string");
    expect(typeof error.hint).toBe("string");
    expect((error.details as Record<string, unknown>).entity_type).toBe(noSchemaType);
    // Must NOT carry the legacy top-level shape.
    expect(body.success).toBeUndefined();
    expect(body.error_code).toBeUndefined();
  });

  it("emits ERR_SCHEMA_MISSING_IDENTITY_CONFIG in the canonical envelope", async () => {
    // Insert a base schema directly (bypassing register() validation) that
    // declares NEITHER canonical_name_fields NOR identity_opt_out. This models
    // a legacy schema; the incremental update's internal re-register raises the
    // R2 identity-config error, which the handler maps to the canonical
    // ERR_SCHEMA_MISSING_IDENTITY_CONFIG envelope.
    const { error: insertError } = await db.from("schema_registry").insert({
      entity_type: missingIdentityType,
      schema_version: "1.0.0",
      schema_definition: { fields: { existing_field: { type: "string" } } },
      reducer_config: { merge_policies: { existing_field: { strategy: "last_write" } } },
      active: true,
      scope: "global",
    });
    expect(insertError).toBeFalsy();

    const result = await server.executeToolForCli(
      "update_schema_incremental",
      {
        entity_type: missingIdentityType,
        fields_to_add: [{ field_name: "new_field", field_type: "number" }],
      },
      TEST_USER_ID
    );

    const body = parseEnvelope(result);
    expect(body).toHaveProperty("error");
    const error = body.error as Record<string, unknown>;
    expect(error.error_code).toBe("ERR_SCHEMA_MISSING_IDENTITY_CONFIG");
    expect(typeof error.message).toBe("string");
    expect(typeof error.hint).toBe("string");
    expect((error.details as Record<string, unknown>).entity_type).toBe(missingIdentityType);
    expect(body.success).toBeUndefined();
    expect(body.error_code).toBeUndefined();
  });
});
