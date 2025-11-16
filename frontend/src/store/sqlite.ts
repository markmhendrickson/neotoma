/**
 * SQLite WASM initialization with OPFS VFS
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Database } from '@sqlite.org/sqlite-wasm';
import { getSchemaSQL } from './schema.js';
import { setEncryptionKeys } from './encryption.js';
import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';

let db: Database | null = null;

/**
 * Initialize SQLite with OPFS VFS
 */
export async function initSQLite(
  x25519KeyPair: X25519KeyPair,
  ed25519KeyPair: Ed25519KeyPair
): Promise<Database> {
  if (db) {
    return db;
  }

  // Set encryption keys
  await setEncryptionKeys(x25519KeyPair, ed25519KeyPair);

  // Initialize SQLite module
  const sqlite3 = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  });

  // Check if OPFS is available
  if (sqlite3.oo1.OpfsDb) {
    // Use OPFS VFS for persistent storage
    db = new sqlite3.oo1.OpfsDb('/neotoma.db');
  } else {
    // Fallback to in-memory database if OPFS not available
    console.warn('OPFS not available, using in-memory database');
    db = new sqlite3.oo1.DB('/neotoma.db');
  }

  // Create schema
  const schemaSQL = getSchemaSQL();
  db.exec(schemaSQL);

  return db;
}

/**
 * Get current database instance
 */
export function getDB(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initSQLite() first.');
  }
  return db;
}

