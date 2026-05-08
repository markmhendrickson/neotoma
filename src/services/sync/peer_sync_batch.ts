import { db } from "../../db.js";

export interface PeerSyncObservationRow {
  id: string;
  entity_id: string;
  entity_type: string;
  observed_at: string;
  observation_source: string | null;
}

export interface PeerSyncSnapshotRow extends PeerSyncObservationRow {
  snapshot: Record<string, unknown>;
}

function hasTaggedPeer(snapshot: Record<string, unknown>, peerId: string): boolean {
  const syncPeers = snapshot.sync_peers;
  return Array.isArray(syncPeers) && syncPeers.includes(peerId);
}

/**
 * Observations to consider for outbound peer sync: scoped by entity types,
 * optionally since last_sync_at, excluding rows already produced by sync replay.
 */
export async function listObservationsForPeerSyncOutbound(params: {
  userId: string;
  entityTypes: string[];
  observedAfterIso: string | null;
  limit: number;
  syncScope?: "all" | "tagged";
  peerId?: string;
}): Promise<PeerSyncObservationRow[]> {
  if (params.entityTypes.length === 0) return [];
  let q = db
    .from("observations")
    .select("id, entity_id, entity_type, observed_at, observation_source")
    .eq("user_id", params.userId)
    .in("entity_type", params.entityTypes)
    .order("observed_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(params.limit);

  if (params.observedAfterIso) {
    q = q.gt("observed_at", params.observedAfterIso);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PeerSyncObservationRow[];
  const localRows = rows.filter((r) => r.observation_source !== "sync");
  if (params.syncScope !== "tagged") return localRows;
  if (!params.peerId) return [];

  const entityIds = [...new Set(localRows.map((r) => r.entity_id))];
  if (entityIds.length === 0) return [];
  const { data: snaps, error: snapError } = await db
    .from("entity_snapshots")
    .select("entity_id, snapshot")
    .in("entity_id", entityIds);
  if (snapError) throw new Error(snapError.message);

  const snapRows = (snaps ?? []) as Array<{
    entity_id: string;
    snapshot?: Record<string, unknown>;
  }>;
  const tagged = new Set(
    snapRows
      .filter((row) => hasTaggedPeer(row.snapshot ?? {}, params.peerId!))
      .map((row) => row.entity_id),
  );
  return localRows.filter((r) => tagged.has(r.entity_id));
}

export async function listEntitySnapshotsForPeerSyncOutbound(params: {
  userId: string;
  entityTypes: string[];
  observedAfterIso: string | null;
  limit: number;
  syncScope?: "all" | "tagged";
  peerId?: string;
}): Promise<PeerSyncSnapshotRow[]> {
  const observations = await listObservationsForPeerSyncOutbound(params);
  const entityIds = [...new Set(observations.map((r) => r.entity_id))];
  if (entityIds.length === 0) return [];

  const { data: snaps, error } = await db
    .from("entity_snapshots")
    .select("entity_id, snapshot")
    .in("entity_id", entityIds);
  if (error) throw new Error(error.message);

  const snapshotByEntity = new Map<string, Record<string, unknown>>();
  for (const row of snaps ?? []) {
    const typed = row as { entity_id: string; snapshot?: Record<string, unknown> };
    if (typed.snapshot && typeof typed.snapshot === "object") {
      snapshotByEntity.set(typed.entity_id, typed.snapshot);
    }
  }

  return observations
    .map((row) => {
      const snapshot = snapshotByEntity.get(row.entity_id);
      return snapshot ? { ...row, snapshot } : null;
    })
    .filter((row): row is PeerSyncSnapshotRow => row !== null);
}
