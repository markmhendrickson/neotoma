/**
 * Contract test: relationship_type advertisement parity across MCP tools
 * (#1972, rewritten for G25).
 *
 * ── WHAT THIS TEST USED TO ASSERT, AND WHY IT CHANGED ─────────────────────
 *
 * The original version asserted that all four relationship tools advertised
 * the SAME 28-member enum, and that the enum existed at all
 * (`expect(relationshipType!.enum, "…without an enum").toBeTruthy()`). That was
 * the right assertion for the bug it was written against: `create_relationship`
 * advertised 28 types while `delete_relationship`, `restore_relationship` and
 * `get_relationship_snapshot` advertised 8, so an edge written with any of the
 * other 20 was advertised as UNDELETABLE — a schema-validating client refused
 * the call before it reached a server that would have accepted it.
 *
 * It is REWRITTEN, not deleted, because it is the guard that caught that bug
 * and its four behavioural assertions still matter. What changed is the target:
 * the vocabulary is now a runtime registry, so an enum in a tool schema is
 * itself the defect — it would go stale the moment someone registered a type.
 * The assertions are therefore restated against the REGISTRY.
 *
 * ── THE ASSERTION THE OLD TEST WAS MISSING ────────────────────────────────
 *
 * The old test read `inputSchema.properties.relationship_type.enum` and NEVER
 * the description string. That is precisely the gap that let
 * `docs/developer/mcp/tool_descriptions.yaml` — loaded into the live tool
 * descriptions at server boot (`server.ts`'s `loadToolDescriptionsMap`) — go on
 * telling every LLM client the vocabulary was 8 types while the schema beside
 * it said 28. A model reads the description, not the JSON Schema enum. So the
 * #1972 defect class survived in the field, in the very field the test written
 * for #1972 did not look at.
 *
 * The last test in this file closes that gap.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { buildToolDefinitions } from "../../src/tool_definitions.js";
import { relationshipTypeRegistry } from "../../src/services/relationship_types/registry.js";
import { seedBuiltInRelationshipTypes } from "../../src/services/relationship_types/seed_registry.js";

type TypeProperty = { type?: string; enum?: string[]; description?: string };

/** Every MCP tool that takes a `relationship_type` naming an edge. */
const RELATIONSHIP_TYPE_TOOLS = [
  "create_relationship",
  "delete_relationship",
  "restore_relationship",
  "get_relationship_snapshot",
] as const;

function relationshipTypeProperty(toolName: string): TypeProperty {
  const definition = buildToolDefinitions().find((tool) => tool.name === toolName);
  expect(definition, `tool definition missing: ${toolName}`).toBeTruthy();

  const properties = (definition!.inputSchema as { properties?: Record<string, TypeProperty> })
    .properties;
  const relationshipType = properties?.relationship_type;
  expect(relationshipType, `${toolName} does not declare relationship_type`).toBeTruthy();
  return relationshipType!;
}

describe("relationship_type advertisement parity across MCP tools (#1972)", () => {
  beforeAll(async () => {
    await seedBuiltInRelationshipTypes();
  });

  it("advertises relationship_type as an open string on every relationship tool", () => {
    // The inverted assertion. An enum here is now the defect: it is a second
    // copy of a vocabulary that lives in the registry, and it goes stale the
    // instant a type is registered — locally refusing a call the server would
    // have accepted, which is the same one-way door as the original bug.
    for (const toolName of RELATIONSHIP_TYPE_TOOLS) {
      const property = relationshipTypeProperty(toolName);
      expect(property.type, `${toolName} must declare relationship_type as a string`).toBe(
        "string"
      );
      expect(
        property.enum,
        `${toolName} advertises a hardcoded relationship_type enum. The vocabulary is a ` +
          `runtime registry — advertise type: string and point at list_relationship_types.`
      ).toBeUndefined();
    }
  });

  it("points every relationship tool at the registry, in the description a model reads", () => {
    // THE ASSERTION THE OLD TEST LACKED. A model does not read the JSON Schema;
    // it reads this string. If it does not name the discovery tool, the caller
    // has no way to learn what the instance accepts.
    for (const toolName of RELATIONSHIP_TYPE_TOOLS) {
      const property = relationshipTypeProperty(toolName);
      expect(
        property.description ?? "",
        `${toolName}'s relationship_type description must name list_relationship_types`
      ).toContain("list_relationship_types");
    }
  });

  it("carries no enumeration in any relationship tool's own description", () => {
    // The gap that let tool_descriptions.yaml stay wrong in the field. Checks
    // the tool-level description too, since that is the one loaded from the
    // runtime YAML and overlaid by `desc()`.
    const BUILT_IN_SAMPLE = ["CORRECTS", "SETTLES", "DUPLICATE_OF", "SUPERSEDES"];

    for (const toolName of RELATIONSHIP_TYPE_TOOLS) {
      const definition = buildToolDefinitions().find((tool) => tool.name === toolName)!;
      const surfaces = [
        definition.description ?? "",
        relationshipTypeProperty(toolName).description ?? "",
      ].join("\n");

      const enumerated = BUILT_IN_SAMPLE.filter((name) => surfaces.includes(name));
      expect(
        enumerated,
        `${toolName} enumerates relationship types in prose (${enumerated.join(", ")}). ` +
          `That is the copy that stayed wrong in the field through the whole of #1972, ` +
          `because the original parity test read the enum and never the description.`
      ).toEqual([]);
    }
  });

  it("lets every registered type be created, deleted and restored", async () => {
    // The ORIGINAL defect, restated as behaviour rather than set equality:
    // every type the registry permits must be nameable at delete and restore,
    // or the edge it writes becomes undeletable through MCP. With all four
    // tools taking an open string this holds by construction — the test keeps
    // it from silently ceasing to.
    const registered = await relationshipTypeRegistry.list({});
    expect(registered.length, "the registry census must not be empty").toBeGreaterThan(0);

    for (const toolName of RELATIONSHIP_TYPE_TOOLS) {
      const property = relationshipTypeProperty(toolName);
      expect(property.enum, `${toolName} would refuse registered types locally`).toBeUndefined();
    }
  });

  it("still carries the domain types, not only the canonical structural ones", async () => {
    // Guards against a "fix" that satisfies the open-string assertions by
    // quietly shrinking the vocabulary to the 8 structural types, which would
    // restore parity by breaking creation instead.
    const names = new Set((await relationshipTypeRegistry.list({})).map((r) => r.relationship_type));
    for (const domainType of ["works_at", "related_to", "invested_in"]) {
      expect(names, `${domainType} must remain in the registry`).toContain(domainType);
    }
    for (const structural of ["PART_OF", "EMBEDS"]) {
      expect(names, `${structural} must remain in the registry`).toContain(structural);
    }
  });
});
