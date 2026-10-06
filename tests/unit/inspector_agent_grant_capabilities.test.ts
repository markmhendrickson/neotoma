/**
 * The Inspector agent grant form must carry `relationship_types` through load
 * and submit (neotoma#2524): a mapping that dropped it would silently revoke
 * every edge-write grant the moment an operator saved the grant for any other
 * reason. The form edits the list on `create_relationship` rows, drops it on
 * an op switch away, and flags rows whose empty list grants no edge writes.
 */

import { describe, expect, it } from "vitest";
import {
  capabilitiesForForm,
  capabilitiesForPayload,
  isInertRelationshipCapability,
  parseListInput,
  withCapabilityOp,
} from "../../inspector/src/components/agents/agent_grant_capabilities.js";

describe("Inspector agent grant capability mapping", () => {
  it("round-trips relationship_types through load and submit", () => {
    const stored = [
      {
        op: "create_relationship" as const,
        entity_types: ["checkpoint_brief", "task"],
        relationship_types: ["REFERS_TO"],
      },
      { op: "store_structured" as const, entity_types: ["task"] },
    ];

    const rows = capabilitiesForForm(stored);
    expect(rows).not.toBeNull();
    const payload = capabilitiesForPayload(rows!);

    expect(payload).toEqual(stored);
    expect("relationship_types" in payload[1]).toBe(false);
  });

  it("keeps an explicitly empty relationship_types list as empty (still denies)", () => {
    const rows = capabilitiesForForm([
      { op: "create_relationship", entity_types: ["task"], relationship_types: [] },
    ]);
    expect(capabilitiesForPayload(rows!)[0].relationship_types).toEqual([]);
  });

  it("defaults an empty entity_types list to '*' on load and trims on submit", () => {
    const rows = capabilitiesForForm([{ op: "retrieve", entity_types: [] }]);
    expect(rows![0].entity_types).toEqual(["*"]);
    expect(
      capabilitiesForPayload([{ op: "retrieve", entity_types: [" task ", ""] }])[0].entity_types
    ).toEqual(["task"]);
    expect(capabilitiesForForm([])).toBeNull();
  });

  it("carries a relationship_types value edited in the form into the payload", () => {
    const rows = capabilitiesForForm([{ op: "create_relationship", entity_types: ["task"] }])!;
    const edited = { ...rows[0], relationship_types: parseListInput(" REFERS_TO, ,PART_OF ") };
    expect(capabilitiesForPayload([edited])).toEqual([
      {
        op: "create_relationship",
        entity_types: ["task"],
        relationship_types: ["REFERS_TO", "PART_OF"],
      },
    ]);
  });

  it("drops relationship_types when a row switches away from create_relationship", () => {
    const row = {
      op: "create_relationship" as const,
      entity_types: ["task"],
      relationship_types: ["REFERS_TO"],
    };
    const [payload] = capabilitiesForPayload([withCapabilityOp(row, "store_structured")]);
    expect(payload).toEqual({ op: "store_structured", entity_types: ["task"] });
    expect("relationship_types" in payload).toBe(false);
  });

  it("does not pre-fill relationship_types when a row switches to create_relationship", () => {
    const next = withCapabilityOp(
      { op: "store_structured", entity_types: ["*"] },
      "create_relationship"
    );
    expect(next.relationship_types).toBeUndefined();
    expect(isInertRelationshipCapability(next)).toBe(true);
  });

  it("flags create_relationship rows with a missing or empty list as inert", () => {
    expect(
      isInertRelationshipCapability({ op: "create_relationship", entity_types: ["task"] })
    ).toBe(true);
    expect(
      isInertRelationshipCapability({
        op: "create_relationship",
        entity_types: ["task"],
        relationship_types: [],
      })
    ).toBe(true);
    expect(
      isInertRelationshipCapability({
        op: "create_relationship",
        entity_types: ["task"],
        relationship_types: ["REFERS_TO"],
      })
    ).toBe(false);
    expect(isInertRelationshipCapability({ op: "store_structured", entity_types: ["task"] })).toBe(
      false
    );
  });
});
