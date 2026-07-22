/**
 * Integration-style test: Google-verified identity -> local-auth user_id
 * resolution, exactly as `/mcp/oauth/google/callback` in `src/actions.ts`
 * wires the two modules together.
 *
 * Confirms the two load-bearing guarantees for this feature:
 *  1. An ALLOWLISTED, verified Google email resolves to a STABLE,
 *     non-dev user_id via the EXISTING per-email primitive
 *     (`createLocalAuthUser` / `hashEmailToUserId` in local_auth.ts) — the
 *     same primitive used elsewhere, not a new identity model.
 *  2. A verified-but-NON-allowlisted email is REJECTED by
 *     `verifyGoogleIdToken` before local_auth is ever consulted, so it is
 *     never admitted as the shared LOCAL_DEV_USER_ID (or any other
 *     identity) via the Google path.
 *
 * AUTH-LAYER ONLY: this test does not exercise, and the code under test
 * does not implement, any cross-user read/data-sharing behavior.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "fs";
import path from "path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const KID = "test-kid-identity";

const ENV_KEYS = ["NEOTOMA_GOOGLE_CLIENT_ID", "NEOTOMA_APPROVED_EMAILS"] as const;

async function loadGoogleOidcModule() {
  const moduleUrl = new URL("../../src/services/google_oidc.js", import.meta.url).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}${Math.floor(Math.random() * 1e9)}`);
}

async function loadLocalAuthModule(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  const moduleUrl = new URL("../../src/services/local_auth.js", import.meta.url).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}${Math.floor(Math.random() * 1e9)}`);
}

describe("Google identity resolution (auth-layer only)", () => {
  const original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  let privateKey: CryptoKey;
  let publicJwk: Record<string, unknown>;
  let restoreFetch: () => void;

  beforeEach(async () => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };

    const realFetch = global.fetch;
    global.fetch = (async () =>
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
    restoreFetch = () => {
      global.fetch = realFetch;
    };
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const v = original[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    restoreFetch();
  });

  async function signIdToken(email: string, emailVerified = true): Promise<string> {
    return new SignJWT({ email, email_verified: emailVerified })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuedAt()
      .setIssuer("https://accounts.google.com")
      .setAudience(CLIENT_ID)
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  it("resolves an allowlisted email to a stable, non-dev user_id", async () => {
    process.env.NEOTOMA_GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.NEOTOMA_APPROVED_EMAILS = "person@example.com";

    const googleOidc = await loadGoogleOidcModule();
    const tempDir = path.join(process.cwd(), "tmp", `neotoma-google-identity-${Date.now()}`);
    const localAuth = await loadLocalAuthModule(tempDir);

    const token = await signIdToken("person@example.com");
    const verified = await googleOidc.verifyGoogleIdToken(token);
    expect(verified.email).toBe("person@example.com");

    // This is the exact call the callback route makes: resolve the
    // verified email to a user_id via the EXISTING per-email primitive.
    const user = await localAuth.createLocalAuthUser(
      verified.email,
      "unused-throwaway-password"
    );

    expect(user.id).not.toBe(localAuth.LOCAL_DEV_USER_ID);
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // Stability: verifying + resolving again for the SAME email yields the
    // SAME user_id (same person signing in again gets the same identity).
    const tokenAgain = await signIdToken("person@example.com");
    const verifiedAgain = await googleOidc.verifyGoogleIdToken(tokenAgain);
    const userAgain = await localAuth.createLocalAuthUser(
      verifiedAgain.email,
      "different-unused-password"
    );
    expect(userAgain.id).toBe(user.id);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects a non-allowlisted verified email and never admits it as the dev user", async () => {
    process.env.NEOTOMA_GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.NEOTOMA_APPROVED_EMAILS = "person@example.com";

    const googleOidc = await loadGoogleOidcModule();
    const tempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-google-identity-rejected-${Date.now()}`
    );
    const localAuth = await loadLocalAuthModule(tempDir);

    const token = await signIdToken("stranger@example.com");

    // The rejection must happen in verifyGoogleIdToken itself — the
    // callback route never reaches createLocalAuthUser / ensureLocalDevUser
    // for a non-allowlisted email.
    await expect(googleOidc.verifyGoogleIdToken(token)).rejects.toMatchObject({
      code: "EMAIL_NOT_APPROVED",
    });

    // Confirm no local_auth user was created for the rejected email, and
    // that the shared dev user (what the OLD hardwired path always used)
    // remains untouched/distinct.
    expect(await localAuth.getLocalAuthUserByEmail("stranger@example.com")).toBeNull();
    const devUser = await localAuth.ensureLocalDevUser();
    expect(devUser.id).toBe(localAuth.LOCAL_DEV_USER_ID);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
