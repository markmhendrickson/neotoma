/**
 * Derives the same stable agent key string the server uses for `GET /agents`
 * rows, so admission grants (match_thumbprint / match_sub) align with
 * directory identities.
 */

import type { AgentGrant } from "@/types/api";

export function grantDerivedAgentKey(g: AgentGrant): string {
  const tp = g.match_thumbprint?.trim();
  if (tp) return `thumb:${tp}`;
  const sub = g.match_sub?.trim();
  if (sub) return `sub:${sub}`;
  return "anonymous";
}

export function grantsMatchingAgentKey(grants: AgentGrant[], agentKey: string): AgentGrant[] {
  if (agentKey === "anonymous") return [];
  return grants.filter((g) => grantDerivedAgentKey(g) === agentKey);
}

/**
 * True when any capability on the grant lists `entityType` or the `"*"` wildcard.
 */
export function grantCoversEntityType(grant: AgentGrant, entityType: string): boolean {
  const caps = grant.capabilities ?? [];
  for (const c of caps) {
    const types = c.entity_types ?? [];
    if (types.includes("*")) return true;
    if (types.includes(entityType)) return true;
  }
  return false;
}

export function grantsForEntityType(grants: AgentGrant[], entityType: string): AgentGrant[] {
  return grants.filter((g) => grantCoversEntityType(g, entityType));
}

/** One-line summary of grant capabilities for tooltips and list rows. */
export function formatAgentGrantCapabilitiesLine(g: AgentGrant): string {
  const caps = g.capabilities ?? [];
  if (caps.length === 0) return "—";
  return caps
    .map((c) => {
      const types = c.entity_types ?? [];
      const head = types.slice(0, 2).join(", ");
      const more = types.length > 2 ? "…" : "";
      return `${c.op}(${head}${more})`;
    })
    .slice(0, 6)
    .join(" · ");
}
