import { randomBytes, randomUUID } from "node:crypto";

import { logger } from "../../utils/logger.js";
import { SUBSCRIPTION_ENTITY_TYPE } from "./seed_schema.js";
import {
  countActiveSubscriptionsForUser,
  rebuildSubscriptionIndex,
  refreshSubscriptionInIndex,
  getSubscriptionsForUser,
} from "./subscription_index.js";
import type { SubscriptionRecord } from "./subscription_types.js";
import { parseSubscriptionSnapshot } from "./subscription_types.js";
import { isWebhookUrlAllowed } from "./webhook_delivery.js";
import { createCorrection } from "../correction.js";
import { db } from "../../db.js";

const MAX_SUBSCRIPTIONS_PER_USER =
  parseInt(process.env.NEOTOMA_MAX_SUBSCRIPTIONS_PER_USER ?? "50", 10) || 50;

export interface SubscribeInput {
  entity_types?: string[];
  entity_ids?: string[];
  event_types?: string[];
  delivery_method: "webhook" | "sse";
  webhook_url?: string;
  webhook_secret?: string;
  max_failures?: number;
  /** Omit webhook deliveries for events stamped with this `source_peer_id`. */
  sync_peer_id?: string;
}

export async function subscribeUser(params: {
  userId: string;
  input: SubscribeInput;
}): Promise<{ subscription_id: string; entity_id: string; webhook_secret?: string }> {
  const { userId, input } = params;
  const hasFilter =
    (input.entity_types?.length ?? 0) > 0 ||
    (input.entity_ids?.length ?? 0) > 0 ||
    (input.event_types?.length ?? 0) > 0;
  if (!hasFilter) {
    throw new Error(
      "At least one filter is required: entity_types, entity_ids, or event_types (no firehose subscriptions)."
    );
  }
  if (input.delivery_method === "webhook") {
    if (!input.webhook_url) {
      throw new Error("webhook_url is required for webhook delivery_method");
    }
    if (!isWebhookUrlAllowed(input.webhook_url)) {
      throw new Error(
        "webhook_url must be HTTPS in production, or http://localhost / 127.0.0.1 for dev"
      );
    }
  }

  const activeCount = await countActiveSubscriptionsForUser(userId);
  if (activeCount >= MAX_SUBSCRIPTIONS_PER_USER) {
    throw new Error(
      `Maximum active subscriptions per user (${MAX_SUBSCRIPTIONS_PER_USER}) reached`
    );
  }

  const subscription_id = randomUUID();
  const webhook_secret =
    input.delivery_method === "webhook"
      ? (input.webhook_secret ?? randomBytes(32).toString("hex"))
      : undefined;

  const created_at = new Date().toISOString();
  const { storeStructuredForApi } = await import("../../actions.js");
  const result = await storeStructuredForApi({
    userId,
    entities: [
      {
        entity_type: SUBSCRIPTION_ENTITY_TYPE,
        subscription_id,
        watch_entity_types: input.entity_types ?? [],
        watch_entity_ids: input.entity_ids ?? [],
        watch_event_types: input.event_types ?? [],
        delivery_method: input.delivery_method,
        webhook_url: input.webhook_url,
        webhook_secret,
        active: true,
        created_at,
        consecutive_failures: 0,
        max_failures: input.max_failures ?? 10,
        ...(input.sync_peer_id ? { sync_peer_id: input.sync_peer_id } : {}),
      },
    ],
    sourcePriority: 100,
    idempotencyKey: `subscription-create:${subscription_id}`,
  });

  const entity_id = result.entities?.[0]?.entity_id;
  if (!entity_id) {
    throw new Error("subscription store did not return entity_id");
  }
  await rebuildSubscriptionIndex();
  logger.info("[subscriptions] created", { subscription_id, entity_id, userId });
  return { subscription_id, entity_id, webhook_secret };
}

export async function unsubscribeUser(params: {
  userId: string;
  subscription_id: string;
}): Promise<void> {
  const row = await findSubscriptionRow(params.userId, params.subscription_id);
  if (!row) throw new Error("subscription not found");
  await createCorrection({
    entity_id: row.entity_id,
    entity_type: SUBSCRIPTION_ENTITY_TYPE,
    field: "active",
    value: false,
    schema_version: "1.0",
    user_id: params.userId,
    idempotency_key: `subscription-deact:${row.entity_id}:active:false`,
  });
  await refreshSubscriptionInIndex(row.entity_id);
}

/** Omit signing secret from API/MCP surfaces (returned only once on subscribe). */
export function redactSubscriptionForClient(
  sub: SubscriptionRecord
): Omit<SubscriptionRecord, "webhook_secret"> {
  const { webhook_secret, ...rest } = sub;
  void webhook_secret;
  return rest;
}

export async function listSubscriptionsForUser(userId: string): Promise<SubscriptionRecord[]> {
  await rebuildSubscriptionIndex();
  return getSubscriptionsForUser(userId);
}

export async function getSubscriptionStatus(params: {
  userId: string;
  subscription_id: string;
}): Promise<SubscriptionRecord | null> {
  const row = await findSubscriptionRow(params.userId, params.subscription_id);
  if (!row) return null;
  const { data: snap } = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", row.entity_id)
    .maybeSingle();
  if (!snap?.snapshot) return null;
  return parseSubscriptionSnapshot(
    row.entity_id,
    params.userId,
    snap.snapshot as Record<string, unknown>
  );
}

async function findSubscriptionRow(
  userId: string,
  subscription_id: string
): Promise<{ entity_id: string } | null> {
  const { data: snaps } = await db
    .from("entity_snapshots")
    .select("entity_id, snapshot")
    .eq("entity_type", SUBSCRIPTION_ENTITY_TYPE);
  for (const s of snaps ?? []) {
    const sid = (s as { snapshot: Record<string, unknown> }).snapshot?.subscription_id;
    if (sid !== subscription_id) continue;
    const entityId = (s as { entity_id: string }).entity_id;
    const { data: ent } = await db
      .from("entities")
      .select("user_id")
      .eq("id", entityId)
      .maybeSingle();
    if (ent?.user_id === userId) {
      return { entity_id: entityId };
    }
  }
  return null;
}
