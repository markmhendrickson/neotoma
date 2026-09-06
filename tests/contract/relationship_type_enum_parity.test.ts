/**
 * Contract test: relationship_type vocabulary parity across MCP tools (#1972, step 1).
 *
 * `create_relationship` derives its `relationship_type` enum from the OpenAPI
 * definition (28 members). `delete_relationship`, `restore_relationship`, and
 * `get_relationship_snapshot` hand-built their schemas from a local 8-member
 * literal in `src/tool_definitions.ts`. The result was a one-way door: an edge
 * written with any of the other 20 types (`works_at`, `related_to`, `owns`, …)
 * was advertised to MCP clients as undeletable, because a schema-validating
 * client refuses the call before it ever reaches the server — whose Zod schema
 * would have accepted it.
 *
 * These assertions fail if any of the four tools' advertised type sets diverge
 * again, which is the durable half of the fix: re-widening one copy by hand
 * would simply reset the clock.
 */

import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../../src/tool_definitions.js";
import { RelationshipTypeSchema } from "../../src/shared/action_schemas.js";

type EnumProperty = { type?: string; enum?: string[] };

/** Every MCP tool that takes a `relationship_type` naming an existing edge. */
const RELATIONSHIP_TYPE_TOOLS = [
  "create_relationship",
  "delete_relationship",
  "restore_relationship",
  "get_relationship_snapshot",
] as const;

function relationshipTypeEnum(toolName: string): string[] {
  const definition = buildToolDefinitions().find((tool) => tool.name === toolName);
  expect(definition, `tool definition missing: ${toolName}`).toBeTruthy();

  const properties = (definition!.inputSchema as { properties?: Record<string, EnumProperty> })
    .properties;
  const relationshipType = properties?.relationship_type;
  expect(relationshipType, `${toolName} does not declare relationship_type`).toBeTruthy();
  expect(relationshipType!.type).toBe("string");
  expect(
    relationshipType!.enum,
    `${toolName} declares relationship_type without an enum`
  ).toBeTruthy();

  return relationshipType!.enum!;
}

describe("relationship_type enum parity across MCP tools (#1972)", () => {
  it("advertises an identical type set on every relationship tool", () => {
    const baseline = relationshipTypeEnum("create_relationship");

    for (const toolName of RELATIONSHIP_TYPE_TOOLS) {
      expect(
        [...relationshipTypeEnum(toolName)].sort(),
        `${toolName} advertises a different relationship_type set than create_relationship`
      ).toEqual([...baseline].sort());
    }
  });

  it("advertises exactly what the server's Zod schema accepts", () => {
    // The server validates with RelationshipTypeSchema. A tool advertising a
    // narrower set makes valid calls unreachable; a wider set promises calls
    // the server will reject. Both are contract breaks.
    const serverAccepts = [...RelationshipTypeSchema.options].sort();

    for (const toolName of RELATIONSHIP_TYPE_TOOLS) {
      expect(
        [...relationshipTypeEnum(toolName)].sort(),
        `${toolName} advertises a type set the server does not exactly accept`
      ).toEqual(serverAccepts);
    }
  });

  it("lets every creatable type also be deleted and restored", () => {
    // The original defect, stated as behaviour rather than as set equality:
    // every type create_relationship accepts must be nameable at delete and
    // restore, or the edge it writes becomes undeletable through MCP.
    const creatable = relationshipTypeEnum("create_relationship");
    const deletable = new Set(relationshipTypeEnum("delete_relationship"));
    const restorable = new Set(relationshipTypeEnum("restore_relationship"));

    const undeletable = creatable.filter((type) => !deletable.has(type));
    const unrestorable = creatable.filter((type) => !restorable.has(type));

    expect(undeletable, "types that can be created but not deleted").toEqual([]);
    expect(unrestorable, "types that can be created but not restored").toEqual([]);
  });

  it("includes the domain types, not only the canonical structural ones", () => {
    // Guards against a "fix" that quietly settles on the 8-member structural
    // set everywhere, which would restore parity by breaking creation instead.
    for (const toolName of RELATIONSHIP_TYPE_TOOLS) {
      expect(relationshipTypeEnum(toolName)).toEqual(
        expect.arrayContaining(["PART_OF", "EMBEDS", "works_at", "related_to", "invested_in"])
      );
    }
  });
});
