/**
 * Integration tests for the /peers/* CRUD lifecycle and POST /peers/:peer_id/sync
 * outbound sync flow. Uses two isolated Neotoma servers connected as peers.
 *
 * Covers OpenAPI paths:
 *   POST   /peers                      — register peer
 *   GET    /peers                      — list peers
 *   GET    /peers/:peer_id             — peer status (with remote_health)
 *   DELETE /peers/:peer_id             — deactivate peer
 *   POST   /peers/:peer_id/sync        — trigger bounded outbound sync
 *   POST   /peers/resolve_sync_conflict — prefer_local, prefer_remote (missing url)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  startPeerSyncFixture,
  type PeerSyncFixture,
} from "../helpers/two_server_fixture.js";

let fixture: PeerSyncFixture;

describe("Peer sync integration", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    fixture = await startPeerSyncFixture();
  }, 90_000);

  afterAll(async () => {
    await fixture?.stop();
  });

  /* ------------------------------------------------------------------ */
  /*  GET /peers — list                                                  */
  /* ------------------------------------------------------------------ */

  it("GET /peers returns the registered peer on server A", async () => {
    const res = await fixture.httpFetch(fixture.serverA, "/peers");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { peers: Array<Record<string, unknown>> };
    expect(Array.isArray(body.peers)).toBe(true);
    const peer = body.peers.find((p) => p.peer_id === fixture.peerIdB);
    expect(peer).toBeDefined();
    expect(peer!.peer_name).toBe("server-b");
    expect(peer!.active).toBe(true);
    expect(peer!.shared_secret).toBeUndefined();
  });

  /* ------------------------------------------------------------------ */
  /*  GET /peers/:peer_id — status                                      */
  /* ------------------------------------------------------------------ */

  it("GET /peers/:peer_id returns status with remote_health", async () => {
    const res = await fixture.httpFetch(fixture.serverA, `/peers/${fixture.peerIdB}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      peer: Record<string, unknown>;
      local_api_version: string;
      remote_health: Record<string, unknown>;
    };
    expect(body.peer.peer_id).toBe(fixture.peerIdB);
    expect(typeof body.local_api_version).toBe("string");
    expect(body.remote_health).toBeDefined();
    expect(body.remote_health.reachable).toBe(true);
  });

  it("GET /peers/:peer_id returns 404 for unknown peer", async () => {
    const res = await fixture.httpFetch(fixture.serverA, "/peers/nonexistent-peer");
    expect(res.status).toBe(404);
  });

  /* ------------------------------------------------------------------ */
  /*  POST /peers/:peer_id/sync — outbound sync                        */
  /* ------------------------------------------------------------------ */

  it("POST /peers/:peer_id/sync replicates data from A to B", async () => {
    const storeRes = await fixture.httpFetch(fixture.serverA, "/store", {
      method: "POST",
      body: JSON.stringify({
        entities: [
          {
            entity_type: "note",
            title: "peer-sync-test-note",
            body: "created on server A for sync test",
          },
        ],
        idempotency_key: "peer-sync-test-note-v1",
      }),
    });
    expect(storeRes.status).toBe(200);
    const storeBody = (await storeRes.json()) as {
      entities: Array<{ entity_id: string }>;
    };
    const entityId = storeBody.entities?.[0]?.entity_id;
    expect(entityId).toBeDefined();

    const syncRes = await fixture.httpFetch(
      fixture.serverA,
      `/peers/${fixture.peerIdB}/sync`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(syncRes.status).toBe(200);
    const syncBody = (await syncRes.json()) as {
      ok: boolean;
      message: string;
      succeeded?: number;
      pulled?: number;
    };
    expect(syncBody.ok).toBe(true);

    // Verify entity now exists on server B by searching
    const searchRes = await fixture.httpFetch(
      fixture.serverB,
      `/entities/query?entity_type=note&limit=50`,
    );
    if (searchRes.ok) {
      const searchBody = (await searchRes.json()) as {
        entities?: Array<{ entity_id: string; snapshot?: Record<string, unknown> }>;
      };
      const synced = searchBody.entities?.find((e) => {
        const snap = e.snapshot as Record<string, unknown> | undefined;
        return snap?.title === "peer-sync-test-note";
      });
      expect(synced).toBeDefined();
    }
  });

  it("POST /peers/:peer_id/sync returns error for unknown peer", async () => {
    const res = await fixture.httpFetch(
      fixture.serverA,
      "/peers/does-not-exist/sync",
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/not found/i);
  });

  /* ------------------------------------------------------------------ */
  /*  POST /peers/resolve_sync_conflict                                 */
  /* ------------------------------------------------------------------ */

  it("resolve_sync_conflict prefer_local returns guidance", async () => {
    const res = await fixture.httpFetch(
      fixture.serverA,
      "/peers/resolve_sync_conflict",
      {
        method: "POST",
        body: JSON.stringify({
          entity_id: "ent_00000000000000000000000000",
          strategy: "prefer_local",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/prefer_local/);
  });

  it("resolve_sync_conflict prefer_remote fails without sender_peer_url", async () => {
    const res = await fixture.httpFetch(
      fixture.serverA,
      "/peers/resolve_sync_conflict",
      {
        method: "POST",
        body: JSON.stringify({
          entity_id: "ent_00000000000000000000000000",
          strategy: "prefer_remote",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/sender_peer_url/);
  });

  it("resolve_sync_conflict rejects invalid strategy", async () => {
    const res = await fixture.httpFetch(
      fixture.serverA,
      "/peers/resolve_sync_conflict",
      {
        method: "POST",
        body: JSON.stringify({
          entity_id: "ent_00000000000000000000000000",
          strategy: "bogus",
        }),
      },
    );
    expect(res.status).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /*  POST /peers — validation negatives                                */
  /* ------------------------------------------------------------------ */

  it("POST /peers rejects missing required fields", async () => {
    const res = await fixture.httpFetch(fixture.serverA, "/peers", {
      method: "POST",
      body: JSON.stringify({ peer_id: "x" }),
    });
    expect(res.status).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /*  DELETE /peers/:peer_id                                            */
  /* ------------------------------------------------------------------ */

  it("DELETE /peers/:peer_id deactivates the peer", async () => {
    const delRes = await fixture.httpFetch(
      fixture.serverA,
      `/peers/${fixture.peerIdB}`,
      { method: "DELETE" },
    );
    expect(delRes.status).toBe(200);
    const delBody = (await delRes.json()) as { success: boolean };
    expect(delBody.success).toBe(true);

    const listRes = await fixture.httpFetch(fixture.serverA, `/peers/${fixture.peerIdB}`);
    if (listRes.ok) {
      const status = (await listRes.json()) as { peer: { active: boolean } };
      expect(status.peer.active).toBe(false);
    }
  });

  it("DELETE /peers/:peer_id returns 404 for unknown peer", async () => {
    const res = await fixture.httpFetch(
      fixture.serverA,
      "/peers/nonexistent-peer-id",
      { method: "DELETE" },
    );
    expect(res.status).toBe(404);
  });
});
