/**
 * Integration test for #247: the describe_entity_type MCP tool returns field-level
 * schema introspection (field names, types, descriptions, required flags) so
 * agents can learn a type's shape before storing.
 *
 * Exercises the real MCP handler (server.describeEntityType) against the local DB,
 * and asserts the tool is registered and contract-mapped.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupTestSchema } from "../helpers/cleanup_helpers.js";
import { buildToolDefinitions, NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";
import { MCP_TOOL_TO_OPERATION_ID } from "../../src/shared/contract_mappings.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TYPE = "test_describe_cluster";

type DescribeResponse = {
  entity_type?: string;
  schema_version?: string;
  field_names?: string[];
  field_count?: number;
  required_fields?: string[];
  field_summary?: Record<string, { type: string; required: boolean; description?: string }>;
  schema_definition?: { fields?: Record<string, { type: string; required?: boolean }> };
  error?: unknown;
};

function callDescribe(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      describeEntityType: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).describeEntityType(params);
}

describe("describe_entity_type MCP tool (#247)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;

    if (!(await schemaRegistry.loadActiveSchema(TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            checkpoint_name: { type: "string", required: true, description: "Display name" },
            summary: { type: "string", required: false },
            score: { type: "number", required: false },
          },
          canonical_name_fields: ["checkpoint_name"],
        },
        reducer_config: {
          merge_policies: {
            summary: { strategy: "last_write" },
            score: { strategy: "last_write" },
          },
        },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    }
  });

  afterAll(async () => {
    await cleanupTestSchema(TYPE, TEST_USER_ID);
  });

  it("is registered as a Neotoma tool and contract-mapped to getSchemaByEntityType", () => {
    expect(NEOTOMA_TOOL_NAMES).toContain("describe_entity_type");
    expect(MCP_TOOL_TO_OPERATION_ID["describe_entity_type"]).toBe("getSchemaByEntityType");
    const tools = buildToolDefinitions();
    const tool = tools.find((t) => t.name === "describe_entity_type");
    expect(tool).toBeDefined();
    // Input schema must require entity_type (derived from the OpenAPI path param).
    const props = (tool!.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(props).toHaveProperty("entity_type");
  });

  it("returns field names, types, descriptions, and required flags", async () => {
    const result = await callDescribe(server, {
      user_id: TEST_USER_ID,
      entity_type: TYPE,
    });

    const body = JSON.parse(result.content[0].text) as DescribeResponse;
    expect(body.error).toBeUndefined();
    expect(body.entity_type).toBe(TYPE);
    expect(body.schema_version).toBeDefined();

    expect(body.field_names).toEqual(
      expect.arrayContaining(["checkpoint_name", "summary", "score"])
    );
    expect(body.required_fields).toContain("checkpoint_name");
    expect(body.required_fields).not.toContain("summary");

    expect(body.field_summary).toBeDefined();
    expect(body.field_summary!.checkpoint_name.type).toBe("string");
    expect(body.field_summary!.checkpoint_name.required).toBe(true);
    expect(body.field_summary!.checkpoint_name.description).toBe("Display name");
    expect(body.field_summary!.score.type).toBe("number");
    expect(body.field_summary!.summary.required).toBe(false);

    // Full schema_definition.fields is included for completeness.
    expect(body.schema_definition?.fields?.checkpoint_name?.required).toBe(true);
  });

  it("errors clearly for an unknown entity type", async () => {
    await expect(
      callDescribe(server, {
        user_id: TEST_USER_ID,
        entity_type: "test_definitely_not_a_registered_type_zzz",
      })
    ).rejects.toThrow(/No active schema for entity type/);
  });
});
