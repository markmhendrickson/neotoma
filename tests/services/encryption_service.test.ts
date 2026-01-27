/**
 * Unit tests for Encryption Service
 * 
 * Tests encryption/decryption functionality.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initServerKeys,
  getServerPublicKey,
  encryptResponse,
} from "../../src/services/encryption_service.js";
import { generateX25519KeyPair } from "../../src/crypto/keys.js";

describe("Encryption Service", () => {
  beforeAll(async () => {
    await initServerKeys();
  });

  describe("initServerKeys", () => {
    it("should initialize server keys", async () => {
      await initServerKeys();
      
      const publicKey = getServerPublicKey();
      expect(publicKey).toBeDefined();
      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey!.length).toBe(32); // X25519 public key is 32 bytes
    });

    it("should be idempotent (multiple calls safe)", async () => {
      await initServerKeys();
      const key1 = getServerPublicKey();
      
      await initServerKeys();
      const key2 = getServerPublicKey();
      
      // Should return same key (not regenerate)
      expect(Buffer.from(key1!).toString("hex")).toBe(
        Buffer.from(key2!).toString("hex")
      );
    });
  });

  describe("getServerPublicKey", () => {
    it("should return public key after initialization", async () => {
      await initServerKeys();
      
      const publicKey = getServerPublicKey();
      
      expect(publicKey).toBeDefined();
      expect(publicKey).toBeInstanceOf(Uint8Array);
    });
  });

  describe("encryptResponse", () => {
    it("should encrypt plaintext for recipient", async () => {
      await initServerKeys();
      
      // Generate recipient key pair
      const recipientKeyPair = await generateX25519KeyPair();
      
      const plaintext = { message: "test data", value: 123 };
      
      const encrypted = await encryptResponse(plaintext, recipientKeyPair.publicKey);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it("should produce different ciphertext for different plaintexts", async () => {
      await initServerKeys();
      
      const recipientKeyPair = await generateX25519KeyPair();
      
      const encrypted1 = await encryptResponse(
        { message: "test1" },
        recipientKeyPair.publicKey
      );
      const encrypted2 = await encryptResponse(
        { message: "test2" },
        recipientKeyPair.publicKey
      );
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should produce different ciphertext for same plaintext (nonce randomness)", async () => {
      await initServerKeys();
      
      const recipientKeyPair = await generateX25519KeyPair();
      const plaintext = { message: "test" };
      
      const encrypted1 = await encryptResponse(plaintext, recipientKeyPair.publicKey);
      const encrypted2 = await encryptResponse(plaintext, recipientKeyPair.publicKey);
      
      // Different nonce means different ciphertext
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should handle empty object", async () => {
      await initServerKeys();
      
      const recipientKeyPair = await generateX25519KeyPair();
      
      const encrypted = await encryptResponse({}, recipientKeyPair.publicKey);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
    });

    it("should handle complex nested objects", async () => {
      await initServerKeys();
      
      const recipientKeyPair = await generateX25519KeyPair();
      const plaintext = {
        nested: {
          deep: {
            value: "test",
            array: [1, 2, 3],
          },
        },
      };
      
      const encrypted = await encryptResponse(plaintext, recipientKeyPair.publicKey);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
    });

    it("should produce base64url encoded output", async () => {
      await initServerKeys();
      
      const recipientKeyPair = await generateX25519KeyPair();
      
      const encrypted = await encryptResponse(
        { test: "data" },
        recipientKeyPair.publicKey
      );
      
      // Base64url should not contain +, /, or =
      expect(encrypted).not.toMatch(/[+/=]/);
      // Should only contain base64url characters
      expect(encrypted).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});
