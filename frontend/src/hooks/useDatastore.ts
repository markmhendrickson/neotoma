/**
 * Hook for managing local datastore
 * Initializes SQLite and WebWorker connection
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DatastoreWorkerClient } from '../worker/client.js';
import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';
import type { LocalRecord, QueryOptions, VectorSearchOptions } from '../store/types.js';

const workerUrl = new URL('../worker/db.worker.ts', import.meta.url);
let sharedWorkerClient: DatastoreWorkerClient | null = null;
let sharedWorkerInitPromise: Promise<void> | null = null;
let sharedWorkerKeyFingerprint: string | null = null;

function fingerprintKeys(x25519Key: X25519KeyPair, ed25519Key: Ed25519KeyPair): string {
  const serialize = (key: X25519KeyPair | Ed25519KeyPair) =>
    Array.from(key.publicKey).join(',') + '|' + Array.from(key.privateKey).join(',');
  return `${serialize(x25519Key)}::${serialize(ed25519Key)}`;
}

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

    async function init() {
      if (!x25519Key || !ed25519Key) {
        return;
      }

      const fingerprint = fingerprintKeys(x25519Key, ed25519Key);

      if (sharedWorkerKeyFingerprint && sharedWorkerKeyFingerprint !== fingerprint) {
        // Keys changed – reset existing worker so it can be re-initialized
        sharedWorkerClient?.terminate();
        sharedWorkerClient = null;
        sharedWorkerInitPromise = null;
        sharedWorkerKeyFingerprint = null;
        setInitialized(false);
      }

      try {
        console.log('[Datastore] Starting initialization...');
        if (!sharedWorkerClient) {
          sharedWorkerClient = new DatastoreWorkerClient(workerUrl);
        }
        if (!sharedWorkerInitPromise) {
          sharedWorkerInitPromise = sharedWorkerClient
            .init(x25519Key, ed25519Key)
            .catch((error) => {
              // Reset cached worker on failure so we can retry
              sharedWorkerClient?.terminate();
              sharedWorkerClient = null;
              sharedWorkerInitPromise = null;
              sharedWorkerKeyFingerprint = null;
              throw error;
            });
        }

        await sharedWorkerInitPromise;

        sharedWorkerKeyFingerprint = fingerprint;
        setClient(sharedWorkerClient);
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

  const datastoreValue = useMemo(
    () => ({
      initialized,
      error,
      getRecord,
      putRecord,
      queryRecords,
      countRecords,
      deleteRecord,
      clearAll,
      searchVectors,
    }),
    [initialized, error, getRecord, putRecord, queryRecords, countRecords, deleteRecord, clearAll, searchVectors]
  );

  return datastoreValue;
}

