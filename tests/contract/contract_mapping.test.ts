import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  MCP_ONLY_TOOLS,
  MCP_TOOL_TO_CLI_COMMAND,
  MCP_TOOL_TO_OPERATION_ID,
  OPENAPI_OPERATION_MAPPINGS,
} from "../../src/shared/contract_mappings.js";

type OpenApiSpec = {
  paths?: Record<string, Record<string, { operationId?: string }>>;
};

function collectOperationIds(spec: OpenApiSpec): string[] {
  const ids: string[] = [];
  const paths = spec.paths || {};
  for (const methods of Object.values(paths)) {
    for (const operation of Object.values(methods)) {
      if (operation?.operationId) {
        ids.push(operation.operationId);
      }
    }
  }
  return ids.sort();
}

describe("contract mappings", () => {
  it("covers all OpenAPI operationIds", async () => {
    const openApiPath = path.resolve(process.cwd(), "openapi.yaml");
    const raw = await fs.readFile(openApiPath, "utf-8");
    const spec = yaml.load(raw) as OpenApiSpec;
    const openApiOperationIds = collectOperationIds(spec);
    const mappedOperationIds = OPENAPI_OPERATION_MAPPINGS.map((mapping) => mapping.operationId)
      .slice()
      .sort();

    const openApiSet = new Set(openApiOperationIds);
    const mappedSet = new Set(mappedOperationIds);
    for (const id of openApiSet) {
      expect(mappedSet.has(id), `Missing mapping for operationId: ${id}`).toBe(true);
    }
  });

  it("requires adapters for all mapped operations", () => {
    for (const mapping of OPENAPI_OPERATION_MAPPINGS) {
      if (mapping.adapter === "infra") {
        continue;
      }
      expect(mapping.mcpTool || mapping.cliCommand).toBeTruthy();
    }
  });

  it("ensures MCP tool mappings resolve to OpenAPI operationIds", () => {
    const operationIdSet = new Set(
      OPENAPI_OPERATION_MAPPINGS.map((mapping) => mapping.operationId)
    );
    for (const operationId of Object.values(MCP_TOOL_TO_OPERATION_ID)) {
      expect(operationIdSet.has(operationId)).toBe(true);
    }
  });

  it("keeps MCP only tools explicit", () => {
    const mcpOnlySet = new Set(MCP_ONLY_TOOLS);
    for (const toolName of Object.keys(MCP_TOOL_TO_OPERATION_ID)) {
      expect(mcpOnlySet.has(toolName)).toBe(false);
    }
  });

  it("maps MCP tools to OpenAPI or CLI commands", () => {
    const mappedToolSet = new Set(Object.keys(MCP_TOOL_TO_OPERATION_ID));
    for (const toolName of MCP_ONLY_TOOLS) {
      if (mappedToolSet.has(toolName)) {
        continue;
      }
      expect(MCP_TOOL_TO_CLI_COMMAND[toolName]).toBeTruthy();
    }
  });

  it("ensures no data operations use mcp-only placeholders", () => {
    // Data operation tools that should have CLI equivalents
    const dataOperationTools = [
      "retrieve_entity_by_identifier",
      "retrieve_related_entities",
      "retrieve_graph_neighborhood",
      "analyze_schema_candidates",
      "get_schema_recommendations",
      "update_schema_incremental",
      "register_schema",
      "reinterpret",
      "correct",
      "get_authenticated_user",
      "health_check_snapshots",
    ];

    for (const toolName of dataOperationTools) {
      const cliCommand = MCP_TOOL_TO_CLI_COMMAND[toolName];
      expect(cliCommand, `${toolName} should have a CLI command`).toBeTruthy();
      expect(
        cliCommand?.startsWith("mcp-only"),
        `${toolName} should not use mcp-only placeholder, got: ${cliCommand}`
      ).toBe(false);
    }
  });

  it("ensures bidirectional mapping between MCP and CLI for data operations", () => {
    // Verify that all implemented CLI commands have corresponding MCP tools
    const cliToMcpExpectedMappings = {
      "entities search": "retrieve_entity_by_identifier",
      "entities related": "retrieve_related_entities",
      "entities neighborhood": "retrieve_graph_neighborhood",
      "schemas analyze": "analyze_schema_candidates",
      "schemas recommend": "get_schema_recommendations",
      "schemas update": "update_schema_incremental",
      "schemas register": "register_schema",
      "interpretations reinterpret": "reinterpret",
      "corrections create": "correct",
      "auth whoami": "get_authenticated_user",
      "snapshots check": "health_check_snapshots",
    };

    for (const [cliPrefix, mcpTool] of Object.entries(cliToMcpExpectedMappings)) {
      const cliCommand = MCP_TOOL_TO_CLI_COMMAND[mcpTool];
      expect(
        cliCommand?.startsWith(cliPrefix),
        `${mcpTool} should map to CLI command starting with '${cliPrefix}', got: ${cliCommand}`
      ).toBe(true);
    }
  });
});
