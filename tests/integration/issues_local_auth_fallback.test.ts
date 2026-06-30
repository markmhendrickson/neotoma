import { createServer, type Server } from "node:http";

import { describe, expect, it } from "vitest";

import { app, routeAllowsLocalIssueWriteFallback } from "../../src/actions.js";

/**
 * Regression coverage for #1842: `neotoma issues create` (POST /issues/submit)
 * failed with AUTH_REQUIRED on local/offline use because the route required a
 * Bearer token, while `neotoma issues auth` only configures the gh-CLI mirror.
 *
 * Approved fix (Option B, operator-approved auth-surface change): extend
 * local-loopback trust to /issues/submit and /issues/add_message so a LOCAL
 * request with NO Authorization: Bearer header falls through to the local dev
 * user — the same trust entity reads already grant. The widening is scoped to
 * exactly these two routes; remote requests (untrusted X-Forwarded-For) still
 * require auth, and other routes are untouched.
 *
 * Requests originate from 127.0.0.1 in this harness, so `isLocalRequest` is
 * true unless an untrusted X-Forwarded-For is supplied (which simulates a
 * remote/tunnelled caller).
 */

async function withHttpServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind to a TCP port");
  }
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("routeAllowsLocalIssueWriteFallback", () => {
  it("matches only the two issue-write routes on POST", () => {
    for (const path of [
      "/issues/submit",
      "/api/issues/submit",
      "/issues/add_message",
      "/api/issues/add_message",
    ]) {
      expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path })).toBe(true);
    }
  });

  it("does not match other routes or non-POST methods", () => {
    expect(routeAllowsLocalIssueWriteFallback({ method: "GET", path: "/issues/submit" })).toBe(false);
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/issues/status" })).toBe(false);
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/subscribe" })).toBe(false);
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/entities/store" })).toBe(false);
  });
});

describe("issues/submit local-loopback auth fallback (#1842)", () => {
  it("succeeds locally with NO Authorization header (no access token configured)", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/issues/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `local-fallback issue ${Date.now()}`,
          body: "Created locally with no Bearer token — should not require auth.",
          visibility: "private",
          // Reporter provenance is an unrelated, downstream requirement; supply
          // it so the request reaches a real submit (proving the local user
          // resolves and persists) rather than stopping at a 400 validation.
          reporter_git_sha: "0".repeat(40),
          reporter_app_version: "0.0.0-test",
        }),
      });

      // The local request must clear the auth gate. AUTH_REQUIRED (401) is the
      // exact failure mode #1842 reported; any other status (2xx success, or a
      // downstream non-auth error) means the auth surface no longer blocks the
      // offline developer.
      expect(response.status).not.toBe(401);
      const text = await response.text();
      expect(text).not.toMatch(/AUTH_REQUIRED/);

      if (response.ok) {
        const json = JSON.parse(text) as { entity_id?: string; submitted_to_neotoma?: boolean };
        expect(json.entity_id).toBeTruthy();
      }
    });
  });

  it("still requires auth for a remote request (untrusted X-Forwarded-For) with no Bearer", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/issues/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // A non-loopback, untrusted forwarded-for entry disqualifies the
          // request as local, so the fallback must NOT apply.
          "X-Forwarded-For": "203.0.113.7",
        },
        body: JSON.stringify({
          title: `remote issue ${Date.now()}`,
          body: "Remote caller with no Bearer must still get AUTH_REQUIRED.",
          visibility: "private",
        }),
      });

      expect(response.status).toBe(401);
      await expect(response.text()).resolves.toMatch(/AUTH_REQUIRED/);
    });
  });
});
