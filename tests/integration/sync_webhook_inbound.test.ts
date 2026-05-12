/**
 * Integration tests for inbound sync endpoints:
 *   POST /sync/webhook   — HMAC-signed cross-instance entity replication
 *   POST /sync/entities  — authenticated peer entity listing
 *
 * Negative tests (signature validation) run against a single server.
 * Happy-path tests that require a remote entity fetch use two servers.
 *
 * Covers:
 *   - Missing X-Neotoma-Sync-Signature-256        → 401
 *   - Wrong signature                               → 401
 *   - Unknown peer (no peer_config row)             → 401
 *   - Tampered body (signature computed on original) → 401
 *   - Wrong content-type                             → 400
 *   - Happy path /sync/webhook                       → 200, entity applied
 *   - POST /sync/entities happy path                 → 200, rows returned
 *   - POST /sync/entities bad payload                → 400
 */

import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  startPeerSyncFixture,
  type PeerSyncFixture,
} from "../helpers/two_server_fixture.js";
import type { IsolatedServer } from "../../packages/eval-harness/src/isolated_server.js";

function signBody(secret: string, body: string): string {
  const mac = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${mac}`;
}

/**
 * Stable-sorted JSON stringify matching the server's `stableStringify`.
 * Required so the HMAC signature covers the exact byte sequence the server
 * computes during outbound delivery.
 */
function stableStringify(obj: unknown): string {
  if (obj === undefined) return "null";
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map((x) => stableStringify(x)).join(",")}]`;
  }
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",")}}`;
}

const LOCAL_DEV = "00000000-0000-0000-0000-000000000000";

let fixture: PeerSyncFixture;

describe("Inbound sync webhook", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    fixture = await startPeerSyncFixture();
  }, 90_000);

  afterAll(async () => {
    await fixture?.stop();
  });

  /**
   * Raw POST to /sync/webhook on serverB, bypassing the fixture httpFetch
   * (which adds Bearer auth) since the webhook endpoint uses its own HMAC auth.
   */
  function postSyncWebhook(
    server: IsolatedServer,
    body: string,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return fetch(`${server.baseUrl}/sync/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    });
  }

  function postSyncEntities(
    server: IsolatedServer,
    body: string,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return fetch(`${server.baseUrl}/sync/entities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  /sync/webhook — signature negatives                               */
  /* ------------------------------------------------------------------ */

  it("rejects when X-Neotoma-Sync-Signature-256 is missing", async () => {
    const payload = stableStringify({
      sender_peer_id: fixture.peerIdA,
      sender_peer_url: fixture.serverA.baseUrl,
      target_user_id: LOCAL_DEV,
      entity_id: "ent_00000000000000000000000000",
      source_observation_id: "obs_test_1",
    });

    const res = await postSyncWebhook(fixture.serverB, payload);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error_code?: string };
    expect(body.error_code).toBe("SYNC_WEBHOOK_UNAUTHORIZED");
  });

  it("rejects when signature is wrong", async () => {
    const payload = stableStringify({
      sender_peer_id: fixture.peerIdA,
      sender_peer_url: fixture.serverA.baseUrl,
      target_user_id: LOCAL_DEV,
      entity_id: "ent_00000000000000000000000000",
      source_observation_id: "obs_test_2",
    });

    const res = await postSyncWebhook(fixture.serverB, payload, {
      "X-Neotoma-Sync-Signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
    });
    expect(res.status).toBe(401);
  });

  it("rejects when sender_peer_id is unknown", async () => {
    const unknownPeerId = `unknown-peer-${randomUUID().slice(0, 8)}`;
    const payload = stableStringify({
      sender_peer_id: unknownPeerId,
      sender_peer_url: fixture.serverA.baseUrl,
      target_user_id: LOCAL_DEV,
      entity_id: "ent_00000000000000000000000000",
      source_observation_id: "obs_test_3",
    });
    const sig = signBody(fixture.sharedSecret, payload);

    const res = await postSyncWebhook(fixture.serverB, payload, {
      "X-Neotoma-Sync-Signature-256": sig,
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error_code?: string };
    expect(body.error_code).toBe("SYNC_WEBHOOK_UNAUTHORIZED");
  });

  it("rejects when body is tampered after signing", async () => {
    const original = stableStringify({
      sender_peer_id: fixture.peerIdA,
      sender_peer_url: fixture.serverA.baseUrl,
      target_user_id: LOCAL_DEV,
      entity_id: "ent_00000000000000000000000000",
      source_observation_id: "obs_test_4",
    });
    const sig = signBody(fixture.sharedSecret, original);

    const tampered = stableStringify({
      sender_peer_id: fixture.peerIdA,
      sender_peer_url: fixture.serverA.baseUrl,
      target_user_id: LOCAL_DEV,
      entity_id: "ent_TAMPERED_ID_000000000000",
      source_observation_id: "obs_test_4",
    });

    const res = await postSyncWebhook(fixture.serverB, tampered, {
      "X-Neotoma-Sync-Signature-256": sig,
    });
    expect(res.status).toBe(401);
  });

  it("rejects when content-type is not application/json", async () => {
    const payload = stableStringify({
      sender_peer_id: fixture.peerIdA,
      sender_peer_url: fixture.serverA.baseUrl,
      target_user_id: LOCAL_DEV,
      entity_id: "ent_00000000000000000000000000",
      source_observation_id: "obs_test_5",
    });
    const sig = signBody(fixture.sharedSecret, payload);

    const res = await fetch(`${fixture.serverB.baseUrl}/sync/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-Neotoma-Sync-Signature-256": sig,
      },
      body: payload,
    });
    expect(res.status).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /*  /sync/webhook — happy path                                        */
  /* ------------------------------------------------------------------ */

  it("applies a signed webhook from a registered peer", async () => {
    // Store an entity on server A so the inbound handler can fetch it.
    const storeRes = await fixture.httpFetch(fixture.serverA, "/store", {
      method: "POST",
      body: JSON.stringify({
        entities: [
          {
            entity_type: "note",
            title: "webhook-happy-path-note",
            body: "created on A for inbound webhook test",
          },
        ],
        idempotency_key: "webhook-happy-path-note-v1",
      }),
    });
    expect(storeRes.status).toBe(200);
    const storeBody = (await storeRes.json()) as {
      entities: Array<{ entity_id: string }>;
    };
    const entityId = storeBody.entities?.[0]?.entity_id;
    expect(entityId).toBeDefined();

    const payload = stableStringify({
      sender_peer_id: fixture.peerIdA,
      sender_peer_url: fixture.serverA.baseUrl,
      target_user_id: LOCAL_DEV,
      entity_id: entityId!,
      source_observation_id: `obs_happy_${randomUUID().slice(0, 8)}`,
    });
    const sig = signBody(fixture.sharedSecret, payload);

    const res = await postSyncWebhook(fixture.serverB, payload, {
      "X-Neotoma-Sync-Signature-256": sig,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; entity_id?: string };
    expect(body.status).toBe("applied");
    expect(body.entity_id).toBe(entityId);
  });

  /* ------------------------------------------------------------------ */
  /*  /sync/entities — happy path + negatives                           */
  /* ------------------------------------------------------------------ */

  it("POST /sync/entities returns rows for a registered peer", async () => {
    const payload = stableStringify({
      sender_peer_id: fixture.peerIdA,
      target_user_id: LOCAL_DEV,
      entity_types: ["note"],
    });
    const sig = signBody(fixture.sharedSecret, payload);

    const res = await postSyncEntities(fixture.serverB, payload, {
      "X-Neotoma-Sync-Signature-256": sig,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[] };
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it("POST /sync/entities rejects bad payload", async () => {
    const payload = "not valid json at all";
    const res = await postSyncEntities(fixture.serverB, payload, {
      "X-Neotoma-Sync-Signature-256": "sha256=abc",
    });
    // Invalid JSON is rejected by either the global express.json() parser
    // (returning 400 with an HTML error page) or by the handler's own
    // INVALID_JSON path. Either way the status should indicate a client error.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("POST /sync/entities rejects missing required fields", async () => {
    const payload = stableStringify({ sender_peer_id: fixture.peerIdA });
    const sig = signBody(fixture.sharedSecret, payload);

    const res = await postSyncEntities(fixture.serverB, payload, {
      "X-Neotoma-Sync-Signature-256": sig,
    });
    expect(res.status).toBe(400);
  });
});
