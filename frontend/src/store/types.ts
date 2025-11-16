/**
 * Types for browser datastore
 */

export interface LocalRecord {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  file_urls: string[];
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface QueryOptions {
  type?: string;
  properties?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface VectorSearchOptions {
  query_embedding: number[];
  similarity_threshold?: number;
  limit?: number;
  type?: string;
}

export interface SyncDelta {
  id: string;
  version: number;
  encrypted_data: Uint8Array;
  timestamp: string;
  device_id: string;
}

