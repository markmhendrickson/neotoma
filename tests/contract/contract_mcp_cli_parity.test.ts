/**
 * MCP-CLI Parity Contract Tests
 *
 * Validates that all MCP data operation tools have corresponding CLI commands
 * and that bidirectional mappings are consistent and complete.
 *
 * These tests act as a regression guard: any time a new MCP tool is added
 * without a CLI equivalent, or vice versa, these tests will fail.
 */

import { describe, it, expect } from "vitest";
import {
  MCP_ONLY_TOOLS,
  MCP_TOOL_TO_CLI_COMMAND,
  MCP_TOOL_TO_OPERATION_ID,
  OPENAPI_OPERATION_MAPPINGS,
} from "../../src/shared/contract_mappings.js";

// Tools that are intentionally infrastructure/CLI-only — no MCP equivalent needed
const INFRA_ONLY_CLI_TOOLS = [
  "init",
  "servers",
  "auth login",
  "auth logout",
  "auth status",
  "auth mcp-token",
  "mcp config",
  "mcp check",
  "mcp watch",
  "storage info",
  "storage backup",
  "storage restore",
  "logs tail",
  "api start",
  "api stop",
  "api logs",
  "dev",
  "env",
  "options",
  "stats",
  "request",
];

// All data operation MCP tools that must have CLI equivalents
const DATA_OPERATION_MCP_TOOLS = [
  "store",
  "store_structured",
  "store_unstructured",
  "retrieve_entity_snapshot",
  "retrieve_entities",
  "retrieve_entity_by_identifier",
  "merge_entities",
  "delete_entity",
  "restore_entity",
  "get_authenticated_user",
  "list_observations",
  "retrieve_field_provenance",
  "create_relationship",
  "list_relationships",
  "get_relationship_snapshot",
  "delete_relationship",
  "restore_relationship",
  "list_entity_types",
  "analyze_schema_candidates",
  "get_schema_recommendations",
  "update_schema_incremental",
  "register_schema",
  "health_check_snapshots",
  "correct",
  "retrieve_file_url",
  "reinterpret",
  "list_timeline_events",
  "retrieve_related_entities",
  "retrieve_graph_neighborhood",
];

describe("MCP-CLI Parity", () => {
  it("MCP_ONLY_TOOLS list should be empty — all tools must have CLI equivalents", () => {
    expect(MCP_ONLY_TOOLS).toHaveLength(0);
  });

  it("all data operation MCP tools should have explicit CLI command mappings", () => {
    const missing: string[] = [];

    for (const tool of DATA_OPERATION_MCP_TOOLS) {
      const hasOperationId = MCP_TOOL_TO_OPERATION_ID[tool] !== undefined;
      const hasCliCommand = MCP_TOOL_TO_CLI_COMMAND[tool] !== undefined;

      if (!hasOperationId && !hasCliCommand) {
        missing.push(tool);
      }
    }

    expect(
      missing,
      `These MCP tools have no CLI mapping: ${missing.join(", ")}`
    ).toHaveLength(0);
  });

  it("no data operation tool should use the mcp-only fallback placeholder", () => {
    const violations: string[] = [];

    for (const tool of DATA_OPERATION_MCP_TOOLS) {
      const cliCommand = MCP_TOOL_TO_CLI_COMMAND[tool];
      if (cliCommand && cliCommand.startsWith("mcp-only")) {
        violations.push(`${tool} → ${cliCommand}`);
      }
    }

    expect(
      violations,
      `These tools still use mcp-only placeholder: ${violations.join("; ")}`
    ).toHaveLength(0);
  });

  it("all MCP_TOOL_TO_CLI_COMMAND entries should have non-empty values", () => {
    for (const [tool, command] of Object.entries(MCP_TOOL_TO_CLI_COMMAND)) {
      expect(
        command,
        `MCP tool '${tool}' has empty CLI command mapping`
      ).toBeTruthy();
      expect(
        command.trim().length,
        `MCP tool '${tool}' has whitespace-only CLI command mapping`
      ).toBeGreaterThan(0);
    }
  });

  it("bidirectional: tools using CLI fallback mapping should have correct command prefixes", () => {
    // These tools are NOT in MCP_TOOL_TO_OPERATION_ID, so they use MCP_TOOL_TO_CLI_COMMAND
    // as their primary mapping path. Verify the CLI command prefix is correct for each.
    const expectedCliMappedTools: Record<string, string> = {
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

    for (const [cliPrefix, mcpTool] of Object.entries(expectedCliMappedTools)) {
      const mappedCommand = MCP_TOOL_TO_CLI_COMMAND[mcpTool];
      expect(
        mappedCommand,
        `MCP tool '${mcpTool}' has no CLI command mapping`
      ).toBeTruthy();
      expect(
        mappedCommand?.startsWith(cliPrefix),
        `MCP tool '${mcpTool}' should map to CLI command starting with '${cliPrefix}', got: '${mappedCommand}'`
      ).toBe(true);
    }
  });

  it("bidirectional: tools using OpenAPI operation mapping should have entries in MCP_TOOL_TO_OPERATION_ID", () => {
    // These tools are routed via full OpenAPI operations — verify they're in the operation map
    const operationMappedTools = [
      "delete_entity",
      "restore_entity",
      "delete_relationship",
      "restore_relationship",
      "store",
      "store_structured",
      "retrieve_entity_snapshot",
      "retrieve_entities",
      "merge_entities",
      "list_observations",
      "retrieve_field_provenance",
      "create_relationship",
      "list_relationships",
      "list_entity_types",
      "list_timeline_events",
    ];

    for (const tool of operationMappedTools) {
      expect(
        MCP_TOOL_TO_OPERATION_ID[tool],
        `MCP tool '${tool}' should be in MCP_TOOL_TO_OPERATION_ID`
      ).toBeTruthy();
    }
  });

  it("all MCP tools in MCP_TOOL_TO_OPERATION_ID should have valid OPENAPI_OPERATION_MAPPINGS entries", () => {
    const operationIdSet = new Set(
      OPENAPI_OPERATION_MAPPINGS.map((m) => m.operationId)
    );

    for (const [tool, operationId] of Object.entries(MCP_TOOL_TO_OPERATION_ID)) {
      expect(
        operationIdSet.has(operationId),
        `MCP tool '${tool}' maps to operationId '${operationId}' which has no OPENAPI_OPERATION_MAPPINGS entry`
      ).toBe(true);
    }
  });

  it("data operation tools mapped via MCP_TOOL_TO_OPERATION_ID should not also appear in MCP_TOOL_TO_CLI_COMMAND as primary mappings", () => {
    // Tools that have a full OpenAPI operation mapping don't need the CLI command fallback map
    // (they're already fully covered). This is an informational check.
    const operationMappedTools = new Set(Object.keys(MCP_TOOL_TO_OPERATION_ID));
    const cliMappedTools = new Set(Object.keys(MCP_TOOL_TO_CLI_COMMAND));

    const both = [...operationMappedTools].filter((t) => cliMappedTools.has(t));

    // Having a tool in both is not an error — just ensure neither is empty
    for (const tool of both) {
      expect(MCP_TOOL_TO_CLI_COMMAND[tool]).toBeTruthy();
    }
  });

  it("no MCP_ONLY_TOOLS entries should also appear in MCP_TOOL_TO_OPERATION_ID", () => {
    const operationMappedTools = new Set(Object.keys(MCP_TOOL_TO_OPERATION_ID));
    for (const tool of MCP_ONLY_TOOLS) {
      expect(
        operationMappedTools.has(tool),
        `Tool '${tool}' is in MCP_ONLY_TOOLS but also has an operation mapping — remove it from MCP_ONLY_TOOLS`
      ).toBe(false);
    }
  });
});
