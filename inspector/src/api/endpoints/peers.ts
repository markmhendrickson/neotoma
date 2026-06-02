import { del, get, post, type FetchOptions } from "../client";

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

export function listPeers(fetch?: FetchOptions) {
  return get<{ peers: PeerConfigRow[] }>("/peers", undefined, fetch);
}

export function getPeer(peerId: string, fetch?: FetchOptions) {
  return get<{ peer: PeerConfigRow }>(`/peers/${encodeURIComponent(peerId)}`, undefined, fetch);
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

export function addPeer(body: AddPeerRequest, fetch?: FetchOptions) {
  return post<Record<string, unknown>>("/peers", body, fetch);
}

export function removePeer(peerId: string, fetch?: FetchOptions) {
  return del<{ success: boolean }>(`/peers/${encodeURIComponent(peerId)}`, fetch);
}

export function syncPeer(peerId: string, fetch?: FetchOptions) {
  return post<Record<string, unknown>>(`/peers/${encodeURIComponent(peerId)}/sync`, {}, fetch);
}
