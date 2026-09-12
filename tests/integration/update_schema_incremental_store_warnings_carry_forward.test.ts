/**
 * Regression: an incremental update must not be blocked by a malformed
 * `store_warnings` rule the caller never touched (neotoma#2165 follow-up).
 *
 * PR #1942 added registration-time validation of `store_warnings` to
 * `validateSchemaDefinition`, which `register()` calls. But
 * `updateSchemaIncremental()` carries the CURRENT schema's definition forward
 * into `register()` — `preserved` is a spread of `currentSchema
 * .schema_definition` — so a schema already carrying a legacy
 * `condition`-shaped rule (no `fields` key) had its next incremental update
 * throw at registration time. That moved the crash from the store path to the
 * registration path for schemas already in the wild, including the live
 * `skill` type that #1942 exists to unbreak.
 *
 * The carry-forward path now normalizes `store_warnings` the same way it
 * prunes `canonical_name_fields` / `temporal_fields` / `reference_fields` /
 * `content_field`: malformed entries are dropped with a warning so what
 * reaches `register()` is valid. A caller who SUPPLIES a malformed rule is
 * still rejected — see
 * tests/services/schema_store_warnings_validation.test.ts.
 *
 * Base schemas are inserted directly, bypassing `register()` validation, to
 * model a legacy row written before the validator existed. Same technique as
 * tests/integration/update_schema_incremental_envelope.test.ts.
 */
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

const STAMP = Date.now();
const legacyConditionType = `sw_carry_legacy_condition_${STAMP}`;
const nullRuleType = `sw_carry_null_rule_${STAMP}`;
const mixedRuleType = `sw_carry_mixed_rules_${STAMP}`;
const wellFormedType = `sw_carry_well_formed_${STAMP}`;

const ALL_TYPES = [legacyConditionType, nullRuleType, mixedRuleType, wellFormedType];

/** Insert a legacy active row carrying an arbitrary store_warnings value. */
async function insertLegacySchema(entityType: string, storeWarnings: unknown): Promise<void> {
  const { error } = await db.from("schema_registry").insert({
    entity_type: entityType,
    schema_version: "1.0.0",
    schema_definition: {
      fields: {
        content: { type: "string" },
        name: { type: "string" },
      },
      canonical_name_fields: ["name"],
      store_warnings: storeWarnings,
    },
    reducer_config: {
      merge_policies: {
        content: { strategy: "last_write" },
        name: { strategy: "last_write" },
      },
    },
    active: true,
    scope: "global",
  });
  expect(error).toBeFalsy();
}

/** Add one unrelated field — the update an operator or agent would actually do. */
function addUnrelatedField(entityType: string) {
  return schemaRegistry.updateSchemaIncremental({
    entity_type: entityType,
    fields_to_add: [{ field_name: "summary", field_type: "string" }],
  });
}

describe("updateSchemaIncremental carries a malformed store_warnings forward safely", () => {
  afterAll(async () => {
    for (const t of ALL_TYPES) {
      await db.from("schema_registry").delete().eq("entity_type", t);
    }
  });

  it("updates a schema carrying the legacy condition-shaped rule (no fields key)", async () => {
    // The exact malformed shape observed on the live `skill` type.
    await insertLegacySchema(legacyConditionType, [
      {
        code: "MISSING_CONTENT_FIELD",
        message: "skill has no content body.",
        condition: { missing_all_of: ["content"] },
      },
    ]);

    const updated = await addUnrelatedField(legacyConditionType);

    // The unrelated field landed.
    expect(updated.schema_definition.fields).toHaveProperty("summary");
    // The malformed rule did not ride forward into the new version.
    expect(updated.schema_definition.store_warnings).toBeUndefined();
  });

  it("updates a schema carrying a null rule entry", async () => {
    await insertLegacySchema(nullRuleType, [null]);

    const updated = await addUnrelatedField(nullRuleType);

    expect(updated.schema_definition.fields).toHaveProperty("summary");
    expect(updated.schema_definition.store_warnings).toBeUndefined();
  });

  it("keeps the well-formed rules and drops only the malformed ones", async () => {
    await insertLegacySchema(mixedRuleType, [
      { code: "GOOD_RULE", fields: ["name"], message: "no identity field." },
      { code: "BAD_RULE", message: "legacy.", condition: { missing_all_of: ["content"] } },
    ]);

    const updated = await addUnrelatedField(mixedRuleType);

    expect(updated.schema_definition.fields).toHaveProperty("summary");
    const carried = updated.schema_definition.store_warnings;
    expect(carried).toHaveLength(1);
    expect(carried?.[0]?.code).toBe("GOOD_RULE");
    expect(carried?.[0]?.fields).toEqual(["name"]);
  });

  it("carries a fully well-formed store_warnings through verbatim", async () => {
    // The normalizer must not disturb a valid declaration.
    await insertLegacySchema(wellFormedType, [
      { code: "MISSING_IDENTITY_FIELDS", fields: ["name", "content"], message: "no identity." },
    ]);

    const updated = await addUnrelatedField(wellFormedType);

    expect(updated.schema_definition.fields).toHaveProperty("summary");
    expect(updated.schema_definition.store_warnings).toEqual([
      { code: "MISSING_IDENTITY_FIELDS", fields: ["name", "content"], message: "no identity." },
    ]);
  });

  it("prunes a removed field out of a well-formed rule's fields list", async () => {
    // Consistency with how canonical_name_fields / temporal_fields /
    // reference_fields treat fields_to_remove: a rule must not be left
    // pointing at a field the new version no longer declares.
    const pruneType = `sw_carry_prune_${STAMP}`;
    ALL_TYPES.push(pruneType);
    await insertLegacySchema(pruneType, [
      { code: "MISSING_IDENTITY_FIELDS", fields: ["name", "content"], message: "no identity." },
    ]);

    const updated = await schemaRegistry.updateSchemaIncremental({
      entity_type: pruneType,
      fields_to_remove: ["content"],
    });

    expect(updated.schema_definition.fields).not.toHaveProperty("content");
    expect(updated.schema_definition.store_warnings).toEqual([
      { code: "MISSING_IDENTITY_FIELDS", fields: ["name"], message: "no identity." },
    ]);
  });

  it("drops a rule entirely when every one of its fields is removed", async () => {
    const emptiedType = `sw_carry_emptied_${STAMP}`;
    ALL_TYPES.push(emptiedType);
    await insertLegacySchema(emptiedType, [
      { code: "MISSING_CONTENT_FIELD", fields: ["content"], message: "no content." },
    ]);

    const updated = await schemaRegistry.updateSchemaIncremental({
      entity_type: emptiedType,
      fields_to_remove: ["content"],
    });

    // An empty fields list would fire the warning on every store, so the rule
    // goes rather than surviving as a vacuous always-true condition.
    expect(updated.schema_definition.store_warnings).toBeUndefined();
  });
});
