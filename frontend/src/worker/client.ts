/**
 * Client-side RPC wrapper for WebWorker
 * Provides typed interface for datastore operations
 */

import type { LocalRecord, QueryOptions, VectorSearchOptions } from '../store/types.js';
import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';
import type { RPCRequest, RPCResponse } from './types.js';

export class DatastoreWorkerClient {
  private worker: Worker;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private messageIdCounter = 0;

  constructor(workerUrl: string | URL) {
    this.worker = new Worker(workerUrl, { type: 'module' });
    this.worker.addEventListener('message', this.handleMessage.bind(this));
  }

  private handleMessage(event: MessageEvent): void {
    if (event.data.type === 'ready') {
      return;
    }

    const response = event.data as RPCResponse;
    const pending = this.pendingRequests.get(response.id);

    if (!pending) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  private async call(method: string, params?: unknown): Promise<unknown> {
    const id = `req-${++this.messageIdCounter}`;
    const message: RPCRequest = { method, params } as RPCRequest;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.worker.postMessage({
        id,
        method: message.method,
        params: message.params,
      });

      // Timeout after 60 seconds (longer for SQLite initialization)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 60000);
    });
  }

  /**
   * Initialize database with encryption keys
   */
  async init(x25519Key: X25519KeyPair, ed25519Key: Ed25519KeyPair): Promise<void> {
    await this.call('local.init', { x25519Key, ed25519Key });
  }

  /**
   * Get a record by ID
   */
  async get(id: string): Promise<LocalRecord | null> {
    return (await this.call('local.get', { id })) as LocalRecord | null;
  }

  /**
   * Store a record
   */
  async put(record: LocalRecord): Promise<void> {
    await this.call('local.put', { record });
  }

  /**
   * Query records
   */
  async query(options?: QueryOptions): Promise<LocalRecord[]> {
    return (await this.call('local.query', { options })) as LocalRecord[];
  }

  /**
   * Delete a record
   */
  async delete(id: string): Promise<void> {
    await this.call('local.delete', { id });
  }

  /**
   * Delete multiple records
   */
  async deleteMany(ids: string[]): Promise<void> {
    await this.call('local.deleteMany', { ids });
  }

  /**
   * Search vectors
   */
  async searchVectors(options: VectorSearchOptions): Promise<LocalRecord[]> {
    return (await this.call('local.searchVectors', { options })) as LocalRecord[];
  }

  /**
   * Push sync deltas
   */
  async syncPush(deltas: unknown[]): Promise<{ pushed: number }> {
    return (await this.call('local.syncPush', { deltas })) as { pushed: number };
  }

  /**
   * Pull sync deltas
   */
  async syncPull(since?: number): Promise<{ deltas: unknown[]; version: number }> {
    return (await this.call('local.syncPull', { since })) as { deltas: unknown[]; version: number };
  }

  /**
   * Terminate worker
   */
  terminate(): void {
    this.worker.terminate();
  }
}

