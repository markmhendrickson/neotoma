/**
 * Hook for managing local datastore
 * Initializes SQLite and WebWorker connection
 */

import { useState, useEffect, useCallback } from 'react';
import { DatastoreWorkerClient } from '../worker/client.js';
import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';
import type { LocalRecord, QueryOptions, VectorSearchOptions } from '../store/types.js';

export interface DatastoreAPI {
  initialized: boolean;
  error: Error | null;
  getRecord: (id: string) => Promise<LocalRecord | null>;
  putRecord: (record: LocalRecord) => Promise<void>;
  queryRecords: (options?: QueryOptions) => Promise<LocalRecord[]>;
  countRecords: (options?: QueryOptions) => Promise<number>;
  deleteRecord: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  searchVectors: (options: VectorSearchOptions) => Promise<LocalRecord[]>;
}

export function useDatastore(
  x25519Key: X25519KeyPair | null,
  ed25519Key: Ed25519KeyPair | null
): DatastoreAPI {
  const [client, setClient] = useState<DatastoreWorkerClient | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize worker client
  useEffect(() => {
    if (!x25519Key || !ed25519Key) {
      return;
    }

    let workerClient: DatastoreWorkerClient | null = null;

    async function init() {
      if (!x25519Key || !ed25519Key) {
        return;
      }
      try {
        console.log('[Datastore] Starting initialization...');
        // Create worker client
        const workerUrl = new URL('../worker/db.worker.ts', import.meta.url);
        workerClient = new DatastoreWorkerClient(workerUrl);

        // Initialize database
        await workerClient.init(x25519Key, ed25519Key);

        setClient(workerClient);
        setInitialized(true);
        setError(null);
        console.log('[Datastore] Initialization complete');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to initialize datastore');
        setError(error);
        console.error('[Datastore] Initialization error:', error);
        console.error('[Datastore] Error details:', {
          message: error.message,
          stack: error.stack,
          cause: err,
        });
      }
    }

    init();

    return () => {
      if (workerClient) {
        workerClient.terminate();
      }
    };
  }, [x25519Key, ed25519Key]);

  const getRecord = useCallback(
    async (id: string): Promise<LocalRecord | null> => {
      if (!client || !initialized) {
        throw new Error('Datastore not initialized');
      }
      return client.get(id);
    },
    [client, initialized]
  );

  const putRecord = useCallback(
    async (record: LocalRecord): Promise<void> => {
      if (!client || !initialized) {
        throw new Error('Datastore not initialized');
      }
      await client.put(record);
    },
    [client, initialized]
  );

  const queryRecords = useCallback(
    async (options?: QueryOptions): Promise<LocalRecord[]> => {
      if (!client || !initialized) {
        throw new Error('Datastore not initialized');
      }
      return client.query(options);
    },
    [client, initialized]
  );

  const countRecords = useCallback(
    async (options?: QueryOptions): Promise<number> => {
      if (!client || !initialized) {
        throw new Error('Datastore not initialized');
      }
      return client.count(options);
    },
    [client, initialized]
  );

  const deleteRecord = useCallback(
    async (id: string): Promise<void> => {
      if (!client || !initialized) {
        throw new Error('Datastore not initialized');
      }
      await client.delete(id);
    },
    [client, initialized]
  );

  const clearAll = useCallback(
    async (): Promise<void> => {
      if (!client || !initialized) {
        throw new Error('Datastore not initialized');
      }
      await client.clearAll();
    },
    [client, initialized]
  );

  const searchVectors = useCallback(
    async (options: VectorSearchOptions): Promise<LocalRecord[]> => {
      if (!client || !initialized) {
        throw new Error('Datastore not initialized');
      }
      return client.searchVectors(options);
    },
    [client, initialized]
  );

  return {
    initialized,
    error,
    getRecord,
    putRecord,
    queryRecords,
    countRecords,
    deleteRecord,
    clearAll,
    searchVectors,
  };
}

