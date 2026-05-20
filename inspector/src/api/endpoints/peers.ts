import { del, get, post } from "../client";

export interface PeerConfigRow {
  entity_id: string;
  peer_id: string;
  peer_name: string;
  peer_url: string;
  direction: string;
  entity_types: string[];
  sync_scope: string;
  auth_method: string;
  conflict_strategy: string;
  active: boolean;
  last_sync_at?: string;
  consecutive_failures?: number;
  [key: string]: unknown;
}

export function listPeers() {
  return get<{ peers: PeerConfigRow[] }>("/peers");
}

export function getPeer(peerId: string) {
  return get<{ peer: PeerConfigRow }>(`/peers/${encodeURIComponent(peerId)}`);
}

export interface AddPeerRequest {
  peer_id: string;
  peer_name: string;
  peer_url: string;
  direction: "push" | "pull" | "bidirectional";
  entity_types: string[];
  sync_scope: "all" | "tagged";
  auth_method: "aauth" | "shared_secret";
  conflict_strategy: "last_write_wins" | "source_priority" | "manual";
  shared_secret?: string;
}

export function addPeer(body: AddPeerRequest) {
  return post<Record<string, unknown>>("/peers", body);
}

export function removePeer(peerId: string) {
  return del<{ success: boolean }>(`/peers/${encodeURIComponent(peerId)}`);
}

export function syncPeer(peerId: string) {
  return post<Record<string, unknown>>(`/peers/${encodeURIComponent(peerId)}/sync`, {});
}
