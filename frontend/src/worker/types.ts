/**
 * RPC message types for WebWorker communication
 */

export interface RPCMessage {
  id: string;
  method: string;
  params?: unknown;
}

export interface RPCResponse {
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type RPCRequest =
  | { method: 'local.get'; params: { id: string } }
  | { method: 'local.put'; params: { record: unknown } }
  | { method: 'local.query'; params: { options?: unknown } }
  | { method: 'local.delete'; params: { id: string } }
  | { method: 'local.deleteMany'; params: { ids: string[] } }
  | { method: 'local.searchVectors'; params: { options: unknown } }
  | { method: 'local.syncPush'; params: { deltas: unknown[] } }
  | { method: 'local.syncPull'; params: { since?: number } }
  | { method: 'local.init'; params: { x25519Key: unknown; ed25519Key: unknown } };

