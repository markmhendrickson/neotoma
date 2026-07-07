/**
 * Unit tests for `src/services/google_oidc.ts`.
 *
 * AUTH-LAYER ONLY scope: these tests exercise identity verification
 * (signature/issuer/audience/expiry/email_verified) and the approved-email
 * allowlist. They do NOT exercise, and this module does not implement,
 * any cross-user read/data-sharing behavior.
 *
 * Google's live JWKS endpoint is mocked via `global.fetch` (what jose's
 * `createRemoteJWKSet` uses internally) so tests stay hermetic and fast.
 * A real RSA keypair is generated per test file and used to sign test
 * id_tokens with `jose`'s `SignJWT`, mirroring how Google actually signs
 * id_tokens (RS256 + JWKS).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const ENV_KEYS = [
  "NEOTOMA_GOOGLE_CLIENT_ID",
  "NEOTOMA_GOOGLE_CLIENT_SECRET",
  "NEOTOMA_APPROVED_EMAILS",
] as const;

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const KID = "test-kid-1";

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;

async function signIdToken(overrides: {
  email?: string;
  email_verified?: boolean | string;
  iss?: string;
  aud?: string;
  expiresIn?: string;
  kid?: string;
}): Promise<string> {
  const {
    email = "approved@example.com",
    email_verified = true,
    iss = "https://accounts.google.com",
    aud = CLIENT_ID,
    expiresIn = "1h",
    kid = KID,
  } = overrides;

  return new SignJWT({ email, email_verified })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setIssuer(iss)
    .setAudience(aud)
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}

function mockFetchWithJwks() {
  const original = global.fetch;
  global.fetch = vi.fn(async () => {
    return new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return () => {
    global.fetch = original;
  };
}

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const key of ENV_KEYS) {
    if (key in values) {
      const v = values[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
}

let loadCounter = 0;
async function loadModule() {
  const moduleUrl = new URL("../../src/services/google_oidc.js", import.meta.url).href;
  loadCounter += 1;
  return import(`${moduleUrl}?cacheBust=${Date.now()}${loadCounter}`);
}

describe("google_oidc", () => {
  const original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  let restoreFetch: () => void;

  beforeEach(async () => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    if (!privateKey) {
      const pair = await generateKeyPair("RS256");
      privateKey = pair.privateKey;
      publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
    }
    restoreFetch = mockFetchWithJwks();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const v = original[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    restoreFetch();
  });

  describe("isGoogleSigninEnabled", () => {
    it("is false when neither env var is set", async () => {
      withEnv({ NEOTOMA_GOOGLE_CLIENT_ID: undefined, NEOTOMA_APPROVED_EMAILS: undefined });
      const mod = await loadModule();
      expect(mod.isGoogleSigninEnabled()).toBe(false);
    });

    it("is false when only client id is set", async () => {
      withEnv({ NEOTOMA_GOOGLE_CLIENT_ID: CLIENT_ID, NEOTOMA_APPROVED_EMAILS: undefined });
      const mod = await loadModule();
      expect(mod.isGoogleSigninEnabled()).toBe(false);
    });

    it("is false when only approved emails is set", async () => {
      withEnv({ NEOTOMA_GOOGLE_CLIENT_ID: undefined, NEOTOMA_APPROVED_EMAILS: "a@example.com" });
      const mod = await loadModule();
      expect(mod.isGoogleSigninEnabled()).toBe(false);
    });

    it("is true only when both are set", async () => {
      withEnv({ NEOTOMA_GOOGLE_CLIENT_ID: CLIENT_ID, NEOTOMA_APPROVED_EMAILS: "a@example.com" });
      const mod = await loadModule();
      expect(mod.isGoogleSigninEnabled()).toBe(true);
    });
  });

  describe("isEmailApproved (allowlist)", () => {
    it("matches case-insensitively and trims whitespace", async () => {
      withEnv({ NEOTOMA_APPROVED_EMAILS: " Approved@Example.com , other@example.com" });
      const mod = await loadModule();
      expect(mod.isEmailApproved("approved@example.com")).toBe(true);
      expect(mod.isEmailApproved("APPROVED@EXAMPLE.COM")).toBe(true);
      expect(mod.isEmailApproved("other@example.com")).toBe(true);
      expect(mod.isEmailApproved("nope@example.com")).toBe(false);
    });

    it("returns false when allowlist is unset", async () => {
      withEnv({ NEOTOMA_APPROVED_EMAILS: undefined });
      const mod = await loadModule();
      expect(mod.isEmailApproved("anyone@example.com")).toBe(false);
    });
  });

  describe("verifyGoogleIdToken", () => {
    beforeEach(() => {
      withEnv({
        NEOTOMA_GOOGLE_CLIENT_ID: CLIENT_ID,
        NEOTOMA_APPROVED_EMAILS: "approved@example.com",
      });
    });

    it("accepts a valid, verified, allowlisted token and returns the normalized email", async () => {
      const mod = await loadModule();
      const token = await signIdToken({ email: "Approved@Example.com" });
      const result = await mod.verifyGoogleIdToken(token);
      expect(result).toEqual({ email: "approved@example.com", emailVerified: true });
    });

    it("rejects a token with the wrong issuer", async () => {
      const mod = await loadModule();
      const token = await signIdToken({ iss: "https://evil.example" });
      await expect(mod.verifyGoogleIdToken(token)).rejects.toMatchObject({
        code: "BAD_ISSUER",
      });
    });

    it("accepts the alternate bare-hostname issuer form", async () => {
      const mod = await loadModule();
      const token = await signIdToken({ iss: "accounts.google.com" });
      const result = await mod.verifyGoogleIdToken(token);
      expect(result.email).toBe("approved@example.com");
    });

    it("rejects a token with the wrong audience", async () => {
      const mod = await loadModule();
      const token = await signIdToken({ aud: "someone-elses-client-id" });
      await expect(mod.verifyGoogleIdToken(token)).rejects.toMatchObject({
        code: "BAD_AUDIENCE",
      });
    });

    it("rejects an expired token", async () => {
      const mod = await loadModule();
      const token = await signIdToken({ expiresIn: "-1h" });
      await expect(mod.verifyGoogleIdToken(token)).rejects.toMatchObject({
        code: "EXPIRED",
      });
    });

    it("rejects a token whose signature does not match the JWKS (tampered/wrong key)", async () => {
      const mod = await loadModule();
      const otherPair = await generateKeyPair("RS256");
      const badToken = await new SignJWT({ email: "approved@example.com", email_verified: true })
        .setProtectedHeader({ alg: "RS256", kid: KID })
        .setIssuedAt()
        .setIssuer("https://accounts.google.com")
        .setAudience(CLIENT_ID)
        .setExpirationTime("1h")
        .sign(otherPair.privateKey);
      await expect(mod.verifyGoogleIdToken(badToken)).rejects.toMatchObject({
        code: "BAD_SIGNATURE",
      });
    });

    it("rejects when email_verified is false", async () => {
      const mod = await loadModule();
      const token = await signIdToken({ email: "approved@example.com", email_verified: false });
      await expect(mod.verifyGoogleIdToken(token)).rejects.toMatchObject({
        code: "EMAIL_NOT_VERIFIED",
      });
    });

    it("rejects a verified email that is NOT on the approved allowlist, without admitting the request", async () => {
      const mod = await loadModule();
      const token = await signIdToken({ email: "not-approved@example.com", email_verified: true });
      await expect(mod.verifyGoogleIdToken(token)).rejects.toMatchObject({
        code: "EMAIL_NOT_APPROVED",
      });
    });

    it("throws NOT_CONFIGURED when client id is unset", async () => {
      withEnv({ NEOTOMA_GOOGLE_CLIENT_ID: undefined });
      const mod = await loadModule();
      const token = await signIdToken({});
      await expect(mod.verifyGoogleIdToken(token)).rejects.toMatchObject({
        code: "NOT_CONFIGURED",
      });
    });
  });

  describe("createGoogleSigninNonce / consumeGoogleSigninNonce", () => {
    it("round-trips the next path and is single-use", async () => {
      const mod = await loadModule();
      const nonce = mod.createGoogleSigninNonce("/mcp/oauth/authorize?foo=bar");
      const first = mod.consumeGoogleSigninNonce(nonce);
      expect(first).toEqual({ next: "/mcp/oauth/authorize?foo=bar" });

      const second = mod.consumeGoogleSigninNonce(nonce);
      expect(second).toBeNull();
    });

    it("returns null for an unknown nonce", async () => {
      const mod = await loadModule();
      expect(mod.consumeGoogleSigninNonce("never-issued")).toBeNull();
    });
  });

  describe("buildGoogleAuthorizeUrl", () => {
    it("builds a well-formed Google authorize URL with required params", async () => {
      withEnv({ NEOTOMA_GOOGLE_CLIENT_ID: CLIENT_ID });
      const mod = await loadModule();
      const url = new URL(
        mod.buildGoogleAuthorizeUrl({
          redirectUri: "https://neotoma.example/mcp/oauth/google/callback",
          nonce: "nonce-abc",
        })
      );
      expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://neotoma.example/mcp/oauth/google/callback"
      );
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBe("openid email");
      expect(url.searchParams.get("state")).toBe("nonce-abc");
    });

    it("throws NOT_CONFIGURED when client id is unset", async () => {
      withEnv({ NEOTOMA_GOOGLE_CLIENT_ID: undefined });
      const mod = await loadModule();
      expect(() =>
        mod.buildGoogleAuthorizeUrl({ redirectUri: "https://x/callback", nonce: "n" })
      ).toThrow(/NOT_CONFIGURED|NEOTOMA_GOOGLE_CLIENT_ID/);
    });
  });
});
