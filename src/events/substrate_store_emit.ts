import { getCurrentAgentIdentity } from "../services/request_context.js";
import { substrateEventBus } from "./substrate_event_bus.js";
import type { SubstrateEvent } from "./types.js";

export function shallowFieldsChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>
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

/**
 * Emit the post-write events for one stored observation: `observation.created`
 * followed by exactly one of `entity.created` (the observation created the
 * entity) or `entity.updated`.
 *
 * Subscribers treat `entity.created` as "a new entity appeared", so it must not
 * depend on the snapshot recompute succeeding. When `snapshot_after` is null
 * (recompute threw or produced nothing) a new entity still gets
 * `entity.created` (its payload never carried snapshot data), and an existing
 * entity gets `entity.updated` with `fields_changed` omitted, which means
 * "changed, fields unknown".
 */
export function emitStoreWriteEvents(params: {
  user_id: string;
  entity_id: string;
  entity_type: string;
  observation_id: string;
  timestamp: string;
  is_new_entity: boolean;
  prior_snapshot: Record<string, unknown>;
  snapshot_after: Record<string, unknown> | null;
  source_id?: string;
  idempotency_key?: string;
  observation_source?: string;
  source_peer_id?: string;
}): void {
  emitObservationCreated({
    user_id: params.user_id,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    observation_id: params.observation_id,
    timestamp: params.timestamp,
    source_id: params.source_id,
    idempotency_key: params.idempotency_key,
    observation_source: params.observation_source,
    source_peer_id: params.source_peer_id,
  });
  emitEntitySnapshotChange({
    user_id: params.user_id,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    event_type: params.is_new_entity ? "entity.created" : "entity.updated",
    timestamp: params.timestamp,
    observation_id: params.observation_id,
    fields_changed:
      params.is_new_entity || !params.snapshot_after
        ? undefined
        : shallowFieldsChanged(params.prior_snapshot, params.snapshot_after),
    source_id: params.source_id,
    idempotency_key: params.idempotency_key,
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
  event_type: "entity.deleted" | "entity.restored" | "entity.merged" | "entity.split";
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
