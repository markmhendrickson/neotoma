/**
 * Bounded outbound peer sync: POST signed /sync/webhook for recent observations.
 * Also performs a bounded pull from the peer's /sync/entities endpoint for
 * bilateral catch-up.
 */

import { createCorrection } from "../correction.js";
import { listPeersWithSecrets } from "./peer_ops.js";
import { PEER_CONFIG_ENTITY_TYPE } from "./seed_peer_schema.js";
import { logger } from "../../utils/logger.js";
import { listObservationsForPeerSyncOutbound } from "./peer_sync_batch.js";
import { admitRemoteSnapshotType, remoteSnapshotStoreEntity } from "./remote_snapshot_admission.js";
import {
  getLocalPeerIdForOutboundSync,
  getNeotomaPublicBaseUrl,
  PEER_REFUSED_ENTITY_TYPE,
  postOutboundSyncEntitiesRequest,
  postOutboundSyncWebhook,
} from "./sync_webhook_outbound.js";

const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;

/** Clock skew allowed on a pulled row's observed_at before it is ignored for the watermark. */
const PEER_WATERMARK_MAX_SKEW_MS = 5 * 60 * 1000;

/**
 * A pulled row's `observed_at` as a watermark candidate, or null. The peer
 * chooses this value, and the watermark is written to this peer's own
 * `peer_config.last_sync_at`, which bounds the next push and pull. So only a
 * timestamp that parses and is no later than now (plus skew) is used, and it is
 * returned in canonical ISO form rather than as the peer's text.
 */
export function peerWatermarkCandidate(observedAt: unknown, nowMs = Date.now()): string | null {
  if (typeof observedAt !== "string" || observedAt.length > 64) return null;
  const ms = Date.parse(observedAt);
  if (!Number.isFinite(ms) || ms > nowMs + PEER_WATERMARK_MAX_SKEW_MS) return null;
  return new Date(ms).toISOString();
}

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
  /** Pulled rows not ingested because the peer's entity_type was refused. */
  refused?: number;
  /** Pushed rows the receiving peer refused by entity type (not counted in failed). */
  refused_by_peer?: number;
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
  let refusedByPeer = 0;
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
    } else if (out.error === PEER_REFUSED_ENTITY_TYPE) {
      // The receiver does not admit this type from this instance: its
      // configuration, not a delivery failure. Not counted in `failed`, and the
      // watermark moves past it as on the pull leg, so a batch of refused rows
      // cannot hold back the rows behind it. After the receiving operator opts
      // in, a last_sync_at reset resends it (docs/subsystems/peer_sync.md).
      refusedByPeer++;
      if (!watermark || row.observed_at > watermark) {
        watermark = row.observed_at;
      }
    } else {
      failed++;
    }
  }

  let pulled = 0;
  let refused = 0;
  const refusedReasons: Record<string, number> = {};
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
        // The peer names each row's entity_type. Ingest only a type configured
        // for this peer, never a protected one, and a governance type only when
        // this peer's accept_governance_entity_types names it
        // (remote_snapshot_admission). A refused row still advances the
        // watermark: the refusal is permanent until the operator changes config.
        const rowWatermark = peerWatermarkCandidate(row.observed_at);
        const rowRefusal = await admitRemoteSnapshotType(row.entity_type, {
          userId: params.userId,
          peerEntityTypes: peer.entity_types,
          acceptGovernanceEntityTypes: peer.accept_governance_entity_types,
        });
        if (rowRefusal) {
          refused++;
          refusedReasons[rowRefusal.reason] = (refusedReasons[rowRefusal.reason] ?? 0) + 1;
          if (rowWatermark && (!watermark || rowWatermark > watermark)) {
            watermark = rowWatermark;
          }
          continue;
        }
        await storeStructuredForApi({
          userId: params.userId,
          entities: [remoteSnapshotStoreEntity(row.entity_type, row.snapshot ?? {})],
          sourcePriority: 40,
          observationSource: "sync",
          sourcePeerId: peer.peer_id,
          idempotencyKey: `sync:${peer.peer_id}:${row.source_observation_id}:${row.entity_id}`,
        });
        pulled++;
        if (rowWatermark && (!watermark || rowWatermark > watermark)) {
          watermark = rowWatermark;
        }
      }
    } else if (peer.direction === "pull") {
      failed++;
    }
  }

  if (refused > 0) {
    logger.warn("[sync] refused pulled peer rows by entity type", {
      peer_id: peer.peer_id,
      refused,
      reasons: refusedReasons,
    });
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
      // The previous value is part of the key: after an operator sets last_sync_at
      // back, a run that ends at the same watermark and tail must still write.
      idempotency_key: `peer-sync-lsa:${peer.entity_id}:${watermark}:${tailId}:${peer.last_sync_at ?? ""}`,
    });
  }

  const ok = failed === 0;
  const refusedNote = refused
    ? ` Refused ${refused} pulled row(s) whose entity_type is protected, governance not accepted from this peer, or not configured for this peer.`
    : "";
  const refusedByPeerNote = refusedByPeer
    ? ` The peer refused ${refusedByPeer} pushed row(s) by entity type; its operator must list the type in the entity_types of their peer_config for this instance, and also in accept_governance_entity_types for a governance type such as issue.`
    : "";
  return {
    ok,
    message:
      (ok
        ? `Posted ${succeeded} sync webhook(s) to peer; pulled ${pulled} remote row(s).`
        : `Partial sync: ${succeeded} succeeded, ${failed} failed, ${pulled} pulled; consecutive_failures=${nextCf}.`) +
      refusedNote +
      refusedByPeerNote,
    batches: rows.length,
    succeeded,
    failed,
    pulled,
    refused,
    refused_by_peer: refusedByPeer,
  };
}
