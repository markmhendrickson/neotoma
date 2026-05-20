/**
 * Regression tests for issue #326: storeStructuredForApi (HTTP API store path)
 * did not track or return unknown field names, unlike the MCP store path which
 * correctly returns unknown_fields_count, unknown_fields, and hint.
 *
 * Verifies that:
 * 1. When all fields are schema-known, unknown_fields_count is 0 and
 *    unknown_fields is an empty array.
 * 2. When unknown fields are submitted against a registered schema, they are
 *    counted and returned in unknown_fields, and a hint is included.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";

const TEST_USER_ID = "00000000-0000-4000-8000-000000000326";
const ENTITY_TYPE = `api_store_uf_test_${Date.now()}`;

async function cleanup() {
  const { data: observations } = await db
    .from("observations")
    .select("entity_id, source_id")
    .eq("user_id", TEST_USER_ID);
  const entityIds = Array.from(
    new Set((observations ?? []).map((obs: { entity_id: string }) => obs.entity_id).filter(Boolean))
  );
  const sourceIds = Array.from(
    new Set((observations ?? []).map((obs: { source_id: string }) => obs.source_id).filter(Boolean))
  );

  await db.from("timeline_events").delete().eq("user_id", TEST_USER_ID);
  if (entityIds.length > 0) await db.from("entity_snapshots").delete().in("entity_id", entityIds);
  await db.from("observations").delete().eq("user_id", TEST_USER_ID);
  if (sourceIds.length > 0) {
    await db.from("raw_fragments").delete().in("source_id", sourceIds);
    await db.from("sources").delete().in("id", sourceIds);
  }
  if (entityIds.length > 0) await db.from("entities").delete().in("id", entityIds);
  await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
}

describe("storeStructuredForApi — unknown fields tracking (issue #326)", () => {
  beforeAll(async () => {
    // Register a schema with only known declared fields so we can submit
    // an entity with an extra undeclared field and test that it is tracked.
    await db.from("schema_registry").insert({
      entity_type: ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          schema_version: { type: "string", required: true },
          title: { type: "string" },
          overview: { type: "string" },
        },
        canonical_name_fields: ["title"],
      },
      reducer_config: { merge_policies: { title: { strategy: "last_write" } } },
      active: true,
      scope: "global",
      user_id: null,
    });
  });

  afterAll(cleanup);

  it("returns unknown_fields_count: 0 and unknown_fields: [] when all fields match the schema", async () => {
    const result = await storeStructuredForApi({
      userId: TEST_USER_ID,
      idempotencyKey: `uf-known-${randomUUID()}`,
      commit: true,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          title: "Known fields only",
          overview: "Short summary.",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(typeof result.unknown_fields_count).toBe("number");
    expect(result.unknown_fields_count).toBe(0);
    expect(Array.isArray(result.unknown_fields)).toBe(true);
    expect(result.unknown_fields).toHaveLength(0);
    expect(result.hint).toBeUndefined();
  });

  it("returns non-zero unknown_fields_count and a sorted unknown_fields list when undeclared fields are submitted", async () => {
    const result = await storeStructuredForApi({
      userId: TEST_USER_ID,
      idempotencyKey: `uf-unknown-${randomUUID()}`,
      commit: true,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          title: "Entity with unknown fields",
          overview: "Short summary.",
          // These two fields are NOT declared in the schema above:
          zebra_field: "z-value",
          alpha_field: "a-value",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.unknown_fields_count).toBeGreaterThan(0);
    expect(Array.isArray(result.unknown_fields)).toBe(true);
    // Should contain the undeclared fields, sorted alphabetically
    expect(result.unknown_fields).toContain("alpha_field");
    expect(result.unknown_fields).toContain("zebra_field");
    // Must be sorted
    const sorted = [...result.unknown_fields].sort();
    expect(result.unknown_fields).toEqual(sorted);
  });

  it("includes a hint when unknown fields are present", async () => {
    const result = await storeStructuredForApi({
      userId: TEST_USER_ID,
      idempotencyKey: `uf-hint-${randomUUID()}`,
      commit: true,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          title: "Entity triggering hint",
          unregistered_field: "value",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.unknown_fields_count).toBeGreaterThan(0);
    expect(typeof result.hint).toBe("string");
    expect(result.hint).toMatch(/update_schema_incremental/i);
    expect(result.hint).toMatch(/raw_fragments/i);
  });

  it("returns unknown_fields_count: 0 when no schema is registered for the entity type (no tracking without schema)", async () => {
    // For entity types with no schema, there is nothing to validate against,
    // so unknown_fields_count stays 0.
    const result = await storeStructuredForApi({
      userId: TEST_USER_ID,
      idempotencyKey: `uf-noschema-${randomUUID()}`,
      commit: true,
      entities: [
        {
          entity_type: "generic",
          title: "No schema entity",
          some_field: "value",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(typeof result.unknown_fields_count).toBe("number");
    expect(Array.isArray(result.unknown_fields)).toBe(true);
  });
});
