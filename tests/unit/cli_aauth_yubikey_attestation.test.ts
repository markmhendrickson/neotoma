/**
 * Unit tests for `src/cli/aauth_yubikey_attestation.ts`.
 *
 * The native YubiKey binding is intentionally optional and only
 * resolves on hosts with `libykcs11` installed and a YubiKey 5 series
 * device connected. These tests mock the binding via
 * {@link __setYubikeyBindingForTesting} so the helper surface can be
 * exercised on every host (including macOS dev machines without a
 * connected YubiKey, Linux CI runners without yubico-piv-tool, and
 * Windows hosts without YubiKey Manager).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __setYubikeyBindingForTesting,
  buildYubikeyAttestationEnvelope,
  computeAttestationChallenge,
  isYubikeyBackendAvailable,
  YubikeyBackendUnavailableError,
} from "../../src/cli/aauth_yubikey_attestation.js";

describe("aauth_yubikey_attestation", () => {
  beforeEach(() => {
    __setYubikeyBindingForTesting(null);
  });

  afterEach(() => {
    __setYubikeyBindingForTesting(null);
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

    it("matches the helper used by FU-4 and FU-5 for the same inputs", async () => {
      // Both FU-4 (TPM2) and FU-5 (TBS) export a helper with the same
      // contract; we cross-check shape compatibility here so a future
      // refactor that consolidates the three helpers does not break
      // server-side challenge derivation.
      const tbs = await import("../../src/cli/aauth_tbs_attestation.js");
      const tpm2 = await import("../../src/cli/aauth_tpm2_attestation.js");
      const args = {
        iss: "https://issuer.example",
        sub: "agent:cross-check",
        iat: 1700000000,
      };
      const yubikey = computeAttestationChallenge(args);
      expect(tbs.computeAttestationChallenge(args)).toEqual(yubikey);
      expect(tpm2.computeAttestationChallenge(args)).toEqual(yubikey);
    });
  });

  describe("isYubikeyBackendAvailable", () => {
    it("returns supported=false when no binding is installed", () => {
      // No binding installed; the helper should report a structured
      // failure mode rather than throwing.
      const probe = isYubikeyBackendAvailable();
      expect(probe.supported).toBe(false);
      expect(typeof probe.reason).toBe("string");
      expect(probe.reason!.length).toBeGreaterThan(0);
    });

    it("delegates to the binding's probe when one is available", () => {
      const isSupported = vi.fn(() => ({ supported: true }));
      __setYubikeyBindingForTesting({
        isSupported,
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      const probe = isYubikeyBackendAvailable();
      expect(probe).toEqual({ supported: true });
      expect(isSupported).toHaveBeenCalledOnce();
    });

    it("forwards pkcs11Path override to the binding's probe", () => {
      const isSupported = vi.fn(() => ({ supported: true }));
      __setYubikeyBindingForTesting({
        isSupported,
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      isYubikeyBackendAvailable({ pkcs11Path: "/opt/yubico/libykcs11.so" });
      expect(isSupported).toHaveBeenCalledWith({
        pkcs11Path: "/opt/yubico/libykcs11.so",
      });
    });

    it("converts thrown probe errors into structured reasons", () => {
      __setYubikeyBindingForTesting({
        isSupported: () => {
          throw new Error("libykcs11 not loadable");
        },
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      const probe = isYubikeyBackendAvailable();
      expect(probe).toEqual({
        supported: false,
        reason: "libykcs11 not loadable",
      });
    });

    it("does not gate on process.platform (cross-platform binding)", () => {
      // Unlike isTbsBackendAvailable / isTpm2BackendAvailable, the
      // YubiKey probe is portable across darwin / linux / win32 — the
      // YubiKey is an external USB device. We assert this by mocking
      // the binding to return supported=true regardless of platform.
      const isSupported = vi.fn(() => ({ supported: true }));
      __setYubikeyBindingForTesting({
        isSupported,
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      const originalPlatform = process.platform;
      try {
        for (const platform of ["darwin", "linux", "win32"] as const) {
          Object.defineProperty(process, "platform", {
            value: platform,
            configurable: true,
          });
          expect(isYubikeyBackendAvailable().supported).toBe(true);
        }
      } finally {
        Object.defineProperty(process, "platform", {
          value: originalPlatform,
          configurable: true,
        });
      }
    });
  });

  describe("buildYubikeyAttestationEnvelope", () => {
    it("throws YubikeyBackendUnavailableError when the binding is unavailable", () => {
      expect(() =>
        buildYubikeyAttestationEnvelope({
          slot: "9c",
          iss: "https://issuer.example",
          sub: "agent:test",
          iat: 1700000000,
          jkt: "deadbeef",
        }),
      ).toThrow(YubikeyBackendUnavailableError);
    });

    it("rejects unsupported PIV slot overrides", () => {
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest: vi.fn(),
      });
      expect(() =>
        buildYubikeyAttestationEnvelope({
          // @ts-expect-error: deliberately exercising the runtime gate
          slot: "9a",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/9a|YUBIKEY_SLOT_UNSUPPORTED/);
    });

    it("wraps the binding's attest() output into the FU-2 envelope shape", () => {
      const expectedChallenge = computeAttestationChallenge({
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
      });
      const attest = vi.fn(() => ({
        format: "packed" as const,
        alg: -7,
        sig: "sig-b64",
        x5c: ["leaf-der", "intermediate-der"],
        aaguid: "yubikey-5-aaguid",
      }));
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest,
      });

      const envelope = buildYubikeyAttestationEnvelope({
        slot: "9c",
        iss: "https://issuer.example",
        sub: "agent:test",
        iat: 1700000000,
        jkt: "thumb-print-base64url",
        pkcs11Path: "/opt/yubico/libykcs11.so",
      });

      expect(attest).toHaveBeenCalledWith({
        pkcs11Path: "/opt/yubico/libykcs11.so",
        slot: "9c",
        challenge: expectedChallenge,
        jkt: "thumb-print-base64url",
        pin: undefined,
        serial: undefined,
      });
      expect(envelope).toEqual({
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig: "sig-b64",
          x5c: ["leaf-der", "intermediate-der"],
        },
        challenge: expectedChallenge,
        key_binding_jkt: "thumb-print-base64url",
        aaguid: "yubikey-5-aaguid",
      });
    });

    it("forwards pin and serial to the binding without persisting them", () => {
      const attest = vi.fn(() => ({
        format: "packed" as const,
        alg: -7,
        sig: "sig",
        x5c: ["leaf"],
        aaguid: "aaguid",
      }));
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest,
      });
      buildYubikeyAttestationEnvelope({
        slot: "9c",
        iss: "i",
        sub: "s",
        iat: 0,
        jkt: "j",
        pin: "123456",
        serial: "12345678",
      });
      expect(attest).toHaveBeenCalledWith(
        expect.objectContaining({
          pin: "123456",
          serial: "12345678",
        }),
      );
    });

    it("defaults slot to 9c when omitted", () => {
      const attest = vi.fn(() => ({
        format: "packed" as const,
        alg: -7,
        sig: "sig",
        x5c: ["leaf"],
        aaguid: "aaguid",
      }));
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest,
      });
      buildYubikeyAttestationEnvelope({
        iss: "i",
        sub: "s",
        iat: 0,
        jkt: "j",
      });
      expect(attest).toHaveBeenCalledWith(
        expect.objectContaining({ slot: "9c" }),
      );
    });

    it("rejects malformed attest() shapes (wrong format)", () => {
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest: () =>
          ({
            format: "tpm2",
            alg: -7,
            sig: "s",
            x5c: ["leaf"],
            aaguid: "a",
          }) as never,
      });
      expect(() =>
        buildYubikeyAttestationEnvelope({
          slot: "9c",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/unexpected attest\(\) format/);
    });

    it("rejects empty x5c chains", () => {
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest: () => ({
          format: "packed" as const,
          alg: -7,
          sig: "s",
          x5c: [],
          aaguid: "a",
        }),
      });
      expect(() =>
        buildYubikeyAttestationEnvelope({
          slot: "9c",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/empty or non-array x5c/);
    });

    it("rejects empty signatures", () => {
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest: () => ({
          format: "packed" as const,
          alg: -7,
          sig: "",
          x5c: ["leaf"],
          aaguid: "a",
        }),
      });
      expect(() =>
        buildYubikeyAttestationEnvelope({
          slot: "9c",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/empty signature/);
    });

    it("rejects empty AAGUIDs", () => {
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest: () => ({
          format: "packed" as const,
          alg: -7,
          sig: "s",
          x5c: ["leaf"],
          aaguid: "",
        }),
      });
      expect(() =>
        buildYubikeyAttestationEnvelope({
          slot: "9c",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/empty AAGUID/);
    });

    it("rejects non-numeric alg values from the binding", () => {
      __setYubikeyBindingForTesting({
        isSupported: () => ({ supported: true }),
        generateKey: vi.fn(),
        attest: () =>
          ({
            format: "packed",
            alg: "ES256",
            sig: "s",
            x5c: ["leaf"],
            aaguid: "a",
          }) as never,
      });
      expect(() =>
        buildYubikeyAttestationEnvelope({
          slot: "9c",
          iss: "i",
          sub: "s",
          iat: 0,
          jkt: "j",
        }),
      ).toThrow(/unexpected attest\(\) alg/);
    });
  });
});
