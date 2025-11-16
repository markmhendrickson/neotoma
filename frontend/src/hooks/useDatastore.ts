/**
 * Hook for managing local datastore
 * Initializes SQLite and WebWorker connection
 */

import { useState, useEffect, useCallback } from 'react';
import { DatastoreWorkerClient } from '../worker/client.js';
import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';
import type { LocalRecord, QueryOptions, VectorSearchOptions } from '../store/types.js';

export function useDatastore(
  x25519Key: X25519KeyPair | null,
  ed25519Key: Ed25519KeyPair | null
) {
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
      try {
        // Create worker client
        const workerUrl = new URL('./worker/db.worker.ts', import.meta.url);
        workerClient = new DatastoreWorkerClient(workerUrl);

        // Initialize database
        await workerClient.init(x25519Key, ed25519Key);

        setClient(workerClient);
        setInitialized(true);
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to initialize datastore');
        setError(error);
        console.error('Datastore initialization error:', error);
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

  const deleteRecord = useCallback(
    async (id: string): Promise<void> => {
      if (!client || !initialized) {
        throw new Error('Datastore not initialized');
      }
      await client.delete(id);
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
    deleteRecord,
    searchVectors,
  };
}

