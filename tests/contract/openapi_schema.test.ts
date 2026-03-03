import { describe, expect, it } from "vitest";
import {
  getOpenApiInputSchemaForTool,
  listOpenApiMappedMcpTools,
} from "../../src/shared/openapi_schema.js";
import { resolveOpenApiPath } from "../../src/shared/openapi_file.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("OpenAPI tool schemas", () => {
  it("returns schemas for all mapped MCP tools", () => {
    for (const toolName of listOpenApiMappedMcpTools()) {
      const schema = getOpenApiInputSchemaForTool(toolName);
      expect(schema).toBeTruthy();
      expect(schema?.type).toBeTruthy();
    }
  });

  it("resolves OpenAPI path independently of cwd", () => {
    const originalCwd = process.cwd();
    const tempDir = mkdtempSync(join(tmpdir(), "neotoma-openapi-cwd-"));
    process.chdir(tempDir);
    try {
      const openApiPath = resolveOpenApiPath();
      expect(openApiPath.endsWith("/openapi.yaml")).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
