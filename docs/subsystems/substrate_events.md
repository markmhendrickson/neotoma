# Substrate Events

In-process bus for post-write substrate events. Acts as the "nervous system" between the immutable storage layer (`src/services/observation_storage.ts`, `src/services/relationships.ts`, `src/services/deletion.ts`, `src/services/entity_merge.ts`, `src/services/entity_split.ts`) and downstream fan-out (subscription delivery, peer sync, observability).

## Scope

This document covers:

- The `SubstrateEvent` shape and the closed set of `SubstrateEventType` values.
- The singleton `substrateEventBus` (`src/events/substrate_event_bus.ts`) and its delivery contract.
- Convenience emitters in `src/events/substrate_store_emit.ts` (observation / entity / relationship / lifecycle).
- Determinism of `event_id`.
- Loop-prevention metadata for cross-instance peer sync (`source_peer_id`).

It does NOT cover:

- Subscription matching or webhook / SSE delivery (see [`subscriptions.md`](subscriptions.md)).
- Cross-instance replication semantics (see [`peer_sync.md`](peer_sync.md)).
- Reducer / snapshot computation (see [`reducer.md`](reducer.md), [`entity_snapshots.md`](entity_snapshots.md)).

## Purpose

Neotoma's State Layer is fundamentally a write-then-react substrate. Every committed observation, every relationship lifecycle change, and every entity merge / split / delete must be observable to local in-process consumers without polling SQLite. The substrate event bus is the bounded surface that exposes these write-path moments to subscribers while preserving the State Layer invariants:

- Listeners run synchronously in the writer's process; they MUST NOT throw into the write path. Errors are swallowed and logged (see [`docs/observability/logging.md`](../observability/logging.md)).
- Events are derived from already-committed observations — never speculative.
- Event identifiers are deterministic SHA-256 hashes of the event payload, so identical write paths emit identical event IDs across replicas.

## Invariants

1. **Single channel.** All substrate events flow through one `EventEmitter` channel (`substrate_event`). New consumers register via `substrateEventBus.onSubstrateEvent(listener)`.
2. **Deterministic event IDs.** `event_id` is `sha256(event_type | user_id | entity_id | entity_type | observation_id | relationship_type | source_entity_id | target_entity_id | action | source_id | idempotency_key | agent_thumbprint | observation_source | source_peer_id | fields_changed | timestamp)` truncated to 40 hex chars. Replays produce identical IDs.
3. **No write-path failure propagation.** Listener exceptions are caught in the bus and logged; they do not roll back the writer's transaction.
4. **Closed event-type set.** `SubstrateEventType` is enumerated in `src/events/types.ts`. Adding a new type requires a coordinated change in the matcher (`subscription_types.ts`), the seed schema (`subscriptions/seed_schema.ts`), and downstream consumers.
5. **Loop-prevention metadata.** Replicated observations carry `source_peer_id` so subscriptions and outbound peer-sync hooks can skip events that originated from the destination peer.

## Event types

Defined in `src/events/types.ts`:

- `entity.created` — first observation that produces a snapshot for `entity_id`.
- `entity.updated` — subsequent observation that mutates one or more snapshot fields.
- `entity.deleted` — soft-delete observation.
- `entity.restored` — restoration observation.
- `entity.merged` — merge observation rewriting source entity into target.
- `entity.split` — split observation re-pointing observations to a new entity.
- `relationship.created`, `relationship.deleted`, `relationship.restored` — typed-edge lifecycle.
- `observation.created` — every committed observation, regardless of whether it changed the snapshot. Used by audit subscribers.

`SubstrateEntityAction` collapses these into the action verbs `created | updated | deleted | restored | merged | split` for consumers that prefer the verb form.

## Event shape

```ts
interface SubstrateEvent {
  event_id: string;             // deterministic 40-char hash
  event_type: SubstrateEventType;
  timestamp: string;            // ISO; copied from the originating observation
  user_id: string;
  entity_id: string;            // for relationships, this is the relationship_key
  entity_type: string;          // "__relationship__" for relationship events
  observation_id?: string;
  relationship_type?: string;
  source_entity_id?: string;    // relationship-only
  target_entity_id?: string;    // relationship-only
  fields_changed?: string[];    // sorted; populated for entity.updated
  action: SubstrateEntityAction;
  source_id?: string;
  idempotency_key?: string;
  agent_thumbprint?: string;    // resolved via getCurrentAgentIdentity()
  observation_source?: string;  // sensor | llm_summary | workflow_state | human | import | sync
  source_peer_id?: string;      // set when the observation was replayed from a peer
}
```

`fields_changed` is computed by `shallowFieldsChanged(before, after)` in `src/events/substrate_store_emit.ts` so all entity-update events carry a sorted, JSON-stable diff.

## Emit helpers

`src/events/substrate_store_emit.ts` exports the canonical emitters that storage services call after a successful commit:

- `emitObservationCreated({ user_id, entity_id, entity_type, observation_id, timestamp, source_id?, idempotency_key?, observation_source?, source_peer_id? })`.
- `emitEntitySnapshotChange({ user_id, entity_id, entity_type, event_type: "entity.created" | "entity.updated", timestamp, observation_id?, fields_changed?, source_id?, idempotency_key?, observation_source?, source_peer_id? })`.
- `emitRelationshipLifecycle({ user_id, relationship_key, relationship_type, source_entity_id, target_entity_id, event_type, timestamp, observation_id?, source_id?, idempotency_key?, source_peer_id? })`.
- `emitEntityLifecycle({ user_id, entity_id, entity_type, event_type, timestamp, observation_id?, source_id?, idempotency_key?, source_peer_id? })` for `entity.deleted | restored | merged | split`.

Storage callers MUST pass through `observation_source` and `source_peer_id` from the originating observation so downstream loop prevention works.

## Listeners

Current consumers:

- `handleSubstrateEventForSubscriptions` (`src/services/subscriptions/subscription_bridge.ts`) — pushes the event into the SSE ring buffer, broadcasts to matching SSE clients, and queues webhook or peer-sync deliveries. See [`subscriptions.md`](subscriptions.md).
- Peer-sync outbound queue (`src/services/sync/sync_webhook_outbound.ts`) is invoked transitively from the subscription bridge when `sync_peer_id` is set on a subscription.

`install_subscription_bridge.ts` registers the subscription bridge listener once at server startup; tests register their own listeners on the same singleton bus.

## Debugging

Set `NEOTOMA_DEBUG_SUBSTRATE_EVENTS=1` to log each event at `debug` level (`event_id`, `event_type`, `entity_id`, `entity_type`, `action`). The default level is `info` and the bus is silent unless this flag is enabled.

## Testing

- Unit tests: `tests/unit/substrate_event_bus.test.ts` exercises the deterministic-ID contract and listener-exception swallowing.
- Integration: subscription, sync, and ingestion tests exercise the bus indirectly by asserting downstream side-effects.

## Related

- [`subscriptions.md`](subscriptions.md) — fan-out to webhook / SSE delivery.
- [`peer_sync.md`](peer_sync.md) — replication semantics that consume `source_peer_id`.
- [`observation_architecture.md`](observation_architecture.md) — the upstream commit boundary that triggers emit calls.
- [`reducer.md`](reducer.md) — how `fields_changed` relates to snapshot diffs.
