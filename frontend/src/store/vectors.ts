/**
 * Vector storage and search utilities
 * Note: Full vector search will be implemented in Step 3 with HNSWlib-WASM
 * This file provides basic storage for embeddings
 */

import { getDB } from './sqlite.js';
import type { LocalRecord, VectorSearchOptions } from './types.js';

/**
 * Store embedding for a record
 */
export async function storeEmbedding(recordId: string, embedding: number[]): Promise<void> {
  const db = getDB();
  const stmt = db.prepare('UPDATE records SET embedding = ? WHERE id = ?');
  
  try {
    stmt.bind([JSON.stringify(embedding), recordId] as readonly string[]);
    stmt.step();
  } finally {
    stmt.finalize();
  }
}

/**
 * Get embedding for a record
 */
export async function getEmbedding(recordId: string): Promise<number[] | null> {
  const db = getDB();
  const stmt = db.prepare('SELECT embedding FROM records WHERE id = ?');
  
  try {
    stmt.bind([recordId]);

    if (stmt.step()) {
      const row = stmt.get({ embedding: null as string | null }) as { embedding: string | null };
      if (row?.embedding) {
        return JSON.parse(row.embedding);
      }
    }
  } finally {
    stmt.finalize();
  }

  return null;
}

/**
 * Basic cosine similarity calculation
 * Used for simple vector search until HNSWlib is integrated
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Simple vector search (will be replaced with HNSWlib in Step 3)
 */
export async function searchVectors(options: VectorSearchOptions): Promise<LocalRecord[]> {
  const db = getDB();
  const conditions: string[] = ['embedding IS NOT NULL'];
  const params: unknown[] = [];

  if (options.type) {
    conditions.push('type = ?');
    params.push(options.type);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const limit = options.limit || 10;
  const threshold = options.similarity_threshold || 0.7;

  const sql = `SELECT * FROM records ${whereClause}`;
  const stmt = db.prepare(sql);

  const results: Array<{ record: LocalRecord; similarity: number }> = [];

  try {
    if (params.length > 0) {
      stmt.bind(params as readonly (string | number | null | boolean | undefined)[]);
    }

    while (stmt.step()) {
      const row = stmt.get({
        id: '',
        type: '',
        summary: null as string | null,
        properties: '',
        file_urls: '',
        embedding: null as string | null,
        created_at: '',
        updated_at: '',
      }) as {
        id: string;
        type: string;
        summary: string | null;
        properties: string;
        file_urls: string;
        embedding: string | null;
        created_at: string;
        updated_at: string;
      };

      if (row?.embedding) {
        const embedding = JSON.parse(row.embedding) as number[];
        const similarity = cosineSimilarity(options.query_embedding, embedding);

        if (similarity >= threshold) {
          results.push({
            record: {
              id: row.id,
              type: row.type,
              summary: row.summary,
              properties: JSON.parse(row.properties),
              file_urls: JSON.parse(row.file_urls),
              embedding,
              created_at: row.created_at,
              updated_at: row.updated_at,
            },
            similarity,
          });
        }
      }
    }
  } finally {
    stmt.finalize();
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  // Return top N records
  return results.slice(0, limit).map(r => r.record);
}

