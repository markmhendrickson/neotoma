/**
 * Scope of the local-dev `user_id` override in `getAuthenticatedUserId`.
 *
 * A caller-supplied `user_id` (query string or JSON body) that differs from
 * the authenticated local dev user is honoured only for a loopback request
 * that signed in WITHOUT a token, outside production, or when
 * `NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE=1` is set. Every token-based sign-in
 * that resolves to the dev user (static bearer, key-derived token, OAuth
 * access token minted through key sign-in) gets the existing 403 mismatch
 * error instead. A matching or absent `user_id` keeps working everywhere.
 *
 * All assertions drive real HTTP requests against a freshly imported app.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE",
  "NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD",
  "NEOTOMA_BEARER_TOKEN",
  "NEOTOMA_DATA_DIR",
  "NEOTOMA_RAW_STORAGE_DIR",
  "NEOTOMA_ENCRYPTION_ENABLED",
  "NEOTOMA_ENV",
  "NEOTOMA_HOST_URL",
  "NEOTOMA_HTTP_PORT",
  "NEOTOMA_KEY_FILE_PATH",
  "NEOTOMA_MNEMONIC",
  "NEOTOMA_MNEMONIC_PASSPHRASE",
  "NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY",
  "MCP_TOKEN_ENCRYPTION_KEY",
  "NEOTOMA_REQUIRE_KEY_FOR_OAUTH",
  "NEOTOMA_TRUST_PROD_LOOPBACK",
  "NEOTOMA_TRUSTED_PROXY_IPS",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreEnv(): void {
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Synthetic static bearer for this test process only. */
const STATIC_BEARER = "synthetic-static-bearer-for-user-id-scope-tests";
/** Synthetic user id that differs from the local dev user. */
const OTHER_USER_ID = "11111111-2222-4333-8444-555555555555";

type Harness = {
  baseUrl: string;
  devUserId: string;
  keyDerivedToken: string | null;
  close: () => Promise<void>;
};

async function startApp(options: { allowOverride?: boolean } = {}): Promise<Harness> {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-user-id-scope-"));
  const keyFile = path.join(tmpRoot, "synthetic.key");
  writeFileSync(keyFile, randomBytes(32).toString("hex"));
  process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
  process.env.NEOTOMA_BEARER_TOKEN = STATIC_BEARER;
  process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tmpRoot, "data", "sources");
  process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
  process.env.NEOTOMA_ENV = "development";
  process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
  process.env.NEOTOMA_HTTP_PORT = "0";
  process.env.NEOTOMA_KEY_FILE_PATH = keyFile;
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH = "true";
  delete process.env.NEOTOMA_MNEMONIC;
  delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;
  delete process.env.NEOTOMA_TRUST_PROD_LOOPBACK;
  delete process.env.NEOTOMA_TRUSTED_PROXY_IPS;
  if (options.allowOverride) process.env.NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE = "1";
  else delete process.env.NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE;

  vi.resetModules();
  const { app } = await import("../../src/actions.js");
  const { config } = await import("../../src/config.js");
  config.requireKeyForOauth = true;
  const { getMcpAuthToken } = await import("../../src/crypto/mcp_auth_token.js");
  const { LOCAL_DEV_USER_ID } = await import("../../src/services/local_auth.js");

  const httpServer = createServer(app);
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
    httpServer.once("error", reject);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    devUserId: LOCAL_DEV_USER_ID,
    keyDerivedToken: getMcpAuthToken(),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      rmSync(tmpRoot, { recursive: true, force: true });
    },
  };
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET route reading `user_id` from the query string. */
async function getEntities(
  baseUrl: string,
  token: string | undefined,
  userId: string | undefined
): Promise<number> {
  const params = new URLSearchParams({ entity_type: "note" });
  if (userId) params.set("user_id", userId);
  const res = await fetch(`${baseUrl}/entities?${params.toString()}`, {
    headers: { Accept: "application/json", ...authHeaders(token) },
  });
  await res.text();
  return res.status;
}

/** POST route reading `user_id` from the JSON body. */
async function queryEntities(
  baseUrl: string,
  token: string | undefined,
  userId: string | undefined
): Promise<{ status: number; json: any }> {
  const body: Record<string, unknown> = { entity_type: "note" };
  if (userId) body.user_id = userId;
  const res = await fetch(`${baseUrl}/entities/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function sessionCookieFrom(res: Response): string {
  const line = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("neotoma_oauth_key_session="));
  if (!line) throw new Error("Expected a key-session cookie");
  return line.split(";")[0];
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint an OAuth access token through the key sign-in page and local-login. */
async function mintOauthAccessToken(baseUrl: string): Promise<string> {
  const signIn = await fetch(`${baseUrl}/mcp/oauth/key-auth`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      credential_mode: "bearer",
      bearer_token: STATIC_BEARER,
      next: "/mcp/oauth/authorize",
    }).toString(),
  });
  expect(signIn.status).toBe(302);
  const cookie = sessionCookieFrom(signIn);

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const redirectUri = "http://localhost:4321/callback";
  const authorize = await fetch(
    `${baseUrl}/mcp/oauth/authorize?${new URLSearchParams({
      redirect_uri: redirectUri,
      state: "synthetic-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
    })}`,
    { redirect: "manual", headers: { cookie } }
  );
  expect(authorize.status).toBe(302);
  const loginLocation = authorize.headers.get("location") ?? "";
  expect(loginLocation).toMatch(/^\/mcp\/oauth\/local-login\?state=/);

  const login = await fetch(`${baseUrl}${loginLocation}`, {
    redirect: "manual",
    headers: { cookie },
  });
  expect(login.status).toBe(302);
  const code = new URL(login.headers.get("location") as string).searchParams.get("code");
  expect(code).toBeTruthy();

  const token = await fetch(`${baseUrl}/mcp/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code as string,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });
  const tokenJson = await token.json();
  expect(token.status).toBe(200);
  expect(typeof tokenJson.access_token).toBe("string");
  return tokenJson.access_token as string;
}

describe("local-dev user_id override is limited to loopback requests without a token", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
    vi.resetModules();
    restoreEnv();
  });

  async function credentials(h: Harness): Promise<Array<[string, string]>> {
    expect(h.keyDerivedToken).toBeTruthy();
    return [
      ["static bearer", STATIC_BEARER],
      ["key-derived token", h.keyDerivedToken as string],
      ["OAuth access token from key sign-in", await mintOauthAccessToken(h.baseUrl)],
    ];
  }

  it("refuses a different user_id for each token-based sign-in (GET query and POST body)", async () => {
    harness = await startApp();
    for (const [label, token] of await credentials(harness)) {
      expect(await getEntities(harness.baseUrl, token, OTHER_USER_ID), label).toBe(403);
      const post = await queryEntities(harness.baseUrl, token, OTHER_USER_ID);
      expect(post.status, label).toBe(403);
      expect(post.json?.error_code, label).toBe("FORBIDDEN");
    }
  });

  it("keeps a matching or absent user_id working for each token-based sign-in", async () => {
    harness = await startApp();
    for (const [label, token] of await credentials(harness)) {
      expect(await getEntities(harness.baseUrl, token, harness.devUserId), label).toBe(200);
      expect(await getEntities(harness.baseUrl, token, undefined), label).toBe(200);
      expect((await queryEntities(harness.baseUrl, token, harness.devUserId)).status, label).toBe(
        200
      );
      expect((await queryEntities(harness.baseUrl, token, undefined)).status, label).toBe(200);
    }
  });

  it("still honours a different user_id for a loopback request without a token", async () => {
    harness = await startApp();
    expect(await getEntities(harness.baseUrl, undefined, OTHER_USER_ID)).toBe(200);
    expect((await queryEntities(harness.baseUrl, undefined, OTHER_USER_ID)).status).toBe(200);
    expect(await getEntities(harness.baseUrl, undefined, harness.devUserId)).toBe(200);
    expect((await queryEntities(harness.baseUrl, undefined, undefined)).status).toBe(200);
  });

  it("honours a different user_id for token sign-ins when NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE=1", async () => {
    harness = await startApp({ allowOverride: true });
    for (const [label, token] of await credentials(harness)) {
      expect(await getEntities(harness.baseUrl, token, OTHER_USER_ID), label).toBe(200);
      expect((await queryEntities(harness.baseUrl, token, OTHER_USER_ID)).status, label).toBe(200);
    }
  });
});
