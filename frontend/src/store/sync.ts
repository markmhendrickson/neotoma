/**
 * Encrypted delta sync for multi-device support
 * Implements versioned encrypted deltas with conflict-free merge
 */

import { getDB } from './sqlite.js';
import type { LocalRecord } from './types.js';
import { encryptEnvelope, decryptEnvelope } from '../../../src/crypto/envelope.js';
import type { X25519KeyPair, Ed25519KeyPair, EncryptedEnvelope } from '../../../src/crypto/types.js';

export interface SyncDelta {
  id: string;
  version: number;
  operation: 'create' | 'update' | 'delete';
  record_id: string;
  encrypted_payload: string; // Base64url-encoded encrypted envelope
  timestamp: string;
}

export interface SyncState {
  last_sync_version: number;
  device_id: string;
}

/**
 * Push local changes as encrypted deltas
 */
export async function syncPush(
  sinceVersion: number,
  x25519KeyPair: X25519KeyPair,
  ed25519KeyPair: Ed25519KeyPair,
  recipientPublicKey: Uint8Array
): Promise<SyncDelta[]> {
  const db = getDB();
  const stmt = db.prepare(`
    SELECT * FROM sync_deltas
    WHERE version > ?
    ORDER BY version ASC
  `);

  const deltas: SyncDelta[] = [];

  try {
    stmt.bind({ 1: sinceVersion });

    while (stmt.step()) {
      const row = stmt.get({
        id: '',
        version: 0,
        operation: '',
        record_id: '',
        encrypted_payload: '',
        timestamp: '',
      }) as {
        id: string;
        version: number;
        operation: string;
        record_id: string;
        encrypted_payload: string;
        timestamp: string;
      };

      // Re-encrypt for recipient if needed
      // For now, return as-is (already encrypted)
      deltas.push({
        id: row.id,
        version: row.version,
        operation: row.operation as 'create' | 'update' | 'delete',
        record_id: row.record_id,
        encrypted_payload: row.encrypted_payload,
        timestamp: row.timestamp,
      });
    }
  } finally {
    stmt.finalize();
  }

  return deltas;
}

/**
 * Apply encrypted deltas from remote
 */
export async function syncPull(
  deltas: SyncDelta[],
  x25519KeyPair: X25519KeyPair,
  ed25519KeyPair: Ed25519KeyPair,
  signerPublicKey: Uint8Array
): Promise<{ applied: number; conflicts: number }> {
  const db = getDB();
  let applied = 0;
  let conflicts = 0;

  for (const delta of deltas) {
    try {
      // Decrypt delta
      const envelope = deserializeEnvelope(delta.encrypted_payload);
      const decrypted = await decryptEnvelope(
        envelope,
        x25519KeyPair.privateKey,
        signerPublicKey
      );

      const record = JSON.parse(new TextDecoder().decode(decrypted)) as LocalRecord;

      // Check for conflicts (simplified: last-write-wins)
      const existing = db.prepare('SELECT * FROM records WHERE id = ?');
      existing.bind({ 1: record.id });

      if (existing.step()) {
        const existingRow = existing.get({
          updated_at: '',
        }) as { updated_at: string };

        // Conflict resolution: last-write-wins
        const existingTime = new Date(existingRow.updated_at).getTime();
        const deltaTime = new Date(record.updated_at).getTime();

        if (deltaTime <= existingTime) {
          conflicts++;
          existing.finalize();
          continue; // Skip this delta
        }
      }

      existing.finalize();

      // Apply delta
      if (delta.operation === 'delete') {
        const deleteStmt = db.prepare('DELETE FROM records WHERE id = ?');
        deleteStmt.bind({ 1: record.id });
        deleteStmt.step();
        deleteStmt.finalize();
      } else {
        const putStmt = db.prepare(`
          INSERT OR REPLACE INTO records (id, type, properties, file_urls, embedding, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        putStmt.bind({
          1: record.id,
          2: record.type,
          3: JSON.stringify(record.properties),
          4: JSON.stringify(record.file_urls),
          5: record.embedding ? JSON.stringify(record.embedding) : null,
          6: record.created_at,
          7: record.updated_at,
        });
        putStmt.step();
        putStmt.finalize();
      }

      // Record delta as applied
      const deltaStmt = db.prepare(`
        INSERT OR IGNORE INTO sync_deltas (id, version, operation, record_id, encrypted_payload, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      deltaStmt.bind({
        1: delta.id,
        2: delta.version,
        3: delta.operation,
        4: delta.record_id,
        5: delta.encrypted_payload,
        6: delta.timestamp,
      });
      deltaStmt.step();
      deltaStmt.finalize();

      applied++;
    } catch (error) {
      console.error('Error applying delta:', error);
      conflicts++;
    }
  }

  return { applied, conflicts };
}

/**
 * Create delta for record change
 */
export async function createDelta(
  record: LocalRecord,
  operation: 'create' | 'update' | 'delete',
  x25519KeyPair: X25519KeyPair,
  ed25519KeyPair: Ed25519KeyPair,
  recipientPublicKey: Uint8Array
): Promise<SyncDelta> {
  const db = getDB();

  // Get next version
  const versionStmt = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM sync_deltas');
  versionStmt.step();
  const version = (versionStmt.get({ next_version: 0 }) as { next_version: number }).next_version;
  versionStmt.finalize();

  // Encrypt record
  const recordBytes = new TextEncoder().encode(JSON.stringify(record));
  const envelope = await encryptEnvelope(recordBytes, recipientPublicKey, ed25519KeyPair);
  const encryptedPayload = serializeEnvelope(envelope);

  const delta: SyncDelta = {
    id: `delta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    version,
    operation,
    record_id: record.id,
    encrypted_payload: encryptedPayload,
    timestamp: new Date().toISOString(),
  };

  // Store delta
  const stmt = db.prepare(`
    INSERT INTO sync_deltas (id, version, operation, record_id, encrypted_payload, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.bind({
    1: delta.id,
    2: delta.version,
    3: delta.operation,
    4: delta.record_id,
    5: delta.encrypted_payload,
    6: delta.timestamp,
  });
  stmt.step();
  stmt.finalize();

  return delta;
}

/**
 * Serialize encrypted envelope to base64url
 */
function serializeEnvelope(envelope: EncryptedEnvelope): string {
  const parts = [
    envelope.ciphertext,
    envelope.encryptedKey,
    envelope.ephemeralPublicKey,
    envelope.nonce,
    envelope.signature,
    envelope.signerPublicKey,
  ];

  let totalLength = parts.length * 4;
  for (const part of parts) {
    totalLength += part.length;
  }

  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  for (const part of parts) {
    view.setUint32(offset, part.length, true);
    offset += 4;
    buffer.set(part, offset);
    offset += part.length;
  }

  return base64UrlEncode(buffer);
}

/**
 * Deserialize base64url to encrypted envelope
 */
function deserializeEnvelope(encoded: string): EncryptedEnvelope {
  const buffer = base64UrlDecode(encoded);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  function readPart(): Uint8Array {
    const length = view.getUint32(offset, true);
    offset += 4;
    const part = buffer.slice(offset, offset + length);
    offset += length;
    return part;
  }

  return {
    ciphertext: readPart(),
    encryptedKey: readPart(),
    ephemeralPublicKey: readPart(),
    nonce: readPart(),
    signature: readPart(),
    signerPublicKey: readPart(),
  };
}

/**
 * Base64url encode
 */
function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64url decode
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

