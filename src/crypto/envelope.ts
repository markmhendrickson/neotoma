/**
 * Encrypted envelope implementation
 * Uses AES-GCM for payload encryption with ephemeral symmetric key
 * X25519 for key agreement (encrypting the symmetric key)
 * Ed25519 for envelope signing
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "@noble/hashes/utils.js";
import type { EncryptedEnvelope, Ed25519KeyPair } from "./types.js";

const AES_GCM_KEY_LENGTH = 32; // 256 bits
const AES_GCM_NONCE_LENGTH = 12; // 96 bits for GCM

/**
 * Encrypt data into an envelope
 * @param plaintext Data to encrypt
 * @param recipientPublicKey X25519 public key of recipient
 * @param signerKeyPair Ed25519 keypair for signing
 * @returns Encrypted envelope
 */
export async function encryptEnvelope(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array,
  signerKeyPair: Ed25519KeyPair
): Promise<EncryptedEnvelope> {
  // Generate ephemeral X25519 keypair for this encryption
  const ephemeralPrivateKey = x25519.utils.randomSecretKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);

  // Derive shared secret using X25519
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, recipientPublicKey);

  // Derive the AES-GCM content key from the X25519 shared secret via HKDF.
  //
  // SECURITY (Phase 2): the AES key is NOT transmitted. Both parties derive it
  // deterministically from the same ECDH shared secret + HKDF, so there is no key
  // to wrap. The previous implementation redundantly XOR-wrapped the AES key with
  // the raw shared secret ("simple XOR for now") and shipped it in `encryptedKey`
  // — homemade, unauthenticated key-wrap that added attack surface without adding
  // security (the recipient can already derive the key). Removing the wrap
  // eliminates that surface entirely; `deriveAESKey` uses HKDF-SHA256 with a
  // per-envelope salt bound to the ephemeral public key (see deriveAESKey).
  const aesKey = await deriveAESKey(sharedSecret, ephemeralPublicKey);

  // Generate nonce
  const nonce = randomBytes(AES_GCM_NONCE_LENGTH);

  // Encrypt plaintext with AES-GCM
  const ciphertext = await encryptAESGCM(plaintext, aesKey, nonce);

  // Create envelope (no wrapped key — the recipient re-derives it from the
  // shared secret + ephemeralPublicKey).
  const envelope: Omit<EncryptedEnvelope, "signature" | "signerPublicKey"> = {
    ciphertext,
    encryptedKey: new Uint8Array(0), // retained for wire-shape compat; no longer carries a key
    ephemeralPublicKey,
    nonce,
  };

  // Sign the envelope
  const envelopeBytes = serializeEnvelopeForSigning(envelope);
  const signature = await signMessage(envelopeBytes, signerKeyPair.privateKey);

  return {
    ...envelope,
    signature,
    signerPublicKey: signerKeyPair.publicKey,
  };
}

/**
 * Decrypt an envelope
 * @param envelope Encrypted envelope
 * @param recipientPrivateKey X25519 private key of recipient
 * @param signerPublicKey Ed25519 public key to verify signature
 * @returns Decrypted plaintext
 */
export async function decryptEnvelope(
  envelope: EncryptedEnvelope,
  recipientPrivateKey: Uint8Array,
  signerPublicKey: Uint8Array
): Promise<Uint8Array> {
  // Verify signature first
  const envelopeBytes = serializeEnvelopeForSigning(envelope);
  const isValid = await verifySignature(envelopeBytes, envelope.signature, signerPublicKey);
  if (!isValid) {
    throw new Error("Invalid envelope signature");
  }

  // Derive shared secret using X25519
  const sharedSecret = x25519.getSharedSecret(recipientPrivateKey, envelope.ephemeralPublicKey);

  // Re-derive the AES-GCM content key from the shared secret + ephemeral public
  // key (same HKDF the sender used). No wrapped key is transmitted.
  const aesKey = await deriveAESKey(sharedSecret, envelope.ephemeralPublicKey);

  // Decrypt plaintext with AES-GCM
  const plaintext = await decryptAESGCM(envelope.ciphertext, aesKey, envelope.nonce);

  return plaintext;
}

/**
 * Derive AES key from shared secret (simplified HKDF)
 */
async function deriveAESKey(sharedSecret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  // HKDF-SHA256 over the ECDH shared secret. The salt is the per-envelope
  // ephemeral X25519 public key (SECURITY, Phase 2: the prior implementation
  // used an empty salt; binding the salt to the ephemeral key domain-separates
  // each envelope's derived key). The key is not extractable — it never leaves
  // the crypto layer, since the wrapped-key path that required export is gone.
  const secretBuffer = new Uint8Array(sharedSecret).buffer;
  const keyMaterial = await crypto.subtle.importKey("raw", secretBuffer, { name: "HKDF" }, false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new Uint8Array(salt),
      info: new Uint8Array([0x6e, 0x65, 0x6f, 0x74, 0x6f, 0x6d, 0x61]), // "neotoma"
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_GCM_KEY_LENGTH * 8 },
    false, // non-extractable: the key is used in-place, never exported
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt with AES-GCM
 */
async function encryptAESGCM(
  plaintext: Uint8Array,
  key: CryptoKey,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const plaintextBuffer = new Uint8Array(plaintext).buffer;
  const nonceArray = new Uint8Array(nonce);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonceArray },
    key,
    plaintextBuffer as ArrayBuffer
  );
  return new Uint8Array(ciphertext);
}

/**
 * Decrypt with AES-GCM
 */
async function decryptAESGCM(
  ciphertext: Uint8Array,
  key: CryptoKey,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const ciphertextBuffer = new Uint8Array(ciphertext).buffer;
  const nonceArray = new Uint8Array(nonce);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonceArray },
    key,
    ciphertextBuffer as ArrayBuffer
  );
  return new Uint8Array(plaintext);
}

/**
 * Serialize envelope for signing (excludes signature fields)
 */
function serializeEnvelopeForSigning(
  envelope: Omit<EncryptedEnvelope, "signature" | "signerPublicKey">
): Uint8Array {
  const parts = [
    envelope.ciphertext,
    envelope.encryptedKey,
    envelope.ephemeralPublicKey,
    envelope.nonce,
  ];
  const totalLength = parts.reduce((sum, part) => sum + part.length + 4, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    // Write length (4 bytes, little-endian)
    const view = new DataView(result.buffer, offset, 4);
    view.setUint32(0, part.length, true);
    offset += 4;
    // Write data
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Sign message with Ed25519
 */
async function signMessage(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  const { ed25519 } = await import("@noble/curves/ed25519.js");
  return ed25519.sign(message, privateKey);
}

/**
 * Verify Ed25519 signature
 */
async function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  const { ed25519 } = await import("@noble/curves/ed25519.js");
  return ed25519.verify(signature, message, publicKey);
}
