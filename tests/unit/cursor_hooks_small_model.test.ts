/**
 * Unit tests for cursor-hooks shared helpers, focusing on the
 * diagnoseSkippedStore classifier from _common.ts.
 */

import { describe, expect, it } from "vitest";
import {
  diagnoseSkippedStore,
  looksLikeRetrieveInvocation,
  looksLikeStoreStructured,
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

describe("diagnoseSkippedStore", () => {
  it("classifies tooling_unavailable_or_failed on connection failure", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState({ neotoma_connection_failure: true }),
      hadFinalText: true,
      localBuild: false,
    });
    expect(result.classification).toBe("tooling_unavailable_or_failed");
    expect(result.confidence).toBe("high");
  });

  it("classifies tooling_unavailable_or_failed on tool failures", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState({ neotoma_tool_failures: 3 }),
      hadFinalText: true,
      localBuild: false,
    });
    expect(result.classification).toBe("tooling_unavailable_or_failed");
    expect(result.confidence).toBe("medium");
  });

  it("classifies hook_state_incomplete when no reminders and no tools", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState(),
      hadFinalText: true,
      localBuild: false,
    });
    expect(result.classification).toBe("hook_state_incomplete");
    expect(result.confidence).toBe("high");
    expect(result.recommended_repairs.some((r) => r.includes("install"))).toBe(true);
  });

  it("classifies hook_state_incomplete with medium confidence when user message was stored", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState({ user_message_stored: true }),
      hadFinalText: true,
      localBuild: false,
    });
    expect(result.classification).toBe("hook_state_incomplete");
    expect(result.confidence).toBe("medium");
  });

  it("classifies instruction_delivery_missing_or_stale when tools ran but no reminders", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState({ tool_invocation_count: 5 }),
      hadFinalText: true,
      localBuild: false,
    });
    expect(result.classification).toBe("instruction_delivery_missing_or_stale");
    expect(result.confidence).toBe("medium");
  });

  it("classifies agent_ignored_available_instructions when reminders injected and had final text", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState({
        reminder_injected: true,
        reminder_hooks: ["session_start", "post_tool_use"],
        tool_invocation_count: 3,
      }),
      hadFinalText: true,
      localBuild: false,
    });
    expect(result.classification).toBe("agent_ignored_available_instructions");
    expect(result.confidence).toBe("high");
  });

  it("classifies false_positive_or_no_material_content when reminders injected but no final text", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState({
        reminder_injected: true,
        reminder_hooks: ["session_start"],
      }),
      hadFinalText: false,
      localBuild: false,
    });
    expect(result.classification).toBe("false_positive_or_no_material_content");
    expect(result.confidence).toBe("low");
  });

  it("includes repo-owned repairs for local builds", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState({
        reminder_injected: true,
        reminder_hooks: ["session_start"],
        tool_invocation_count: 2,
      }),
      hadFinalText: true,
      localBuild: true,
    });
    expect(result.local_build).toBe(true);
    expect(result.proactive_remediation_required).toBe(true);
    expect(result.recommended_repairs.some((r) => r.includes("Tier 1"))).toBe(true);
  });

  it("includes non-repo repairs for non-local builds", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState({
        reminder_injected: true,
        reminder_hooks: ["session_start"],
        tool_invocation_count: 2,
      }),
      hadFinalText: true,
      localBuild: false,
    });
    expect(result.local_build).toBe(false);
    expect(result.proactive_remediation_required).toBe(false);
    expect(result.recommended_repairs.some((r) => r.includes("NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP"))).toBe(true);
  });

  it("respects localBuild override parameter", () => {
    const resultLocal = diagnoseSkippedStore({
      state: baseTurnState(),
      hadFinalText: true,
      localBuild: true,
    });
    expect(resultLocal.local_build).toBe(true);

    const resultNonLocal = diagnoseSkippedStore({
      state: baseTurnState(),
      hadFinalText: true,
      localBuild: false,
    });
    expect(resultNonLocal.local_build).toBe(false);
  });

  it("always includes signals in the result", () => {
    const result = diagnoseSkippedStore({
      state: baseTurnState(),
      hadFinalText: true,
      localBuild: false,
    });
    expect(result.signals).toBeDefined();
    expect(typeof result.signals.reminder_injected).toBe("boolean");
    expect(typeof result.signals.neotoma_connection_failure).toBe("boolean");
    expect(typeof result.signals.had_final_text).toBe("boolean");
  });
});

describe("generic MCP wrapper detection", () => {
  it("recognizes wrapped Neotoma store_structured calls", () => {
    expect(
      looksLikeStoreStructured("CallMcpTool", {
        server: "user-neotoma",
        toolName: "store_structured",
        arguments: {
          entities: [{ entity_type: "conversation_message", role: "user" }],
        },
      })
    ).toBe(true);
  });

  it("recognizes Neotoma CLI store calls as turn writes", () => {
    expect(
      looksLikeStoreStructured("Shell", {
        command:
          "neotoma --servers=start store --idempotency-key turn-1 --json='[{\"entity_type\":\"conversation_message\"}]'",
      })
    ).toBe(true);
  });

  it("does not classify Neotoma CLI reads as turn writes", () => {
    expect(
      looksLikeStoreStructured("Shell", {
        command: 'neotoma --servers=start entities search "Neotoma compliance checks"',
      })
    ).toBe(false);
  });

  it("recognizes wrapped Neotoma retrieval calls", () => {
    expect(
      looksLikeRetrieveInvocation("CallMcpTool", {
        server: "user-neotoma",
        toolName: "retrieve_entity_by_identifier",
        arguments: { identifier: "Neotoma" },
      })
    ).toBe(true);
  });
});
