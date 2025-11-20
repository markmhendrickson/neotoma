/**
 * RPC protocol handler for WebWorker
 * Handles datastore operations in isolated worker context
 */

import {
  initSQLite,
  putRecord,
  getRecord,
  queryRecords,
  countRecords,
  deleteRecord,
  deleteRecords,
  clearAllRecords,
  searchVectors,
} from '../store/index.js';
import type { LocalRecord, QueryOptions, VectorSearchOptions } from '../store/types.js';
import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';
import type { RPCMessage, RPCResponse } from './types.js';

let initialized = false;

/**
 * Handle RPC request
 */
export async function handleRPCRequest(message: RPCMessage): Promise<RPCResponse> {
  try {
    let result: unknown;

    switch (message.method) {
      case 'local.init': {
        const { x25519Key, ed25519Key } = message.params as {
          x25519Key: X25519KeyPair;
          ed25519Key: Ed25519KeyPair;
        };
        await initSQLite(x25519Key, ed25519Key);
        initialized = true;
        result = { success: true };
        break;
      }

      case 'local.get': {
        if (!initialized) throw new Error('Database not initialized');
        const { id } = message.params as { id: string };
        result = await getRecord(id);
        break;
      }

      case 'local.put': {
        if (!initialized) throw new Error('Database not initialized');
        const { record } = message.params as { record: LocalRecord };
        await putRecord(record);
        result = { success: true };
        break;
      }

      case 'local.query': {
        if (!initialized) throw new Error('Database not initialized');
        const { options } = message.params as { options?: QueryOptions };
        result = await queryRecords(options);
        break;
      }

      case 'local.count': {
        if (!initialized) throw new Error('Database not initialized');
        const { options } = message.params as { options?: QueryOptions };
        result = await countRecords(options);
        break;
      }

      case 'local.delete': {
        if (!initialized) throw new Error('Database not initialized');
        const { id } = message.params as { id: string };
        await deleteRecord(id);
        result = { success: true };
        break;
      }

      case 'local.deleteMany': {
        if (!initialized) throw new Error('Database not initialized');
        const { ids } = message.params as { ids: string[] };
        await deleteRecords(ids);
        result = { success: true, deleted: ids.length };
        break;
      }

      case 'local.clearAll': {
        if (!initialized) throw new Error('Database not initialized');
        await clearAllRecords();
        result = { success: true };
        break;
      }

      case 'local.searchVectors': {
        if (!initialized) throw new Error('Database not initialized');
        const { options } = message.params as { options: VectorSearchOptions };
        result = await searchVectors(options);
        break;
      }

      case 'local.syncPush': {
        if (!initialized) throw new Error('Database not initialized');
        const { since } = message.params as { since?: number };
        // Import sync functions dynamically
        const { syncPush } = await import('../store/sync.js');
        // Note: In a real implementation, we'd need to pass keys and recipient public key
        // For now, return placeholder
        result = { success: true, pushed: 0, deltas: [] };
        break;
      }

      case 'local.syncPull': {
        if (!initialized) throw new Error('Database not initialized');
        const { deltas } = message.params as { deltas: unknown[] };
        // Import sync functions dynamically
        const { syncPull } = await import('../store/sync.js');
        // Note: In a real implementation, we'd need to pass keys and signer public key
        // For now, return placeholder
        result = { applied: 0, conflicts: 0 };
        break;
      }

      default:
        throw new Error(`Unknown method: ${message.method}`);
    }

    return {
      id: message.id,
      result,
    };
  } catch (error) {
    return {
      id: message.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : 'Unknown error',
        data: error,
      },
    };
  }
}

/**
 * Parse and validate RPC message
 */
export function parseRPCMessage(data: unknown): RPCMessage | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const msg = data as Record<string, unknown>;
  if (typeof msg.id !== 'string' || typeof msg.method !== 'string') {
    return null;
  }

  return {
    id: msg.id,
    method: msg.method,
    params: msg.params,
  };
}

