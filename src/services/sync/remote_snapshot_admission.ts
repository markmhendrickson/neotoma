/**
 * Admission for an entity snapshot fetched from a remote peer, run before the
 * snapshot is ingested locally.
 *
 * Every peer-ingest path (`resolve_sync_conflict` prefer_remote, inbound
 * `POST /sync/webhook`, and the pull leg of `syncPeerFull`) receives a response
 * that names its own `entity_type`. Without a check, the peer and not the local
 * caller decides what kind of entity is written. The rules, in order:
 *
 *   1. A protected entity type (from the list in `protected_entity_types.ts`,
 *      e.g. `agent_grant`) is never accepted from a peer, for any caller and
 *      under any peer configuration. Ingest runs as the receiving user, whom
 *      the protected-type guard lets write these types, so this rule is the
 *      one that keeps them local.
 *   2. A peer-governance type ({@link PEER_GOVERNANCE_ENTITY_TYPES}) is refused
 *      by default. These types grant access, change policy, schedule outbound
 *      calls, steer agents, or alter sync. A CONFIGURED peer may be allowed to
 *      supply specific ones by naming them in its own `peer_config`
 *      `accept_governance_entity_types`; an unknown peer URL never can. The
 *      peer's own configuration (`peer_config`) is never admissible, so a peer
 *      can never write the allow list that admits it.
 *   3. Where the peer has a `peer_config` and the path is a sync path, the type
 *      must also be one of that peer's `entity_types`.
 *
 * Each rule is applied to every type store could persist the given type as
 * (normalized spelling, singular form, equivalence collapse), not only the
 * type as given. {@link remoteSnapshotStoreEntity} then builds the store
 * payload so the admitted type is the type store receives: the snapshot's own
 * fields can neither re-name the type nor point the write at another entity.
 *
 * The caller's own store admission (grant capabilities, guest access policy)
 * still runs inside `storeStructuredForApi`; {@link isStoreAdmissionRefusal}
 * lets a peer-ingest path report that refusal as a result rather than a crash.
 */

import { AccessPolicyError } from "../access_policy.js";
import { AgentCapabilityError } from "../agent_capabilities.js";
import { SUBMISSION_CONFIG_ENTITY_TYPE } from "../entity_submission/types.js";
import { ISSUE_ENTITY_TYPE } from "../issues/seed_schema.js";
import { suggestSingular } from "../entity_type_guard.js";
import { isProtected } from "../protected_entity_types.js";
import { normalizeEntityTypeForSchema } from "../schema_registry.js";
import { SKILL_ENTITY_TYPE } from "../skills/seed_schema.js";
import { SUBSCRIPTION_ENTITY_TYPE } from "../subscriptions/seed_schema.js";
import { PEER_CONFIG_ENTITY_TYPE } from "./seed_peer_schema.js";

/**
 * `error_code` of the 403 a receiving instance answers on `POST /sync/webhook`
 * when it does not admit the snapshot's entity type. Senders match on it to
 * tell a configuration refusal from a delivery failure, so both sides use this
 * one constant.
 */
export const SYNC_ENTITY_TYPE_REFUSED_ERROR_CODE = "SYNC_ENTITY_TYPE_REFUSED";

/**
 * Entity types a remote peer may not supply by default. The single source for
 * every peer-ingest path; each entry is read by the server to make a decision
 * about access, policy, outbound calls, agent behaviour, or sync:
 *
 * - `peer_config`: the peer registry itself (url, shared secret, synced types,
 *   and `accept_governance_entity_types`). Never admissible from a peer.
 * - `subscription`: schedules outbound webhook deliveries (`webhook_url`).
 * - `submission_config`: sets the guest access policy for submissions and
 *   `external_mirrors` (outbound GitHub / Linear / webhook mirrors).
 * - `instance_policy`: the instance-wide write policy enforced on every store.
 * - `conformance_policy`: the rules a rendered page must pass to publish.
 * - `guest_access_token`: grants guest read-back access to entity ids.
 * - `standing_rule`: persistent instructions injected into agent context.
 * - `skill`: agent workflows mirrored into harness skill directories.
 * - `issue`: issue records feed the instance's outbound issue publishing under
 *   the operator's identity. Instances that sync issues between peers opt each
 *   such peer in.
 *
 * Protected types (`protected_entity_types.ts`) are refused separately and
 * unconditionally; they are not repeated here.
 */
export const PEER_GOVERNANCE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  PEER_CONFIG_ENTITY_TYPE,
  SUBSCRIPTION_ENTITY_TYPE,
  SUBMISSION_CONFIG_ENTITY_TYPE,
  "instance_policy",
  "conformance_policy",
  "guest_access_token",
  "standing_rule",
  SKILL_ENTITY_TYPE,
  ISSUE_ENTITY_TYPE,
]);

/** Governance types no peer configuration can admit: the peer configuration itself. */
const NEVER_ADMISSIBLE_FROM_PEER: ReadonlySet<string> = new Set([PEER_CONFIG_ENTITY_TYPE]);

/** Sorted snapshot of {@link PEER_GOVERNANCE_ENTITY_TYPES}. */
export function getPeerGovernanceEntityTypes(): string[] {
  return Array.from(PEER_GOVERNANCE_ENTITY_TYPES).sort();
}

export type RemoteSnapshotTypeRefusalReason =
  | "invalid_entity_type"
  | "protected_entity_type"
  | "peer_configuration_entity_type"
  | "governance_entity_type"
  | "entity_type_not_synced";

export interface RemoteSnapshotTypeRefusal {
  reason: RemoteSnapshotTypeRefusalReason;
  /**
   * The local list entry the remote type matched (a protected or governance
   * type), or null when the refusal matched no list entry. Never the peer's own
   * string: see {@link remoteSnapshotTypeRefusal}.
   */
  entity_type: string | null;
  /** Fixed text plus at most a local list entry; never contains peer-chosen text. */
  message: string;
}

export interface RemoteSnapshotTypeOptions {
  /**
   * The configured peer's `entity_types`. Pass on sync paths, where the peer is
   * always a configured one; omit where no such restriction applies.
   */
  peerEntityTypes?: readonly string[];
  /**
   * The configured peer's `accept_governance_entity_types`. Leave undefined for
   * an unconfigured peer, which keeps every governance type refused.
   */
  acceptGovernanceEntityTypes?: readonly string[];
  /**
   * The registered type store's equivalence lookup maps `entityType` onto, when
   * there is one. Set by {@link admitRemoteSnapshotType}.
   */
  equivalentEntityType?: string | null;
}

/**
 * Every type a remote `entityType` can be persisted as: the type as given, the
 * normalized form store writes, the singular form store's equivalence collapse
 * maps a plural onto, and any equivalent type store's own lookup resolved,
 * which also covers declared schema aliases.
 */
function storeTypeForms(entityType: string, equivalentEntityType?: string | null): Set<string> {
  const forms = new Set<string>([entityType]);
  const normalized = normalizeEntityTypeForSchema(entityType);
  forms.add(normalized);
  for (const base of [entityType.trim().toLowerCase(), normalized]) {
    const singular = suggestSingular(base);
    if (singular) {
      forms.add(singular);
      forms.add(normalizeEntityTypeForSchema(singular));
    }
  }
  if (equivalentEntityType) {
    forms.add(equivalentEntityType);
    forms.add(normalizeEntityTypeForSchema(equivalentEntityType));
  }
  return forms;
}

/**
 * Returns a refusal when a peer's snapshot of `entityType` must not be ingested,
 * or `null` when it may proceed to the caller's store admission. Anything other
 * than a non-empty string is refused, so a malformed type fails closed.
 *
 * Synchronous: it covers every spelling store could persist the type as except
 * a schema alias. Peer-ingest paths call {@link admitRemoteSnapshotType}, which
 * adds store's own equivalence lookup.
 */
export function remoteSnapshotTypeRefusal(
  entityType: unknown,
  options: RemoteSnapshotTypeOptions = {}
): RemoteSnapshotTypeRefusal | null {
  // The peer chooses `entityType`, and a refusal message reaches the calling
  // agent's context, so no message below interpolates it. A refusal names at
  // most the local list entry the type matched, which is fixed server text.
  if (typeof entityType !== "string" || entityType.trim() === "") {
    return {
      reason: "invalid_entity_type",
      entity_type: null,
      message: "the remote snapshot's entity_type is not a non-empty string.",
    };
  }
  const forms = [...storeTypeForms(entityType, options.equivalentEntityType)];
  const hits = (set: ReadonlySet<string>): string[] => forms.filter((form) => set.has(form));

  const protectedHit = forms.find((form) => isProtected(form));
  if (protectedHit !== undefined) {
    return {
      reason: "protected_entity_type",
      entity_type: protectedHit,
      message:
        `the remote snapshot's entity_type matches the protected type ${protectedHit}; ` +
        "governance state is never accepted from a remote peer.",
    };
  }
  const [peerConfigHit] = hits(NEVER_ADMISSIBLE_FROM_PEER);
  if (peerConfigHit !== undefined) {
    return {
      reason: "peer_configuration_entity_type",
      entity_type: peerConfigHit,
      message:
        `the remote snapshot's entity_type matches ${peerConfigHit}, which is peer configuration; ` +
        "it is never accepted from a remote peer.",
    };
  }
  const governanceHits = hits(PEER_GOVERNANCE_ENTITY_TYPES);
  if (governanceHits.length > 0) {
    // Admitted only when a configured peer names this exact type. A spelling
    // variant that store would persist as a governance type is never admitted.
    const accepted =
      governanceHits.every((form) => form === entityType) &&
      options.acceptGovernanceEntityTypes?.includes(entityType) === true;
    if (!accepted) {
      return {
        reason: "governance_entity_type",
        entity_type: governanceHits[0],
        message:
          `the remote snapshot's entity_type matches the governance type ${governanceHits[0]}, ` +
          "refused from a remote peer unless that configured peer's " +
          "accept_governance_entity_types names it.",
      };
    }
  }
  if (options.peerEntityTypes && !options.peerEntityTypes.includes(entityType)) {
    return {
      reason: "entity_type_not_synced",
      entity_type: null,
      message:
        "the remote snapshot's entity_type is not one of the entity_types configured for this peer.",
    };
  }
  return null;
}

/**
 * The admission every peer-ingest path runs. Same rules as
 * {@link remoteSnapshotTypeRefusal}, plus the type store's equivalence collapse
 * would redirect the write to: when the given type has no active schema for
 * `userId`, store looks for an equivalent registered type (alias, case, or
 * singular form) and writes that type instead, so that type is checked too.
 */
export async function admitRemoteSnapshotType(
  entityType: unknown,
  options: RemoteSnapshotTypeOptions & { userId: string }
): Promise<RemoteSnapshotTypeRefusal | null> {
  const first = remoteSnapshotTypeRefusal(entityType, options);
  if (first || typeof entityType !== "string") return first;

  const { schemaRegistry } = await import("../schema_registry.js");
  if (await schemaRegistry.loadActiveSchema(entityType, options.userId)) return null;
  const { findEquivalentEntityType } = await import("../entity_type_equivalence.js");
  const match = await findEquivalentEntityType(entityType, { userId: options.userId });
  if (!match) return null;
  return remoteSnapshotTypeRefusal(entityType, {
    ...options,
    equivalentEntityType: match.canonical_entity_type,
  });
}

/**
 * Keys store reads as write directives rather than as data (`entity_type`,
 * `target_id`, `intent`); `entity_id` is the peer's own id. None is taken from
 * a peer's snapshot.
 */
const STORE_DIRECTIVE_KEYS: readonly string[] = ["entity_id", "entity_type", "target_id", "intent"];

/**
 * Keys beginning with an underscore are the instance's own markers on an
 * observation (`_deleted`, `_encrypted`, `_iv`, `_migration_run_id`, ...), read
 * by lifecycle, encryption and repair code rather than as data. A peer's
 * snapshot never supplies them; the whole prefix is reserved so a marker added
 * later is covered without a second list to keep in step.
 */
export function isReservedSnapshotKey(key: string): boolean {
  return key.startsWith("_");
}

/**
 * The store entity for an admitted remote snapshot: the snapshot's fields with
 * every store directive and every reserved underscore key removed, under the
 * admitted `entityType`. Every peer-ingest path builds its store payload here,
 * so the type {@link admitRemoteSnapshotType} checked is the type store
 * receives.
 */
export function remoteSnapshotStoreEntity(
  entityType: string,
  snapshot: Record<string, unknown>
): Record<string, unknown> & { entity_type: string } {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (STORE_DIRECTIVE_KEYS.includes(key) || isReservedSnapshotKey(key)) continue;
    fields[key] = value;
  }
  return { ...fields, entity_type: entityType };
}

/**
 * Message for a store-admission refusal on a peer-ingest path. The error's own
 * message names the entity type the peer chose, so it is not relayed; only the
 * kind of refusal is.
 */
export function storeAdmissionRefusalMessage(
  err: AgentCapabilityError | AccessPolicyError
): string {
  return err instanceof AgentCapabilityError
    ? "the caller's agent grant does not permit storing the entity_type the remote snapshot names."
    : "the access policy does not permit storing the entity_type the remote snapshot names.";
}

/** True when `err` is the caller's store admission refusing the write. */
export function isStoreAdmissionRefusal(
  err: unknown
): err is AgentCapabilityError | AccessPolicyError {
  return err instanceof AgentCapabilityError || err instanceof AccessPolicyError;
}
