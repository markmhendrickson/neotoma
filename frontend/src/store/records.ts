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
    INSERT OR REPLACE INTO records (id, type, summary, properties, file_urls, embedding, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.bind([
      record.id,
      record.type,
      record.summary ?? null,
      JSON.stringify(record.properties),
      JSON.stringify(record.file_urls),
      record.embedding ? JSON.stringify(record.embedding) : null,
      record.created_at,
      record.updated_at,
    ] as readonly (string | null)[]);

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
    stmt.bind([id]);

    if (stmt.step()) {
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

      if (row) {
        return {
          id: row.id,
          type: row.type,
          summary: row.summary,
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
  const params: unknown[] = [];

  if (options.type) {
    conditions.push('type = ?');
    params.push(options.type);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  // Use LIMIT -1 (SQLite) when no explicit limit is provided so we return all records
  const limit = options.limit ?? -1;
  const offset = options.offset ?? 0;

  // Build SQL with proper parameter placeholders
  const sql = `
    SELECT * FROM records
    ${whereClause}
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const stmt = db.prepare(sql);
  const records: LocalRecord[] = [];

  try {
    // Bind all parameters in order: WHERE params first, then LIMIT, then OFFSET
    // Use array format for positional parameters (SQLite WASM accepts arrays for positional binding)
    const allParams = [...params, limit, offset] as readonly (string | number | null | boolean | undefined)[];
    stmt.bind(allParams);

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

      if (row) {
        records.push({
          id: row.id,
          type: row.type,
          summary: row.summary,
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
 * Count total records (optionally filtered)
 */
export async function countRecords(options: QueryOptions = {}): Promise<number> {
  const db = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.type) {
    conditions.push('type = ?');
    params.push(options.type);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT COUNT(*) as count
    FROM records
    ${whereClause}
  `;

  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) {
      stmt.bind(params as readonly (string | number | null | boolean | undefined)[]);
    }
    if (stmt.step()) {
      const row = stmt.get({ count: 0 }) as { count: number };
      return typeof row.count === 'number' ? row.count : Number(row.count) || 0;
    }
    return 0;
  } finally {
    stmt.finalize();
  }
}

/**
 * Delete a record
 */
export async function deleteRecord(id: string): Promise<void> {
  const db = getDB();
  const stmt = db.prepare('DELETE FROM records WHERE id = ?');
  
  try {
    stmt.bind([id]);
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
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`DELETE FROM records WHERE id IN (${placeholders})`);
  
  try {
    stmt.bind(ids as readonly string[]);
    stmt.step();
  } finally {
    stmt.finalize();
  }
}

/**
 * Delete all records
 */
export async function clearAllRecords(): Promise<void> {
  const db = getDB();
  db.exec('DELETE FROM records');
}

