/**
 * An admitted agent whose grant has no `create_relationship` entry at all is
 * told how to fix it. The fix it was told used to omit `relationship_types`, so
 * following it left the agent denied again: an edge write needs the relationship
 * type listed as well as both endpoint entity types.
 *
 * Seen in production when a dispatcher signing a `checkpoint_brief` store with a
 * `REFERS_TO` edge to its task had a grant covering the entity types but no edge
 * entry: every store was refused, and the hint pointed at an edit that would not
 * have admitted it.
 */

import { describe, expect, it } from "vitest";

import {
  AgentCapabilityError,
  enforceAgentRelationshipCapability,
  type AgentCapabilityContext,
} from "../../src/services/agent_capabilities.js";

function dispatcherContext(): AgentCapabilityContext {
  const capabilities = [
    { op: "store_structured" as const, entity_types: ["checkpoint_brief", "task"] },
    { op: "retrieve" as const, entity_types: ["checkpoint_brief", "task"] },
  ];
  return {
    sub: "dispatcher@swarm.test",
    tier: "software",
    capabilities,
    agentLabel: "dispatcher",
    admitted: true,
    ceiling: { kind: "grant", capabilities },
  };
}

function denial(): AgentCapabilityError {
  try {
    enforceAgentRelationshipCapability(
      "REFERS_TO",
      ["checkpoint_brief", "task"],
      dispatcherContext()
    );
  } catch (error) {
    return error as AgentCapabilityError;
  }
  throw new Error("expected the edge write to be denied");
}

describe("relationship write denial hint", () => {
  it("is a capability denial for a grant with no create_relationship entry", () => {
    const error = denial();
    expect(error).toBeInstanceOf(AgentCapabilityError);
    expect(error.code).toBe("capability_denied");
    expect(error.op).toBe("create_relationship");
  });

  it("names relationship_types, so following it admits the edge", () => {
    const { hint } = denial();
    expect(hint).toContain('relationship_types: ["REFERS_TO"]');
    expect(hint).toContain('entity_types: ["checkpoint_brief", "task"]');
    expect(hint).toContain("Absent or empty relationship_types denies edge writes");
  });

  it("the grant the hint describes does admit the edge", () => {
    const ctx = dispatcherContext();
    const capabilities = [
      ...ctx.capabilities,
      {
        op: "create_relationship" as const,
        entity_types: ["checkpoint_brief", "task"],
        relationship_types: ["REFERS_TO"],
      },
    ];
    expect(() =>
      enforceAgentRelationshipCapability("REFERS_TO", ["checkpoint_brief", "task"], {
        ...ctx,
        capabilities,
        ceiling: { kind: "grant", capabilities },
      })
    ).not.toThrow();
  });
});
