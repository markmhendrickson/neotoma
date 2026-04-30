/**
 * Unit tests for looksLikeExternalDataTool and the external_data_tool_calls
 * turn state counter from cursor-hooks/_common.ts.
 */

import { describe, expect, it } from "vitest";
import {
  looksLikeExternalDataTool,
  type TurnComplianceState,
} from "../../packages/cursor-hooks/hooks/_common.js";

function baseTurnState(overrides?: Partial<TurnComplianceState>): TurnComplianceState {
  return {
    conversation_id: "test-session",
    generation_id: "turn-1",
    model: "claude-sonnet-4.5",
    tool_invocation_count: 0,
    store_structured_calls: 0,
    retrieve_calls: 0,
    neotoma_tool_failures: 0,
    external_data_tool_calls: 0,
    user_message_stored: false,
    assistant_message_stored: false,
    reminder_injected: false,
    reminder_hooks: [],
    neotoma_connection_failure: false,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("looksLikeExternalDataTool", () => {
  it("detects CallMcpTool to gmail server with structured output", () => {
    const result = looksLikeExternalDataTool(
      "CallMcpTool",
      { server: "user-gmail", toolName: "search_emails", arguments: { query: "in:anywhere", maxResults: 10 } },
      JSON.stringify([{ id: "msg1", subject: "Hello" }]),
    );
    expect(result).toBe(true);
  });

  it("rejects CallMcpTool to neotoma server", () => {
    const result = looksLikeExternalDataTool(
      "CallMcpTool",
      { server: "user-neotoma", toolName: "store_structured" },
      JSON.stringify({ entities: [] }),
    );
    expect(result).toBe(false);
  });

  it("rejects Neotoma-relevant direct tool names", () => {
    expect(looksLikeExternalDataTool("store_structured", {}, "{}")).toBe(false);
    expect(looksLikeExternalDataTool("retrieve_entities", {}, "{}")).toBe(false);
    expect(looksLikeExternalDataTool("create_relationship", {}, "{}")).toBe(false);
  });

  it("detects direct external tool names with structured output", () => {
    expect(looksLikeExternalDataTool(
      "search_emails",
      {},
      JSON.stringify([{ id: "msg1" }]),
    )).toBe(true);

    expect(looksLikeExternalDataTool(
      "list_events",
      {},
      JSON.stringify([{ id: "evt1", title: "Meeting" }]),
    )).toBe(true);
  });

  it("rejects external tool names with null output", () => {
    expect(looksLikeExternalDataTool("search_emails", {}, null)).toBe(false);
  });

  it("rejects external tool names with trivially short output", () => {
    expect(looksLikeExternalDataTool("search_emails", {}, "[]")).toBe(false);
  });

  it("detects CallMcpTool to arbitrary non-neotoma server", () => {
    const result = looksLikeExternalDataTool(
      "CallMcpTool",
      { server: "user-calendar", toolName: "list_events" },
      JSON.stringify({ events: [{ id: 1, title: "Standup" }] }),
    );
    expect(result).toBe(true);
  });

  it("rejects non-matching tool names", () => {
    expect(looksLikeExternalDataTool("Read", {}, "file contents here")).toBe(false);
    expect(looksLikeExternalDataTool("Shell", {}, "command output")).toBe(false);
    expect(looksLikeExternalDataTool("Grep", {}, "search results")).toBe(false);
  });

  it("rejects CallMcpTool without server", () => {
    const result = looksLikeExternalDataTool(
      "CallMcpTool",
      { toolName: "some_tool" },
      JSON.stringify({ data: "yes" }),
    );
    expect(result).toBe(false);
  });
});

describe("TurnComplianceState external_data_tool_calls", () => {
  it("defaults to 0", () => {
    const state = baseTurnState();
    expect(state.external_data_tool_calls).toBe(0);
  });

  it("accepts positive counts", () => {
    const state = baseTurnState({ external_data_tool_calls: 3 });
    expect(state.external_data_tool_calls).toBe(3);
  });
});
