/**
 * Bounded outbound peer sync: POST signed /sync/webhook for recent observations.
 * Also performs a bounded pull from the peer's /sync/entities endpoint for
 * bilateral catch-up.
 */

import { createCorrection } from "../correction.js";
import { listPeersWithSecrets } from "./peer_ops.js";
import { PEER_CONFIG_ENTITY_TYPE } from "./seed_peer_schema.js";
import { listObservationsForPeerSyncOutbound } from "./peer_sync_batch.js";
import {
  getLocalPeerIdForOutboundSync,
  getNeotomaPublicBaseUrl,
  postOutboundSyncEntitiesRequest,
  postOutboundSyncWebhook,
} from "./sync_webhook_outbound.js";

const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;

export async function syncPeerFull(params: {
  userId: string;
  peer_id: string;
  limit?: number;
}): Promise<{
  ok: boolean;
  message: string;
  batches: number;
  succeeded?: number;
  failed?: number;
  pulled?: number;
}> {
  const peers = await listPeersWithSecrets(params.userId);
  const peer = peers.find((p) => p.peer_id === params.peer_id);
  if (!peer) {
    return { ok: false, message: "peer not found", batches: 0 };
  }
  if (!peer.active) {
    return { ok: false, message: "peer is inactive", batches: 0 };
  }
  if (peer.auth_method === "shared_secret" && !peer.shared_secret) {
    return {
      ok: false,
      message: "outbound sync requires shared_secret when auth_method is shared_secret",
      batches: 0,
    };
  }
  if (!peer.sync_target_user_id?.trim()) {
    return {
      ok: false,
      message:
        "sync_target_user_id must be set on peer_config (receiver user_id) for outbound /sync/webhook",
      batches: 0,
    };
  }

  const senderUrl = getNeotomaPublicBaseUrl();
  const senderPeerId = getLocalPeerIdForOutboundSync();
  if (!senderUrl || !senderPeerId) {
    return {
      ok: false,
      message:
        "Set NEOTOMA_PUBLIC_BASE_URL (this instance base URL) and NEOTOMA_LOCAL_PEER_ID (stable id peers expect as sender_peer_id) for outbound sync",
      batches: 0,
    };
  }

  const limit = Math.min(Math.max(params.limit ?? DEFAULT_BATCH, 1), MAX_BATCH);
  const rows =
    peer.direction === "pull"
      ? []
      : await listObservationsForPeerSyncOutbound({
          userId: params.userId,
          entityTypes: peer.entity_types,
          observedAfterIso: peer.last_sync_at ?? null,
          limit,
          syncScope: peer.sync_scope === "tagged" ? "tagged" : "all",
          peerId: peer.peer_id,
        });

  if (rows.length === 0 && peer.direction === "push") {
    return {
      ok: true,
      message: "No observations to sync in this window (check entity_types and last_sync_at).",
      batches: 0,
      succeeded: 0,
      failed: 0,
    };
  }

  let succeeded = 0;
  let failed = 0;
  let watermark: string | null = null;

  for (const row of rows) {
    const out = await postOutboundSyncWebhook({
      peerUrlBase: peer.peer_url,
      sharedSecret: peer.shared_secret,
      authMethod: peer.auth_method === "aauth" ? "aauth" : "shared_secret",
      payload: {
        sender_peer_id: senderPeerId,
        sender_peer_url: senderUrl,
        target_user_id: peer.sync_target_user_id.trim(),
        entity_id: row.entity_id,
        source_observation_id: row.id,
      },
    });
    if (out.ok) {
      succeeded++;
      if (!watermark || row.observed_at > watermark) {
        watermark = row.observed_at;
      }
    } else {
      failed++;
    }
  }

  let pulled = 0;
  if (peer.direction !== "push") {
    const pull = await postOutboundSyncEntitiesRequest({
      peerUrlBase: peer.peer_url,
      sharedSecret: peer.shared_secret,
      authMethod: peer.auth_method === "aauth" ? "aauth" : "shared_secret",
      payload: {
        sender_peer_id: senderPeerId,
        target_user_id: peer.sync_target_user_id.trim(),
        entity_types: peer.entity_types,
        observed_after: peer.last_sync_at ?? undefined,
        limit,
      },
    });
    if (pull.ok) {
      const { storeStructuredForApi } = await import("../../actions.js");
      for (const row of pull.rows ?? []) {
        const fields = { ...row.snapshot };
        delete (fields as Record<string, unknown>).entity_id;
        await storeStructuredForApi({
          userId: params.userId,
          entities: [{ entity_type: row.entity_type, ...fields }],
          sourcePriority: 40,
          observationSource: "sync",
          sourcePeerId: peer.peer_id,
          idempotencyKey: `sync:${peer.peer_id}:${row.source_observation_id}:${row.entity_id}`,
        });
        pulled++;
        if (!watermark || row.observed_at > watermark) {
          watermark = row.observed_at;
        }
      }
    } else if (peer.direction === "pull") {
      failed++;
    }
  }

  let nextCf = peer.consecutive_failures ?? 0;
  if (succeeded > 0) {
    nextCf = 0;
  } else if (failed > 0) {
    nextCf += 1;
  }

  const tailId = rows[rows.length - 1]?.id ?? `pull:${watermark ?? peer.peer_id}`;
  await createCorrection({
    entity_id: peer.entity_id,
    entity_type: PEER_CONFIG_ENTITY_TYPE,
    field: "consecutive_failures",
    value: nextCf,
    schema_version: "1.0",
    user_id: params.userId,
    idempotency_key: `peer-sync-cf:${peer.entity_id}:${nextCf}:${tailId}`,
  });

  if (watermark) {
    await createCorrection({
      entity_id: peer.entity_id,
      entity_type: PEER_CONFIG_ENTITY_TYPE,
      field: "last_sync_at",
      value: watermark,
      schema_version: "1.0",
      user_id: params.userId,
      idempotency_key: `peer-sync-lsa:${peer.entity_id}:${watermark}:${tailId}`,
    });
  }

  const ok = failed === 0;
  return {
    ok,
    message: ok
      ? `Posted ${succeeded} sync webhook(s) to peer; pulled ${pulled} remote row(s).`
      : `Partial sync: ${succeeded} succeeded, ${failed} failed, ${pulled} pulled; consecutive_failures=${nextCf}.`,
    batches: rows.length,
    succeeded,
    failed,
    pulled,
  };
}
