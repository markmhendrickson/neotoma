/**
 * neotoma#2070 — MCP 2026-07-28 stateless auth resolution on POST /mcp.
 *
 * Under the 2026-07-28 spec there is no session and no `initialize`: every
 * request carries its own credentials and `_meta`, and any API instance must be
 * able to serve any request. Before #2070 the authenticated `NeotomaServer`
 * was pinned in a per-process map keyed by `Mcp-Session-Id`, so a request that
 * landed on another replica could not resolve identity and a session-less
 * request was refused outright (400 "No MCP session").
 *
 * These tests assert the EFFECT, not just acceptance:
 *
 * 1. Round-robin across two replicas. Two independently booted apps (separate
 *    module graphs, so separate in-process session maps) share one data dir.
 *    A realistic sequence — server/discover, tools/list, an authenticated
 *    store, then a retrieve and a whoami — alternates between them. Data
 *    written through replica A is read back through replica B as the same
 *    user, with no session minted anywhere.
 * 2. Identity comes only from the current request. Sequential requests with
 *    different credentials on the same replica each resolve their own user;
 *    nothing carries over from the previous request.
 * 3. Concurrency (arch gate): interleaved in-flight requests from two
 *    different identities on ONE replica each resolve their own identity, and
 *    one user cannot read the other's entities.
 *
 * Identities are two OAuth connections resolved through a mocked
 * `getAccessTokenForConnection` (the same function both the HTTP auth gate and
 * the server's connection resolution call), so the test controls exactly which
 * user each credential maps to.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  toolResultJson,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const USER_A = "aaaaaaaa-2070-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-2070-4bbb-8bbb-bbbbbbbbbbbb";
const CONNECTIONS: Record<string, string> = {
  "conn-2070-a": USER_A,
  "conn-2070-b": USER_B,
};

vi.mock("../../src/services/mcp_oauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/mcp_oauth.js")>();
  return {
    ...actual,
    getAccessTokenForConnection: vi.fn(async (connectionId: string) => {
      const userId = CONNECTIONS[connectionId];
      if (!userId) {
        const error = new Error("Connection not found") as Error & { code?: string };
        error.code = "OAUTH_CONNECTION_NOT_FOUND";
        throw error;
      }
      return { accessToken: `test-access-${connectionId}`, userId };
    }),
  };
});

async function whoami(baseUrl: string, connectionId: string, id: number): Promise<unknown> {
  const reply = await modernPost(
    baseUrl,
    { id, method: "tools/call", params: { name: "get_authenticated_user", arguments: {} } },
    { connectionId }
  );
  expect(reply.status, reply.text).toBe(200);
  return toolResultJson(reply.body).user_id;
}

/** Canonical names of the entities in a retrieve_entities payload. */
function entityNamesOf(payload: Record<string, unknown>): string[] {
  const entities = (payload.entities ?? []) as Array<Record<string, unknown>>;
  return entities.map((e) => String(e.canonical_name ?? ""));
}

describe("POST /mcp 2026-07-28 stateless auth resolution (#2070)", () => {
  let env: McpTestEnv;
  const apps: BootedMcpApp[] = [];

  beforeEach(() => {
    env = prepareMcpTestEnv("neotoma-mcp-2070-auth-");
  });

  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
    vi.resetModules();
    env.restore();
  });

  it("serves a realistic sequence round-robin across two replicas with no session affinity", async () => {
    const replicaA = await bootMcpApp();
    apps.push(replicaA);
    const replicaB = await bootMcpApp();
    apps.push(replicaB);
    const conn = "conn-2070-a";
    const entityName = "stateless 2070 round robin";

    // 1. discover on A
    const discover = await modernPost(
      replicaA.baseUrl,
      { id: 1, method: "server/discover" },
      { connectionId: conn }
    );
    expect(discover.status, discover.text).toBe(200);
    expect(discover.headers.get("mcp-session-id")).toBeNull();

    // 2. tools/list on B
    const list = await modernPost(
      replicaB.baseUrl,
      { id: 2, method: "tools/list" },
      { connectionId: conn }
    );
    expect(list.status, list.text).toBe(200);
    expect(list.headers.get("mcp-session-id")).toBeNull();
    const toolNames = ((list.body?.result?.tools ?? []) as Array<{ name: string }>).map(
      (t) => t.name
    );
    expect(toolNames).toContain("store");

    // 3. authenticated write on A
    const store = await modernPost(
      replicaA.baseUrl,
      {
        id: 3,
        method: "tools/call",
        params: {
          name: "store",
          arguments: {
            entities: [{ entity_type: "note", name: entityName, content: entityName }],
            idempotency_key: "mcp-2070-round-robin-store",
          },
        },
      },
      { connectionId: conn }
    );
    expect(store.status, store.text).toBe(200);
    expect(store.body?.result?.isError, store.text).not.toBe(true);
    expect(store.headers.get("mcp-session-id")).toBeNull();

    // 4. read it back on B as the same user: the write landed under USER_A and
    // B resolved USER_A from this request alone.
    const retrieve = await modernPost(
      replicaB.baseUrl,
      {
        id: 4,
        method: "tools/call",
        params: { name: "retrieve_entities", arguments: { entity_type: "note" } },
      },
      { connectionId: conn }
    );
    expect(retrieve.status, retrieve.text).toBe(200);
    expect(entityNamesOf(toolResultJson(retrieve.body))).toContain(entityName);

    // 5. both replicas resolve the same identity from the same credential.
    expect(await whoami(replicaA.baseUrl, conn, 5)).toBe(USER_A);
    expect(await whoami(replicaB.baseUrl, conn, 6)).toBe(USER_A);
  });

  it("resolves identity from the current request only, never a previous request's", async () => {
    const replica = await bootMcpApp();
    apps.push(replica);

    expect(await whoami(replica.baseUrl, "conn-2070-a", 11)).toBe(USER_A);
    // Same process, next request, different credential: must be B, not A.
    expect(await whoami(replica.baseUrl, "conn-2070-b", 12)).toBe(USER_B);
    expect(await whoami(replica.baseUrl, "conn-2070-a", 13)).toBe(USER_A);

    // An unknown connection is refused by this request's own credential check;
    // it does not fall back to the identity an earlier request resolved.
    const unknown = await modernPost(
      replica.baseUrl,
      { id: 14, method: "tools/call", params: { name: "get_authenticated_user", arguments: {} } },
      { connectionId: "conn-2070-unknown" }
    );
    expect(unknown.status).toBe(401);
    expect(unknown.text).not.toContain(USER_A);
    expect(unknown.text).not.toContain(USER_B);
  });

  it("keeps interleaved requests from different identities isolated on one replica", async () => {
    const replica = await bootMcpApp();
    apps.push(replica);
    const privateName = "stateless 2070 private to a";

    const storeA = await modernPost(
      replica.baseUrl,
      {
        id: 21,
        method: "tools/call",
        params: {
          name: "store",
          arguments: {
            entities: [{ entity_type: "note", name: privateName, content: privateName }],
            idempotency_key: "mcp-2070-isolation-store-a",
          },
        },
      },
      { connectionId: "conn-2070-a" }
    );
    expect(storeA.status, storeA.text).toBe(200);
    expect(storeA.body?.result?.isError, storeA.text).not.toBe(true);

    // Fire A and B requests concurrently so they are in flight together on the
    // same process and interleave across every await.
    const plan = Array.from({ length: 16 }, (_, i) =>
      i % 2 === 0 ? "conn-2070-a" : "conn-2070-b"
    );
    const whoamis = await Promise.all(
      plan.map((conn, i) => whoami(replica.baseUrl, conn, 100 + i))
    );
    plan.forEach((conn, i) => {
      expect(whoamis[i], `request ${i} (${conn})`).toBe(CONNECTIONS[conn]);
    });

    const [retrieveA, retrieveB] = await Promise.all(
      ["conn-2070-a", "conn-2070-b"].map((conn, i) =>
        modernPost(
          replica.baseUrl,
          {
            id: 200 + i,
            method: "tools/call",
            params: { name: "retrieve_entities", arguments: { entity_type: "note" } },
          },
          { connectionId: conn }
        )
      )
    );
    expect(retrieveA.status, retrieveA.text).toBe(200);
    expect(retrieveB.status, retrieveB.text).toBe(200);
    expect(entityNamesOf(toolResultJson(retrieveA.body))).toContain(privateName);
    expect(entityNamesOf(toolResultJson(retrieveB.body))).not.toContain(privateName);
  });

  it("a credential that resolves to no user is refused at request time with a typed 401, not a tool error", async () => {
    const replica = await bootMcpApp();
    apps.push(replica);
    // The /mcp gate skips connection-id validation when a Bearer is also
    // present, so an unknown connection id reaches the stateless path, where
    // resolution fails. That must surface as an authentication error for this
    // request, before any method runs.
    const cases = [
      { id: 300, method: "tools/call", params: { name: "get_authenticated_user", arguments: {} } },
      { id: 301, method: "tools/list" },
      { id: 302, method: "server/discover" },
    ];
    for (const request of cases) {
      const reply = await modernPost(replica.baseUrl, request, {
        connectionId: "conn-2070-unknown",
        headers: { Authorization: "Bearer not-a-real-2070-token" },
      });
      expect(reply.status, `${request.method}: ${reply.text}`).toBe(401);
      expect(reply.body?.id).toBe(request.id);
      expect(reply.body?.result).toBeUndefined();
      expect(reply.body?.error?.code).toBe(-32001);
      expect(reply.body?.error?.data?.error_code).toBe("MCP_AUTH_CONNECTION_INVALID");
      expect(reply.body?.error?.data?.hint).toBeTruthy();
      expect(reply.headers.get("www-authenticate")).toContain('error="invalid_token"');
      expect(reply.headers.get("mcp-session-id")).toBeNull();
      expect(reply.text).not.toContain("conn-2070-unknown");
    }
  });
});
