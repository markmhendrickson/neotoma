/**
 * Types for encrypted envelopes and cryptographic operations
 */

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface X25519KeyPair extends KeyPair {
  type: 'x25519';
}

export interface Ed25519KeyPair extends KeyPair {
  type: 'ed25519';
}

export interface EncryptedEnvelope {
  /** Encrypted payload (AES-GCM ciphertext) */
  ciphertext: Uint8Array;
  /** Encrypted ephemeral symmetric key (X25519 encrypted) */
  encryptedKey: Uint8Array;
  /** Ephemeral public key used for key agreement */
  ephemeralPublicKey: Uint8Array;
  /** Nonce for AES-GCM */
  nonce: Uint8Array;
  /** Ed25519 signature of the envelope */
  signature: Uint8Array;
  /** Public key used for signing */
  signerPublicKey: Uint8Array;
}

export interface SignedMessage {
  message: Uint8Array;
  signature: Uint8Array;
  publicKey: Uint8Array;
}

export interface KeyExport {
  /** Base64url-encoded private key */
  privateKey: string;
  /** Base64url-encoded public key */
  publicKey: string;
  /** Key type */
  type: 'x25519' | 'ed25519';
  /** Timestamp when exported */
  exportedAt: string;
}

