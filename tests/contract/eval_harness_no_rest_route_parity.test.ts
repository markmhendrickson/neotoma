/**
 * Eval-harness "no REST route" parity.
 *
 * The eval harness keeps its own list of Neotoma MCP tools that have no REST
 * route (NEOTOMA_NO_REST_ROUTE_TOOL_NAMES) because packages/eval-harness cannot
 * import from the root src/. This test pins that list to the canonical
 * contract maps so the two cannot drift silently.
 */

import { describe, expect, it } from "vitest";
import {
  NEOTOMA_NO_REST_ROUTE_TOOL_NAMES,
  NEOTOMA_TOOL_NAMES as HARNESS_REST_REPLAY_TOOL_NAMES,
} from "../../packages/eval-harness/src/drivers/base.js";
import {
  MCP_ONLY_TOOLS,
  MCP_TOOL_TO_CLI_COMMAND,
  MCP_TOOL_TO_OPERATION_ID,
  buildCliEquivalentInvocation,
} from "../../src/shared/contract_mappings.js";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";

const noRestRoute = [...NEOTOMA_NO_REST_ROUTE_TOOL_NAMES];

describe("eval harness no-REST-route tool list parity", () => {
  it("lists only registered Neotoma MCP tools", () => {
    const registered = new Set<string>(NEOTOMA_TOOL_NAMES);
    expect(noRestRoute.filter((tool) => !registered.has(tool))).toEqual([]);
  });

  it("lists only tools absent from MCP_TOOL_TO_OPERATION_ID", () => {
    expect(noRestRoute.filter((tool) => MCP_TOOL_TO_OPERATION_ID[tool] !== undefined)).toEqual(
      []
    );
  });

  it("does not also replay any of them over a REST route", () => {
    expect(noRestRoute.filter((tool) => HARNESS_REST_REPLAY_TOOL_NAMES.has(tool))).toEqual([]);
  });

  it("gives every no-REST-route tool a CLI equivalent (not MCP-only)", () => {
    expect(noRestRoute.filter((tool) => MCP_TOOL_TO_CLI_COMMAND[tool] === undefined)).toEqual([]);
    expect(noRestRoute.filter((tool) => MCP_ONLY_TOOLS.includes(tool))).toEqual([]);
  });

  it("hints the bundles CLI for manage_bundles instead of a dead mcp-only command", () => {
    const hint = buildCliEquivalentInvocation("manage_bundles", {
      action: "install",
      bundle: "crm",
    });
    expect(hint.startsWith("neotoma bundles ")).toBe(true);
    expect(hint).not.toContain("mcp-only");
  });
});
