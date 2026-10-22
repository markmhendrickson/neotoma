/**
 * Drive the real Google sign-in flow against a booted app, stubbing only the
 * two outbound Google calls (the JWKS fetch and the authorization-code
 * exchange). `verifyGoogleIdToken` runs for real against a locally generated
 * RS256 keypair, so signature, issuer, audience, email-verified and allowlist
 * checks are genuinely exercised.
 *
 * Same sequence as tests/integration/shared_graph_identity.test.ts (#2228):
 * /mcp/oauth/google/start -> /mcp/oauth/google/callback ->
 * /mcp/oauth/local-login -> /mcp/oauth/token. Factored out for the #2240
 * write-attribution tests, which need the same real session to exist before
 * they can write under it.
 */

import { randomUUID } from "node:crypto";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { expect } from "vitest";

import { createLocalAuthUser } from "../../src/services/local_auth.js";
import { createLocalAuthorizationRequest, generatePKCE } from "../../src/services/mcp_oauth.js";

export type GoogleSignInHarness = {
  /** Sign in as `email`; returns the bearer the resulting session issues. */
  signIn: (email: string) => Promise<{ accessToken: string; connectionId: string }>;
  /** Restore the real global fetch. */
  restoreFetch: () => void;
};

/**
 * The per-email user_id an email resolves to, via the SAME primitive the
 * callback uses, so a test cannot drift from local_auth's hashing.
 */
export async function perEmailUserId(email: string): Promise<string> {
  const user = await createLocalAuthUser(email, randomUUID());
  return user.id;
}

function readSetCookie(res: Response, name: string): string | undefined {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const [key, value] = (pair ?? "").split("=");
    if (key?.trim() === name) return value;
  }
  return undefined;
}

export async function createGoogleSignInHarness(options: {
  apiBase: () => string;
  clientId: string;
  kid?: string;
}): Promise<GoogleSignInHarness> {
  const kid = options.kid ?? `sign-in-harness-${randomUUID().slice(0, 8)}`;
  const pair = await generateKeyPair("RS256");
  const privateKey = pair.privateKey;
  const publicJwk = { ...(await exportJWK(pair.publicKey)), kid, alg: "RS256", use: "sig" };
  const realFetch = global.fetch;

  async function signIdToken(email: string): Promise<string> {
    return new SignJWT({ email, email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuedAt()
      .setIssuer("https://accounts.google.com")
      .setAudience(options.clientId)
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  function installGoogleFetchStub(email: string): void {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ id_token: await signIdToken(email) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return realFetch(input as RequestInfo, init);
    }) as typeof fetch;
  }

  async function signIn(email: string): Promise<{ accessToken: string; connectionId: string }> {
    const base = options.apiBase();
    installGoogleFetchStub(email);
    try {
      const connectionId = `conn_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const { codeVerifier, codeChallenge } = generatePKCE();
      const { state } = await createLocalAuthorizationRequest({
        connectionId,
        redirectUri: `${base}/oauth`,
        codeChallenge,
        codeVerifier,
      });

      const startRes = await fetch(`${base}/mcp/oauth/google/start`, { redirect: "manual" });
      const nonce = new URL(startRes.headers.get("location") ?? "").searchParams.get("state");
      expect(nonce, "google start should mint a sign-in nonce").toBeTruthy();

      const callbackRes = await fetch(
        `${base}/mcp/oauth/google/callback?code=test-auth-code&state=${encodeURIComponent(nonce!)}`,
        { redirect: "manual" }
      );
      expect(callbackRes.status, await callbackRes.clone().text()).toBe(302);
      const sessionCookie = readSetCookie(callbackRes, "neotoma_oauth_key_session");
      expect(sessionCookie, "callback should set the sign-in session cookie").toBeTruthy();

      const loginRes = await fetch(
        `${base}/mcp/oauth/local-login?state=${encodeURIComponent(state)}`,
        {
          redirect: "manual",
          headers: { cookie: `neotoma_oauth_key_session=${sessionCookie}` },
        }
      );
      expect(loginRes.status, await loginRes.clone().text()).toBe(302);
      const code = new URL(loginRes.headers.get("location") ?? "", base).searchParams.get("code");
      expect(code, "local-login redirect should carry a code").toBeTruthy();

      const tokenRes = await fetch(`${base}/mcp/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          code_verifier: codeVerifier,
        }).toString(),
      });
      expect(tokenRes.status, await tokenRes.clone().text()).toBe(200);
      const token = (await tokenRes.json()) as { access_token?: string };
      expect(token.access_token).toBeTruthy();
      return { accessToken: token.access_token!, connectionId };
    } finally {
      global.fetch = realFetch;
    }
  }

  return {
    signIn,
    restoreFetch: () => {
      global.fetch = realFetch;
    },
  };
}
