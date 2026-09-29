/**
 * Load/submit mapping for the capability rows of the agent grant form.
 *
 * Kept free of React and UI imports so the round-trip is unit-testable
 * without the Inspector's own dependencies installed.
 *
 * `relationship_types` is the second allowlist on a `create_relationship`
 * entry: without it the entry grants no edge writes (neotoma#2524). Load and
 * submit carry it through, so a routine grant edit never silently revokes the
 * agent's edge-write authority; only an op switch away from
 * `create_relationship` drops it (see `withCapabilityOp`).
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
      entry.relationship_types = c.relationship_types
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }
    return entry;
  });
}

/** Parse a comma-separated list input: split, trim, drop empty entries. */
export function parseListInput(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * The row after its op changes. Switching to `create_relationship` leaves
 * `relationship_types` unset (a pre-filled type would be a silent grant);
 * switching away drops it, so a non-edge row never carries a stale edge list
 * the operator can no longer see.
 */
export function withCapabilityOp(
  cap: AgentCapabilityEntry,
  op: AgentCapabilityEntry["op"],
): AgentCapabilityEntry {
  const next: AgentCapabilityEntry = { op, entity_types: [...cap.entity_types] };
  if (op === "create_relationship" && cap.op === "create_relationship" && cap.relationship_types) {
    next.relationship_types = [...cap.relationship_types];
  }
  return next;
}

/** True when a `create_relationship` row grants no edge writes. */
export function isInertRelationshipCapability(cap: AgentCapabilityEntry): boolean {
  return (
    cap.op === "create_relationship" &&
    (!cap.relationship_types || cap.relationship_types.length === 0)
  );
}
