/**
 * Cross-surface SSRF-guard parity — `subscribe` and `add_peer` (neotoma#2164
 * acceptance criteria, policy `cross_surface_contract_parity_tested_all_surfaces`
 * / ent_2ad0677fe23c0c1878ae43e8).
 *
 * `tests/security/ssrf_outbound_host_guard.test.ts` and
 * `ssrf_sink_wiring.test.ts` lock the shared guard helper and prove each
 * fetch-time sink refuses a private-host target. Neither exercises the
 * public surfaces a caller actually reaches: MCP `subscribe`/`add_peer` and
 * HTTP `POST /subscribe`/`POST /peers`. #2164's signed acceptance criteria
 * require `subscribe` tested on every exposing surface (MCP and HTTP), each
 * with that surface's own natural call shape, asserting identical rejection
 * — and the same for `add_peer`.
 *
 * Boots the real Express `app` for HTTP and a real `NeotomaServer` for MCP
 * (via the public `executeToolForCli`, the same dispatch a real MCP client's
 * tool call goes through), following the pattern already established by
 * `tests/integration/correct_http_mcp_parity.test.ts`.
 *
 * `subscribe`: rejects a cloud-metadata webhook_url identically on both
 * surfaces (the guard fires inside `subscribeUser`, shared by both).
 *
 * `add_peer`: as of this test, addPeerForUser does NOT reject a private
 * peer_url at store time — the guard is enforced later, at every outbound
 * fetch (probePeerRemoteHealth, sync_webhook_outbound), which
 * `ssrf_sink_wiring.test.ts` already covers. This test asserts that
 * documented behavior identically on both surfaces (a private peer_url is
 * ACCEPTED by add_peer itself) rather than asserting a rejection neither
 * surface performs — asserting a rejection here would be a test that cannot
 * fail on the thing it claims to watch. If add_peer is ever changed to
 * validate peer_url at store time, invert this assertion on both surfaces
 * together.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { PEER_CONFIG_ENTITY_TYPE } from "../../src/services/sync/seed_peer_schema.js";
import { SUBSCRIPTION_ENTITY_TYPE } from "../../src/services/subscriptions/seed_schema.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";

const HOSTED = "NEOTOMA_HOSTED_MODE";
const CLOUD_METADATA_URL = "https://169.254.169.254/latest/meta-data/";
const USER_ID = LOCAL_DEV_USER_ID;

function mcpCall(server: NeotomaServer, name: string, args: Record<string, unknown>) {
  return server.executeToolForCli(name, args, USER_ID);
}

function mcpResultBody(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("SSRF guard cross-surface parity — subscribe, add_peer", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;
  let apiBase: string;

  beforeAll(async () => {
    server = new NeotomaServer();
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      // Ephemeral port (0) so this suite never collides with another
      // server's fixed port — the exact class of flake #2473 fixed for the
      // graph-neighborhood integration test.
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("expected an AddressInfo from the ephemeral listen()");
    }
    apiBase = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    // Hard-delete the rows this file created, on the same worktree-isolated
    // test DB every other test's afterAll already writes to (see
    // tests/integration/correct_http_mcp_parity.test.ts for the identical
    // pattern). MAX_PEERS (10) and MAX_SUBSCRIPTIONS_PER_USER (50) are
    // per-user quotas on the shared LOCAL_DEV_USER_ID, and peer_config /
    // subscription entities are append-only — deactivating (active: false)
    // does not reduce countPeersForUser's row count, so a repeated run of
    // this file without a hard delete exhausts the peer quota within a
    // couple of invocations (observed directly: the "accepts" tests started
    // returning 400 "Maximum peers reached" after prior runs, not because
    // the guard regressed).
    await cleanupEntityType(PEER_CONFIG_ENTITY_TYPE, USER_ID);
    await cleanupEntityType(SUBSCRIPTION_ENTITY_TYPE, USER_ID);
  });

  beforeEach(() => {
    process.env[HOSTED] = "1";
  });

  afterEach(() => {
    delete process.env[HOSTED];
  });

  describe("subscribe", () => {
    it("MCP subscribe rejects a cloud-metadata webhook_url", async () => {
      // The MCP dispatch (NeotomaServer.executeTool -> handleSubscribe)
      // wraps subscribeUser's throw in an McpError and re-throws — the
      // rejection IS the observable behavior on this surface, there is no
      // success-shaped body to inspect.
      await expect(
        mcpCall(server, "subscribe", {
          entity_types: ["task"],
          delivery_method: "webhook",
          webhook_url: CLOUD_METADATA_URL,
        })
      ).rejects.toThrow(/public host/i);
    });

    it("HTTP POST /subscribe rejects the SAME cloud-metadata webhook_url", async () => {
      // No user_id in the body: /subscribe's OpenAPI-derived undeclared-field
      // gate does not list it (drift from the route's own inline zod schema,
      // out of scope here) — omit it and rely on local-auth resolution, the
      // same path POST /peers already exercises successfully below.
      const res = await fetch(`${apiBase}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_types: ["task"],
          delivery_method: "webhook",
          webhook_url: CLOUD_METADATA_URL,
        }),
      });
      expect(res.status, "HTTP /subscribe must reject a cloud-metadata webhook_url").not.toBe(200);
      const body = (await res.json()) as { message?: string; error?: string };
      const text = JSON.stringify(body).toLowerCase();
      expect(text).toMatch(/public host|https|localhost|127\.0\.0\.1/);
    });

    it("both surfaces still accept a public https webhook_url (no over-rejection)", async () => {
      const publicUrl = `https://hooks.example.com/${randomUUID()}`;

      const mcpResult = await mcpCall(server, "subscribe", {
        entity_types: ["task"],
        delivery_method: "webhook",
        webhook_url: publicUrl,
      });
      const mcpBody = mcpResultBody(mcpResult);
      expect(mcpBody.subscription_id).toBeTruthy();

      const httpRes = await fetch(`${apiBase}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_types: ["task"],
          delivery_method: "webhook",
          webhook_url: publicUrl,
        }),
      });
      expect(httpRes.status).toBe(200);
      const httpBody = (await httpRes.json()) as { subscription_id?: string };
      expect(httpBody.subscription_id).toBeTruthy();
    });
  });

  describe("add_peer", () => {
    // Both surfaces share addPeerForUser, which does not validate peer_url
    // at store time (the guard fires later, at fetch time — see the module
    // docstring above). Assert that documented behavior identically on both
    // surfaces rather than a rejection neither performs.
    it("MCP add_peer ACCEPTS a private peer_url (guard is fetch-time, not store-time)", async () => {
      const peerId = `mcp-parity-${randomUUID()}`;
      const result = await mcpCall(server, "add_peer", {
        peer_id: peerId,
        peer_name: "mcp parity test peer",
        peer_url: "http://169.254.169.254",
        direction: "push",
        entity_types: ["task"],
        sync_scope: "all",
        auth_method: "shared_secret",
        conflict_strategy: "last_write_wins",
      });
      const body = mcpResultBody(result);
      expect(body.entity_id).toBeTruthy();
    });

    it("HTTP POST /peers ACCEPTS the SAME private peer_url", async () => {
      const peerId = `http-parity-${randomUUID()}`;
      const res = await fetch(`${apiBase}/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peer_id: peerId,
          peer_name: "http parity test peer",
          peer_url: "http://169.254.169.254",
          direction: "push",
          entity_types: ["task"],
          sync_scope: "all",
          auth_method: "shared_secret",
          conflict_strategy: "last_write_wins",
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { entity_id?: string };
      expect(body.entity_id).toBeTruthy();
    });
  });
});
