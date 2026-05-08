import { randomBytes } from "node:crypto";

import { db } from "../../db.js";
import { createCorrection } from "../correction.js";
import { PEER_CONFIG_ENTITY_TYPE } from "./seed_peer_schema.js";
import {
  mergeProbeIntoRemoteHealth,
  probePeerRemoteHealth,
  readLocalNeotomaPackageVersion,
  type PeerRemoteHealth,
} from "./peer_health.js";

const MAX_PEERS = parseInt(process.env.NEOTOMA_MAX_PEERS ?? "10", 10) || 10;

export interface PeerConfigRecord {
  entity_id: string;
  peer_id: string;
  peer_name: string;
  peer_url: string;
  direction: string;
  entity_types: string[];
  sync_scope: string;
  auth_method: string;
  shared_secret?: string;
  peer_public_key_thumbprint?: string;
  /** Receiver user_id on the peer Neotoma instance (outbound sync webhook target_user_id). */
  sync_target_user_id?: string;
  conflict_strategy: string;
  active: boolean;
  last_sync_at?: string;
  consecutive_failures?: number;
}

function parsePeerSnapshot(entityId: string, snap: Record<string, unknown>): PeerConfigRecord | null {
  const peer_id = snap.peer_id;
  if (typeof peer_id !== "string" || !peer_id) return null;
  const toStrArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    entity_id: entityId,
    peer_id,
    peer_name: typeof snap.peer_name === "string" ? snap.peer_name : "",
    peer_url: typeof snap.peer_url === "string" ? snap.peer_url : "",
    direction: typeof snap.direction === "string" ? snap.direction : "bidirectional",
    entity_types: toStrArray(snap.entity_types),
    sync_scope: typeof snap.sync_scope === "string" ? snap.sync_scope : "all",
    auth_method: typeof snap.auth_method === "string" ? snap.auth_method : "shared_secret",
    shared_secret: typeof snap.shared_secret === "string" ? snap.shared_secret : undefined,
    peer_public_key_thumbprint:
      typeof snap.peer_public_key_thumbprint === "string"
        ? snap.peer_public_key_thumbprint
        : undefined,
    sync_target_user_id:
      typeof snap.sync_target_user_id === "string" ? snap.sync_target_user_id : undefined,
    conflict_strategy:
      typeof snap.conflict_strategy === "string" ? snap.conflict_strategy : "last_write_wins",
    active: Boolean(snap.active),
    last_sync_at: typeof snap.last_sync_at === "string" ? snap.last_sync_at : undefined,
    consecutive_failures:
      typeof snap.consecutive_failures === "number" ? snap.consecutive_failures : undefined,
  };
}

async function countPeersForUser(userId: string): Promise<number> {
  const { count, error } = await db
    .from("entities")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("entity_type", PEER_CONFIG_ENTITY_TYPE)
    .is("merged_to_entity_id", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listPeersForUser(userId: string): Promise<PeerConfigRecord[]> {
  const full = await listPeersWithSecrets(userId);
  return full.map(redactPeerForClient);
}

export function redactPeerForClient(p: PeerConfigRecord): PeerConfigRecord {
  const { shared_secret, ...rest } = p;
  void shared_secret;
  return rest;
}

/** Internal: includes shared_secret for webhook verification. */
export async function listPeersWithSecrets(userId: string): Promise<PeerConfigRecord[]> {
  const { data: ents, error } = await db
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .eq("entity_type", PEER_CONFIG_ENTITY_TYPE)
    .is("merged_to_entity_id", null);
  if (error) throw new Error(error.message);
  const out: PeerConfigRecord[] = [];
  for (const e of ents ?? []) {
    const entityId = (e as { id: string }).id;
    const { data: snapRow } = await db
      .from("entity_snapshots")
      .select("snapshot")
      .eq("entity_id", entityId)
      .maybeSingle();
    const snap = snapRow?.snapshot as Record<string, unknown> | undefined;
    if (!snap) continue;
    const rec = parsePeerSnapshot(entityId, snap);
    if (rec) out.push(rec);
  }
  return out;
}

export async function getPeerSecretForVerification(
  userId: string,
  senderPeerId: string,
): Promise<string | null> {
  const peers = await listPeersWithSecrets(userId);
  const hit = peers.find((p) => p.peer_id === senderPeerId && p.active);
  if (!hit?.shared_secret) return null;
  return hit.shared_secret;
}

export async function getPeerForAAuthVerification(
  userId: string,
  senderPeerId: string,
  thumbprint: string | undefined,
): Promise<PeerConfigRecord | null> {
  if (!thumbprint) return null;
  const peers = await listPeersWithSecrets(userId);
  const hit = peers.find((p) => p.peer_id === senderPeerId && p.active);
  if (!hit || hit.auth_method !== "aauth") return null;
  if (hit.peer_public_key_thumbprint && hit.peer_public_key_thumbprint !== thumbprint) {
    return null;
  }
  return hit;
}

export async function addPeerForUser(params: {
  userId: string;
  peer_id: string;
  peer_name: string;
  peer_url: string;
  direction: "push" | "pull" | "bidirectional";
  entity_types: string[];
  sync_scope: "all" | "tagged";
  auth_method: "aauth" | "shared_secret";
  conflict_strategy: "last_write_wins" | "source_priority" | "manual";
  shared_secret?: string;
  peer_public_key_thumbprint?: string;
  sync_target_user_id?: string;
}): Promise<{ entity_id: string; shared_secret?: string }> {
  const n = await countPeersForUser(params.userId);
  if (n >= MAX_PEERS) {
    throw new Error(`Maximum peers (${MAX_PEERS}) reached for this user`);
  }

  const shared_secret =
    params.auth_method === "shared_secret"
      ? (params.shared_secret?.trim() || randomBytes(32).toString("hex"))
      : undefined;

  const { storeStructuredForApi } = await import("../../actions.js");
  const idem = `peer-config:${params.userId}:${params.peer_id}:v1`;
  const result = await storeStructuredForApi({
    userId: params.userId,
    entities: [
      {
        entity_type: PEER_CONFIG_ENTITY_TYPE,
        peer_id: params.peer_id,
        peer_name: params.peer_name,
        peer_url: params.peer_url.replace(/\/$/, ""),
        direction: params.direction,
        entity_types: params.entity_types,
        sync_scope: params.sync_scope,
        auth_method: params.auth_method,
        ...(shared_secret ? { shared_secret } : {}),
        ...(params.peer_public_key_thumbprint?.trim()
          ? { peer_public_key_thumbprint: params.peer_public_key_thumbprint.trim() }
          : {}),
        ...(params.sync_target_user_id?.trim()
          ? { sync_target_user_id: params.sync_target_user_id.trim() }
          : {}),
        conflict_strategy: params.conflict_strategy,
        active: true,
        consecutive_failures: 0,
      },
    ],
    sourcePriority: 100,
    observationSource: "workflow_state",
    idempotencyKey: idem,
  });
  const entity_id = result.entities?.[0]?.entity_id;
  if (!entity_id) throw new Error("peer_config store did not return entity_id");
  return { entity_id, shared_secret };
}

export async function removePeerForUser(params: {
  userId: string;
  peer_id: string;
}): Promise<void> {
  const full = await listPeersWithSecrets(params.userId);
  const hit = full.find((p) => p.peer_id === params.peer_id);
  if (!hit) throw new Error("peer not found");
  await createCorrection({
    entity_id: hit.entity_id,
    entity_type: PEER_CONFIG_ENTITY_TYPE,
    field: "active",
    value: false,
    schema_version: "1.0",
    user_id: params.userId,
    idempotency_key: `peer-deact:${hit.entity_id}:active:false`,
  });
}

export interface PeerStatusPayload {
  peer: PeerConfigRecord;
  local_api_version: string;
  remote_health: PeerRemoteHealth;
}

export async function getPeerStatusForUser(params: {
  userId: string;
  peer_id: string;
}): Promise<PeerStatusPayload | null> {
  const peers = await listPeersForUser(params.userId);
  const peer = peers.find((p) => p.peer_id === params.peer_id);
  if (!peer) return null;
  const local_api_version = readLocalNeotomaPackageVersion();
  const probe = await probePeerRemoteHealth(peer.peer_url);
  const remote_health = mergeProbeIntoRemoteHealth(local_api_version, probe);
  return { peer, local_api_version, remote_health };
}
