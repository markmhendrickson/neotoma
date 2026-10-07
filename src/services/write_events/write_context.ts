/**
 * Server-side write context for substrate events (write events; turn keys #2440, reads #2261).
 *
 * Every write the substrate makes already emits a {@link SubstrateEvent}, and
 * every emitted event is persisted to the durable `substrate_events` log. This
 * module adds what that record lacked to answer "what did this session write":
 * the write operation in activity-view vocabulary, the actor as identifiers,
 * and the conversation turn the client said caused the write. All three are
 * read from the request-scoped AsyncLocalStorage context at emit time — the
 * same seam observation provenance uses — so nothing is client-reported after
 * the fact except the turn identity the client sent with the request itself.
 *
 * The context is persisted, never delivered: {@link toDeliverableSubstrateEvent}
 * removes it before an event reaches SSE, the ring, a webhook, a sync peer, or
 * a durable-resume reader.
 */

import type {
  SubstrateEvent,
  SubstrateEventType,
  WriteEventActor,
  WriteEventContext,
  WriteOperation,
} from "../../events/types.js";
import { getCurrentAttribution, getCurrentTurnIdentity } from "../request_context.js";

const OPERATION_BY_EVENT_TYPE: Record<SubstrateEventType, WriteOperation> = {
  "entity.created": "created",
  "entity.updated": "updated",
  "entity.deleted": "deleted",
  "entity.restored": "restored",
  "entity.merged": "merged",
  "entity.split": "split",
  "relationship.created": "relationship_created",
  "relationship.deleted": "relationship_deleted",
  "relationship.restored": "relationship_restored",
  "observation.created": "stored",
};

/** Map an event type to its default write operation. */
export function writeOperationForEventType(eventType: SubstrateEventType): WriteOperation {
  return OPERATION_BY_EVENT_TYPE[eventType];
}

/** Actor identifiers for the active request; empty outside a request. */
export function currentWriteEventActor(): WriteEventActor {
  const attribution = getCurrentAttribution();
  const actor: WriteEventActor = {};
  if (attribution.attribution_tier) actor.attribution_tier = attribution.attribution_tier;
  if (attribution.agent_sub) actor.agent_sub = attribution.agent_sub;
  if (attribution.agent_thumbprint) actor.agent_thumbprint = attribution.agent_thumbprint;
  if (attribution.client_name) actor.client_name = attribution.client_name;
  if (attribution.client_version) actor.client_version = attribution.client_version;
  if (attribution.connection_id) actor.connection_id = attribution.connection_id;
  if (attribution.authenticated_actor_id) {
    actor.authenticated_actor_id = attribution.authenticated_actor_id;
  }
  return actor;
}

/**
 * Build the write context for an event about to be emitted. `operation`
 * overrides the event-type default (the correction path passes `corrected`).
 */
export function buildWriteContext(
  eventType: SubstrateEventType,
  operation?: WriteOperation
): WriteEventContext {
  const context: WriteEventContext = {
    operation: operation ?? writeOperationForEventType(eventType),
    actor: currentWriteEventActor(),
  };
  const turn = getCurrentTurnIdentity();
  if (turn) {
    if (turn.conversation_id) context.conversation_id = turn.conversation_id;
    if (turn.turn_key) context.turn_key = turn.turn_key;
    context.turn_source = turn.source;
  }
  return context;
}

/**
 * The event as a subscriber may see it: identical, minus `write_context`.
 * Apply at every outbound boundary. Returns the same object when there is
 * nothing to strip.
 */
export function toDeliverableSubstrateEvent(event: SubstrateEvent): SubstrateEvent {
  if (event.write_context === undefined) return event;
  const { write_context: _omitted, ...deliverable } = event;
  return deliverable;
}
