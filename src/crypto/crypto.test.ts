/**
 * Unit tests for crypto library
 */

import { describe, it, expect } from 'vitest';
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  deriveBearerToken,
  parseBearerToken,
  encryptEnvelope,
  decryptEnvelope,
  signMessage,
  verifySignature,
  signRequest,
  verifyRequest,
  exportKeyPair,
  importKeyPair,
  maskPrivateKey,
} from './index.js';

describe('Key Generation', () => {
  it('should generate X25519 keypair', async () => {
    const keyPair = await generateX25519KeyPair();
    expect(keyPair.type).toBe('x25519');
    expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.privateKey.length).toBe(32);
    expect(keyPair.publicKey.length).toBe(32);
  });

  it('should generate Ed25519 keypair', async () => {
    const keyPair = await generateEd25519KeyPair();
    expect(keyPair.type).toBe('ed25519');
    expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.privateKey.length).toBe(32);
    expect(keyPair.publicKey.length).toBe(32);
  });

  it('should generate different keypairs on each call', async () => {
    const keyPair1 = await generateX25519KeyPair();
    const keyPair2 = await generateX25519KeyPair();
    expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
    expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
  });
});

describe('Bearer Token', () => {
  it('should derive bearer token from public key', async () => {
    const keyPair = await generateEd25519KeyPair();
    const token = deriveBearerToken(keyPair.publicKey);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
  });

  it('should parse bearer token back to public key', async () => {
    const keyPair = await generateEd25519KeyPair();
    const token = deriveBearerToken(keyPair.publicKey);
    const parsed = parseBearerToken(token);
    expect(parsed).toEqual(keyPair.publicKey);
  });

  it('should handle round-trip encoding/decoding', async () => {
    const keyPair = await generateEd25519KeyPair();
    const token = deriveBearerToken(keyPair.publicKey);
    const parsed = parseBearerToken(token);
    const token2 = deriveBearerToken(parsed);
    expect(token).toBe(token2);
  });
});

describe('Envelope Encryption', () => {
  it('should encrypt and decrypt envelope', async () => {
    const x25519KeyPair = await generateX25519KeyPair();
    const ed25519KeyPair = await generateEd25519KeyPair();
    const plaintext = new TextEncoder().encode('Hello, Neotoma!');

    const envelope = await encryptEnvelope(
      plaintext,
      x25519KeyPair.publicKey,
      ed25519KeyPair
    );

    expect(envelope.ciphertext).toBeInstanceOf(Uint8Array);
    expect(envelope.encryptedKey).toBeInstanceOf(Uint8Array);
    expect(envelope.ephemeralPublicKey).toBeInstanceOf(Uint8Array);
    expect(envelope.nonce).toBeInstanceOf(Uint8Array);
    expect(envelope.signature).toBeInstanceOf(Uint8Array);
    expect(envelope.signerPublicKey).toBeInstanceOf(Uint8Array);

    const decrypted = await decryptEnvelope(
      envelope,
      x25519KeyPair.privateKey,
      ed25519KeyPair.publicKey
    );

    expect(decrypted).toEqual(plaintext);
    expect(new TextDecoder().decode(decrypted)).toBe('Hello, Neotoma!');
  });

  it('should fail decryption with wrong private key', async () => {
    const x25519KeyPair1 = await generateX25519KeyPair();
    const x25519KeyPair2 = await generateX25519KeyPair();
    const ed25519KeyPair = await generateEd25519KeyPair();
    const plaintext = new TextEncoder().encode('Test message');

    const envelope = await encryptEnvelope(
      plaintext,
      x25519KeyPair1.publicKey,
      ed25519KeyPair
    );

    await expect(
      decryptEnvelope(
        envelope,
        x25519KeyPair2.privateKey, // Wrong key
        ed25519KeyPair.publicKey
      )
    ).rejects.toThrow();
  });

  it('should fail decryption with tampered signature', async () => {
    const x25519KeyPair = await generateX25519KeyPair();
    const ed25519KeyPair = await generateEd25519KeyPair();
    const plaintext = new TextEncoder().encode('Test message');

    const envelope = await encryptEnvelope(
      plaintext,
      x25519KeyPair.publicKey,
      ed25519KeyPair
    );

    // Tamper with signature
    const tamperedEnvelope = {
      ...envelope,
      signature: new Uint8Array(envelope.signature.length).fill(0),
    };

    await expect(
      decryptEnvelope(
        tamperedEnvelope,
        x25519KeyPair.privateKey,
        ed25519KeyPair.publicKey
      )
    ).rejects.toThrow('Invalid envelope signature');
  });

  it('should handle large plaintext', async () => {
    const x25519KeyPair = await generateX25519KeyPair();
    const ed25519KeyPair = await generateEd25519KeyPair();
    const largePlaintext = new Uint8Array(10000).fill(42);

    const envelope = await encryptEnvelope(
      largePlaintext,
      x25519KeyPair.publicKey,
      ed25519KeyPair
    );

    const decrypted = await decryptEnvelope(
      envelope,
      x25519KeyPair.privateKey,
      ed25519KeyPair.publicKey
    );

    expect(decrypted).toEqual(largePlaintext);
  });
});

describe('Signatures', () => {
  it('should sign and verify message', async () => {
    const keyPair = await generateEd25519KeyPair();
    const message = new TextEncoder().encode('Test message');

    const signature = signMessage(message, keyPair.privateKey);
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64); // Ed25519 signature is 64 bytes

    const isValid = verifySignature(message, signature, keyPair.publicKey);
    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const keyPair = await generateEd25519KeyPair();
    const message = new TextEncoder().encode('Test message');
    const wrongSignature = new Uint8Array(64).fill(0);

    const isValid = verifySignature(message, wrongSignature, keyPair.publicKey);
    expect(isValid).toBe(false);
  });

  it('should reject signature for different message', async () => {
    const keyPair = await generateEd25519KeyPair();
    const message1 = new TextEncoder().encode('Message 1');
    const message2 = new TextEncoder().encode('Message 2');

    const signature = signMessage(message1, keyPair.privateKey);
    const isValid = verifySignature(message2, signature, keyPair.publicKey);
    expect(isValid).toBe(false);
  });
});

describe('Request Authentication', () => {
  it('should sign and verify request', async () => {
    const keyPair = await generateEd25519KeyPair();
    const body = '{"test": "data"}';

    const { signature, bearerToken } = signRequest(body, keyPair);
    expect(typeof signature).toBe('string');
    expect(typeof bearerToken).toBe('string');

    const isValid = verifyRequest(body, signature, bearerToken);
    expect(isValid).toBe(true);
  });

  it('should reject request with wrong signature', async () => {
    const keyPair = await generateEd25519KeyPair();
    const body = '{"test": "data"}';

    const { bearerToken } = signRequest(body, keyPair);
    const wrongSignature = 'invalid_signature';

    const isValid = verifyRequest(body, wrongSignature, bearerToken);
    expect(isValid).toBe(false);
  });

  it('should handle Uint8Array body', async () => {
    const keyPair = await generateEd25519KeyPair();
    const body = new Uint8Array([1, 2, 3, 4, 5]);

    const { signature, bearerToken } = signRequest(body, keyPair);
    const isValid = verifyRequest(body, signature, bearerToken);
    expect(isValid).toBe(true);
  });
});

describe('Key Export/Import', () => {
  it('should export and import X25519 keypair', async () => {
    const keyPair = await generateX25519KeyPair();
    const exported = exportKeyPair(keyPair);

    expect(exported.type).toBe('x25519');
    expect(typeof exported.privateKey).toBe('string');
    expect(typeof exported.publicKey).toBe('string');
    expect(typeof exported.exportedAt).toBe('string');

    const imported = importKeyPair(exported);
    expect(imported.type).toBe('x25519');
    expect(imported.privateKey).toEqual(keyPair.privateKey);
    expect(imported.publicKey).toEqual(keyPair.publicKey);
  });

  it('should export and import Ed25519 keypair', async () => {
    const keyPair = await generateEd25519KeyPair();
    const exported = exportKeyPair(keyPair);

    expect(exported.type).toBe('ed25519');
    expect(typeof exported.privateKey).toBe('string');
    expect(typeof exported.publicKey).toBe('string');

    const imported = importKeyPair(exported);
    expect(imported.type).toBe('ed25519');
    expect(imported.privateKey).toEqual(keyPair.privateKey);
    expect(imported.publicKey).toEqual(keyPair.publicKey);
  });

  it('should mask private key for display', () => {
    const privateKey = 'abcdefghijklmnopqrstuvwxyz1234567890';
    const masked = maskPrivateKey(privateKey);
    expect(masked).toBe('****7890');
    expect(masked.length).toBe(8);
  });

  it('should mask short private key', () => {
    const privateKey = 'abc';
    const masked = maskPrivateKey(privateKey);
    expect(masked).toBe('****');
  });

  it('should mask Uint8Array private key', async () => {
    const keyPair = await generateEd25519KeyPair();
    const exported = exportKeyPair(keyPair);
    const masked = maskPrivateKey(exported.privateKey);
    expect(masked).toMatch(/^\*\*\*\*/);
    expect(masked.length).toBeGreaterThan(4);
  });
});

describe('Integration: Full Flow', () => {
  it('should handle complete encryption/decryption flow', async () => {
    // Generate keypairs
    const x25519KeyPair = await generateX25519KeyPair();
    const ed25519KeyPair = await generateEd25519KeyPair();

    // Export keys for ChatGPT client
    const exported = exportKeyPair(ed25519KeyPair);
    expect(exported.type).toBe('ed25519');

    // Encrypt message
    const message = new TextEncoder().encode(JSON.stringify({ data: 'secret' }));
    const envelope = await encryptEnvelope(
      message,
      x25519KeyPair.publicKey,
      ed25519KeyPair
    );

    // Decrypt message
    const decrypted = await decryptEnvelope(
      envelope,
      x25519KeyPair.privateKey,
      ed25519KeyPair.publicKey
    );

    const decoded = JSON.parse(new TextDecoder().decode(decrypted));
    expect(decoded.data).toBe('secret');
  });

  it('should handle bearer token authentication flow', async () => {
    const keyPair = await generateEd25519KeyPair();
    const bearerToken = deriveBearerToken(keyPair.publicKey);

    // Simulate request signing
    const requestBody = JSON.stringify({ action: 'get', id: '123' });
    const { signature } = signRequest(requestBody, keyPair);

    // Simulate server verification
    const publicKey = parseBearerToken(bearerToken);
    const isValid = verifyRequest(requestBody, signature, bearerToken);
    expect(isValid).toBe(true);
  });
});

