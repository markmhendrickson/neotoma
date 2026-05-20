import { post } from "../client";

export interface SubscribeRequest {
  entity_types?: string[];
  entity_ids?: string[];
  event_types?: string[];
  delivery_method: "webhook" | "sse";
  webhook_url?: string;
  webhook_secret?: string;
  max_failures?: number;
  sync_peer_id?: string;
}

export interface SubscribeResponse {
  subscription_id: string;
  entity_id: string;
  webhook_secret?: string;
}

export function subscribe(body: SubscribeRequest) {
  return post<SubscribeResponse>("/subscribe", body);
}

export function unsubscribe(subscription_id: string) {
  return post<{ success: boolean }>("/unsubscribe", { subscription_id });
}

export interface SubscriptionStatusRow {
  subscription_id?: string;
  entity_id?: string;
  delivery_method?: string;
  active?: boolean;
  watch_entity_types?: string[];
  watch_entity_ids?: string[];
  watch_event_types?: string[];
  webhook_url?: string;
  sync_peer_id?: string;
  consecutive_failures?: number;
  last_delivered_at?: string;
  max_failures?: number;
  created_at?: string;
  [key: string]: unknown;
}

export function getSubscriptionStatus(subscription_id: string) {
  return post<{ subscription?: SubscriptionStatusRow } & Record<string, unknown>>(
    "/get_subscription_status",
    { subscription_id },
  );
}

export function listSubscriptions() {
  return post<{ subscriptions: SubscriptionStatusRow[] }>("/list_subscriptions", {});
}
