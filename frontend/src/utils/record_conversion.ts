/**
 * Convert between LocalRecord and NeotomaRecord types
 */

import type { LocalRecord } from '../store/types.js';
import type { NeotomaRecord } from '../types/record.js';

/**
 * Convert LocalRecord to NeotomaRecord
 */
export function localToNeotoma(local: LocalRecord): NeotomaRecord {
  return {
    id: local.id,
    type: local.type,
    properties: local.properties,
    file_urls: local.file_urls,
    embedding: local.embedding,
    created_at: local.created_at,
    updated_at: local.updated_at,
    _status: 'Ready', // Default status
  };
}

/**
 * Convert NeotomaRecord to LocalRecord
 */
export function neotomaToLocal(neotoma: NeotomaRecord): LocalRecord {
  return {
    id: neotoma.id,
    type: neotoma.type,
    properties: neotoma.properties,
    file_urls: neotoma.file_urls || [],
    embedding: neotoma.embedding || null,
    created_at: neotoma.created_at,
    updated_at: neotoma.updated_at,
  };
}

