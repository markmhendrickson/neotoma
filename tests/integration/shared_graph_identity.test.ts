/**
 * #2228 — shared-graph sign-in must carry the signed-in identity ALONGSIDE the
 * graph scope, not replace it.
 *
 * The bug: `/mcp/oauth/google/callback` computed
 * `resolvedUserId = getSharedGraphUserId() ?? perEmailUser.id` and bound only
 * that id to the session. Under `NEOTOMA_SHARED_GRAPH_USER_ID` the verified
 * Google email was therefore discarded at sign-in, and every downstream surface
 * re-derived the email from the shared `user_id` — so `/me` and the Inspector
 * told a signed-in teammate they were the graph owner. On a hosted instance
 * this was alarming enough to be reported as a suspected security incident.
 *
 * Two concepts were collapsed into one field:
 *   - WHO YOU ARE          — the verified Google email (authentication)
 *   - WHOSE GRAPH YOU USE  — the shared user_id (authorization / scope)
 *
 * These tests drive the REAL Express app over HTTP through the REAL sign-in
 * flow (Google callback -> authorize state -> local-login -> token -> `/me`),
 * stubbing only the two outbound Google calls: the JWKS fetch and the
 * authorization-code exchange. Nothing about identity resolution, session
 * binding, connection persistence or `/me` is mocked.
 *
 * The load-bearing test asserts BOTH halves in ONE scenario, because each half
 * passes for the wrong reason on its own: showing the teammate's email is only
 * a fix if the graph scope did NOT follow the identity, and preserved scoping
 * is only interesting if the identity actually survived.
 *
 * HARNESS LIMIT: no real Google account is involved. `verifyGoogleIdToken` runs
 * for real against a locally generated RS256 keypair served as Google's JWKS,
 * so signature/issuer/audience/allowlist checks are genuinely exercised — but
 * the assertion that Google would return this email for this person is out of
 * reach locally and is covered only by manual smoke on a hosted instance.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { createLocalAuthUser } from "../../src/services/local_auth.js";
import { createLocalAuthorizationRequest } from "../../src/services/mcp_oauth.js";

const API_PORT = 18477;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const CLIENT_ID = "shared-graph-test.apps.googleusercontent.com";
const KID = "shared-graph-test-kid";

const TEAMMATE_EMAIL = "teammate@example.com";
const TEAMMATE_TWO_EMAIL = "teammate2@example.com";
const OWNER_EMAIL = "graph-owner@example.com";

/** The shared graph's user_id — a real UUID, since getSharedGraphUserId rejects
 *  anything that is not one (and rejects the nil UUID). */
const SHARED_GRAPH_USER_ID = randomUUID().toLowerCase();

const ENV_KEYS = [
  "NEOTOMA_GOOGLE_CLIENT_ID",
  "NEOTOMA_GOOGLE_CLIENT_SECRET",
  "NEOTOMA_APPROVED_EMAILS",
  "NEOTOMA_SHARED_GRAPH_USER_ID",
] as const;

type MeResponse = {
  user_id?: string;
  email?: string;
  authenticated_user_id?: string;
  shared_graph?: boolean;
};

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;
let realFetch: typeof global.fetch;
let httpServer: ReturnType<typeof createServer>;

/**
 * The per-email user_id an email resolves to, via the SAME primitive the
 * callback uses. Derived rather than hardcoded so the test cannot drift from
 * local_auth's hashing (which is deliberately not exported).
 */
async function perEmailUserId(email: string): Promise<string> {
  const user = await createLocalAuthUser(email, randomUUID());
  return user.id;
}

/** Mint an id_token that the real verifyGoogleIdToken will accept. */
async function signIdToken(email: string): Promise<string> {
  return new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setIssuer("https://accounts.google.com")
    .setAudience(CLIENT_ID)
    .setExpirationTime("1h")
    .sign(privateKey);
}

/**
 * Intercept ONLY Google's two endpoints (JWKS + token exchange). Every other
 * request — including the test's own calls to the app under test — goes to the
 * real fetch, so the HTTP surface is genuinely exercised.
 */
function installGoogleFetchStub(emailForNextExchange: () => string): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const idToken = await signIdToken(emailForNextExchange());
      return new Response(JSON.stringify({ id_token: idToken }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

/** Extract a Set-Cookie value by name from a fetch Response. */
function readSetCookie(res: Response, name: string): string | undefined {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const [key, value] = (pair ?? "").split("=");
    if (key?.trim() === name) return value;
  }
  return undefined;
}

/**
 * Drive the whole sign-in the way a browser does, and return the bearer token
 * the resulting session issues plus the connection id behind it.
 *
 * 1. GET /mcp/oauth/google/callback  -> verifies the id_token, binds the session
 * 2. GET /mcp/oauth/local-login      -> completes authorization as that session
 * 3. POST /mcp/oauth/token           -> exchanges the code for an access token
 */
async function signInViaGoogle(email: string): Promise<{
  accessToken: string;
  connectionId: string;
}> {
  installGoogleFetchStub(() => email);

  // A pending authorization for local-login to complete.
  const connectionId = `conn_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const { state } = await createLocalAuthorizationRequest({
    connectionId,
    redirectUri: `${API_BASE}/oauth`,
    codeChallenge: "shared-graph-test-challenge",
    codeVerifier: "shared-graph-test-challenge",
  });

  // Step 1: the Google callback. `state` here is the sign-in nonce, which the
  // app mints in /mcp/oauth/google/start — so start there to get a real one.
  const startRes = await fetch(`${API_BASE}/mcp/oauth/google/start`, { redirect: "manual" });
  const authorizeUrl = new URL(startRes.headers.get("location") ?? "");
  const nonce = authorizeUrl.searchParams.get("state");
  expect(nonce, "google start should mint a sign-in nonce").toBeTruthy();

  const callbackRes = await fetch(
    `${API_BASE}/mcp/oauth/google/callback?code=test-auth-code&state=${encodeURIComponent(nonce!)}`,
    { redirect: "manual" }
  );
  expect(
    callbackRes.status,
    `google callback should redirect, got ${callbackRes.status}: ${await callbackRes
      .clone()
      .text()
      .catch(() => "")}`
  ).toBe(302);

  const sessionCookie = readSetCookie(callbackRes, "neotoma_oauth_key_session");
  expect(sessionCookie, "callback should set the sign-in session cookie").toBeTruthy();

  // Step 2: local-login, carrying the sign-in session cookie.
  const loginRes = await fetch(
    `${API_BASE}/mcp/oauth/local-login?state=${encodeURIComponent(state)}`,
    {
      redirect: "manual",
      headers: { cookie: `neotoma_oauth_key_session=${sessionCookie}` },
    }
  );
  expect(
    loginRes.status,
    `local-login should redirect, got ${loginRes.status}: ${await loginRes
      .clone()
      .text()
      .catch(() => "")}`
  ).toBe(302);

  // Step 3: exchange the authorization code for an access token.
  const tokenRes = await fetch(`${API_BASE}/mcp/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: connectionId }).toString(),
  });
  expect(tokenRes.status, `token exchange should succeed: ${await tokenRes.clone().text()}`).toBe(
    200
  );
  const token = (await tokenRes.json()) as { access_token?: string };
  expect(token.access_token).toBeTruthy();

  return { accessToken: token.access_token!, connectionId };
}

async function getMe(accessToken: string): Promise<{ status: number; body: MeResponse }> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as MeResponse };
}

describe("#2228 shared-graph sign-in: identity alongside scope", () => {
  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
    realFetch = global.fetch;

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    // Seed the graph owner as a real local-auth user. This is what made the bug
    // visible: resolving the email from the shared user_id returns THIS address.
    await createLocalAuthUser(OWNER_EMAIL, randomUUID());
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    process.env.NEOTOMA_GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.NEOTOMA_GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.NEOTOMA_APPROVED_EMAILS = [TEAMMATE_EMAIL, TEAMMATE_TWO_EMAIL].join(",");
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = realFetch;
  });

  /**
   * THE REGRESSION TEST. Both acceptance assertions live in one scenario
   * deliberately: identity-correct and scope-correct are only meaningful
   * together. Before the fix, the first expectation below fails with the
   * OWNER's email.
   */
  it("shows the signed-in teammate's email while keeping reads and writes on the shared graph", async () => {
    process.env.NEOTOMA_SHARED_GRAPH_USER_ID = SHARED_GRAPH_USER_ID;

    // Seed the shared graph owner under the SHARED id, so a user_id-derived
    // email lookup has something to find — i.e. so the pre-fix behavior would
    // return a plausible wrong answer rather than simply undefined.
    const ownerDb = await getDb();
    await ownerDb
      .prepare(
        "INSERT OR IGNORE INTO local_auth_users (id, email, password_hash, password_salt, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        SHARED_GRAPH_USER_ID,
        OWNER_EMAIL,
        "x",
        "x",
        new Date().toISOString(),
        new Date().toISOString(),
        null
      );

    const { accessToken } = await signInViaGoogle(TEAMMATE_EMAIL);
    const { status, body } = await getMe(accessToken);
    expect(status).toBe(200);

    // (a) IDENTITY: the person signed in is the teammate, not the graph owner.
    // This is the exact bug — pre-fix this is OWNER_EMAIL.
    expect(body.email).toBe(TEAMMATE_EMAIL);
    expect(body.email).not.toBe(OWNER_EMAIL);

    // (b) SCOPE: the graph operated on is still the shared one. If a fix moved
    // scoping to the per-email id to make (a) pass, this fails.
    expect(body.user_id).toBe(SHARED_GRAPH_USER_ID);
    expect(body.user_id).not.toBe(await perEmailUserId(TEAMMATE_EMAIL));

    // The two concepts are reported as distinct, and the sharing is legible.
    expect(body.shared_graph).toBe(true);
    expect(body.authenticated_user_id).toBe(await perEmailUserId(TEAMMATE_EMAIL));
    expect(body.authenticated_user_id).not.toBe(body.user_id);

    // (c) SCOPE, ENFORCED: a write made under this session must land on the
    // shared graph, not the teammate's personal one. Asserting the stored
    // row — not just what /me says about itself — is what makes this a scoping
    // test rather than a response-shape test.
    const entityType = "shared_graph_identity_probe";
    const storeRes = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entities: [{ entity_type: entityType, name: `probe ${randomUUID().slice(0, 8)}` }],
        idempotency_key: `shared-graph-probe-${randomUUID()}`,
      }),
    });
    expect(storeRes.status, `store should succeed: ${await storeRes.clone().text()}`).toBe(200);

    const { data: rows } = await db
      .from("entities")
      .select("id, user_id")
      .eq("entity_type", entityType);
    expect(rows?.length, "the probe entity should have been written").toBeGreaterThan(0);
    for (const row of rows as Array<{ user_id: string }>) {
      expect(row.user_id).toBe(SHARED_GRAPH_USER_ID);
      expect(row.user_id).not.toBe(await perEmailUserId(TEAMMATE_EMAIL));
    }

    // Cleanup: keep the shared suite DB clean for other files.
    for (const row of (rows ?? []) as Array<{ id: string }>) {
      await db.from("observations").delete().eq("entity_id", row.id);
      await db.from("entity_snapshots").delete().eq("entity_id", row.id);
      await db.from("entities").delete().eq("id", row.id);
    }
  });

  /**
   * E1 — two teammates on the same shared graph keep separate identities.
   * A single shared identity field would collapse these; separate connection
   * rows must each carry their own signer.
   */
  it("keeps each teammate's identity distinct while both operate on the same graph", async () => {
    process.env.NEOTOMA_SHARED_GRAPH_USER_ID = SHARED_GRAPH_USER_ID;

    const first = await signInViaGoogle(TEAMMATE_EMAIL);
    const second = await signInViaGoogle(TEAMMATE_TWO_EMAIL);

    const meFirst = await getMe(first.accessToken);
    const meSecond = await getMe(second.accessToken);

    expect(meFirst.body.email).toBe(TEAMMATE_EMAIL);
    expect(meSecond.body.email).toBe(TEAMMATE_TWO_EMAIL);

    // Same graph for both — the point of shared-graph mode.
    expect(meFirst.body.user_id).toBe(SHARED_GRAPH_USER_ID);
    expect(meSecond.body.user_id).toBe(SHARED_GRAPH_USER_ID);

    // One teammate's identity must never leak into the other's session.
    expect(meFirst.body.authenticated_user_id).not.toBe(meSecond.body.authenticated_user_id);
  });

  /**
   * E3 — the no-regression case. With the env var unset, sign-in is the
   * isolated per-email behavior it has always been, and the additive fields
   * stay absent rather than always-emitted.
   */
  it("leaves non-shared-graph sign-in unchanged, with no shared-graph fields", async () => {
    delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;

    const { accessToken } = await signInViaGoogle(TEAMMATE_EMAIL);
    const { status, body } = await getMe(accessToken);

    expect(status).toBe(200);
    expect(body.email).toBe(TEAMMATE_EMAIL);
    // The signer's own graph — identity and scope coincide here, as before.
    expect(body.user_id).toBe(await perEmailUserId(TEAMMATE_EMAIL));
    // Additive fields are omitted when there is nothing to disambiguate, so
    // existing consumers see the exact response shape they saw before.
    expect(body.shared_graph).toBeUndefined();
    expect(body.authenticated_user_id).toBeUndefined();
  });

  /**
   * E4 — a connection row written before this migration has NULL identity
   * columns. It must keep resolving the email from user_id rather than
   * throwing or reporting nothing.
   */
  it("falls back to the user_id-derived email for pre-migration connection rows", async () => {
    delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;

    const legacyEmail = `legacy-${randomUUID().slice(0, 8)}@example.com`;
    const legacyUser = await createLocalAuthUser(legacyEmail, randomUUID());
    const legacyToken = `local_access_${randomUUID().replace(/-/g, "")}`;
    const legacyConnection = `conn_legacy_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // Exactly what an old row looks like: no authenticated_* values at all.
    const legacyDb = await getDb();
    await legacyDb
      .prepare(
        "INSERT INTO mcp_oauth_connections (id, user_id, connection_id, refresh_token, access_token, access_token_expires_at, client_name, last_used_at, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        randomUUID(),
        legacyUser.id,
        legacyConnection,
        `local_refresh_${randomUUID().replace(/-/g, "")}`,
        legacyToken,
        new Date(Date.now() + 3600_000).toISOString(),
        null,
        null,
        new Date().toISOString(),
        null
      );

    const { status, body } = await getMe(legacyToken);
    expect(status).toBe(200);
    expect(body.email).toBe(legacyEmail);
    expect(body.user_id).toBe(legacyUser.id);
    expect(body.shared_graph).toBeUndefined();
  });

  /**
   * E6 — the allowlist still rejects before any identity is bound. A fix that
   * recorded identity earlier in the flow could admit a non-allowlisted signer;
   * assert no session and no connection row result.
   */
  it("rejects a non-allowlisted email before binding any identity", async () => {
    process.env.NEOTOMA_SHARED_GRAPH_USER_ID = SHARED_GRAPH_USER_ID;
    const intruder = "intruder@example.com";
    installGoogleFetchStub(() => intruder);

    const startRes = await fetch(`${API_BASE}/mcp/oauth/google/start`, { redirect: "manual" });
    const nonce = new URL(startRes.headers.get("location") ?? "").searchParams.get("state");

    const callbackRes = await fetch(
      `${API_BASE}/mcp/oauth/google/callback?code=test-auth-code&state=${encodeURIComponent(nonce!)}`,
      { redirect: "manual" }
    );

    expect(callbackRes.status).toBe(401);
    expect(readSetCookie(callbackRes, "neotoma_oauth_key_session")).toBeUndefined();

    const rowDb = await getDb();
    const row = await rowDb
      .prepare("SELECT id FROM mcp_oauth_connections WHERE authenticated_email = ?")
      .get(intruder);
    expect(row, "a rejected sign-in must not write a connection row").toBeFalsy();
  });
});
