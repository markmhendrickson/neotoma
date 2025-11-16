/**
 * Encrypted-at-rest layer for SQLite pages
 * Encrypts data before writing to OPFS, decrypts after reading
 */

import type { X25519KeyPair } from '../../../src/crypto/types.js';
import { encryptEnvelope, decryptEnvelope } from '../../../src/crypto/envelope.js';
import type { Ed25519KeyPair } from '../../../src/crypto/types.js';

let encryptionKeyPair: X25519KeyPair | null = null;
let signingKeyPair: Ed25519KeyPair | null = null;

/**
 * Initialize encryption keys (should be called once)
 */
export async function setEncryptionKeys(
  x25519KeyPair: X25519KeyPair,
  ed25519KeyPair: Ed25519KeyPair
): Promise<void> {
  encryptionKeyPair = x25519KeyPair;
  signingKeyPair = ed25519KeyPair;
}

/**
 * Encrypt data before storing in OPFS
 */
export async function encryptForStorage(data: Uint8Array): Promise<Uint8Array> {
  if (!encryptionKeyPair || !signingKeyPair) {
    throw new Error('Encryption keys not initialized');
  }

  // Encrypt using envelope encryption
  const envelope = await encryptEnvelope(
    data,
    encryptionKeyPair.publicKey,
    signingKeyPair
  );

  // Serialize envelope to bytes
  return serializeEnvelope(envelope);
}

/**
 * Decrypt data after reading from OPFS
 */
export async function decryptFromStorage(encrypted: Uint8Array): Promise<Uint8Array> {
  if (!encryptionKeyPair || !signingKeyPair) {
    throw new Error('Encryption keys not initialized');
  }

  // Deserialize envelope
  const envelope = deserializeEnvelope(encrypted);

  // Decrypt envelope
  return decryptEnvelope(
    envelope,
    encryptionKeyPair.privateKey,
    signingKeyPair.publicKey
  );
}

/**
 * Serialize encrypted envelope to bytes
 */
function serializeEnvelope(envelope: {
  ciphertext: Uint8Array;
  encryptedKey: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  nonce: Uint8Array;
  signature: Uint8Array;
  signerPublicKey: Uint8Array;
}): Uint8Array {
  const parts = [
    envelope.ciphertext,
    envelope.encryptedKey,
    envelope.ephemeralPublicKey,
    envelope.nonce,
    envelope.signature,
    envelope.signerPublicKey,
  ];

  // Calculate total length: 4 bytes per length + data
  let totalLength = parts.length * 4;
  for (const part of parts) {
    totalLength += part.length;
  }

  const result = new Uint8Array(totalLength);
  const view = new DataView(result.buffer);
  let offset = 0;

  for (const part of parts) {
    view.setUint32(offset, part.length, true);
    offset += 4;
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Deserialize bytes to encrypted envelope
 */
function deserializeEnvelope(data: Uint8Array): {
  ciphertext: Uint8Array;
  encryptedKey: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  nonce: Uint8Array;
  signature: Uint8Array;
  signerPublicKey: Uint8Array;
} {
  const view = new DataView(data.buffer);
  let offset = 0;

  function readPart(): Uint8Array {
    const length = view.getUint32(offset, true);
    offset += 4;
    const part = data.slice(offset, offset + length);
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

