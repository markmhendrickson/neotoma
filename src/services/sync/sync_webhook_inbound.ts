import { createHash, timingSafeEqual } from "node:crypto";

import {
  guardedFetch,
  isHostedMode,
  isPrivateOrLoopbackHostname,
} from "../net/private_host_guard.js";
import { signWebhookBody } from "../subscriptions/webhook_delivery.js";
import { logger } from "../../utils/logger.js";
import {
  getPeerForAAuthVerification,
  getPeerSecretForVerification,
  listPeersWithSecrets,
  type PeerConfigRecord,
} from "./peer_ops.js";
import { listEntitySnapshotsForPeerSyncOutbound } from "./peer_sync_batch.js";
import { admitRemoteSnapshotType, remoteSnapshotStoreEntity } from "./remote_snapshot_admission.js";

export interface SyncWebhookPayload {
  sender_peer_id: string;
  sender_peer_url: string;
  target_user_id: string;
  entity_id: string;
  source_observation_id: string;
  guest_access_token?: string;
}

export interface SyncEntitiesPayload {
  sender_peer_id: string;
  target_user_id: string;
  entity_types: string[];
  observed_after?: string;
  limit?: number;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function normalizeUrlBase(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function validateSenderPeerUrl(senderPeerUrl: string, peer: PeerConfigRecord): string {
  let senderBase: string;
  let configuredBase: string;
  try {
    senderBase = normalizeUrlBase(senderPeerUrl);
    configuredBase = normalizeUrlBase(peer.peer_url);
  } catch {
    throw new Error("SENDER_PEER_URL_INVALID");
  }

  if (senderBase !== configuredBase) {
    throw new Error("SENDER_PEER_URL_MISMATCH");
  }

  if (isHostedMode()) {
    const hostname = new URL(senderBase).hostname;
    if (isPrivateOrLoopbackHostname(hostname)) {
      throw new Error("SENDER_PEER_URL_PRIVATE_HOST");
    }
  }

  return senderBase;
}

async function verifyInboundPeer(params: {
  payload: { sender_peer_id: string; target_user_id: string };
  rawBody: string;
  signatureHeader: string | undefined;
  verifiedAauthThumbprint?: string;
}): Promise<PeerConfigRecord> {
  const { payload, rawBody, signatureHeader, verifiedAauthThumbprint } = params;
  if (signatureHeader) {
    const secret = await getPeerSecretForVerification(
      payload.target_user_id,
      payload.sender_peer_id
    );
    if (!secret) {
      throw new Error("PEER_UNKNOWN_OR_INACTIVE");
    }
    const expected = signWebhookBody(secret, rawBody);
    if (!timingSafeEqualString(signatureHeader.trim(), expected)) {
      throw new Error("SIGNATURE_INVALID");
    }
    const peers = await listPeersWithSecrets(payload.target_user_id);
    const peer = peers.find((p) => p.peer_id === payload.sender_peer_id && p.active);
    if (!peer) throw new Error("PEER_UNKNOWN_OR_INACTIVE");
    return peer;
  }

  const peer = await getPeerForAAuthVerification(
    payload.target_user_id,
    payload.sender_peer_id,
    verifiedAauthThumbprint
  );
  if (!peer) throw new Error("SIGNATURE_INVALID");
  return peer;
}

export async function applyInboundSyncWebhook(params: {
  rawBody: string;
  signatureHeader: string | undefined;
  verifiedAauthThumbprint?: string;
}): Promise<{ status: string; entity_id?: string }> {
  const { rawBody, signatureHeader, verifiedAauthThumbprint } = params;
  let payload: SyncWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as SyncWebhookPayload;
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (
    typeof payload.sender_peer_id !== "string" ||
    typeof payload.sender_peer_url !== "string" ||
    typeof payload.target_user_id !== "string" ||
    typeof payload.entity_id !== "string" ||
    typeof payload.source_observation_id !== "string"
  ) {
    throw new Error("VALIDATION_ERROR:missing required sync fields");
  }

  const peer = await verifyInboundPeer({
    payload,
    rawBody,
    signatureHeader,
    verifiedAauthThumbprint,
  });

  const base = validateSenderPeerUrl(payload.sender_peer_url, peer);
  const tokenQ = payload.guest_access_token
    ? `?access_token=${encodeURIComponent(payload.guest_access_token)}`
    : "";
  const url = `${base}/entities/${encodeURIComponent(payload.entity_id)}${tokenQ}`;

  // guardedFetch checks every redirect hop against the same host policy as the
  // first request (hosted mode refuses private hosts); plain fetch would follow
  // a peer's redirect unchecked. The error text names the redirect target the
  // peer chose, so it is not relayed.
  let res: Response;
  try {
    res = await guardedFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("REMOTE_FETCH_FAILED:refused");
  }
  if (!res.ok) {
    throw new Error(`REMOTE_FETCH_FAILED:${res.status}`);
  }
  const remote = (await res.json()) as {
    entity_type?: string;
    snapshot?: Record<string, unknown>;
  };
  if (!remote.entity_type || !remote.snapshot || typeof remote.snapshot !== "object") {
    throw new Error("REMOTE_ENTITY_SHAPE_INVALID");
  }

  // The peer names the entity_type of the snapshot it serves. Accept only a type
  // configured for this peer, never a protected one, and a governance type only
  // when this peer's accept_governance_entity_types names it (remote_snapshot_admission).
  const typeRefusal = await admitRemoteSnapshotType(remote.entity_type, {
    userId: payload.target_user_id,
    peerEntityTypes: peer.entity_types,
    acceptGovernanceEntityTypes: peer.accept_governance_entity_types,
  });
  if (typeRefusal) {
    // Visible to this instance's operator, who is the one who can admit the
    // type. Only the reason and the local list entry are logged, never the
    // peer's entity_type string.
    logger.warn("[sync] refused an inbound peer snapshot by entity type", {
      peer_id: peer.peer_id,
      reason: typeRefusal.reason,
      matched_type: typeRefusal.entity_type,
    });
    throw new Error(`REMOTE_ENTITY_TYPE_REFUSED:${typeRefusal.reason}`);
  }

  const { storeStructuredForApi } = await import("../../actions.js");
  const idempotencyKey = createHash("sha256")
    .update(`sync:${payload.sender_peer_id}:${payload.source_observation_id}:${payload.entity_id}`)
    .digest("hex");

  await storeStructuredForApi({
    userId: payload.target_user_id,
    entities: [remoteSnapshotStoreEntity(remote.entity_type, remote.snapshot)],
    sourcePriority: 40,
    observationSource: "sync",
    sourcePeerId: payload.sender_peer_id,
    idempotencyKey,
  });

  return { status: "applied", entity_id: payload.entity_id };
}

export async function applyInboundSyncEntitiesRequest(params: {
  rawBody: string;
  signatureHeader: string | undefined;
  verifiedAauthThumbprint?: string;
}): Promise<{
  rows: Array<{
    entity_id: string;
    entity_type: string;
    observed_at: string;
    source_observation_id: string;
    snapshot: Record<string, unknown>;
  }>;
}> {
  const { rawBody, signatureHeader, verifiedAauthThumbprint } = params;
  let payload: SyncEntitiesPayload;
  try {
    payload = JSON.parse(rawBody) as SyncEntitiesPayload;
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (
    typeof payload.sender_peer_id !== "string" ||
    typeof payload.target_user_id !== "string" ||
    !Array.isArray(payload.entity_types)
  ) {
    throw new Error("VALIDATION_ERROR:missing required sync entity fields");
  }
  const peer = await verifyInboundPeer({
    payload,
    rawBody,
    signatureHeader,
    verifiedAauthThumbprint,
  });
  const allowedTypes = new Set(peer.entity_types);
  const requestedTypes = payload.entity_types.filter((type) => allowedTypes.has(type));
  const limit = Math.min(Math.max(payload.limit ?? 200, 1), 500);
  const rows = await listEntitySnapshotsForPeerSyncOutbound({
    userId: payload.target_user_id,
    entityTypes: requestedTypes,
    observedAfterIso: payload.observed_after ?? peer.last_sync_at ?? null,
    limit,
    syncScope: peer.sync_scope === "tagged" ? "tagged" : "all",
    peerId: peer.peer_id,
  });
  return {
    rows: rows.map((row) => ({
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      observed_at: row.observed_at,
      source_observation_id: row.id,
      snapshot: row.snapshot,
    })),
  };
}
