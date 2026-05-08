import { signWebhookBody, stableStringify } from "../subscriptions/webhook_delivery.js";
import { createCorrection } from "../correction.js";
import type { SubstrateEvent } from "../../events/types.js";
import { logger } from "../../utils/logger.js";
import { db } from "../../db.js";
import { SUBSCRIPTION_ENTITY_TYPE } from "../subscriptions/seed_schema.js";
import type { SubscriptionRecord } from "../subscriptions/subscription_types.js";
import { listPeersWithSecrets, type PeerConfigRecord } from "./peer_ops.js";
import type { SyncWebhookPayload } from "./sync_webhook_inbound.js";
import type { SyncEntitiesPayload } from "./sync_webhook_inbound.js";

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 300_000];
const DELIVERY_TIMESTAMPS = new Map<string, number[]>();

export function getNeotomaPublicBaseUrl(): string | null {
  const u = process.env.NEOTOMA_PUBLIC_BASE_URL?.trim();
  if (!u) return null;
  return u.replace(/\/$/, "");
}

export function getLocalPeerIdForOutboundSync(): string | null {
  const id = process.env.NEOTOMA_LOCAL_PEER_ID?.trim();
  return id || null;
}

export async function postOutboundSyncWebhook(params: {
  peerUrlBase: string;
  sharedSecret?: string;
  authMethod?: "aauth" | "shared_secret";
  payload: SyncWebhookPayload;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const rawBody = stableStringify(params.payload);
  const url = `${params.peerUrlBase.replace(/\/$/, "")}/sync/webhook`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if ((params.authMethod ?? "shared_secret") === "shared_secret") {
    if (!params.sharedSecret) {
      return { ok: false, error: "missing_shared_secret" };
    }
    headers["X-Neotoma-Sync-Signature-256"] = signWebhookBody(params.sharedSecret, rawBody);
  }
  try {
    const request = {
      method: "POST",
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    };
    const res =
      params.authMethod === "aauth"
        ? await postWithCliAAuth(url, request)
        : await fetch(url, request);
    if (!res.ok) {
      return { ok: false, status: res.status, error: `http_${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

export async function postOutboundSyncEntitiesRequest(params: {
  peerUrlBase: string;
  sharedSecret?: string;
  authMethod?: "aauth" | "shared_secret";
  payload: SyncEntitiesPayload;
}): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  rows?: Array<{
    entity_id: string;
    entity_type: string;
    observed_at: string;
    source_observation_id: string;
    snapshot: Record<string, unknown>;
  }>;
}> {
  const rawBody = stableStringify(params.payload);
  const url = `${params.peerUrlBase.replace(/\/$/, "")}/sync/entities`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if ((params.authMethod ?? "shared_secret") === "shared_secret") {
    if (!params.sharedSecret) return { ok: false, error: "missing_shared_secret" };
    headers["X-Neotoma-Sync-Signature-256"] = signWebhookBody(params.sharedSecret, rawBody);
  }

  try {
    const request = {
      method: "POST",
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(15_000),
    };
    const res =
      params.authMethod === "aauth"
        ? await postWithCliAAuth(url, request)
        : await fetch(url, request);
    if (!res.ok) return { ok: false, status: res.status, error: `http_${res.status}` };
    const body = (await res.json()) as { rows?: unknown };
    const rows = Array.isArray(body.rows)
      ? (body.rows.filter((row) => row != null && typeof row === "object") as Array<{
          entity_id: string;
          entity_type: string;
          observed_at: string;
          source_observation_id: string;
          snapshot: Record<string, unknown>;
        }>)
      : [];
    return { ok: true, status: res.status, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

async function postWithCliAAuth(
  url: string,
  request: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
): Promise<Response> {
  const { cliSignedFetch } = await import("../../cli/aauth_signer.js");
  return await cliSignedFetch(url, request);
}

async function entityTaggedForPeer(entityId: string, peerId: string): Promise<boolean> {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const snapshot = (data?.snapshot ?? {}) as Record<string, unknown>;
  const syncPeers = snapshot.sync_peers;
  return Array.isArray(syncPeers) && syncPeers.includes(peerId);
}

async function shouldDeliverEventToPeer(
  peer: PeerConfigRecord,
  event: SubstrateEvent,
): Promise<boolean> {
  if (!peer.active) return false;
  if (peer.direction === "pull") return false;
  if (!peer.entity_types.includes(event.entity_type)) return false;
  if (peer.sync_scope === "tagged") {
    return await entityTaggedForPeer(event.entity_id, peer.peer_id);
  }
  return true;
}

function underRateLimit(subscriptionId: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const arr = DELIVERY_TIMESTAMPS.get(subscriptionId) ?? [];
  const pruned = arr.filter((t) => now - t < windowMs);
  if (pruned.length >= maxPerMinute) return false;
  pruned.push(now);
  DELIVERY_TIMESTAMPS.set(subscriptionId, pruned);
  return true;
}

async function bumpFailures(sub: SubscriptionRecord, nextCount: number): Promise<void> {
  await createCorrection({
    entity_id: sub.entity_id,
    entity_type: SUBSCRIPTION_ENTITY_TYPE,
    field: "consecutive_failures",
    value: nextCount,
    schema_version: "1.0",
    user_id: sub.user_id,
    idempotency_key: `peer-sub-fail:${sub.entity_id}:${nextCount}`,
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
    idempotency_key: `peer-sub-ok-fail:${sub.entity_id}:0`,
  });
  await createCorrection({
    entity_id: sub.entity_id,
    entity_type: SUBSCRIPTION_ENTITY_TYPE,
    field: "last_delivered_at",
    value: ts,
    schema_version: "1.0",
    user_id: sub.user_id,
    idempotency_key: `peer-sub-ok-at:${sub.entity_id}:${ts}`,
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
    idempotency_key: `peer-sub-deact:${sub.entity_id}:${reason}`,
  });
  const { refreshSubscriptionInIndex } = await import("../subscriptions/subscription_index.js");
  await refreshSubscriptionInIndex(sub.entity_id);
}

export function queuePeerSyncDelivery(sub: SubscriptionRecord, event: SubstrateEvent): void {
  if (!sub.sync_peer_id || sub.delivery_method !== "webhook") return;
  if (!underRateLimit(sub.subscription_id, 60)) {
    logger.warn("[sync] peer webhook rate limited", {
      subscription_id: sub.subscription_id,
      peer_id: sub.sync_peer_id,
    });
    return;
  }
  setImmediate(() => {
    void deliverPeerSyncWithRetries(sub, event);
  });
}

async function deliverPeerSyncWithRetries(
  sub: SubscriptionRecord,
  event: SubstrateEvent,
): Promise<void> {
  const senderUrl = getNeotomaPublicBaseUrl();
  const senderPeerId = getLocalPeerIdForOutboundSync();
  if (!senderUrl || !senderPeerId) {
    logger.warn("[sync] outbound peer sync missing local identity env", {
      subscription_id: sub.subscription_id,
    });
    return;
  }

  const peer = (await listPeersWithSecrets(sub.user_id)).find(
    (p) => p.peer_id === sub.sync_peer_id,
  );
  if (!peer || !(await shouldDeliverEventToPeer(peer, event))) return;
  if (!peer.sync_target_user_id?.trim()) {
    logger.warn("[sync] peer missing sync_target_user_id", { peer_id: peer.peer_id });
    return;
  }

  let failures = sub.consecutive_failures ?? 0;
  const maxFailures = sub.max_failures ?? 10;
  const { refreshSubscriptionInIndex } = await import("../subscriptions/subscription_index.js");

  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[i - 1]!));
    }
    const result = await postOutboundSyncWebhook({
      peerUrlBase: peer.peer_url,
      sharedSecret: peer.shared_secret,
      authMethod: peer.auth_method === "aauth" ? "aauth" : "shared_secret",
      payload: {
        sender_peer_id: senderPeerId,
        sender_peer_url: senderUrl,
        target_user_id: peer.sync_target_user_id.trim(),
        entity_id: event.entity_id,
        source_observation_id: event.observation_id ?? event.event_id,
      },
    });
    if (result.ok) {
      await markSuccess(sub);
      await refreshSubscriptionInIndex(sub.entity_id);
      return;
    }
    failures += 1;
    await bumpFailures(sub, failures);
    await refreshSubscriptionInIndex(sub.entity_id);
    if (failures >= maxFailures) {
      await deactivateSubscription(sub, "peer_sync_max_failures_exceeded");
      return;
    }
  }
}
