/**
 * Regression tests for issue #269:
 * update_schema_incremental must return a structured non-throwing response
 * with an actionable hint when the target entity_type has no registered schema
 * (cold-start / no baseline to extend from).
 *
 * This test exercises:
 * - update_schema_incremental on an entity_type with no schema in the registry
 *   and no code-defined schema → structured error response with hint, no throw
 * - The response includes `no_schema_for_entity_type: true` as a discriminator
 * - The hint mentions `register_schema` and `analyze_schema_candidates`
 * - update_schema_incremental on an entity_type whose existing schema lacks
 *   canonical_name_fields / identity_opt_out → structured error with actionable hint
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000269";
// A synthetic entity_type that will never have a schema in the registry.
const UNREGISTERED_ENTITY_TYPE = "issue_269_unregistered_cold_start_type";
// An entity_type whose schema deliberately omits identity configuration.
const NO_IDENTITY_ENTITY_TYPE = "issue_269_no_identity_schema_type";

async function cleanupTestData(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", UNREGISTERED_ENTITY_TYPE);
  await db.from("schema_registry").delete().eq("entity_type", NO_IDENTITY_ENTITY_TYPE);
  await db.from("raw_fragments").delete().eq("entity_type", UNREGISTERED_ENTITY_TYPE);
  await db.from("raw_fragments").delete().eq("entity_type", NO_IDENTITY_ENTITY_TYPE);
}

describe("update_schema_incremental: cold-start graceful fallback (issue #269)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    await cleanupTestData();
    server = new NeotomaServer();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("returns a structured non-throwing response when entity_type has no schema at all", async () => {
    // Confirm there is no schema for this type (pre-condition).
    const { data: existing } = await db
      .from("schema_registry")
      .select("id")
      .eq("entity_type", UNREGISTERED_ENTITY_TYPE);
    expect(existing ?? []).toHaveLength(0);

    // Call update_schema_incremental via the public CLI/MCP dispatch.
    const result = await server.executeToolForCli(
      "update_schema_incremental",
      {
        entity_type: UNREGISTERED_ENTITY_TYPE,
        fields_to_add: [{ field_name: "title", field_type: "string" }],
        user_id: TEST_USER_ID,
      },
      TEST_USER_ID
    );

    const body = JSON.parse(result.content[0].text) as {
      success?: boolean;
      error_code?: string;
      no_schema_for_entity_type?: boolean;
      hint?: string;
    };

    // Must not throw — the response body carries the error.
    expect(body.success).toBe(false);
    expect(body.error_code).toBe("ERR_NO_SCHEMA_FOR_ENTITY_TYPE");
    expect(body.no_schema_for_entity_type).toBe(true);

    // Hint must point callers to register_schema and analyze_schema_candidates.
    expect(typeof body.hint).toBe("string");
    expect(body.hint).toContain("register_schema");
    expect(body.hint).toContain("analyze_schema_candidates");
  });

  it("returns a structured non-throwing response when existing schema lacks identity configuration", async () => {
    // Seed a schema that deliberately omits both canonical_name_fields and
    // identity_opt_out.  This represents a legacy schema created before R2
    // enforcement, or one inserted directly into the DB.
    await db.from("schema_registry").insert({
      entity_type: NO_IDENTITY_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        // No canonical_name_fields, no identity_opt_out — triggers R2 on register()
        fields: {
          title: { type: "string" },
        },
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write", tie_breaker: "observed_at" },
        },
      },
      active: true,
      scope: "global",
      user_id: null,
    });

    const result = await server.executeToolForCli(
      "update_schema_incremental",
      {
        entity_type: NO_IDENTITY_ENTITY_TYPE,
        fields_to_add: [{ field_name: "description", field_type: "string" }],
        user_id: TEST_USER_ID,
      },
      TEST_USER_ID
    );

    const body = JSON.parse(result.content[0].text) as {
      success?: boolean;
      error_code?: string;
      hint?: string;
    };

    // Must not throw — the response body carries the error.
    expect(body.success).toBe(false);
    expect(body.error_code).toBe("ERR_SCHEMA_MISSING_IDENTITY_CONFIG");

    // Hint must point callers to register_schema with canonical_name_fields.
    expect(typeof body.hint).toBe("string");
    expect(body.hint).toContain("register_schema");
    expect(body.hint).toContain("canonical_name_fields");
  });
});
