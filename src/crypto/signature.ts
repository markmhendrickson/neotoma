/**
 * Ed25519 signature utilities for request authentication
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import type { SignedMessage } from './types.js';

/**
 * Sign a message with Ed25519 private key
 */
export function signMessage(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

/**
 * Verify Ed25519 signature
 */
export function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return ed25519.verify(signature, message, publicKey);
}

/**
 * Create signed message structure
 */
export function createSignedMessage(
  message: Uint8Array,
  privateKey: Uint8Array,
  publicKey: Uint8Array
): SignedMessage {
  const signature = signMessage(message, privateKey);
  return {
    message,
    signature,
    publicKey,
  };
}

/**
 * Verify signed message
 */
export function verifySignedMessage(signed: SignedMessage): boolean {
  return verifySignature(signed.message, signed.signature, signed.publicKey);
}

