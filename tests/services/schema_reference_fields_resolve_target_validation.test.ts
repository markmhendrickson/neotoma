/**
 * Validation coverage for the `resolve_target` flag on `reference_fields`
 * entries (schema_registry.ts SchemaDefinition.reference_fields).
 *
 * Registers against the real local SQLite test DB (see vitest.setup.ts),
 * matching the pattern in tests/unit/duplicate_detection.test.ts and
 * tests/services/company_resolution.test.ts, since `register()` performs
 * real DB writes that a fully-mocked `db.js` (as in
 * schema_reference_linking.test.ts) does not support.
 */

import { describe, it, expect, afterEach } from "vitest";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { db } from "../../src/db.js";

const TEST_TYPE = "rt_validation_test_type";
const TEST_USER_ID = "00000000-0000-0000-0000-00000000c093";

async function cleanup(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", TEST_TYPE);
}

describe("reference_fields.resolve_target validation", () => {
  afterEach(cleanup);

  it("accepts resolve_target: true", async () => {
    await expect(
      schemaRegistry.register({
        entity_type: TEST_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: { org: { type: "string", required: false } },
          identity_opt_out: "heuristic_canonical_name",
          reference_fields: [{ field: "org", target_entity_type: "company", resolve_target: true }],
        },
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      })
    ).resolves.toBeDefined();
  });

  it("accepts a reference_fields entry that omits resolve_target (defaults falsy)", async () => {
    await expect(
      schemaRegistry.register({
        entity_type: TEST_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: { org: { type: "string", required: false } },
          identity_opt_out: "heuristic_canonical_name",
          reference_fields: [{ field: "org", target_entity_type: "company" }],
        },
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      })
    ).resolves.toBeDefined();
  });

  it("rejects a non-boolean resolve_target", async () => {
    await expect(
      schemaRegistry.register({
        entity_type: TEST_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: { org: { type: "string", required: false } },
          identity_opt_out: "heuristic_canonical_name",
          reference_fields: [
            {
              field: "org",
              target_entity_type: "company",
              // @ts-expect-error — intentionally wrong type under test
              resolve_target: "yes",
            },
          ],
        },
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      })
    ).rejects.toThrow(/resolve_target must be a boolean/);
  });
});
