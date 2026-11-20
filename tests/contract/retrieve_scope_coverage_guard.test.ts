/**
 * Coverage guard for the opt-in agent-grant retrieve scope: every REST
 * operation in openapi.yaml and every MCP tool must carry a retrieve-scope
 * classification (src/shared/retrieve_scope_classification.ts), so a new
 * read cannot be added without a decision.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";
import {
  MCP_TOOL_TO_OPERATION_ID,
  OPENAPI_OPERATION_MAPPINGS,
} from "../../src/shared/contract_mappings.js";
import {
  FULL_SCOPE_REST_ROUTES,
  MCP_ONLY_TOOL_RETRIEVE_CLASS,
  OPERATION_RETRIEVE_CLASS,
  findUnclassified,
  fullScopeOperationForRequest,
  retrieveClassForTool,
} from "../../src/shared/retrieve_scope_classification.js";

function openApiOperationIds(): string[] {
  const text = readFileSync(path.join(process.cwd(), "openapi.yaml"), "utf8");
  const ids: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^ {6}operationId:\s*([A-Za-z0-9_]+)\s*$/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

describe("retrieve scope coverage guard", () => {
  const operationIds = openApiOperationIds();
  const tools = [...NEOTOMA_TOOL_NAMES];

  it("reads a non-empty operation list from openapi.yaml", () => {
    expect(operationIds.length).toBeGreaterThan(50);
    expect(operationIds).toContain("queryEntities");
  });

  it("classifies every openapi.yaml operation and every MCP tool", () => {
    expect(findUnclassified(operationIds, tools)).toEqual({ operations: [], tools: [] });
  });

  it("fails on a deliberately unclassified operation and tool", () => {
    const result = findUnclassified(
      [...operationIds, "listSomethingNewWithEntityData"],
      [...tools, "list_something_new"]
    );
    expect(result.operations).toEqual(["listSomethingNewWithEntityData"]);
    expect(result.tools).toEqual(["list_something_new"]);
  });

  it("keeps no stale classification entries", () => {
    const known = new Set(operationIds);
    expect(Object.keys(OPERATION_RETRIEVE_CLASS).filter((id) => !known.has(id))).toEqual([]);
    const toolSet = new Set<string>(tools);
    expect(Object.keys(MCP_ONLY_TOOL_RETRIEVE_CLASS).filter((t) => !toolSet.has(t))).toEqual([]);
    // An MCP-only entry must not shadow an operation mapping.
    expect(
      Object.keys(MCP_ONLY_TOOL_RETRIEVE_CLASS).filter((t) => MCP_TOOL_TO_OPERATION_ID[t])
    ).toEqual([]);
  });

  it("gives every exempt entry a reason", () => {
    for (const entry of [
      ...Object.values(OPERATION_RETRIEVE_CLASS),
      ...Object.values(MCP_ONLY_TOOL_RETRIEVE_CLASS),
    ]) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("derives REST gate routes and MCP tool classes from the same contract mappings", () => {
    const fullOps = Object.entries(OPERATION_RETRIEVE_CLASS)
      .filter(([, e]) => e.class === "read_full_scope")
      .map(([id]) => id)
      .sort();
    const mapped = new Set(OPENAPI_OPERATION_MAPPINGS.map((m) => m.operationId));
    expect(fullOps.filter((id) => !mapped.has(id))).toEqual([]);
    expect(FULL_SCOPE_REST_ROUTES.map((r) => r.operationId).sort()).toEqual(fullOps);
    for (const [tool, operationId] of Object.entries(MCP_TOOL_TO_OPERATION_ID)) {
      expect(retrieveClassForTool(tool)).toBe(OPERATION_RETRIEVE_CLASS[operationId]);
    }
  });

  it("matches gate routes case-insensitively and with a trailing slash", () => {
    expect(fullScopeOperationForRequest("GET", "/relationships")).toBe("listRelationships");
    expect(fullScopeOperationForRequest("GET", "/Relationships/")).toBe("listRelationships");
    expect(fullScopeOperationForRequest("get", "/RECORD_ACTIVITY")).toBe("getRecordActivity");
    expect(fullScopeOperationForRequest("GET", "/relationships/abc")).toBe("getRelationshipById");
    expect(fullScopeOperationForRequest("HEAD", "/sources")).toBe("listSources");
    expect(fullScopeOperationForRequest("GET", "/entities")).toBeNull();
    expect(fullScopeOperationForRequest("POST", "/relationships")).toBeNull();
    expect(fullScopeOperationForRequest("GET", "/relationshipsx")).toBeNull();
  });
});
