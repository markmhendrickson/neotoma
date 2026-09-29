/**
 * Load/submit mapping for the capability rows of the agent grant form.
 *
 * Kept free of React and UI imports so the round-trip is unit-testable
 * without the Inspector's own dependencies installed.
 *
 * `relationship_types` is the second allowlist on a `create_relationship`
 * entry: without it the entry grants no edge writes (neotoma#2524). The form
 * has no editor for it yet, so it MUST pass through load and submit
 * unchanged — dropping it here would turn any routine grant edit into a
 * silent revocation of the agent's edge-write authority.
 */

import type { AgentCapabilityEntry } from "../../types/api";

/** Capability rows for the form, from a stored grant's capabilities. */
export function capabilitiesForForm(
  capabilities: AgentCapabilityEntry[] | undefined,
): AgentCapabilityEntry[] | null {
  if (!capabilities || capabilities.length === 0) return null;
  return capabilities.map((c) => {
    const row: AgentCapabilityEntry = {
      op: c.op,
      entity_types: c.entity_types.length > 0 ? [...c.entity_types] : ["*"],
    };
    if (c.relationship_types !== undefined) {
      row.relationship_types = [...c.relationship_types];
    }
    return row;
  });
}

/** Wire-shape capabilities for the create/update payload. */
export function capabilitiesForPayload(rows: AgentCapabilityEntry[]): AgentCapabilityEntry[] {
  return rows.map((c) => {
    const entry: AgentCapabilityEntry = {
      op: c.op,
      entity_types: (Array.isArray(c.entity_types) ? c.entity_types : [])
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    };
    if (c.relationship_types !== undefined) {
      entry.relationship_types = [...c.relationship_types];
    }
    return entry;
  });
}
