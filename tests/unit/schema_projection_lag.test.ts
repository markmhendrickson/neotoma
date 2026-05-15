/**
 * Unit tests for schema projection lag fix (issue #142).
 *
 * Verifies that when a schema version is bumped via register_schema with
 * activate: true, subsequent store calls that include the new fields produce
 * them in the top-level snapshot rather than raw_fragments.
 *
 * Root cause: register() with activate: true did not deactivate the prior
 * active schema version. loadGlobalSchema uses .single() which behaves
 * non-deterministically when multiple active rows exist (SQLite returns first
 * row = old schema; PostgREST errors). The fix: deactivate prior active rows
 * in register() when activate: true.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";
import { ObservationReducer } from "../../src/reducers/observation_reducer.js";
import { db } from "../../src/db.js";

const TEST_ENTITY_TYPE = "schema_projection_lag_test_entity";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

async function cleanupTestData(): Promise<void> {
  await db.from("raw_fragments").delete().eq("entity_type", TEST_ENTITY_TYPE);
  await db.from("entity_snapshots").delete().eq("entity_type", TEST_ENTITY_TYPE);
  await db.from("observations").delete().eq("entity_type", TEST_ENTITY_TYPE);
  const { data: entities } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", TEST_ENTITY_TYPE);
  if (entities && entities.length > 0) {
    await db
      .from("entities")
      .delete()
      .in("id", entities.map((e: { id: string }) => e.id));
  }
  await db.from("schema_registry").delete().eq("entity_type", TEST_ENTITY_TYPE);
}

describe("Schema projection lag fix (#142)", () => {
  const registry = new SchemaRegistryService();
  const reducer = new ObservationReducer();

  beforeEach(async () => {
    await cleanupTestData();
  });

  it("register() with activate:true deactivates the prior active schema version", async () => {
    // Register v1.0 with activate: true
    await registry.register({
      entity_type: TEST_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string" },
          value: { type: "number" },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          value: { strategy: "last_write" },
        },
      },
      activate: true,
    });

    // Verify v1.0 is active
    const schemaV1 = await registry.loadActiveSchema(TEST_ENTITY_TYPE);
    expect(schemaV1?.schema_version).toBe("1.0");

    // Register v1.1 with activate: true (adds extra_field)
    await registry.register({
      entity_type: TEST_ENTITY_TYPE,
      schema_version: "1.1",
      schema_definition: {
        fields: {
          name: { type: "string" },
          value: { type: "number" },
          extra_field: { type: "string" },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          value: { strategy: "last_write" },
          extra_field: { strategy: "last_write" },
        },
      },
      activate: true,
    });

    // Only one schema should be active, and it should be v1.1
    const { data: activeRows } = await db
      .from("schema_registry")
      .select("schema_version, active")
      .eq("entity_type", TEST_ENTITY_TYPE)
      .eq("active", true);

    expect(activeRows).toBeDefined();
    expect(activeRows!.length).toBe(1);
    expect(activeRows![0].schema_version).toBe("1.1");
  });

  it("loadActiveSchema returns v1.1 (not v1.0) after a schema version bump", async () => {
    await registry.register({
      entity_type: TEST_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string" },
          value: { type: "number" },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          value: { strategy: "last_write" },
        },
      },
      activate: true,
    });

    await registry.register({
      entity_type: TEST_ENTITY_TYPE,
      schema_version: "1.1",
      schema_definition: {
        fields: {
          name: { type: "string" },
          value: { type: "number" },
          extra_field: { type: "string" },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          value: { strategy: "last_write" },
          extra_field: { strategy: "last_write" },
        },
      },
      activate: true,
    });

    // loadActiveSchema must return v1.1 — if it returned v1.0, extra_field
    // would be missing from the schema and new observations would route it
    // to raw_fragments instead of validFields.
    const activeSchema = await registry.loadActiveSchema(TEST_ENTITY_TYPE, TEST_USER_ID);
    expect(activeSchema).not.toBeNull();
    expect(activeSchema!.schema_version).toBe("1.1");
    expect(activeSchema!.schema_definition.fields).toHaveProperty("extra_field");
  });

  it("reducer projects extra_field to top-level snapshot using the active schema after version bump", async () => {
    // Register v1.0 and bump to v1.1 (adds extra_field)
    await registry.register({
      entity_type: TEST_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string" },
          value: { type: "number" },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          value: { strategy: "last_write" },
        },
      },
      activate: true,
    });

    await registry.register({
      entity_type: TEST_ENTITY_TYPE,
      schema_version: "1.1",
      schema_definition: {
        fields: {
          name: { type: "string" },
          value: { type: "number" },
          extra_field: { type: "string" },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          value: { strategy: "last_write" },
          extra_field: { strategy: "last_write" },
        },
      },
      activate: true,
    });

    // Simulate observations — first observation (before bump), second after bump.
    // The reducer uses the *currently active* schema, so extra_field from the
    // second observation should appear in the top-level snapshot.
    const observations = [
      {
        id: "obs-v10-001",
        entity_id: "ent-lag-test-001",
        entity_type: TEST_ENTITY_TYPE,
        schema_version: "1.0",
        source_id: "src-001",
        observed_at: "2025-01-01T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: { name: "Alice", value: 42 },
        created_at: "2025-01-01T00:00:00Z",
        user_id: TEST_USER_ID,
      },
      {
        id: "obs-v11-001",
        entity_id: "ent-lag-test-001",
        entity_type: TEST_ENTITY_TYPE,
        schema_version: "1.1",
        source_id: "src-001",
        observed_at: "2025-01-02T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: { name: "Alice", value: 42, extra_field: "hello" },
        created_at: "2025-01-02T00:00:00Z",
        user_id: TEST_USER_ID,
      },
    ];

    const snapshot = await reducer.computeSnapshot("ent-lag-test-001", observations);

    expect(snapshot).not.toBeNull();
    // extra_field must appear in the top-level snapshot, not be absent
    expect(snapshot!.snapshot).toHaveProperty("extra_field", "hello");
    // name and value must still be present
    expect(snapshot!.snapshot).toHaveProperty("name", "Alice");
    expect(snapshot!.snapshot).toHaveProperty("value", 42);
    // schema_version on the snapshot should reflect the current active schema
    expect(snapshot!.schema_version).toBe("1.1");
  });
});
