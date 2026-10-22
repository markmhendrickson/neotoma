/**
 * Issue #1968: schema seeding is part of the deploy contract, and re-seeding
 * an already-seeded instance must never clobber a CUSTOM operator schema.
 *
 * The hazard being regression-tested: the pre-fix seeding path decided by
 * matching the built-in `schema_version` STRING via getSchemaVersions(), and
 * called `activate()` whenever that version was registered-but-inactive. On an
 * instance where an operator had registered a custom schema for an entity type
 * (via register_schema / update_schema_incremental) and activated it, a deploy
 * re-seed flipped the built-in row back to active — and `activate()`
 * deactivates every other version for the entity type, so the operator's
 * custom schema was silently switched off on every single deploy.
 *
 * These tests drive the real SchemaRegistryService against the shared local
 * SQLite test DB (vitest.setup.ts), using scratch entity types so they neither
 * depend on nor disturb the real registry state — matching the isolation
 * pattern in schema_seeding_fresh_instance_gap.test.ts.
 */

import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { seedSchemaRegistryIfEmpty } from "../../src/services/schema_registry_bootstrap.js";
import { db } from "../../src/db.js";
import type { SchemaDefinition, SchemaRegistryEntry } from "../../src/services/schema_registry.js";

const BUILTIN_TYPE = "bootstrap_test_builtin_type";
const CUSTOM_TYPE = "bootstrap_test_custom_type";

/**
 * A stand-in for ENTITY_SCHEMAS built-ins, so these tests exercise the seeder's
 * decision logic without registering (or perturbing) real entity types in the
 * shared test DB.
 */
const FAKE_BUILTINS = {
  [BUILTIN_TYPE]: {
    entity_type: BUILTIN_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: { schema_version: { type: "string", required: true } },
      // Required by validateSchemaDefinition (schema_agnostic_design_rules R2).
      identity_opt_out: "heuristic_canonical_name",
    } as SchemaDefinition,
    reducer_config: { merge_policies: {} },
  },
  [CUSTOM_TYPE]: {
    entity_type: CUSTOM_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        builtin_only_field: { type: "string", required: false },
      },
      identity_opt_out: "heuristic_canonical_name",
    } as SchemaDefinition,
    reducer_config: { merge_policies: {} },
  },
};

/**
 * Runs the REAL seedSchemaRegistryIfEmpty against the real registry, but over
 * FAKE_BUILTINS instead of the live ENTITY_SCHEMAS. The decision logic under
 * test is therefore genuinely the shipped one — a hand-rolled copy of the
 * skip-if-present check here would keep passing even if the seeder regressed.
 */
async function seedFakeBuiltins() {
  return await seedSchemaRegistryIfEmpty({ schemas: Object.values(FAKE_BUILTINS) });
}

async function cleanup(): Promise<void> {
  for (const type of [BUILTIN_TYPE, CUSTOM_TYPE]) {
    await db.from("schema_registry").delete().eq("entity_type", type);
  }
}

describe("schema registry bootstrap seeding (#1968)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("seeds entity types that have no active schema (closes the fresh-instance gap)", async () => {
    expect(await schemaRegistry.loadActiveSchema(BUILTIN_TYPE)).toBeNull();

    const summary = await seedFakeBuiltins();

    // Assert `failed` explicitly: the seeder collects registration errors
    // rather than throwing, so without this a validation failure would look
    // like a silent no-op.
    expect(summary.failed).toEqual([]);
    expect(summary.registered).toContain(BUILTIN_TYPE);
    const seeded = await schemaRegistry.loadActiveSchema(BUILTIN_TYPE);
    expect(seeded).not.toBeNull();
    expect(seeded!.schema_version).toBe("1.0");
  });

  it("is idempotent: a second run registers nothing and leaves the row identical", async () => {
    await seedFakeBuiltins();
    const afterFirst = await schemaRegistry.loadActiveSchema(BUILTIN_TYPE);

    const secondRun = await seedFakeBuiltins();

    expect(secondRun.registered).toEqual([]);
    expect(secondRun.preserved).toContain(BUILTIN_TYPE);

    const afterSecond = await schemaRegistry.loadActiveSchema(BUILTIN_TYPE);
    // Same row (same id), not a new registration stacked on top.
    expect(afterSecond!.id).toBe(afterFirst!.id);

    const versions = await schemaRegistry.getSchemaVersions(BUILTIN_TYPE);
    expect(versions).toHaveLength(1);
  });

  it("does NOT overwrite or deactivate a CUSTOM operator schema sharing the built-in's version string", async () => {
    // An operator registers their own schema for CUSTOM_TYPE, deliberately
    // overriding the built-in — and at the SAME schema_version "1.0", which is
    // precisely the case the old version-string match got wrong.
    const customDefinition: SchemaDefinition = {
      fields: {
        schema_version: { type: "string", required: true },
        operator_custom_field: { type: "string", required: false },
      },
      identity_opt_out: "heuristic_canonical_name",
      reference_fields: [
        {
          field: "operator_custom_field",
          target_entity_type: "company",
          relationship_type: "works_at",
          resolve_target: true,
        },
      ],
    };

    await schemaRegistry.register({
      entity_type: CUSTOM_TYPE,
      schema_version: "1.0",
      schema_definition: customDefinition,
      reducer_config: { merge_policies: {} },
      user_specific: false,
      activate: true,
    });

    const before = (await schemaRegistry.loadActiveSchema(CUSTOM_TYPE)) as SchemaRegistryEntry;
    expect(before.schema_definition.fields).toHaveProperty("operator_custom_field");

    // Deploy re-seed.
    const summary = await seedFakeBuiltins();
    expect(summary.preserved).toContain(CUSTOM_TYPE);
    expect(summary.registered).not.toContain(CUSTOM_TYPE);

    const after = (await schemaRegistry.loadActiveSchema(CUSTOM_TYPE)) as SchemaRegistryEntry;

    // The operator's schema is still the active one, byte-for-byte.
    expect(after.id).toBe(before.id);
    expect(after.active).toBe(true);
    expect(after.schema_definition.fields).toHaveProperty("operator_custom_field");
    expect(after.schema_definition.reference_fields).toEqual(customDefinition.reference_fields);
    // The built-in's field was NOT merged in, and no built-in row was added.
    expect(after.schema_definition.fields).not.toHaveProperty("builtin_only_field");
    expect(await schemaRegistry.getSchemaVersions(CUSTOM_TYPE)).toHaveLength(1);
  });

  it("preserves a custom schema that carries a DIFFERENT version string", async () => {
    await schemaRegistry.register({
      entity_type: CUSTOM_TYPE,
      schema_version: "9.9-operator",
      schema_definition: {
        fields: {
          schema_version: { type: "string", required: true },
          operator_custom_field: { type: "string", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: { merge_policies: {} },
      user_specific: false,
      activate: true,
    });

    await seedFakeBuiltins();

    const after = await schemaRegistry.loadActiveSchema(CUSTOM_TYPE);
    expect(after!.schema_version).toBe("9.9-operator");
    expect(after!.active).toBe(true);
    // Critically: the built-in "1.0" was not registered alongside and
    // activated over it.
    expect(await schemaRegistry.getSchemaVersions(CUSTOM_TYPE)).toHaveLength(1);
  });

  it("real seedSchemaRegistryIfEmpty preserves everything on an already-seeded registry", async () => {
    // Run against the real ENTITY_SCHEMAS twice. Whatever the shared test DB
    // already had must survive, and the second pass must be a pure no-op.
    const first = await seedSchemaRegistryIfEmpty();
    const second = await seedSchemaRegistryIfEmpty();

    expect(second.registered).toEqual([]);
    expect(second.failed).toEqual([]);
    expect(second.preserved.length).toBeGreaterThan(0);
    // Every type the first pass touched is preserved by the second.
    for (const type of first.registered) {
      expect(second.preserved).toContain(type);
    }
  });
});
