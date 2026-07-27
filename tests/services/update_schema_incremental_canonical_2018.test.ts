/**
 * #2018 — update_schema_incremental can change canonical_name_fields.
 *
 * Before this change, the only way to alter an entity type's identity rule was
 * register_schema, which requires the full reducer_config (unreadable via any
 * MCP tool) and applies it as-is — so re-keying a type risked silently
 * resetting every field's conflict-resolution strategy. update_schema_incremental
 * already preserves reducer_config safely; it just lacked a way to set the rule.
 *
 * These tests pin the request-contract behavior: the schema now accepts a
 * canonical_name_fields-only request (no fields_to_add/remove), and accepts
 * both rule shapes (flat strings and ordered composites). The service-level
 * major-version-bump-on-identity-change is asserted separately in the
 * incremental-update integration coverage.
 */

import { describe, it, expect } from "vitest";
import { UpdateSchemaIncrementalRequestSchema } from "../../src/shared/action_schemas.js";

describe("UpdateSchemaIncrementalRequestSchema — canonical_name_fields (#2018)", () => {
  it("accepts a canonical_name_fields-only request (no field add/remove)", () => {
    const parsed = UpdateSchemaIncrementalRequestSchema.parse({
      entity_type: "contact",
      canonical_name_fields: [{ composite: ["linkedin_url"] }, "email", "name"],
    });
    expect(parsed.canonical_name_fields).toEqual([
      { composite: ["linkedin_url"] },
      "email",
      "name",
    ]);
    // The refine must not reject a re-key that touches no fields.
    expect(parsed.fields_to_add).toBeUndefined();
    expect(parsed.fields_to_remove).toBeUndefined();
  });

  it("still rejects a request that changes nothing", () => {
    const res = UpdateSchemaIncrementalRequestSchema.safeParse({ entity_type: "contact" });
    expect(res.success).toBe(false);
  });

  it("accepts the legacy flat string[] identity rule", () => {
    const parsed = UpdateSchemaIncrementalRequestSchema.parse({
      entity_type: "contact",
      canonical_name_fields: ["name"],
    });
    expect(parsed.canonical_name_fields).toEqual(["name"]);
  });

  it("accepts an empty array (caller intent: clear the identity rule)", () => {
    // Distinct from omitting the key (preserve current rule). The service
    // treats [] as "delete canonical_name_fields".
    const parsed = UpdateSchemaIncrementalRequestSchema.parse({
      entity_type: "contact",
      canonical_name_fields: [],
    });
    expect(parsed.canonical_name_fields).toEqual([]);
  });

  it("rejects a malformed composite rule (non-string member)", () => {
    const res = UpdateSchemaIncrementalRequestSchema.safeParse({
      entity_type: "contact",
      // composite must be a string[]; a bare number is invalid
      canonical_name_fields: [{ composite: [42] }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects the likely mistake of a bare-string composite, with a locatable path", () => {
    // A plausible caller error: {composite: "linkedin_url"} instead of
    // {composite: ["linkedin_url"]}. Confirm it's rejected AND that the Zod
    // issue points at canonical_name_fields so the message is self-correctable.
    const res = UpdateSchemaIncrementalRequestSchema.safeParse({
      entity_type: "contact",
      canonical_name_fields: [{ composite: "linkedin_url" }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("canonical_name_fields"))).toBe(true);
    }
  });

  it("still accepts a fields-only request unchanged (no regression)", () => {
    const parsed = UpdateSchemaIncrementalRequestSchema.parse({
      entity_type: "contact",
      fields_to_add: [{ field_name: "region", field_type: "string" }],
    });
    expect(parsed.fields_to_add?.[0].field_name).toBe("region");
    expect(parsed.canonical_name_fields).toBeUndefined();
  });
});
