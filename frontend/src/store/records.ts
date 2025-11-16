/**
 * CRUD operations for records
 */

import { getDB } from './sqlite.js';
import type { LocalRecord, QueryOptions } from './types.js';

/**
 * Store a new record
 */
export async function putRecord(record: LocalRecord): Promise<void> {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO records (id, type, properties, file_urls, embedding, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.bind({
      1: record.id,
      2: record.type,
      3: JSON.stringify(record.properties),
      4: JSON.stringify(record.file_urls),
      5: record.embedding ? JSON.stringify(record.embedding) : null,
      6: record.created_at,
      7: record.updated_at,
    });

    stmt.step();
  } finally {
    stmt.finalize();
  }
}

/**
 * Get a record by ID
 */
export async function getRecord(id: string): Promise<LocalRecord | null> {
  const db = getDB();
  const stmt = db.prepare('SELECT * FROM records WHERE id = ?');
  
  try {
    stmt.bind({ 1: id });

    if (stmt.step()) {
      const row = stmt.get({
        id: '',
        type: '',
        properties: '',
        file_urls: '',
        embedding: null as string | null,
        created_at: '',
        updated_at: '',
      }) as {
        id: string;
        type: string;
        properties: string;
        file_urls: string;
        embedding: string | null;
        created_at: string;
        updated_at: string;
      };

      if (row) {
        return {
          id: row.id,
          type: row.type,
          properties: JSON.parse(row.properties),
          file_urls: JSON.parse(row.file_urls),
          embedding: row.embedding ? JSON.parse(row.embedding) : null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }
    }
  } finally {
    stmt.finalize();
  }

  return null;
}

/**
 * Query records with filters
 */
export async function queryRecords(options: QueryOptions = {}): Promise<LocalRecord[]> {
  const db = getDB();
  const conditions: string[] = [];
  const bindings: Record<number, unknown> = {};
  let paramIndex = 1;

  if (options.type) {
    conditions.push('type = ?');
    bindings[paramIndex++] = options.type;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  bindings[paramIndex++] = limit;
  bindings[paramIndex++] = offset;

  const sql = `
    SELECT * FROM records
    ${whereClause}
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const stmt = db.prepare(sql);
  const records: LocalRecord[] = [];

  try {
    stmt.bind(bindings);

    while (stmt.step()) {
      const row = stmt.get({
        id: '',
        type: '',
        properties: '',
        file_urls: '',
        embedding: null as string | null,
        created_at: '',
        updated_at: '',
      }) as {
        id: string;
        type: string;
        properties: string;
        file_urls: string;
        embedding: string | null;
        created_at: string;
        updated_at: string;
      };

      if (row) {
        records.push({
          id: row.id,
          type: row.type,
          properties: JSON.parse(row.properties),
          file_urls: JSON.parse(row.file_urls),
          embedding: row.embedding ? JSON.parse(row.embedding) : null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      }
    }
  } finally {
    stmt.finalize();
  }

  // Client-side property filtering (if needed)
  if (options.properties) {
    return records.filter(record => {
      for (const [key, value] of Object.entries(options.properties!)) {
        if (record.properties[key] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  return records;
}

/**
 * Delete a record
 */
export async function deleteRecord(id: string): Promise<void> {
  const db = getDB();
  const stmt = db.prepare('DELETE FROM records WHERE id = ?');
  
  try {
    stmt.bind({ 1: id });
    stmt.step();
  } finally {
    stmt.finalize();
  }
}

/**
 * Delete multiple records
 */
export async function deleteRecords(ids: string[]): Promise<void> {
  const db = getDB();
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(',');
  const stmt = db.prepare(`DELETE FROM records WHERE id IN (${placeholders})`);
  
  try {
    const bindings: Record<number, string> = {};
    ids.forEach((id, i) => {
      bindings[i + 1] = id;
    });
    stmt.bind(bindings);
    stmt.step();
  } finally {
    stmt.finalize();
  }
}

