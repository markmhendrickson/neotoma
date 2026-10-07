/**
 * In-process substrate events (write-path observability).
 * IDs are deterministic hashes — see substrate_event_bus.
 */

export type SubstrateEventType =
  | "entity.created"
  | "entity.updated"
  | "entity.deleted"
  | "entity.restored"
  | "entity.merged"
  | "entity.split"
  | "relationship.created"
  | "relationship.deleted"
  | "relationship.restored"
  | "observation.created";

export type SubstrateEntityAction =
  | "created"
  | "updated"
  | "deleted"
  | "restored"
  | "merged"
  | "split";

/**
 * The write operation a substrate event records, in the vocabulary an
 * activity view uses (write events; turn keys #2440, reads #2261). Derived from the event
 * type, except `corrected`, which the correction path sets explicitly because
 * a correction otherwise looks like any other `entity.updated`.
 */
export type WriteOperation =
  | "created"
  | "updated"
  | "stored"
  | "corrected"
  | "deleted"
  | "restored"
  | "merged"
  | "split"
  | "relationship_created"
  | "relationship_deleted"
  | "relationship_restored";

/**
 * Who caused a write, as identifiers only. Mirrors the attribution block
 * stamped into observation provenance (`AttributionProvenance`) minus the
 * agent public key and the external actor, which are not needed to answer
 * "which agent / client / member wrote this".
 */
export interface WriteEventActor {
  attribution_tier?: string;
  agent_sub?: string;
  agent_thumbprint?: string;
  client_name?: string;
  client_version?: string;
  connection_id?: string;
  /** The signed-in member's per-instance attribution id (#2240), when one stood behind the request. */
  authenticated_actor_id?: string;
}

/**
 * Server-side context of one write: the operation, who caused it, and the
 * conversation turn the client said it belonged to. Persisted with the event
 * in the durable log so writes are queryable by turn and actor.
 *
 * NEVER delivered to subscribers: `toDeliverableSubstrateEvent` strips it at
 * every outbound boundary (SSE, the in-memory ring, webhooks, peer sync, and
 * durable resume), so adding it does not widen what a subscriber, a guest
 * token, or a sync peer receives.
 */
export interface WriteEventContext {
  operation: WriteOperation;
  actor: WriteEventActor;
  conversation_id?: string;
  turn_key?: string;
  /** Carrier that supplied the turn identity, when one was supplied. */
  turn_source?: "header" | "mcp_meta";
}

export interface SubstrateEvent {
  event_id: string;
  event_type: SubstrateEventType;
  timestamp: string;
  user_id: string;
  entity_id: string;
  entity_type: string;
  observation_id?: string;
  relationship_type?: string;
  source_entity_id?: string;
  target_entity_id?: string;
  fields_changed?: string[];
  action: SubstrateEntityAction;
  source_id?: string;
  idempotency_key?: string;
  agent_thumbprint?: string;
  observation_source?: string;
  /** When set, observation was replayed from this Neotoma peer (cross-instance sync). */
  source_peer_id?: string;
  /**
   * Server-side write context (operation, actor, turn). Durable-log only —
   * see {@link WriteEventContext}. Not part of the event id hash.
   */
  write_context?: WriteEventContext;
}
