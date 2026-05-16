/**
 * Protected entity types — write-side guard.
 *
 * Some entity types are governance state (e.g. `agent_grant`) and must not
 * be writable by every agent that can otherwise pass attribution policy.
 * The Stronger AAuth Admission plan introduces this guard so agents can
 * self-manage grants only when an explicit grant capability authorises
 * it, while user-authenticated callers (Bearer / OAuth / local-dev /
 * sandbox-user) keep working without ceremony.
 *
 * Rules enforced by {@link assertCanWriteProtected}:
 *
 *   1. If `entity_type` is not in {@link PROTECTED_ENTITY_TYPES}, return
 *      immediately — the type is unprotected.
 *   2. If the request is admitted via AAuth grants (`admission.admitted`),
 *      the resolved grant must include a capability covering `op` for
 *      `entity_type` (or `*`). Missing → `AgentCapabilityError`.
 *   3. If the request is NOT admitted but carries an AAuth identity (any
 *      of `sub` / `thumbprint` / `clientName`), it is treated as an
 *      unrecognised agent and rejected. This catches the
 *      "AAuth-verified-but-unknown" and "self-reported clientInfo" cases
 *      that should never mutate governance state.
 *   4. Otherwise (no agent identity at all) the caller is plain
 *      user-authenticated; allow.
 *
 * The guard is invoked at the structured-store entry points (HTTP
 * `storeStructuredForApi`, MCP `storeStructuredInternal`) AND deeply at
 * the {@link createObservation} / {@link createCorrection} insertion
 * sites so an alternative write path cannot leak by skipping the upper
 * gate.
 */

import {
  AgentCapabilityError,
  type AgentCapabilityEntry,
  type AgentCapabilityOp,
} from "./agent_capabilities.js";
import type { AgentIdentity } from "../crypto/agent_identity.js";

/** Initial protected list. Add new entries here as governance state grows. */
const PROTECTED_ENTITY_TYPES: ReadonlySet<string> = new Set(["agent_grant"]);

/**
 * Diagnostic record describing how the current request was admitted via
 * AAuth grants. Threaded through the request context so the deep guard
 * can inspect it without coupling to Express. `null` when this request
 * did not pass through the admission service.
 */
export interface AAuthAdmissionContext {
  admitted: boolean;
  /** Reason the admission service produced when `admitted === false`. */
  reason?: AAuthAdmissionReason;
  /** Owner user id of the matched grant. */
  user_id?: string;
  /** Stable id of the matched grant entity. */
  grant_id?: string;
  /** Human-readable grant label (mirrors the grant's `label` field). */
  agent_label?: string;
  /**
   * Capabilities array sourced verbatim from the grant entity. Empty
   * array when admitted but the grant declared no capabilities (the
   * caller can sign requests but can't store anything).
   */
  capabilities?: AgentCapabilityEntry[];
}

export type AAuthAdmissionReason =
  | "admitted"
  | "no_grants_for_user"
  | "no_match"
  | "grant_revoked"
  | "grant_suspended"
  | "strict_rejected"
  | "aauth_disabled"
  | "not_signed";

/** Returns true when writes to `entity_type` are gated by this guard. */
export function isProtected(entity_type: string): boolean {
  return PROTECTED_ENTITY_TYPES.has(entity_type);
}

/** Snapshot of the current protected-entity-types list. */
export function getProtectedEntityTypes(): string[] {
  return Array.from(PROTECTED_ENTITY_TYPES).sort();
}

interface AssertCanWriteProtectedParams {
  entity_type: string;
  op: AgentCapabilityOp;
  identity: AgentIdentity | null;
  admission: AAuthAdmissionContext | null;
}

/**
 * Throws {@link AgentCapabilityError} when the active caller is not
 * permitted to mutate a protected entity type. Returns silently for
 * unprotected types and for user-authenticated callers.
 */
export function assertCanWriteProtected(params: AssertCanWriteProtectedParams): void {
  const { entity_type, op, identity, admission } = params;
  if (!isProtected(entity_type)) return;

  if (admission?.admitted) {
    const caps = admission.capabilities ?? [];
    if (capabilitiesCover(caps, op, entity_type)) return;
    throw new AgentCapabilityError({
      op,
      entityType: entity_type,
      agentLabel: admission.agent_label || agentLabelFor(identity),
      hint:
        `Protected entity_type "${entity_type}" requires an explicit ` +
        `capability on the admitted grant. Add ` +
        `{ op: "${op}", entity_types: ["${entity_type}"] } to the ` +
        "grant via Inspector → Agents → Grants, or have a " +
        "user-authenticated session perform the write.",
    });
  }

  // Not admitted. If there is any agent identity at all, the caller is
  // an unrecognised agent and must not touch governance state.
  if (identity && (identity.sub || identity.thumbprint || identity.clientName)) {
    throw new AgentCapabilityError({
      op,
      entityType: entity_type,
      agentLabel: agentLabelFor(identity),
      hint:
        `Protected entity_type "${entity_type}" can only be written by a ` +
        "user-authenticated session or by an admitted agent with the " +
        "matching grant capability. This request was not admitted; " +
        "create a grant in Inspector → Agents → Grants first.",
    });
  }

  // No agent identity → plain user-authenticated path. Allow.
}

/**
 * Convenience wrapper: enforces the guard for a batch of entity types.
 * No-ops the empty case so upper layers can call it unconditionally.
 */
export function assertCanWriteProtectedBatch(params: {
  entity_types: string[];
  op: AgentCapabilityOp;
  identity: AgentIdentity | null;
  admission: AAuthAdmissionContext | null;
}): void {
  const distinct = Array.from(new Set((params.entity_types || []).filter(Boolean)));
  for (const entity_type of distinct) {
    assertCanWriteProtected({
      entity_type,
      op: params.op,
      identity: params.identity,
      admission: params.admission,
    });
  }
}

function capabilitiesCover(
  caps: AgentCapabilityEntry[],
  op: AgentCapabilityOp,
  entity_type: string
): boolean {
  for (const cap of caps) {
    if (cap.op !== op) continue;
    if (cap.entity_types.includes("*")) return true;
    if (cap.entity_types.includes(entity_type)) return true;
  }
  return false;
}

function agentLabelFor(identity: AgentIdentity | null): string {
  if (!identity) return "anonymous";
  if (identity.sub) return identity.sub;
  if (identity.thumbprint) return `thumb:${identity.thumbprint.slice(0, 12)}`;
  if (identity.clientName) return identity.clientName;
  return "anonymous";
}
