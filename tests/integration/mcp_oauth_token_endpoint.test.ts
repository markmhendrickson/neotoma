import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let currentTempDir: string | null = null;
let importCounter = 0;

async function loadLocalModules(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const oauthUrl = new URL("../../src/services/mcp_oauth.js", import.meta.url).href;
  const localAuthUrl = new URL("../../src/services/local_auth.js", import.meta.url).href;
  const actionsUrl = new URL("../../src/actions.js", import.meta.url).href;
  const cacheBust = `cacheBust=${Date.now()}-${importCounter++}`;
  const oauth = await import(`${oauthUrl}?${cacheBust}`);
  const localAuth = await import(`${localAuthUrl}?${cacheBust}`);
  const actions = await import(`${actionsUrl}?${cacheBust}`);
  return { oauth, localAuth, app: actions.app };
}

describe("MCP OAuth token endpoint", () => {
  afterEach(() => {
    if (currentTempDir) {
      rmSync(currentTempDir, { recursive: true, force: true });
      currentTempDir = null;
    }
  });

  it("accepts refresh_token grant for local OAuth sessions", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-token-endpoint-${Date.now()}`);
    const { oauth, localAuth, app } = await loadLocalModules(currentTempDir);
    await localAuth.createLocalAuthUser("token-endpoint@example.com", "password123");
    const user = await localAuth.getLocalAuthUserByEmail("token-endpoint@example.com");
    if (!user) {
      throw new Error("Local auth user not found in test");
    }

    const connectionId = "cursor-local-token-endpoint";
    const { codeVerifier, codeChallenge } = oauth.generatePKCE();
    const request = await oauth.createLocalAuthorizationRequest({
      connectionId,
      redirectUri: "cursor://oauth",
      clientState: "client-state",
      codeChallenge,
    });
    const callback = await oauth.completeLocalAuthorization(request.state, user.id);
    const firstToken = await oauth.getTokenResponseForConnection(callback.code, codeVerifier);
    if (!firstToken.refresh_token) {
      throw new Error("Expected local OAuth flow to return a refresh token");
    }

    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("Expected HTTP server to bind to an ephemeral port");
      }
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: firstToken.refresh_token,
      });
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.access_token).toMatch(/^local_access_/);
      expect(json.access_token).not.toBe(firstToken.access_token);
      expect(json.refresh_token).toBe(firstToken.refresh_token);
      expect(json.expires_in).toBeGreaterThan(3_000);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => (err ? reject(err) : resolve()));
      });
    }
  });

  // --- Security regression coverage for the code=connection_id defect ---
  //
  // Previously, /mcp/oauth/token accepted `code` as a bare connection_id: it
  // never checked a code_verifier and never consumed anything, so redeeming
  // the SAME code (or just the connection_id, which was identical) any
  // number of times, from anyone who knew or guessed it, always issued a
  // fresh token. These tests exercise the real HTTP route end to end and
  // must fail on origin/main (pre-fix) and pass on this branch.

  async function setUpAuthorizedConnection(app: any, oauth: any, userId: string) {
    const connectionId = `cursor-local-security-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { codeVerifier, codeChallenge } = oauth.generatePKCE();
    const request = await oauth.createLocalAuthorizationRequest({
      connectionId,
      redirectUri: "cursor://oauth",
      clientState: "client-state",
      codeChallenge,
    });
    const callback = await oauth.completeLocalAuthorization(request.state, userId);
    return { connectionId, code: callback.code, codeVerifier };
  }

  async function postToken(
    app: any,
    body: Record<string, string>
  ): Promise<{ status: number; json: any }> {
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("Expected HTTP server to bind to an ephemeral port");
      }
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      });
      const json = await response.json();
      return { status: response.status, json };
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => (err ? reject(err) : resolve()));
      });
    }
  }

  it("rejects a bare connection_id presented as the authorization code", async () => {
    currentTempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-oauth-token-endpoint-bare-connid-${Date.now()}`
    );
    const { oauth, localAuth, app } = await loadLocalModules(currentTempDir);
    await localAuth.createLocalAuthUser("bare-connid@example.com", "password123");
    const user = await localAuth.getLocalAuthUserByEmail("bare-connid@example.com");
    if (!user) throw new Error("Local auth user not found in test");

    const { connectionId, codeVerifier } = await setUpAuthorizedConnection(app, oauth, user.id);

    // The defect: redeeming the connection_id directly (never the minted
    // code) must not succeed. On origin/main this DID succeed, because `code`
    // was interpreted as connection_id with no separate binding.
    const { status, json } = await postToken(app, {
      grant_type: "authorization_code",
      code: connectionId,
      code_verifier: codeVerifier,
    });

    expect(status).toBe(400);
    expect(json.error).toBe("invalid_grant");
  });

  it("consumes the authorization code when rejecting a mismatched PKCE verifier", async () => {
    currentTempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-oauth-token-endpoint-bad-verifier-${Date.now()}`
    );
    const { oauth, localAuth, app } = await loadLocalModules(currentTempDir);
    await localAuth.createLocalAuthUser("bad-verifier@example.com", "password123");
    const user = await localAuth.getLocalAuthUserByEmail("bad-verifier@example.com");
    if (!user) throw new Error("Local auth user not found in test");

    const { code, codeVerifier } = await setUpAuthorizedConnection(app, oauth, user.id);

    const { status, json } = await postToken(app, {
      grant_type: "authorization_code",
      code,
      code_verifier: "attacker-supplied-wrong-verifier",
    });

    expect(status).toBe(400);
    expect(json.error).toBe("invalid_grant");

    const retry = await postToken(app, {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    });
    expect(retry.status).toBe(400);
    expect(retry.json.error).toBe("invalid_grant");
  });

  it("rejects a second redemption of an already-used authorization code", async () => {
    currentTempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-oauth-token-endpoint-replay-${Date.now()}`
    );
    const { oauth, localAuth, app } = await loadLocalModules(currentTempDir);
    await localAuth.createLocalAuthUser("replay@example.com", "password123");
    const user = await localAuth.getLocalAuthUserByEmail("replay@example.com");
    if (!user) throw new Error("Local auth user not found in test");

    const { code, codeVerifier } = await setUpAuthorizedConnection(app, oauth, user.id);

    const first = await postToken(app, {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    });
    expect(first.status).toBe(200);
    expect(first.json.access_token).toMatch(/^local_access_/);

    // Same code, same (correct) verifier, second call — must fail. A code is
    // single-use regardless of whether the verifier presented is right.
    const second = await postToken(app, {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    });
    expect(second.status).toBe(400);
    expect(second.json.error).toBe("invalid_grant");
  });

  it("rejects an authorization_code grant with no code_verifier", async () => {
    currentTempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-oauth-token-endpoint-no-verifier-${Date.now()}`
    );
    const { oauth, localAuth, app } = await loadLocalModules(currentTempDir);
    await localAuth.createLocalAuthUser("no-verifier@example.com", "password123");
    const user = await localAuth.getLocalAuthUserByEmail("no-verifier@example.com");
    if (!user) throw new Error("Local auth user not found in test");

    const { code } = await setUpAuthorizedConnection(app, oauth, user.id);

    const { status, json } = await postToken(app, {
      grant_type: "authorization_code",
      code,
    });

    expect(status).toBe(400);
    expect(json.error).toBe("invalid_request");
  });

  it("issues a working token for the correct code + verifier pair, once", async () => {
    currentTempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-oauth-token-endpoint-happy-${Date.now()}`
    );
    const { oauth, localAuth, app } = await loadLocalModules(currentTempDir);
    await localAuth.createLocalAuthUser("happy-path@example.com", "password123");
    const user = await localAuth.getLocalAuthUserByEmail("happy-path@example.com");
    if (!user) throw new Error("Local auth user not found in test");

    const { connectionId, code, codeVerifier } = await setUpAuthorizedConnection(
      app,
      oauth,
      user.id
    );

    const { status, json } = await postToken(app, {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    });

    expect(status).toBe(200);
    expect(json.access_token).toMatch(/^local_access_/);
    expect(json.token_type).toBe("Bearer");
    expect(json.connection_id).toBe(connectionId);
  });
});
