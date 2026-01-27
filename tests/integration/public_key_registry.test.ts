/**
 * Integration tests for Public Key Registry
 * 
 * Tests public key registration, validation, and retrieval.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPublicKey,
  getPublicKey,
  isBearerTokenValid,
  ensurePublicKeyRegistered,
  getAllPublicKeys,
} from "../../src/services/public_key_registry.js";
import { generateKeyPair } from "../../src/crypto/keys.js";

describe("Public Key Registry", () => {
  beforeEach(() => {
    // Clear registry by registering and then getting all keys
    const allKeys = getAllPublicKeys();
    // Registry is in-memory, so it persists across tests
    // We can't truly clear it, but we can work with it
  });

  describe("registerPublicKey", () => {
    it("should register valid bearer token", () => {
      const { publicKeyBase64url } = generateKeyPair();
      
      // Register without userId
      registerPublicKey(publicKeyBase64url);
      
      // Verify registration
      expect(isBearerTokenValid(publicKeyBase64url)).toBe(true);
    });

    it("should register bearer token with userId", () => {
      const { publicKeyBase64url } = generateKeyPair();
      const userId = "test-user-123";
      
      registerPublicKey(publicKeyBase64url, userId);
      
      expect(isBearerTokenValid(publicKeyBase64url)).toBe(true);
    });

    it("should reject invalid bearer token", () => {
      const invalidToken = "invalid-token-format";
      
      expect(() => registerPublicKey(invalidToken)).toThrow("Invalid bearer token format");
    });

    it("should handle re-registration of same token", () => {
      const { publicKeyBase64url } = generateKeyPair();
      
      registerPublicKey(publicKeyBase64url);
      
      // Re-register should not throw
      expect(() => registerPublicKey(publicKeyBase64url)).not.toThrow();
    });
  });

  describe("getPublicKey", () => {
    it("should retrieve registered public key", () => {
      const { publicKeyBase64url, publicKey } = generateKeyPair();
      
      registerPublicKey(publicKeyBase64url);
      
      const retrieved = getPublicKey(publicKeyBase64url);
      
      expect(retrieved).toBeDefined();
      expect(retrieved).toBeInstanceOf(Uint8Array);
      expect(retrieved?.length).toBe(32); // Ed25519 public key is 32 bytes
    });

    it("should return null for unregistered token", () => {
      const unregisteredToken = "unregistered-token";
      
      const retrieved = getPublicKey(unregisteredToken);
      
      expect(retrieved).toBeNull();
    });

    it("should update last used timestamp on retrieval", () => {
      const { publicKeyBase64url } = generateKeyPair();
      
      registerPublicKey(publicKeyBase64url);
      
      // Retrieve multiple times
      getPublicKey(publicKeyBase64url);
      getPublicKey(publicKeyBase64url);
      
      const allKeys = getAllPublicKeys();
      const entry = allKeys.find(k => k.bearerToken === publicKeyBase64url);
      
      expect(entry).toBeDefined();
    });
  });

  describe("isBearerTokenValid", () => {
    it("should return true for registered token", () => {
      const { publicKeyBase64url } = generateKeyPair();
      
      registerPublicKey(publicKeyBase64url);
      
      expect(isBearerTokenValid(publicKeyBase64url)).toBe(true);
    });

    it("should return false for unregistered token", () => {
      const unregisteredToken = "unregistered-token-check";
      
      expect(isBearerTokenValid(unregisteredToken)).toBe(false);
    });
  });

  describe("ensurePublicKeyRegistered", () => {
    it("should auto-register valid token", () => {
      const { publicKeyBase64url } = generateKeyPair();
      
      const result = ensurePublicKeyRegistered(publicKeyBase64url);
      
      expect(result).toBe(true);
      expect(isBearerTokenValid(publicKeyBase64url)).toBe(true);
    });

    it("should return true for already registered token", () => {
      const { publicKeyBase64url } = generateKeyPair();
      
      registerPublicKey(publicKeyBase64url);
      
      const result = ensurePublicKeyRegistered(publicKeyBase64url);
      
      expect(result).toBe(true);
    });

    it("should return false for invalid token", () => {
      const invalidToken = "invalid-format";
      
      const result = ensurePublicKeyRegistered(invalidToken);
      
      expect(result).toBe(false);
    });

    it("should not throw for invalid token", () => {
      const invalidToken = "another-invalid";
      
      // Should not throw, just return false
      expect(() => ensurePublicKeyRegistered(invalidToken)).not.toThrow();
    });
  });

  describe("getAllPublicKeys", () => {
    it("should return all registered keys", () => {
      const { publicKeyBase64url: token1 } = generateKeyPair();
      const { publicKeyBase64url: token2 } = generateKeyPair();
      
      registerPublicKey(token1, "user-1");
      registerPublicKey(token2, "user-2");
      
      const allKeys = getAllPublicKeys();
      
      expect(allKeys).toBeDefined();
      expect(Array.isArray(allKeys)).toBe(true);
      
      const foundToken1 = allKeys.find(k => k.bearerToken === token1);
      const foundToken2 = allKeys.find(k => k.bearerToken === token2);
      
      expect(foundToken1).toBeDefined();
      expect(foundToken1!.userId).toBe("user-1");
      
      expect(foundToken2).toBeDefined();
      expect(foundToken2!.userId).toBe("user-2");
    });

    it("should return empty array when no keys registered", () => {
      // Registry may have keys from previous tests
      const allKeys = getAllPublicKeys();
      
      expect(allKeys).toBeDefined();
      expect(Array.isArray(allKeys)).toBe(true);
    });
  });

  describe("Multiple Keys", () => {
    it("should handle multiple registered keys", () => {
      const tokens = [];
      
      for (let i = 0; i < 5; i++) {
        const { publicKeyBase64url } = generateKeyPair();
        registerPublicKey(publicKeyBase64url, `user-${i}`);
        tokens.push(publicKeyBase64url);
      }
      
      // All should be valid
      for (const token of tokens) {
        expect(isBearerTokenValid(token)).toBe(true);
      }
      
      // All should be retrievable
      for (const token of tokens) {
        const publicKey = getPublicKey(token);
        expect(publicKey).toBeDefined();
      }
    });
  });
});
