/**
 * Key export/import utilities for sharing keys with ChatGPT client
 */

import type { KeyExport, X25519KeyPair, Ed25519KeyPair } from './types.js';

/**
 * Export keypair to JSON format for sharing
 */
export function exportKeyPair(
  keyPair: X25519KeyPair | Ed25519KeyPair
): KeyExport {
  return {
    privateKey: base64UrlEncode(keyPair.privateKey),
    publicKey: base64UrlEncode(keyPair.publicKey),
    type: keyPair.type,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Export both X25519 and Ed25519 key pairs together
 */
export function exportKeyPairs(
  x25519KeyPair: X25519KeyPair,
  ed25519KeyPair: Ed25519KeyPair
): { x25519: KeyExport; ed25519: KeyExport } {
  return {
    x25519: exportKeyPair(x25519KeyPair),
    ed25519: exportKeyPair(ed25519KeyPair),
  };
}

/**
 * Import both X25519 and Ed25519 key pairs from exported format
 */
export function importKeyPairs(exported: { x25519: KeyExport; ed25519: KeyExport }): {
  x25519: X25519KeyPair;
  ed25519: Ed25519KeyPair;
} {
  return {
    x25519: importKeyPair(exported.x25519) as X25519KeyPair,
    ed25519: importKeyPair(exported.ed25519) as Ed25519KeyPair,
  };
}

/**
 * Import keypair from JSON format
 * Validates key format and structure for security
 */
export function importKeyPair(exported: KeyExport): X25519KeyPair | Ed25519KeyPair {
  // Validate export structure
  if (!exported || typeof exported !== 'object') {
    throw new Error('Invalid key export: must be an object');
  }

  if (exported.type !== 'x25519' && exported.type !== 'ed25519') {
    throw new Error(`Invalid key type: ${exported.type}. Must be 'x25519' or 'ed25519'`);
  }

  if (typeof exported.privateKey !== 'string' || typeof exported.publicKey !== 'string') {
    throw new Error('Invalid key export: privateKey and publicKey must be strings');
  }

  if (!exported.exportedAt || typeof exported.exportedAt !== 'string') {
    throw new Error('Invalid key export: exportedAt must be a string');
  }

  try {
    const privateKey = base64UrlDecode(exported.privateKey);
    const publicKey = base64UrlDecode(exported.publicKey);

    // Validate key lengths (both X25519 and Ed25519 use 32-byte keys)
    if (privateKey.length !== 32 || publicKey.length !== 32) {
      throw new Error('Invalid key length: keys must be 32 bytes');
    }

    if (exported.type === 'x25519') {
      return { type: 'x25519', privateKey, publicKey };
    } else {
      return { type: 'ed25519', privateKey, publicKey };
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to decode keys: invalid base64url encoding');
  }
}

/**
 * Mask private key for display (shows last 4 characters)
 */
export function maskPrivateKey(privateKey: string | Uint8Array): string {
  const str = typeof privateKey === 'string' ? privateKey : base64UrlEncode(privateKey);
  if (str.length <= 4) return '****';
  return '****' + str.slice(-4);
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

