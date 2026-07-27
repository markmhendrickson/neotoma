/**
 * #1967: the two new tools must be discoverable in the MCP tool list, not just
 * callable internally. An unregistered tool is invisible to agents, which is
 * the whole point of the issue.
 */

import { describe, it, expect } from "vitest";
import { buildToolDefinitions, NEOTOMA_TOOL_NAMES } from "../../tool_definitions.js";

describe("tool registration (#1967)", () => {
  const tools = buildToolDefinitions();
  const byName = new Map(tools.map((t) => [t.name, t]));

  for (const name of ["retrieve_entities_by_identifiers", "aggregate_entity_field"]) {
    describe(name, () => {
      it("is present in the tool list and the name registry", () => {
        expect(byName.has(name)).toBe(true);
        expect(NEOTOMA_TOOL_NAMES).toContain(name);
      });

      it("has a non-trivial description so agents can discover it", () => {
        const description = byName.get(name)?.description ?? "";
        expect(description.length).toBeGreaterThan(80);
      });
    });
  }

  it("declares identifiers as a bounded array on the batch tool", () => {
    const schema = byName.get("retrieve_entities_by_identifiers")?.inputSchema as {
      properties: Record<string, { type?: string; maxItems?: number }>;
      required: string[];
    };
    expect(schema.properties.identifiers.type).toBe("array");
    expect(schema.properties.identifiers.maxItems).toBe(100);
    expect(schema.required).toEqual(["identifiers"]);
  });

  it("documents the bucket cap on the aggregation tool", () => {
    const schema = byName.get("aggregate_entity_field")?.inputSchema as {
      properties: Record<string, { maximum?: number }>;
      required: string[];
    };
    expect(schema.properties.limit.maximum).toBe(1000);
    expect(schema.required).toEqual(["field"]);
  });

  it("leaves the single-identifier tool registered and unchanged", () => {
    const single = byName.get("retrieve_entity_by_identifier")?.inputSchema as {
      properties: Record<string, { type?: string }>;
      required: string[];
    };
    // Backward compatibility: still a scalar string, still the only required arg.
    expect(single.properties.identifier.type).toBe("string");
    expect(single.required).toEqual(["identifier"]);
  });
});
