/**
 * Grant vocabulary for the entity lifecycle and schema-governance ops: a
 * grant may carry them, and nothing else implies them.
 */

import { describe, expect, it } from "vitest";

import {
  AgentCapabilityError,
  enforceAgentCapability,
  type AgentCapabilityContext,
} from "../../src/services/agent_capabilities.js";
import { validateCapabilities } from "../../src/services/agent_grants.js";
import {
  assertCurrentAgentMay,
  assetEntityTypeForMimeType,
  lifecycleOpForFields,
  storeEntityTypeOf,
} from "../../src/services/mutation_capability.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import type { AgentCapabilityEntry } from "../../src/services/agent_capabilities.js";

function asAdmitted<T>(capabilities: AgentCapabilityEntry[], fn: () => T): T {
  return runWithRequestContext(
    {
      agentIdentity: {
        sub: "unit@swarm.test",
        thumbprint: "tp-unit",
        algorithm: "ES256",
        publicKey: "{}",
        tier: "software",
      },
      attributionDecision: null,
      aauthAdmission: {
        admitted: true,
        reason: "admitted",
        user_id: "u",
        grant_id: "g",
        agent_label: "unit",
        capabilities,
      },
    },
    fn
  ) as T;
}

const NEW_OPS = ["delete", "restore", "merge", "split", "register_schema"] as const;

function admitted(capabilities: AgentCapabilityContext["capabilities"]): AgentCapabilityContext {
  return {
    sub: "unit@swarm.test",
    tier: "software",
    capabilities,
    agentLabel: "unit",
    admitted: true,
    ceiling: { kind: "grant", capabilities: capabilities ?? [] },
  };
}

describe("grant vocabulary: delete, restore, merge, split, register_schema", () => {
  it.each(NEW_OPS)("validateCapabilities accepts %s scoped by entity_types", (op) => {
    expect(validateCapabilities([{ op, entity_types: ["task"] }])).toEqual([
      { op, entity_types: ["task"] },
    ]);
  });

  it.each(NEW_OPS)("validateCapabilities requires entity_types for %s", (op) => {
    expect(() => validateCapabilities([{ op }])).toThrow(/entity_types/);
  });

  it.each(NEW_OPS)("store, store_structured and correct on * do not imply %s", (op) => {
    const ctx = admitted([
      { op: "store", entity_types: ["*"] },
      { op: "store_structured", entity_types: ["*"] },
      { op: "correct", entity_types: ["*"] },
      { op: "retrieve", entity_types: ["*"] },
    ]);
    expect(() => enforceAgentCapability(op, ["task"], ctx)).toThrow(AgentCapabilityError);
  });

  it.each(NEW_OPS)("%s is covered only for the listed types", (op) => {
    const ctx = admitted([{ op, entity_types: ["task"] }]);
    expect(() => enforceAgentCapability(op, ["task"], ctx)).not.toThrow();
    expect(() => enforceAgentCapability(op, ["contact"], ctx)).toThrow(AgentCapabilityError);
  });

  it("bundle activation needs register_schema on *: a named type is not enough", () => {
    expect(() =>
      enforceAgentCapability(
        "register_schema",
        ["*"],
        admitted([{ op: "register_schema", entity_types: ["task"] }])
      )
    ).toThrow(AgentCapabilityError);
    expect(() =>
      enforceAgentCapability(
        "register_schema",
        ["*"],
        admitted([{ op: "register_schema", entity_types: ["*"] }])
      )
    ).not.toThrow();
  });

  it("the reserved _deleted field makes a write a delete or a restore", () => {
    expect(lifecycleOpForFields({ name: "a", _deleted: true })).toBe("delete");
    // Only `true` hides an entity; any other value shows it again.
    expect(lifecycleOpForFields({ _deleted: false })).toBe("restore");
    expect(lifecycleOpForFields({ _deleted: "true" })).toBe("restore");
    expect(lifecycleOpForFields({ _deleted: null })).toBe("restore");
    expect(lifecycleOpForFields({ name: "a" })).toBeNull();
    expect(lifecycleOpForFields(null)).toBeNull();
  });

  it("a blank type or an empty list is judged as *", () => {
    const scoped: AgentCapabilityEntry[] = [{ op: "register_schema", entity_types: ["task"] }];
    for (const types of [[""], ["  "], [], ["task", ""]]) {
      expect(() =>
        asAdmitted(scoped, () => assertCurrentAgentMay("register_schema", types))
      ).toThrow(AgentCapabilityError);
    }
    const wide: AgentCapabilityEntry[] = [{ op: "register_schema", entity_types: ["*"] }];
    expect(() =>
      asAdmitted(wide, () => assertCurrentAgentMay("register_schema", [""]))
    ).not.toThrow();
  });

  it.each(NEW_OPS)("%s reaches a protected type only when the grant names it", (op) => {
    expect(() =>
      asAdmitted([{ op, entity_types: ["*"] }], () => assertCurrentAgentMay(op, ["agent_grant"]))
    ).toThrow(AgentCapabilityError);
    expect(() =>
      asAdmitted([{ op, entity_types: ["agent_grant"] }], () =>
        assertCurrentAgentMay(op, ["agent_grant"])
      )
    ).not.toThrow();
  });

  it("no agent identity is not gated", () => {
    expect(() => assertCurrentAgentMay("delete", ["agent_grant"])).not.toThrow();
    expect(() => assertCurrentAgentMay("delete", [])).not.toThrow();
  });

  it("a store entity with no type is judged as the type the write uses", () => {
    expect(storeEntityTypeOf({ entity_type: "task" })).toBe("task");
    expect(storeEntityTypeOf({ type: "note" })).toBe("note");
    expect(storeEntityTypeOf({ title: "x" })).toBe("generic");
  });

  it("asset types for uploads follow the MIME family", () => {
    expect(assetEntityTypeForMimeType("image/png")).toBe("image_asset");
    expect(assetEntityTypeForMimeType("audio/mpeg")).toBe("audio_asset");
    expect(assetEntityTypeForMimeType("video/mp4")).toBe("video_asset");
    expect(assetEntityTypeForMimeType("text/plain")).toBe("file_asset");
    expect(assetEntityTypeForMimeType(undefined)).toBe("file_asset");
  });
});
