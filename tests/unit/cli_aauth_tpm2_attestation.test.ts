/**
 * Unit tests for `src/cli/aauth_tpm2_attestation.ts`.
 *
 * The native TPM 2.0 binding is intentionally optional and only
 * resolves on Linux hosts with `libtss2` + `/dev/tpmrm0`. These tests
 * mock the binding via {@link __setTpm2BindingForTesting} so the helper
 * surface can be exercised on every host (including macOS dev machines
 * and CI runners without TPM hardware).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __setTpm2BindingForTesting,
  buildTpm2AttestationEnvelope,
  computeAttestationChallenge,
  isTpm2BackendAvailable,
  Tpm2BackendUnavailableError,
} from "../../src/cli/aauth_tpm2_attestation.js";

describe("aauth_tpm2_attestation", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });
    __setTpm2BindingForTesting(null);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    __setTpm2BindingForTesting(null);
  });

  describe("computeAttestationChallenge", () => {
    it("returns a base64url SHA-256(iss || sub || iat) digest", () => {
      const out = computeAttestationChallenge({
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
      });
      expect(typeof out).toBe("string");
      expect(out).not.toContain("=");
      expect(out).not.toContain("+");
      expect(out).not.toContain("/");
      expect(out.length).toBeGreaterThan(0);
    });

    it("is deterministic for stable inputs", () => {
      const a = computeAttestationChallenge({
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
      });
      const b = computeAttestationChallenge({
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
      });
      expect(a).toEqual(b);
    });
  });

  describe("isTpm2BackendAvailable", () => {
    it("returns supported=false on non-linux hosts", () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });
      const probe = isTpm2BackendAvailable();
      expect(probe.supported).toBe(false);
      expect(probe.reason).toMatch(/non-linux/);
    });

    it("delegates to the binding's probe when one is available", () => {
      const isSupported = vi.fn(() => ({ supported: true }));
      __setTpm2BindingForTesting({
        isSupported,
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      const probe = isTpm2BackendAvailable();
      expect(probe).toEqual({ supported: true });
      expect(isSupported).toHaveBeenCalledOnce();
    });

    it("converts thrown probe errors into structured reasons", () => {
      __setTpm2BindingForTesting({
        isSupported: () => {
          throw new Error("libtss2 unavailable");
        },
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      const probe = isTpm2BackendAvailable();
      expect(probe).toEqual({
        supported: false,
        reason: "libtss2 unavailable",
      });
    });
  });

  describe("buildTpm2AttestationEnvelope", () => {
    it("throws Tpm2BackendUnavailableError when the binding is unavailable", () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });
      expect(() =>
        buildTpm2AttestationEnvelope({
          handle: "0x81000000",
          iss: "https://issuer.example",
          sub: "agent:test",
          iat: 1700000000,
          jkt: "deadbeef",
        }),
      ).toThrow(Tpm2BackendUnavailableError);
    });

    it("wraps the binding's attest() output into the FU-3 envelope shape", () => {
      const expectedChallenge = computeAttestationChallenge({
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
      });
      const attest = vi.fn(() => ({
        format: "tpm2" as const,
        ver: "2.0" as const,
        alg: "RS256" as const,
        x5c: ["leaf-der", "root-der"],
        sig: "sig-b64",
        certInfo: "cert-info-b64",
        pubArea: "pub-area-b64",
      }));
      __setTpm2BindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest,
      });

      const envelope = buildTpm2AttestationEnvelope({
        handle: "0x81000000",
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
        jkt: "thumb-print-base64url",
      });

      expect(attest).toHaveBeenCalledWith({
        handle: "0x81000000",
        challenge: expectedChallenge,
        jkt: "thumb-print-base64url",
      });
      expect(envelope).toEqual({
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -257,
          x5c: ["leaf-der", "root-der"],
          sig: "sig-b64",
          certInfo: "cert-info-b64",
          pubArea: "pub-area-b64",
        },
        challenge: expectedChallenge,
        key_binding_jkt: "thumb-print-base64url",
      });
    });

    it("maps ES256 attest output to COSE alg -7", () => {
      const attest = vi.fn(() => ({
        format: "tpm2" as const,
        ver: "2.0" as const,
        alg: "ES256" as const,
        x5c: ["leaf"],
        sig: "s",
        certInfo: "c",
        pubArea: "p",
      }));
      __setTpm2BindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest,
      });

      const envelope = buildTpm2AttestationEnvelope({
        handle: "0x81000001",
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
        jkt: "jkt",
      });
      expect(envelope.statement.alg).toBe(-7);
    });

    it("rejects malformed attest() shapes (wrong format)", () => {
      __setTpm2BindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest: () =>
          ({
            format: "wrong",
            ver: "2.0",
            alg: "RS256",
            x5c: [],
            sig: "",
            certInfo: "",
            pubArea: "",
          }) as never,
      });
      expect(() =>
        buildTpm2AttestationEnvelope({
          handle: "0x81000000",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/unexpected attest\(\) shape/);
    });

    it("rejects unsupported alg values from the binding", () => {
      __setTpm2BindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest: () =>
          ({
            format: "tpm2",
            ver: "2.0",
            alg: "EdDSA",
            x5c: [],
            sig: "",
            certInfo: "",
            pubArea: "",
          }) as never,
      });
      expect(() =>
        buildTpm2AttestationEnvelope({
          handle: "0x81000000",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/unsupported alg/);
    });
  });
});
