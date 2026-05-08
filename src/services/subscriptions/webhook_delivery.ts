import { createHash, createHmac, randomUUID } from "node:crypto";

import { logger } from "../../utils/logger.js";
import type { SubstrateEvent } from "../../events/types.js";
import { createCorrection } from "../correction.js";
import type { SubscriptionRecord } from "./subscription_types.js";
import { SUBSCRIPTION_ENTITY_TYPE } from "./seed_schema.js";

const WEBHOOK_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 300_000];
const DELIVERY_TIMESTAMPS = new Map<string, number[]>();

function isProductionEnv(): boolean {
  return process.env.NEOTOMA_ENV === "production" || process.env.NODE_ENV === "production";
}

export function isWebhookUrlAllowed(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol === "https:") return true;
    if (!isProductionEnv() && u.protocol === "http:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function underRateLimit(subscriptionId: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const arr = DELIVERY_TIMESTAMPS.get(subscriptionId) ?? [];
  const pruned = arr.filter((t) => now - t < windowMs);
  if (pruned.length >= maxPerMinute) {
    return false;
  }
  pruned.push(now);
  DELIVERY_TIMESTAMPS.set(subscriptionId, pruned);
  return true;
}

export function stableStringify(obj: unknown): string {
  if (obj === undefined) {
    return "null";
  }
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((x) => stableStringify(x)).join(",")}]`;
  }
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",")}}`;
}

export function signWebhookBody(secret: string, body: string): string {
  const mac = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${mac}`;
}

async function postWebhookOnce(
  url: string,
  secret: string,
  event: SubstrateEvent,
  subscriptionId: string,
): Promise<{ ok: boolean; status?: number }> {
  const delivery_id = randomUUID();
  const payload = {
    subscription_id: subscriptionId,
    delivery_id,
    event,
  };
  const body = stableStringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Neotoma-Signature-256": signWebhookBody(secret, body),
        "X-Neotoma-Delivery": delivery_id,
        "X-Neotoma-Event": event.event_type,
      },
      body,
      signal: controller.signal,
    });
    const ok = res.ok && res.status < 500;
    return { ok, status: res.status };
  } catch (err) {
    logger.warn("[subscriptions] webhook POST failed", {
      subscription_id: subscriptionId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function bumpFailures(
  sub: SubscriptionRecord,
  nextCount: number,
): Promise<void> {
  await createCorrection({
    entity_id: sub.entity_id,
    entity_type: SUBSCRIPTION_ENTITY_TYPE,
    field: "consecutive_failures",
    value: nextCount,
    schema_version: "1.0",
    user_id: sub.user_id,
    idempotency_key: createHash("sha256")
      .update(`sub-fail:${sub.entity_id}:consecutive_failures:${nextCount}`)
      .digest("hex"),
  });
}

async function markSuccess(sub: SubscriptionRecord): Promise<void> {
  const ts = new Date().toISOString();
  await createCorrection({
    entity_id: sub.entity_id,
    entity_type: SUBSCRIPTION_ENTITY_TYPE,
    field: "consecutive_failures",
    value: 0,
    schema_version: "1.0",
    user_id: sub.user_id,
    idempotency_key: createHash("sha256")
      .update(`sub-ok-fail:${sub.entity_id}:0`)
      .digest("hex"),
  });
  await createCorrection({
    entity_id: sub.entity_id,
    entity_type: SUBSCRIPTION_ENTITY_TYPE,
    field: "last_delivered_at",
    value: ts,
    schema_version: "1.0",
    user_id: sub.user_id,
    idempotency_key: createHash("sha256")
      .update(`sub-ok-at:${sub.entity_id}:last_delivered_at:${ts}`)
      .digest("hex"),
  });
}

async function deactivateSubscription(sub: SubscriptionRecord, reason: string): Promise<void> {
  await createCorrection({
    entity_id: sub.entity_id,
    entity_type: SUBSCRIPTION_ENTITY_TYPE,
    field: "active",
    value: false,
    schema_version: "1.0",
    user_id: sub.user_id,
    idempotency_key: createHash("sha256")
      .update(`sub-deact:${sub.entity_id}:active:false:${reason}`)
      .digest("hex"),
  });
  logger.warn("[subscriptions] subscription auto-deactivated", {
    subscription_id: sub.subscription_id,
    reason,
  });
  const { refreshSubscriptionInIndex } = await import("./subscription_index.js");
  await refreshSubscriptionInIndex(sub.entity_id);
}

export function queueWebhookDelivery(sub: SubscriptionRecord, event: SubstrateEvent): void {
  if (sub.delivery_method !== "webhook" || !sub.webhook_url || !sub.webhook_secret) return;
  if (!underRateLimit(sub.subscription_id, 60)) {
    logger.warn("[subscriptions] webhook rate limited", { subscription_id: sub.subscription_id });
    return;
  }
  setImmediate(() => {
    void deliverWebhookWithRetries(sub, event);
  });
}

async function deliverWebhookWithRetries(sub: SubscriptionRecord, event: SubstrateEvent): Promise<void> {
  let failures = sub.consecutive_failures ?? 0;
  const maxFailures = sub.max_failures ?? 10;
  const { refreshSubscriptionInIndex } = await import("./subscription_index.js");

  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i - 1]!));
    }
    const result = await postWebhookOnce(sub.webhook_url!, sub.webhook_secret!, event, sub.subscription_id);
    if (result.ok) {
      await markSuccess(sub);
      await refreshSubscriptionInIndex(sub.entity_id);
      return;
    }
    failures += 1;
    await bumpFailures(sub, failures);
    await refreshSubscriptionInIndex(sub.entity_id);
    if (failures >= maxFailures) {
      await deactivateSubscription(sub, "max_failures_exceeded");
      return;
    }
  }
}
