import { describe, expect, it } from "vitest";
import {
  getOpenApiInputSchemaForTool,
  listOpenApiMappedMcpTools,
} from "../../src/shared/openapi_schema.js";

describe("OpenAPI tool schemas", () => {
  it("returns schemas for all mapped MCP tools", () => {
    for (const toolName of listOpenApiMappedMcpTools()) {
      const schema = getOpenApiInputSchemaForTool(toolName);
      expect(schema).toBeTruthy();
      expect(schema?.type).toBeTruthy();
    }
  });
});
