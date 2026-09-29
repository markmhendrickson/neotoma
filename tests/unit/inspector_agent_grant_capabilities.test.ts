/**
 * The Inspector agent grant form must carry `relationship_types` through load
 * and submit unchanged (neotoma#2524). The form has no editor for the field,
 * so a mapping that dropped it would silently revoke every edge-write grant
 * the moment an operator saved the grant for any other reason.
 */

import { describe, expect, it } from "vitest";
import {
  capabilitiesForForm,
  capabilitiesForPayload,
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
});
