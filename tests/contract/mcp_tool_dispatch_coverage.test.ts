/**
 * Advertised-but-unregistered guard (issue #330).
 *
 * `split_entity` shipped in the MCP tool registry (`buildToolDefinitions`),
 * the contract mappings, and the OpenAPI spec — but the `executeTool` dispatch
 * switch in `src/server.ts` had no `case "split_entity":`, so calling it
 * returned `MCP error -32601: Unknown tool: split_entity`. The pre-existing
 * contract tests validated the *mappings* but never that an advertised tool is
 * actually *dispatchable*, so the gap slipped through.
 *
 * This guard closes that class for every tool: each name returned by
 * `buildToolDefinitions()` MUST appear as a `case` in the `executeTool`
 * dispatch switch (directly, or grouped with another case that shares a
 * handler — the `store` / `store_structured` / `store_unstructured` pattern).
 * If a tool is advertised but missing from dispatch, this fails before a user
 * ever hits the `Unknown tool` runtime error.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { buildToolDefinitions } from "../../src/tool_definitions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverSrc = readFileSync(join(__dirname, "../../src/server.ts"), "utf-8");

/**
 * Extract the body of the `executeTool` dispatch switch — from the method
 * declaration to the `default:` branch that throws `Unknown tool`.
 */
function extractExecuteToolDispatch(source: string): string {
  const start = source.indexOf("private async executeTool(");
  expect(start, "executeTool method must exist in server.ts").toBeGreaterThan(-1);
  const end = source.indexOf("Unknown tool: ${name}", start);
  expect(end, "executeTool default branch (Unknown tool) must exist").toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("MCP tool dispatch coverage — advertised tools must be dispatchable", () => {
  const dispatchBody = extractExecuteToolDispatch(serverSrc);
  const advertisedToolNames = buildToolDefinitions().map((def) => def.name);

  it("advertises a non-empty tool set", () => {
    expect(advertisedToolNames.length).toBeGreaterThan(0);
  });

  it("registers a dispatch case for split_entity (issue #330)", () => {
    expect(advertisedToolNames).toContain("split_entity");
    expect(dispatchBody).toMatch(/case\s+"split_entity"\s*:/);
  });

  it.each(advertisedToolNames)("registers a dispatch case for advertised tool %s", (toolName) => {
    const casePattern = new RegExp(
      `case\\s+"${toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`
    );
    expect(
      casePattern.test(dispatchBody),
      `Tool "${toolName}" is advertised by buildToolDefinitions() but has no case in the executeTool dispatch switch. ` +
        `Calling it via MCP would return "Unknown tool: ${toolName}". Add a case in src/server.ts.`
    ).toBe(true);
  });
});
