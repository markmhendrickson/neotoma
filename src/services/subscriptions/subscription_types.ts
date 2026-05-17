import type { SubstrateEvent, SubstrateEventType } from "../../events/types.js";

export type SubscriptionDeliveryMethod = "webhook" | "sse";

/** Parsed subscription row from `entity_snapshots.snapshot` + entity ownership. */
export interface SubscriptionRecord {
  entity_id: string;
  user_id: string;
  subscription_id: string;
  watch_entity_types?: string[];
  watch_entity_ids?: string[];
  watch_event_types?: SubstrateEventType[];
  delivery_method: SubscriptionDeliveryMethod;
  webhook_url?: string;
  webhook_secret?: string;
  /** Skip deliveries when `event.source_peer_id` equals this value (peer loop prevention). */
  sync_peer_id?: string;
  active: boolean;
  created_at?: string;
  last_delivered_at?: string;
  consecutive_failures: number;
  max_failures: number;
}

export function parseSubscriptionSnapshot(
  entityId: string,
  userId: string,
  snapshot: Record<string, unknown>
): SubscriptionRecord | null {
  const subscription_id = snapshot.subscription_id;
  if (typeof subscription_id !== "string" || !subscription_id) return null;
  const delivery_method = snapshot.delivery_method;
  if (delivery_method !== "webhook" && delivery_method !== "sse") return null;
  const active = Boolean(snapshot.active);
  const toStrArray = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
  return {
    entity_id: entityId,
    user_id: userId,
    subscription_id,
    watch_entity_types: toStrArray(snapshot.watch_entity_types),
    watch_entity_ids: toStrArray(snapshot.watch_entity_ids),
    watch_event_types: toStrArray(snapshot.watch_event_types) as SubstrateEventType[] | undefined,
    delivery_method,
    webhook_url: typeof snapshot.webhook_url === "string" ? snapshot.webhook_url : undefined,
    webhook_secret:
      typeof snapshot.webhook_secret === "string" ? snapshot.webhook_secret : undefined,
    sync_peer_id: typeof snapshot.sync_peer_id === "string" ? snapshot.sync_peer_id : undefined,
    active,
    created_at: typeof snapshot.created_at === "string" ? snapshot.created_at : undefined,
    last_delivered_at:
      typeof snapshot.last_delivered_at === "string" ? snapshot.last_delivered_at : undefined,
    consecutive_failures:
      typeof snapshot.consecutive_failures === "number" ? snapshot.consecutive_failures : 0,
    max_failures: typeof snapshot.max_failures === "number" ? snapshot.max_failures : 10,
  };
}

export function subscriptionMatchesEvent(sub: SubscriptionRecord, event: SubstrateEvent): boolean {
  if (!sub.active) return false;
  if (sub.user_id !== event.user_id) return false;
  const hasTypes = Boolean(sub.watch_entity_types?.length);
  const hasIds = Boolean(sub.watch_entity_ids?.length);
  const hasEvts = Boolean(sub.watch_event_types?.length);
  if (!hasTypes && !hasIds && !hasEvts) return false;
  if (hasTypes && !sub.watch_entity_types!.includes(event.entity_type)) return false;
  if (hasIds && !sub.watch_entity_ids!.includes(event.entity_id)) return false;
  if (hasEvts && !sub.watch_event_types!.includes(event.event_type)) return false;
  if (sub.sync_peer_id && event.source_peer_id && sub.sync_peer_id === event.source_peer_id) {
    return false;
  }
  return true;
}
