import { describe, expect, it } from "vitest";

import {
  computeToolInterfaceHash,
  extractToolListHash,
  reconnectRequiredError,
  stableJson,
  toolListChangedNotification,
} from "../../src/mcp_dev_shim.js";

describe("MCP dev shim interface hashing", () => {
  it("canonicalizes object key order before hashing tool definitions", () => {
    const first = [{ name: "store", inputSchema: { type: "object", properties: { b: 1, a: 2 } } }];
    const second = [{ inputSchema: { properties: { a: 2, b: 1 }, type: "object" }, name: "store" }];

    expect(stableJson(first)).toBe(stableJson(second));
    expect(computeToolInterfaceHash(first)).toBe(computeToolInterfaceHash(second));
  });

  it("changes the interface hash when descriptions or schemas change", () => {
    const base = [{ name: "store", description: "Store data", inputSchema: { type: "object" } }];
    const changedDescription = [
      { name: "store", description: "Store structured data", inputSchema: { type: "object" } },
    ];
    const changedSchema = [
      {
        name: "store",
        description: "Store data",
        inputSchema: { type: "object", required: ["entities"] },
      },
    ];

    expect(computeToolInterfaceHash(base)).not.toBe(computeToolInterfaceHash(changedDescription));
    expect(computeToolInterfaceHash(base)).not.toBe(computeToolInterfaceHash(changedSchema));
  });

  it("extracts hashes from tools/list responses only", () => {
    const toolsList = {
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "retrieve_entities", inputSchema: { type: "object" } }] },
    };

    expect(extractToolListHash(toolsList)).toBe(computeToolInterfaceHash(toolsList.result.tools));
    expect(extractToolListHash({ jsonrpc: "2.0", id: 2, result: { ok: true } })).toBeNull();
  });

  it("builds protocol messages for list-change and reconnect-required paths", () => {
    expect(toolListChangedNotification()).toEqual({
      jsonrpc: "2.0",
      method: "notifications/tools/list_changed",
    });

    const error = reconnectRequiredError("call-1", "Tool schema changed.");
    expect(error.id).toBe("call-1");
    expect((error.error as { code: number }).code).toBe(-32070);
    expect((error.error as { message: string }).message).toContain("reconnect or reinitialize");
  });
});
