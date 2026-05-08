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
}
