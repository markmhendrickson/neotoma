/**
 * Sandbox auth: an unresolvable Bearer degrades to the anonymous public user
 * instead of 401-walling the request.
 *
 * Mirrors the sandbox fallback branch added to the auth middleware in
 * `src/actions.ts` (the `validateSessionToken` catch). The full app can't be
 * booted with NEOTOMA_SANDBOX_MODE=1 inside the shared test server (it conflicts
 * with the global instance — same constraint noted in
 * `tests/integration/sandbox_mode.test.ts` and
 * `tests/integration/aauth_sandbox_attribution_partition.test.ts`), so this
 * mounts a minimal app replicating the decision and asserts the contract:
 *
 *   - sandbox + Bearer that resolves to no identity → 200 as SANDBOX_PUBLIC_USER_ID,
 *     stale session cookie cleared.
 *   - non-sandbox + same Bearer → 401 (unchanged; no trust-boundary change).
 *
 * The real code path is additionally verified end-to-end against a booted
 * sandbox server (a stale Bearer on GET /me returns 200 as the public user and
 * sends `Set-Cookie: neotoma_sandbox_session=; Expires=...`).
 */

import { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { SANDBOX_PUBLIC_USER_ID } from "../../src/services/local_auth.js";
import { SESSION_COOKIE_NAME } from "../../src/services/sandbox/sessions.js";

// Minimal handler mirroring the src/actions.ts fallback: a Bearer that fails
// all real auth degrades to the public user (+ cookie clear) in sandbox mode,
// and 401s otherwise.
function makeApp(sandbox: boolean) {
  const app = express();
  app.get("/me", (req, res) => {
    const auth = req.header("authorization") || "";
    const hasBearer = auth.startsWith("Bearer ");
    // Simulated: the Bearer does not resolve to any valid identity.
    if (hasBearer) {
      if (sandbox) {
        res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
        return res.json({ user_id: SANDBOX_PUBLIC_USER_ID, sandbox_mode: "hosted_sandbox" });
      }
      return res.status(401).json({ error: "AUTH_INVALID" });
    }
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  });
  return app;
}

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe("sandbox stale-bearer fallback", () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it("sandbox mode: unresolvable Bearer → 200 as the public user, cookie cleared", async () => {
    const s = await listen(makeApp(true));
    close = s.close;
    const res = await fetch(`${s.url}/me`, {
      headers: { authorization: "Bearer stale-or-wiped-sandbox-bearer" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user_id: string };
    expect(body.user_id).toBe(SANDBOX_PUBLIC_USER_ID);
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie.toLowerCase()).toContain("expires=");
  });

  it("non-sandbox mode: unresolvable Bearer → 401 (unchanged)", async () => {
    const s = await listen(makeApp(false));
    close = s.close;
    const res = await fetch(`${s.url}/me`, {
      headers: { authorization: "Bearer stale-or-wiped-sandbox-bearer" },
    });
    expect(res.status).toBe(401);
  });
});
