/**
 * Regression coverage for issue #2035: a deploy / boot re-seed must NOT
 * overwrite an operator's activated custom `canonical_name_fields`.
 *
 * Background. `schemaRegistry.loadActiveSchema` is DB-only, so a fresh instance
 * must have its `schema_registry` table seeded from the code-defined
 * `ENTITY_SCHEMAS`. That seeding now runs on every deploy/boot path
 * (issue #1968 / #1992): the Fly `release_command`
 * (src/seed_schemas_entry.ts), and the boot-time seeder
 * (src/services/schema_registry_bootstrap.ts `seedSchemaRegistryIfEmpty`).
 *
 * The #2035 hazard. Before the fix, the seeders decided existence by matching
 * the code's `schema_version` STRING and called `activate()` whenever the
 * built-in version was registered-but-inactive. On an instance where an
 * operator had deliberately re-keyed an entity type — e.g. changing `contact`
 * identity from name-heuristic to
 * `[{composite:["linkedin_url"]}, "email", "name"]` via
 * update_schema_incremental — that flipped the built-in back to active and
 * deactivated the operator's schema on the next deploy. The identity rule
 * silently reverted, re-enabling the same-name collision the re-key fixed.
 *
 * The invariant under test (the bootstrap module's SAFETY CONTRACT): the
 * seeder is strictly ADDITIVE — if an active GLOBAL schema already exists for
 * an entity_type, it is left completely untouched (no register, no activate,
 * no field merge), regardless of what `schema_version` string it carries.
 *
 * This test drives the real `seedSchemaRegistryIfEmpty` against the actual
 * `schemaRegistry` (the same code the boot path runs), using a scratch
 * entity_type so it neither depends on nor disturbs the shared local SQLite
 * test DB's real `contact` schema — matching the isolation pattern in
 * schema_seeding_fresh_instance_gap.test.ts.
 */

import { describe, it, expect, afterAll } from "vitest";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { seedSchemaRegistryIfEmpty } from "../../src/services/schema_registry_bootstrap.js";
import { db } from "../../src/db.js";
import type { SchemaDefinition, CanonicalNameRule } from "../../src/services/schema_registry.js";

const CUSTOM_TYPE = "seed_2035_custom_identity_test_type";

// The operator's deliberate re-key: linkedin_url-first, email, then name.
const OPERATOR_RULE: CanonicalNameRule[] = [{ composite: ["linkedin_url"] }, "email", "name"];

// The code-defined "built-in" the seeder would try to install for this type —
// a DIFFERENT identity rule (name-heuristic style), standing in for the
// schema_definitions.ts default that reverted the re-key in #2035.
const BUILTIN_RULE: CanonicalNameRule[] = ["name"];

function operatorSchema(): SchemaDefinition {
  return {
    fields: {
      name: { type: "string", required: false },
      email: { type: "string", required: false },
      linkedin_url: { type: "string", required: false },
    },
    canonical_name_fields: OPERATOR_RULE,
  };
}

function builtInSchema(): SchemaDefinition {
  return {
    fields: {
      name: { type: "string", required: false },
      email: { type: "string", required: false },
      linkedin_url: { type: "string", required: false },
    },
    canonical_name_fields: BUILTIN_RULE,
  };
}

async function cleanup(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", CUSTOM_TYPE);
}

describe("issue #2035: deploy/boot re-seed preserves an operator's activated canonical_name_fields", () => {
  afterAll(cleanup);

  it("seedSchemaRegistryIfEmpty leaves an activated custom identity rule untouched (reported as preserved, not registered)", async () => {
    // 1. Operator re-keys: register + activate a CUSTOM schema whose
    //    canonical_name_fields differ from the built-in default. Version string
    //    is deliberately NOT equal to the built-in's, mirroring how a real
    //    update_schema_incremental re-key bumps to an operator-owned version.
    await schemaRegistry.register({
      entity_type: CUSTOM_TYPE,
      schema_version: "9.0.0-operator",
      schema_definition: operatorSchema(),
      reducer_config: { merge_policies: {} },
    });
    await schemaRegistry.activate(CUSTOM_TYPE, "9.0.0-operator");

    // Precondition: the re-key is live.
    const before = await schemaRegistry.loadActiveSchema(CUSTOM_TYPE);
    expect(before).not.toBeNull();
    expect(before!.schema_definition.canonical_name_fields).toEqual(OPERATOR_RULE);

    // 2. A deploy/boot happens: run the boot-time seeder against a "built-in"
    //    for the SAME type that carries a DIFFERENT (default) identity rule.
    //    This is exactly what schema_registry_bootstrap does on every boot.
    const summary = await seedSchemaRegistryIfEmpty({
      schemas: [
        {
          entity_type: CUSTOM_TYPE,
          schema_version: "1.0.0",
          schema_definition: builtInSchema(),
          reducer_config: { merge_policies: {} },
        } as (typeof import("../../src/services/schema_definitions.js").ENTITY_SCHEMAS)[string],
      ],
    });

    // 3. The seeder must have PRESERVED the type (no write), not re-registered
    //    or re-activated the built-in over it.
    expect(summary.preserved).toContain(CUSTOM_TYPE);
    expect(summary.registered).not.toContain(CUSTOM_TYPE);
    expect(summary.failed).toEqual([]);

    // 4. The active identity rule is STILL the operator's — not reverted to the
    //    built-in. This is the exact assertion #2035 turns on.
    const after = await schemaRegistry.loadActiveSchema(CUSTOM_TYPE);
    expect(after).not.toBeNull();
    expect(after!.schema_definition.canonical_name_fields).toEqual(OPERATOR_RULE);
    expect(after!.schema_definition.canonical_name_fields).not.toEqual(BUILTIN_RULE);
    expect(after!.schema_version).toBe("9.0.0-operator");
  });

  it("is idempotent: a second re-seed still preserves the operator's rule", async () => {
    // Guards against a seeder that is safe once but drifts on repeated runs
    // (deploys happen many times over an instance's life).
    const summary = await seedSchemaRegistryIfEmpty({
      schemas: [
        {
          entity_type: CUSTOM_TYPE,
          schema_version: "1.0.0",
          schema_definition: builtInSchema(),
          reducer_config: { merge_policies: {} },
        } as (typeof import("../../src/services/schema_definitions.js").ENTITY_SCHEMAS)[string],
      ],
    });

    expect(summary.preserved).toContain(CUSTOM_TYPE);
    expect(summary.registered).not.toContain(CUSTOM_TYPE);

    const after = await schemaRegistry.loadActiveSchema(CUSTOM_TYPE);
    expect(after!.schema_definition.canonical_name_fields).toEqual(OPERATOR_RULE);
  });
});
