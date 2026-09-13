/**
 * Registration-time validation coverage for `store_warnings`
 * (schema_registry.ts SchemaDefinition.store_warnings).
 *
 * Why this exists: `validateSchemaDefinition` validated six other
 * rule-bearing fields (canonical_name_fields, identity_opt_out,
 * reference_fields, content_field, temporal_fields, name_collision_policy)
 * and `store_warnings` zero times, even though the TS type declares
 * `fields: string[]` as required. So a schema carrying
 * `store_warnings: [null]` — or a legacy `condition`-shaped rule with no
 * `fields` key at all — could be registered and would then reach the store
 * path's warning evaluator, which is where the `skill` store 500 came from.
 *
 * Guarding at the consumption sites (src/actions.ts, src/server.ts) stops the
 * crash; validating here stops the malformed schema being accepted in the
 * first place. Per docs/foundation/principles.md invariant 6, extend the one
 * mechanism that generalizes rather than patching consumption sites forever.
 *
 * Registers against the real local SQLite test DB (see vitest.setup.ts),
 * matching the pattern in
 * tests/services/schema_reference_fields_resolve_target_validation.test.ts,
 * since `register()` performs real DB writes.
 */

import { describe, it, expect, afterEach } from "vitest";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { db } from "../../src/db.js";

const TEST_TYPE = "sw_validation_test_type";
const TEST_USER_ID = "00000000-0000-0000-0000-00000000c094";

async function cleanup(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", TEST_TYPE);
}

/** Register TEST_TYPE with the given store_warnings value. */
function registerWith(storeWarnings: unknown) {
  return schemaRegistry.register({
    entity_type: TEST_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        reporter_email: { type: "string", required: false },
        reporter_name: { type: "string", required: false },
      },
      identity_opt_out: "heuristic_canonical_name",
      store_warnings: storeWarnings,
    } as never,
    reducer_config: { merge_policies: {} },
    user_id: TEST_USER_ID,
    user_specific: true,
    activate: true,
  });
}

describe("store_warnings registration-time validation", () => {
  afterEach(cleanup);

  it("accepts a well-formed fields-shaped rule", async () => {
    await expect(
      registerWith([
        {
          code: "MISSING_IDENTITY_FIELDS",
          fields: ["reporter_email", "reporter_name"],
          message: "stored without any identity field.",
        },
      ])
    ).resolves.toBeDefined();
  });

  it("accepts a schema that declares no store_warnings at all", async () => {
    await expect(
      schemaRegistry.register({
        entity_type: TEST_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: { reporter_email: { type: "string", required: false } },
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      })
    ).resolves.toBeDefined();
  });

  it("rejects a null rule entry — the shape that crashed the store-path guard", async () => {
    await expect(registerWith([null])).rejects.toThrow(
      /store_warnings entries must be \{ code, fields, message \}/
    );
  });

  it("rejects an undefined rule entry", async () => {
    await expect(registerWith([undefined])).rejects.toThrow(
      /store_warnings entries must be \{ code, fields, message \}/
    );
  });

  it("rejects a primitive rule entry", async () => {
    await expect(registerWith([123])).rejects.toThrow(
      /store_warnings entries must be \{ code, fields, message \}/
    );
  });

  it("rejects store_warnings that is not an array", async () => {
    await expect(registerWith({ code: "X", fields: ["a"], message: "m" })).rejects.toThrow(
      /store_warnings must be an array/
    );
  });

  it("rejects the legacy condition-shaped rule (no fields key)", async () => {
    // This is the exact malformed shape observed on the live `skill` type,
    // and the one docs/subsystems/schema_registry.md §4.2a's worked example
    // used to teach.
    await expect(
      registerWith([
        {
          code: "MISSING_CONTENT_FIELD",
          message: "skill has no content body.",
          condition: { missing_all_of: ["content"] },
        },
      ])
    ).rejects.toThrow(/fields must be a non-empty array of strings/);
  });

  it("rejects a rule whose fields is an empty array", async () => {
    // An empty list vacuously has no present field, so an unguarded
    // evaluator would fire the warning on every single store.
    await expect(registerWith([{ code: "X", fields: [], message: "m" }])).rejects.toThrow(
      /fields must be a non-empty array of strings/
    );
  });

  it("rejects a rule whose fields is a bare string rather than an array", async () => {
    await expect(
      registerWith([{ code: "X", fields: "reporter_email", message: "m" }])
    ).rejects.toThrow(/fields must be a non-empty array of strings/);
  });

  it("rejects a rule whose fields array contains a non-string", async () => {
    await expect(
      registerWith([{ code: "X", fields: ["reporter_email", 7], message: "m" }])
    ).rejects.toThrow(/fields must contain only strings/);
  });

  it("rejects a rule with a non-string code", async () => {
    await expect(
      registerWith([{ code: 7, fields: ["reporter_email"], message: "m" }])
    ).rejects.toThrow(/store_warnings entries must be \{ code, fields, message \}/);
  });

  it("rejects a rule with a missing message", async () => {
    await expect(registerWith([{ code: "X", fields: ["reporter_email"] }])).rejects.toThrow(
      /store_warnings entries must be \{ code, fields, message \}/
    );
  });

  it("names the offending code in the fields error, so a multi-rule schema is diagnosable", async () => {
    await expect(
      registerWith([
        { code: "GOOD_RULE", fields: ["reporter_email"], message: "m" },
        { code: "BAD_RULE", message: "m", condition: { missing_all_of: ["x"] } },
      ])
    ).rejects.toThrow(/BAD_RULE/);
  });
});
