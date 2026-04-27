/**
 * Unit tests for `src/cli/aauth_tbs_attestation.ts`.
 *
 * The native Windows TBS binding is intentionally optional and only
 * resolves on Windows hosts with the Microsoft Platform Crypto Provider
 * + a usable TPM 2.0 chip. These tests mock the binding via
 * {@link __setTbsBindingForTesting} so the helper surface can be
 * exercised on every host (including macOS dev machines, Linux CI
 * runners, and Windows hosts without TPM hardware).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __setTbsBindingForTesting,
  buildTbsAttestationEnvelope,
  computeAttestationChallenge,
  isTbsBackendAvailable,
  TbsBackendUnavailableError,
} from "../../src/cli/aauth_tbs_attestation.js";

describe("aauth_tbs_attestation", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    __setTbsBindingForTesting(null);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    __setTbsBindingForTesting(null);
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

  describe("isTbsBackendAvailable", () => {
    it("returns supported=false on non-windows hosts", () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });
      const probe = isTbsBackendAvailable();
      expect(probe.supported).toBe(false);
      expect(probe.reason).toMatch(/non-windows/);
    });

    it("delegates to the binding's probe when one is available", () => {
      const isSupported = vi.fn(() => ({ supported: true }));
      __setTbsBindingForTesting({
        isSupported,
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      const probe = isTbsBackendAvailable();
      expect(probe).toEqual({ supported: true });
      expect(isSupported).toHaveBeenCalledOnce();
    });

    it("converts thrown probe errors into structured reasons", () => {
      __setTbsBindingForTesting({
        isSupported: () => {
          throw new Error("MS_PLATFORM_KEY_STORAGE_PROVIDER unavailable");
        },
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      const probe = isTbsBackendAvailable();
      expect(probe).toEqual({
        supported: false,
        reason: "MS_PLATFORM_KEY_STORAGE_PROVIDER unavailable",
      });
    });
  });

  describe("buildTbsAttestationEnvelope", () => {
    it("throws TbsBackendUnavailableError when the binding is unavailable", () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });
      expect(() =>
        buildTbsAttestationEnvelope({
          keyName: "neotoma-aauth-key",
          iss: "https://issuer.example",
          sub: "agent:test",
          iat: 1700000000,
          jkt: "deadbeef",
        }),
      ).toThrow(TbsBackendUnavailableError);
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
      __setTbsBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest,
      });

      const envelope = buildTbsAttestationEnvelope({
        keyName: "neotoma-aauth-key",
        provider: "Microsoft Platform Crypto Provider",
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
        jkt: "thumb-print-base64url",
      });

      expect(attest).toHaveBeenCalledWith({
        keyName: "neotoma-aauth-key",
        provider: "Microsoft Platform Crypto Provider",
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
      __setTbsBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest,
      });

      const envelope = buildTbsAttestationEnvelope({
        keyName: "neotoma-aauth-key-es",
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
        jkt: "jkt",
      });
      expect(envelope.statement.alg).toBe(-7);
    });

    it("rejects malformed attest() shapes (wrong format)", () => {
      __setTbsBindingForTesting({
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
        buildTbsAttestationEnvelope({
          keyName: "neotoma-aauth-key",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/unexpected attest\(\) shape/);
    });

    it("rejects unsupported alg values from the binding", () => {
      __setTbsBindingForTesting({
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
        buildTbsAttestationEnvelope({
          keyName: "neotoma-aauth-key",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/unsupported alg/);
    });
  });
});
