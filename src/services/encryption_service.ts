/**
 * Encryption service for MCP server responses
 * Encrypts responses before returning to clients
 */

import { encryptEnvelope } from '../crypto/envelope.js';
import type { Ed25519KeyPair, X25519KeyPair } from '../crypto/types.js';
import { generateX25519KeyPair, generateEd25519KeyPair } from '../crypto/keys.js';

let serverX25519Key: X25519KeyPair | null = null;
let serverEd25519Key: Ed25519KeyPair | null = null;

/**
 * Initialize server encryption keys
 */
export async function initServerKeys(): Promise<void> {
  if (!serverX25519Key) {
    serverX25519Key = await generateX25519KeyPair();
  }
  if (!serverEd25519Key) {
    serverEd25519Key = await generateEd25519KeyPair();
  }
}

/**
 * Encrypt response for client
 * @param plaintext Response data to encrypt
 * @param recipientPublicKey Client's X25519 public key (from bearer token registry)
 * @returns Base64url-encoded encrypted envelope
 */
export async function encryptResponse(
  plaintext: unknown,
  recipientPublicKey: Uint8Array
): Promise<string> {
  if (!serverX25519Key || !serverEd25519Key) {
    await initServerKeys();
  }

  const payload = JSON.stringify(plaintext);
  const payloadBytes = new TextEncoder().encode(payload);

  const envelope = await encryptEnvelope(
    payloadBytes,
    recipientPublicKey,
    serverEd25519Key!
  );

  // Serialize to base64url
  return serializeEnvelope(envelope);
}

/**
 * Serialize encrypted envelope to base64url
 */
function serializeEnvelope(envelope: {
  ciphertext: Uint8Array;
  encryptedKey: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  nonce: Uint8Array;
  signature: Uint8Array;
  signerPublicKey: Uint8Array;
}): string {
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
 * Base64url encode
 */
function base64UrlEncode(data: Uint8Array): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Get server's public key for encryption (X25519)
 */
export function getServerPublicKey(): Uint8Array | null {
  return serverX25519Key?.publicKey || null;
}

