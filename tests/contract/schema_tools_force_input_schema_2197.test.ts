/**
 * #2197: `force` must be declared in the MCP tool `inputSchema` of both
 * schema-writing tools.
 *
 * The reported defect was that `force` was validated by the Zod request
 * schemas but absent from the hand-maintained `inputSchema`, so an MCP client
 * (which validates and strips arguments against the advertised schema) never
 * got it to a handler. Tests that call `executeToolForCli` bypass that layer,
 * so they stay green if the declaration is deleted. This test pins the
 * declaration itself.
 */

import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../../src/tool_definitions.js";

describe("schema tools declare force in inputSchema (#2197)", () => {
  const tools = buildToolDefinitions();

  for (const toolName of ["update_schema_incremental", "register_schema"]) {
    it(`${toolName} advertises force as an optional boolean`, () => {
      const tool = tools.find((t) => t.name === toolName);
      expect(tool, `${toolName} missing from buildToolDefinitions`).toBeDefined();
      const schema = tool!.inputSchema as {
        properties?: Record<string, { type?: string }>;
        required?: string[];
      };
      expect(schema.properties?.force?.type).toBe("boolean");
      expect(schema.required ?? []).not.toContain("force");
    });
  }
});
