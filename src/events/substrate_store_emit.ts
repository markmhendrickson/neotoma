import { getCurrentAgentIdentity } from "../services/request_context.js";
import { substrateEventBus } from "./substrate_event_bus.js";
import type { SubstrateEvent } from "./types.js";

export function shallowFieldsChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changed.push(k);
    }
  }
  return changed.sort();
}

function thumbprint(): string | undefined {
  return getCurrentAgentIdentity()?.thumbprint ?? undefined;
}

export function emitObservationCreated(params: {
  user_id: string;
  entity_id: string;
  entity_type: string;
  observation_id: string;
  timestamp: string;
  source_id?: string;
  idempotency_key?: string;
  observation_source?: string;
  source_peer_id?: string;
}): void {
  const base: Omit<SubstrateEvent, "event_id"> = {
    event_type: "observation.created",
    timestamp: params.timestamp,
    user_id: params.user_id,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    observation_id: params.observation_id,
    action: "created",
    source_id: params.source_id,
    idempotency_key: params.idempotency_key,
    agent_thumbprint: thumbprint(),
    observation_source: params.observation_source,
    source_peer_id: params.source_peer_id,
  };
  substrateEventBus.emitSubstrateEvent(base);
}

export function emitEntitySnapshotChange(params: {
  user_id: string;
  entity_id: string;
  entity_type: string;
  event_type: "entity.created" | "entity.updated";
  timestamp: string;
  observation_id?: string;
  fields_changed?: string[];
  source_id?: string;
  idempotency_key?: string;
  observation_source?: string;
  source_peer_id?: string;
}): void {
  substrateEventBus.emitSubstrateEvent({
    event_type: params.event_type,
    timestamp: params.timestamp,
    user_id: params.user_id,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    observation_id: params.observation_id,
    action: params.event_type === "entity.created" ? "created" : "updated",
    fields_changed: params.fields_changed,
    source_id: params.source_id,
    idempotency_key: params.idempotency_key,
    agent_thumbprint: thumbprint(),
    observation_source: params.observation_source,
    source_peer_id: params.source_peer_id,
  });
}

export function emitRelationshipLifecycle(params: {
  user_id: string;
  relationship_key: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  event_type: "relationship.created" | "relationship.deleted" | "relationship.restored";
  timestamp: string;
  observation_id?: string;
  source_id?: string;
  idempotency_key?: string;
  source_peer_id?: string;
}): void {
  const action =
    params.event_type === "relationship.created"
      ? "created"
      : params.event_type === "relationship.deleted"
        ? "deleted"
        : "restored";
  substrateEventBus.emitSubstrateEvent({
    event_type: params.event_type,
    timestamp: params.timestamp,
    user_id: params.user_id,
    entity_id: params.relationship_key,
    entity_type: "__relationship__",
    relationship_type: params.relationship_type,
    source_entity_id: params.source_entity_id,
    target_entity_id: params.target_entity_id,
    observation_id: params.observation_id,
    action,
    source_id: params.source_id,
    idempotency_key: params.idempotency_key,
    agent_thumbprint: thumbprint(),
    source_peer_id: params.source_peer_id,
  });
}

export function emitEntityLifecycle(params: {
  user_id: string;
  entity_id: string;
  entity_type: string;
  event_type:
    | "entity.deleted"
    | "entity.restored"
    | "entity.merged"
    | "entity.split";
  timestamp: string;
  observation_id?: string;
  source_id?: string;
  idempotency_key?: string;
  source_peer_id?: string;
}): void {
  const action: SubstrateEvent["action"] =
    params.event_type === "entity.deleted"
      ? "deleted"
      : params.event_type === "entity.restored"
        ? "restored"
        : params.event_type === "entity.merged"
          ? "merged"
          : "split";
  substrateEventBus.emitSubstrateEvent({
    event_type: params.event_type,
    timestamp: params.timestamp,
    user_id: params.user_id,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    observation_id: params.observation_id,
    action,
    source_id: params.source_id,
    idempotency_key: params.idempotency_key,
    agent_thumbprint: thumbprint(),
    source_peer_id: params.source_peer_id,
  });
}
