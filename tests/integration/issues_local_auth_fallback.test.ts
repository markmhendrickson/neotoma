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
 * exactly these two routes; other routes are untouched.
 *
 * Superseded in part by #1953 (anonymous remote issue submission). #1842's
 * "remote callers always get AUTH_REQUIRED on these routes" no longer holds for
 * POST /issues/submit: a third party's agent must be able to open an issue with
 * no prior identity, since the guest access token is minted BY that submit.
 * The boundary #1842 protected still stands everywhere else — see the remote
 * cases below (submit allowed; add_message and other routes still 401).
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
    expect(routeAllowsLocalIssueWriteFallback({ method: "GET", path: "/issues/submit" })).toBe(
      false
    );
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/issues/status" })).toBe(
      false
    );
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/subscribe" })).toBe(false);
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/entities/store" })).toBe(
      false
    );
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

  // #1953: a remote, wholly unidentified caller MAY open an issue. This
  // reverses #1842's original assertion for this one route (and only this
  // route) — the guest access token is an OUTPUT of submit, so demanding one
  // up front made first contact impossible.
  it("allows a remote anonymous request (no Bearer, no signature, no token) to POST /issues/submit", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/issues/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.7",
        },
        body: JSON.stringify({
          title: `remote anonymous issue ${Date.now()}`,
          body: "Anonymous remote first contact must be able to open an issue.",
          visibility: "private",
          reporter_app_version: "0.18.8",
        }),
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as Record<string, unknown>;
      expect(json.entity_id).toBeTruthy();
      // The token is minted BY the submit — that is what makes the
      // chicken-and-egg resolvable, and what authenticates any follow-up.
      expect(json.guest_access_token).toBeTruthy();
    });
  });

  // The open inbox does not lower the provenance bar: an anonymous report with
  // no idea what it was reproduced against is the least actionable kind.
  it("rejects a remote anonymous submit that omits both reporter_git_sha and reporter_app_version", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/issues/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.7",
        },
        body: JSON.stringify({
          title: `no reporter env ${Date.now()}`,
          body: "Missing both reporter fields must be rejected.",
          visibility: "private",
        }),
      });

      expect(response.status).toBe(400);
      await expect(response.text()).resolves.toMatch(/ERR_REPORTER_ENVIRONMENT_REQUIRED/);
    });
  });

  // The operator's kill switch. The open inbox is a policy, not a hardcoded
  // posture: setting the issue policy to `closed` restores #1842's behavior.
  it("restores AUTH_REQUIRED for remote anonymous submit when the issue policy is closed", async () => {
    const previous = process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
    process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "closed";
    try {
      await withHttpServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/issues/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "203.0.113.7",
          },
          body: JSON.stringify({
            title: `closed policy ${Date.now()}`,
            body: "A closed inbox must reject anonymous remote submits.",
            visibility: "private",
            reporter_app_version: "0.18.8",
          }),
        });

        expect(response.status).toBe(401);
        await expect(response.text()).resolves.toMatch(/AUTH_REQUIRED/);
      });
    } finally {
      if (previous === undefined) delete process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
      else process.env.NEOTOMA_ACCESS_POLICY_ISSUE = previous;
    }
  });

  it("still requires auth for a remote anonymous POST /issues/add_message", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/issues/add_message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.7",
        },
        body: JSON.stringify({
          entity_id: "ent_0000000000000000000000ff",
          body: "An unidentified caller must not append to an existing thread.",
        }),
      });

      expect(response.status).toBe(401);
      await expect(response.text()).resolves.toMatch(/AUTH_REQUIRED/);
    });
  });

  it("still requires auth for a remote request with no Bearer on non-issue-submit routes", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.7",
        },
        body: JSON.stringify({
          entities: [
            {
              entity_type: "contact",
              content: "Remote caller must not write arbitrary entity types.",
            },
          ],
        }),
      });

      expect(response.status).toBe(401);
      await expect(response.text()).resolves.toMatch(/AUTH_REQUIRED/);
    });
  });
});
