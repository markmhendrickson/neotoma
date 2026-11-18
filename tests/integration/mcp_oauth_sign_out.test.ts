/**
 * Sign-out and failed-sign-in behaviour for the OAuth key-session cookie
 * (`neotoma_oauth_key_session`).
 *
 * - POST /mcp/oauth/sign-out ends the session on the server and clears the
 *   cookie, so a later request carrying the old cookie is treated as signed
 *   out (GET /mcp/oauth/key-auth renders the credential form instead of
 *   redirecting onward).
 * - A failed POST /mcp/oauth/key-auth ends any session the browser already
 *   holds, and clears its cookie.
 * - A correct POST /mcp/oauth/key-auth still issues a working session.
 *
 * Effects are asserted through the real HTTP routes. The session store is only
 * read directly to confirm a server-side revoke, never to stand in for it.
 */

import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Server } from "node:http";

const COOKIE = "neotoma_oauth_key_session";
/** Synthetic bearer value for this test process only. */
const TEST_BEARER = "test-bearer-0123456789abcdef";

let currentTempDir: string | null = null;
let importCounter = 0;
const savedBearer = process.env.NEOTOMA_BEARER_TOKEN;

async function loadApp(tempDir: string): Promise<{ app: any; sessions: any }> {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH = "true";
  process.env.NEOTOMA_BEARER_TOKEN = TEST_BEARER;

  const actionsUrl = new URL("../../src/actions.js", import.meta.url).href;
  const actions = await import(`${actionsUrl}?cacheBust=${Date.now()}-${importCounter++}`);
  // config is a module singleton read once at first import; set the value
  // this file depends on directly (same pattern as the preflight gate test).
  const { config } = await import(new URL("../../src/config.js", import.meta.url).href);
  config.requireKeyForOauth = true;
  return { app: actions.app, sessions: actions.oauthKeySessions };
}

type Reply = { status: number; location: string | null; setCookie: string[] };

async function request(
  app: { listen: (port: number) => Server },
  method: "GET" | "POST",
  urlPath: string,
  opts: { cookie?: string; form?: Record<string, string> } = {}
): Promise<Reply> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address !== "object") {
      throw new Error("Expected HTTP server to bind to an ephemeral port");
    }
    const headers: Record<string, string> = {};
    if (opts.cookie) headers.cookie = `${COOKIE}=${opts.cookie}`;
    let body: string | undefined;
    if (opts.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(opts.form).toString();
    }
    const response = await fetch(`http://127.0.0.1:${address.port}${urlPath}`, {
      method,
      redirect: "manual",
      headers,
      body,
    });
    await response.text();
    return {
      status: response.status,
      location: response.headers.get("location"),
      setCookie: response.headers.getSetCookie(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  }
}

function sessionCookieFrom(reply: Reply): string | undefined {
  const line = reply.setCookie.find((c) => c.startsWith(`${COOKIE}=`));
  if (!line) return undefined;
  const value = line.slice(COOKIE.length + 1).split(";")[0];
  return decodeURIComponent(value);
}

function expectCookieCleared(reply: Reply): void {
  const line = reply.setCookie.find((c) => c.startsWith(`${COOKIE}=`));
  expect(line, "response must clear the session cookie").toBeDefined();
  expect(line).toMatch(new RegExp(`^${COOKIE}=;`));
  expect(line).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  expect(line).toMatch(/Path=\/mcp\/oauth/);
}

async function signIn(app: any): Promise<string> {
  const reply = await request(app, "POST", "/mcp/oauth/key-auth", {
    form: { credential_mode: "bearer", bearer_token: TEST_BEARER, next: "/mcp/oauth/authorize" },
  });
  expect(reply.status).toBe(302);
  const token = sessionCookieFrom(reply);
  expect(token).toBeTruthy();
  return token!;
}

/** Signed in: key-auth GET redirects onward. Signed out: it renders the form. */
async function isSignedIn(app: any, token: string): Promise<boolean> {
  const reply = await request(app, "GET", "/mcp/oauth/key-auth", { cookie: token });
  if (reply.status === 302) return true;
  expect(reply.status).toBe(200);
  return false;
}

describe("OAuth key-session sign-out and failed sign-in", () => {
  afterEach(() => {
    delete process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH;
    if (savedBearer === undefined) delete process.env.NEOTOMA_BEARER_TOKEN;
    else process.env.NEOTOMA_BEARER_TOKEN = savedBearer;
    if (currentTempDir) {
      rmSync(currentTempDir, { recursive: true, force: true });
      currentTempDir = null;
    }
  });

  it("a correct sign-in issues a session that later requests accept", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-signout-signin-${Date.now()}`);
    const { app, sessions } = await loadApp(currentTempDir);

    const token = await signIn(app);
    expect(sessions.isValid(token)).toBe(true);
    expect(await isSignedIn(app, token)).toBe(true);
  });

  it("sign-out ends the session on the server and clears the cookie", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-signout-end-${Date.now()}`);
    const { app, sessions } = await loadApp(currentTempDir);

    const token = await signIn(app);
    expect(await isSignedIn(app, token)).toBe(true);

    const reply = await request(app, "POST", "/mcp/oauth/sign-out", { cookie: token });
    expect(reply.status).toBe(200);
    expectCookieCleared(reply);

    // The old cookie value no longer works, even if a client keeps sending it.
    expect(sessions.isValid(token)).toBe(false);
    expect(await isSignedIn(app, token)).toBe(false);
  });

  it("sign-out also removes the identity bound to the session", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-signout-bound-${Date.now()}`);
    const { app, sessions } = await loadApp(currentTempDir);

    const token = sessions.create(Date.now(), 60_000);
    sessions.bindUser(token, {
      graphUserId: "00000000-0000-4000-8000-000000000001",
      authenticatedEmail: "person@example.com",
    });
    expect(sessions.getBoundIdentity(token)).toBeDefined();

    const reply = await request(app, "POST", "/mcp/oauth/sign-out", { cookie: token });
    expect(reply.status).toBe(200);
    expect(sessions.getBoundIdentity(token)).toBeUndefined();
    expect(sessions.getBoundUser(token)).toBeUndefined();
  });

  it("sign-out with no session still clears the cookie", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-signout-none-${Date.now()}`);
    const { app } = await loadApp(currentTempDir);

    const reply = await request(app, "POST", "/mcp/oauth/sign-out");
    expect(reply.status).toBe(200);
    expectCookieCleared(reply);
  });

  it("a failed sign-in ends the session the browser already holds", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-signout-failed-${Date.now()}`);
    const { app, sessions } = await loadApp(currentTempDir);

    const token = await signIn(app);
    expect(await isSignedIn(app, token)).toBe(true);

    const reply = await request(app, "POST", "/mcp/oauth/key-auth", {
      cookie: token,
      form: {
        credential_mode: "bearer",
        bearer_token: "wrong-value",
        next: "/mcp/oauth/authorize",
      },
    });
    expect(reply.status).toBe(401);
    expectCookieCleared(reply);
    expect(sessions.isValid(token)).toBe(false);
    expect(await isSignedIn(app, token)).toBe(false);

    // Signing in again afterwards works normally.
    const fresh = await signIn(app);
    expect(fresh).not.toBe(token);
    expect(await isSignedIn(app, fresh)).toBe(true);
  });
});
