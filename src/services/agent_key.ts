/**
 * Stable agent-identity key derivation, shared between the agents directory
 * service and the recent-activity service.
 *
 * Keep this in sync with `inspector/src/components/shared/agent_badge.ts`
 * `getAttributionKey()` — both must agree on keys so URLs round-trip.
 *
 * Priority order:
 *   1. `thumb:<agent_thumbprint>`       (AAuth-verified rows)
 *   2. `sub:<agent_sub>`                (JWT subject, no thumbprint)
 *   3. `name:<client_name>[@version]`   (unverified MCP clientInfo)
 *   4. `anonymous`                      (no identifying provenance)
 */

export const ANONYMOUS_AGENT_KEY = "anonymous";

function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface AgentKeyFields {
  agent_thumbprint?: string | null;
  agent_sub?: string | null;
  client_name?: string | null;
  client_version?: string | null;
}

export function deriveAgentKey(fields: AgentKeyFields): string {
  const thumb = nonEmpty(fields.agent_thumbprint);
  if (thumb) return `thumb:${thumb}`;
  const sub = nonEmpty(fields.agent_sub);
  if (sub) return `sub:${sub}`;
  const name = nonEmpty(fields.client_name);
  if (name) {
    const version = nonEmpty(fields.client_version);
    return version ? `name:${name}@${version}` : `name:${name}`;
  }
  return ANONYMOUS_AGENT_KEY;
}

/** Convenience: pull the four fields out of a parsed provenance blob. */
export function deriveAgentKeyFromProvenance(
  provenance: Record<string, unknown> | null | undefined
): string {
  if (!provenance) return ANONYMOUS_AGENT_KEY;
  return deriveAgentKey({
    agent_thumbprint: provenance.agent_thumbprint as string | undefined,
    agent_sub: provenance.agent_sub as string | undefined,
    client_name: provenance.client_name as string | undefined,
    client_version: provenance.client_version as string | undefined,
  });
}
