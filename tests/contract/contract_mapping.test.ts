import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  MCP_ONLY_TOOLS,
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

    expect(mappedOperationIds).toEqual(openApiOperationIds);
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
});
