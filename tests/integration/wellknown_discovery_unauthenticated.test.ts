/**
 * OAuth discovery documents must be reachable with NO credentials (#2049).
 *
 * ## Why these assertions look trivial and are not
 *
 * The bug this guards against was a self-referential deadlock:
 * `/.well-known/oauth-protected-resource` returned 401 with a
 * `WWW-Authenticate` header naming ITSELF as where to find the auth metadata.
 * A client 401'd at `/mcp` follows that header, is 401'd again pointing back to
 * the same URL, and the login flow never starts — no credential can resolve it,
 * because discovery never completes.
 *
 * RFC 9728 §3 makes protected-resource metadata the *unauthenticated* bootstrap
 * entry point: its entire job is to tell a caller with no credentials where to
 * get them. RFC 8414 says the same for authorization-server metadata.
 *
 * The reason this survived is that it is invisible to any test that
 * authenticates first — and an authenticated request was the natural thing to
 * write. So every request below deliberately sends NO `Authorization` and NO
 * `X-Connection-Id`: the unauthenticated caller is the whole point, not an edge
 * case. A future refactor that reintroduces a credential check on these paths
 * fails here rather than silently locking out first-time clients.
 */

import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let currentTempDir: string | null = null;
let importCounter = 0;

async function loadApp(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  const actionsUrl = new URL("../../src/actions.js", import.meta.url).href;
  const actions = await import(`${actionsUrl}?cacheBust=${Date.now()}-${importCounter++}`);
  return actions.app;
}

/** GET with no Authorization and no X-Connection-Id — the first-time-client case. */
async function getAnonymously(port: number, routePath: string) {
  const response = await fetch(`http://127.0.0.1:${port}${routePath}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body: assertions below report status and raw text instead.
  }
  return { status: response.status, headers: response.headers, text, json };
}

describe("OAuth discovery metadata is reachable unauthenticated (#2049)", () => {
  afterEach(() => {
    if (currentTempDir) {
      rmSync(currentTempDir, { recursive: true, force: true });
      currentTempDir = null;
    }
  });

  it("serves protected-resource metadata to a caller with no credentials", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-wk-discovery-${Date.now()}`);
    const app = await loadApp(currentTempDir);
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port bound");

      // Both spellings RFC 9728 §3.1 permits: the bare path, and the path with
      // the protected resource's own path appended. An MCP client whose resource
      // is /mcp probes the suffixed form, which Express does not match against
      // the bare route — so it needs its own registration.
      for (const routePath of [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
      ]) {
        const res = await getAnonymously(address.port, routePath);

        expect(
          res.status,
          `${routePath} must serve metadata to an unauthenticated caller (RFC 9728 §3). ` +
            `Got ${res.status}. A 401 here is a bootstrap deadlock: the client is told to ` +
            `look here for how to authenticate, so gating it means login can never start. ` +
            `Body: ${res.text.slice(0, 200)}`
        ).toBe(200);

        // The document must actually name an authorization server — a 200 with an
        // empty or malformed body is as useless to a bootstrapping client as a 401.
        const body = res.json as { authorization_servers?: unknown } | null;
        expect(
          Array.isArray(body?.authorization_servers) &&
            (body!.authorization_servers as unknown[]).length > 0,
          `${routePath} returned 200 but no authorization_servers — a client still cannot ` +
            `discover where to log in. Body: ${res.text.slice(0, 200)}`
        ).toBe(true);

        // A 200 carrying a challenge would be contradictory, and some clients
        // treat any WWW-Authenticate as a signal to re-auth rather than proceed.
        expect(
          res.headers.get("www-authenticate"),
          `${routePath} returned 200 but still sent WWW-Authenticate — clients may read ` +
            `that as "authenticate first" and abandon the flow.`
        ).toBeNull();
      }
    } finally {
      server.close();
    }
  });

  it("serves authorization-server metadata to a caller with no credentials", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-wk-as-${Date.now()}`);
    const app = await loadApp(currentTempDir);
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port bound");

      // This endpoint was always public; asserting it pins the behaviour so the
      // two siblings cannot drift apart again. The asymmetry between them — one
      // public, one gated — was the shape of the original bug.
      const res = await getAnonymously(address.port, "/.well-known/oauth-authorization-server");
      expect(
        res.status,
        `authorization-server metadata must stay public (RFC 8414). Got ${res.status}.`
      ).toBe(200);

      const body = res.json as { authorization_endpoint?: unknown; issuer?: unknown } | null;
      expect(
        Boolean(body?.authorization_endpoint || body?.issuer),
        `authorization-server metadata returned 200 but named neither issuer nor ` +
          `authorization_endpoint. Body: ${res.text.slice(0, 200)}`
      ).toBe(true);
    } finally {
      server.close();
    }
  });

  it("points /mcp's WWW-Authenticate challenge at a document that is actually reachable", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-wk-chain-${Date.now()}`);
    const app = await loadApp(currentTempDir);
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port bound");

      // End-to-end shape of the bug: follow the challenge the way a client does.
      // Asserting the endpoints individually is not enough — the failure was in
      // the *chain*, and a client only ever experiences the chain.
      const mcp = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      });

      const challenge = mcp.headers.get("www-authenticate");
      if (!challenge) {
        // An instance that admits anonymous callers never issues a challenge, so
        // there is no chain to verify. Skip rather than assert a false pass —
        // this is exactly the configuration in which the deadlock hides, because
        // the anonymous path routes around discovery entirely.
        return;
      }

      const match = /resource_metadata="([^"]+)"/.exec(challenge);
      expect(
        match?.[1],
        `/mcp sent WWW-Authenticate without a resource_metadata URL, so a client has ` +
          `nowhere to look: ${challenge}`
      ).toBeTruthy();

      const metadataUrl = new URL(match![1]);
      const followed = await getAnonymously(
        address.port,
        metadataUrl.pathname + metadataUrl.search
      );

      expect(
        followed.status,
        `Following /mcp's own WWW-Authenticate to ${metadataUrl.pathname} returned ` +
          `${followed.status}. If that is a 401, the challenge points at a gated document ` +
          `and the OAuth handshake cannot bootstrap — the #2049 deadlock.`
      ).toBe(200);
    } finally {
      server.close();
    }
  });
});
