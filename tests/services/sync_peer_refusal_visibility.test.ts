/**
 * A receiving peer that refuses an entity type (403 SYNC_ENTITY_TYPE_REFUSED)
 * is a configuration answer, not a delivery failure. On the sender:
 *
 *   - postOutboundSyncWebhook reports it as `peer_refused_entity_type`;
 *   - real-time peer sync does not retry it, does not count it toward the
 *     subscription's consecutive_failures, and so never deactivates the
 *     subscription over it;
 *   - `neotoma peers sync` counts it in `refused_by_peer`, not in `failed`, and
 *     says in its message what the receiving operator has to change.
 *
 * Other 403s (for example a signature the receiver rejects) stay failures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as Array<{ status: number; body: unknown } | (() => Response)>,
  outboundRows: [] as Array<Record<string, unknown>>,
}));

const PEER = vi.hoisted(() => ({
  entity_id: "ent_peer",
  peer_id: "central",
  peer_name: "Central",
  peer_url: "https://central.example",
  direction: "push",
  entity_types: ["issue", "note"],
  sync_scope: "all",
  auth_method: "shared_secret",
  shared_secret: "secret",
  sync_target_user_id: "remote-user",
  conflict_strategy: "last_write_wins",
  active: true,
  consecutive_failures: 0,
}));

const fetchCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../src/services/net/private_host_guard.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/net/private_host_guard.js")>();
  return {
    ...original,
    isPublicFetchUrlAllowed: () => true,
    guardedFetch: async () => {
      fetchCalls.count += 1;
      const next = state.responses.shift() ?? { status: 200, body: { status: "applied" } };
      if (typeof next === "function") return next();
      return new Response(JSON.stringify(next.body), {
        status: next.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
});

vi.mock("../../src/services/sync/peer_ops.js", () => ({
  listPeersWithSecrets: vi.fn(async () => [PEER]),
}));

const correctionMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../../src/services/correction.js", () => ({ createCorrection: correctionMock }));

vi.mock("../../src/services/subscriptions/subscription_index.js", () => ({
  refreshSubscriptionInIndex: vi.fn(async () => undefined),
}));

vi.mock("../../src/services/sync/peer_sync_batch.js", () => ({
  listObservationsForPeerSyncOutbound: vi.fn(async () => state.outboundRows),
  listEntitySnapshotsForPeerSyncOutbound: vi.fn(async () => []),
}));

import {
  PEER_REFUSED_ENTITY_TYPE,
  postOutboundSyncWebhook,
  queuePeerSyncDelivery,
} from "../../src/services/sync/sync_webhook_outbound.js";
import { syncPeerFull } from "../../src/services/sync/full_sync.js";
import type { SubscriptionRecord } from "../../src/services/subscriptions/subscription_types.js";
import type { SubstrateEvent } from "../../src/events/types.js";

const REFUSED = { status: 403, body: { error_code: "SYNC_ENTITY_TYPE_REFUSED", message: "x" } };
const UNAUTHORIZED = { status: 403, body: { error_code: "SOMETHING_ELSE", message: "x" } };

const PAYLOAD = {
  sender_peer_id: "personal",
  sender_peer_url: "https://personal.example",
  target_user_id: "remote-user",
  entity_id: "ent_issue",
  source_observation_id: "obs_issue",
};

function correctedFields(): string[] {
  return correctionMock.mock.calls.map(
    (call) => (call as unknown as [{ field: string }])[0].field
  );
}

beforeEach(() => {
  state.responses = [];
  state.outboundRows = [];
  fetchCalls.count = 0;
  correctionMock.mockClear();
  vi.stubEnv("NEOTOMA_PUBLIC_BASE_URL", "https://personal.example");
  vi.stubEnv("NEOTOMA_LOCAL_PEER_ID", "personal");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("postOutboundSyncWebhook", () => {
  it("reports a receiver's entity type refusal as peer_refused_entity_type", async () => {
    state.responses = [REFUSED];
    const result = await postOutboundSyncWebhook({
      peerUrlBase: PEER.peer_url,
      sharedSecret: "secret",
      payload: PAYLOAD,
    });
    expect(result).toMatchObject({ ok: false, status: 403, error: PEER_REFUSED_ENTITY_TYPE });
  });

  it("reads at most a small prefix of a 403 body, however large the peer makes it", async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode(" ".repeat(16 * 1024));
    const totalChunks = 3200; // about 50 MB if fully read
    let sent = 0;
    state.responses = [
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const head = new TextEncoder().encode('{"error_code":"SYNC_ENTITY_TYPE_REFUSED","pad":"');
              pulled += head.byteLength;
              controller.enqueue(head);
            },
            pull(controller) {
              if (sent >= totalChunks) {
                controller.enqueue(new TextEncoder().encode('"}'));
                controller.close();
                return;
              }
              sent += 1;
              pulled += chunk.byteLength;
              controller.enqueue(chunk);
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        ),
    ];
    const result = await postOutboundSyncWebhook({
      peerUrlBase: PEER.peer_url,
      sharedSecret: "secret",
      payload: PAYLOAD,
    });
    expect(result).toMatchObject({ ok: false, status: 403, error: "http_403" });
    expect(pulled).toBeLessThan(256 * 1024);
  });

  it("does not read a 403 body whose declared length is over the cap", async () => {
    state.responses = [
      () =>
        new Response(JSON.stringify({ error_code: "SYNC_ENTITY_TYPE_REFUSED", pad: "x".repeat(8192) }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
    ];
    const result = await postOutboundSyncWebhook({
      peerUrlBase: PEER.peer_url,
      sharedSecret: "secret",
      payload: PAYLOAD,
    });
    expect(result).toMatchObject({ ok: false, status: 403, error: "http_403" });
  });

  it("keeps any other 403 as an HTTP failure (control)", async () => {
    state.responses = [UNAUTHORIZED];
    const result = await postOutboundSyncWebhook({
      peerUrlBase: PEER.peer_url,
      sharedSecret: "secret",
      payload: PAYLOAD,
    });
    expect(result).toMatchObject({ ok: false, status: 403, error: "http_403" });
  });
});

describe("real-time peer sync delivery", () => {
  const sub = {
    entity_id: "ent_sub",
    subscription_id: "sub-1",
    user_id: "user-1",
    sync_peer_id: "central",
    delivery_method: "webhook",
    consecutive_failures: 9,
    max_failures: 10,
  } as unknown as SubscriptionRecord;
  const event = {
    event_id: "evt-1",
    entity_id: "ent_issue",
    entity_type: "issue",
    observation_id: "obs_issue",
  } as unknown as SubstrateEvent;

  it("does not retry a refusal, count it as a failure, or deactivate the subscription", async () => {
    state.responses = [REFUSED, REFUSED, REFUSED, REFUSED, REFUSED];
    queuePeerSyncDelivery(sub, event);
    await vi.waitFor(() => expect(fetchCalls.count).toBe(1));
    // Let the delivery finish its bookkeeping for this attempt.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchCalls.count).toBe(1);
    expect(correctedFields()).not.toContain("consecutive_failures");
    expect(correctedFields()).not.toContain("active");
  });
});

describe("neotoma peers sync push leg", () => {
  it("counts refusals in refused_by_peer, not failed, and says what to change", async () => {
    state.outboundRows = [
      { id: "obs_1", entity_id: "ent_1", observed_at: "2026-01-01T00:00:00.000Z" },
      { id: "obs_2", entity_id: "ent_2", observed_at: "2026-01-02T00:00:00.000Z" },
    ];
    state.responses = [REFUSED, { status: 200, body: { status: "applied" } }];

    const result = (await syncPeerFull({ userId: "user-1", peer_id: "central" })) as Record<
      string,
      unknown
    >;

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.refused_by_peer).toBe(1);
    expect(result.ok).toBe(true);
    expect(String(result.message)).toMatch(/accept_governance_entity_types/);
  });

  it("moves the watermark past a batch the peer refused entirely, so later rows are not held back", async () => {
    state.outboundRows = [
      { id: "obs_1", entity_id: "ent_1", observed_at: "2026-01-01T00:00:00.000Z" },
      { id: "obs_2", entity_id: "ent_2", observed_at: "2026-01-02T00:00:00.000Z" },
    ];
    state.responses = [REFUSED, REFUSED];

    await syncPeerFull({ userId: "user-1", peer_id: "central" });

    const lsa = correctionMock.mock.calls
      .map((c) => (c as unknown as [{ field: string; value: unknown }])[0])
      .filter((c) => c.field === "last_sync_at");
    expect(lsa.map((c) => c.value)).toEqual(["2026-01-02T00:00:00.000Z"]);
  });

  it("writes the watermark again after an operator sets last_sync_at back", async () => {
    const rows = [{ id: "obs_9", entity_id: "ent_9", observed_at: "2026-01-09T00:00:00.000Z" }];
    const keys = async (lastSyncAt: string | undefined) => {
      correctionMock.mockClear();
      (PEER as Record<string, unknown>).last_sync_at = lastSyncAt;
      state.outboundRows = rows;
      state.responses = [{ status: 200, body: { status: "applied" } }];
      await syncPeerFull({ userId: "user-1", peer_id: "central" });
      return correctionMock.mock.calls
        .map((c) => (c as unknown as [{ field: string; idempotency_key: string }])[0])
        .filter((c) => c.field === "last_sync_at")
        .map((c) => c.idempotency_key);
    };
    try {
      const before = await keys("2026-01-09T00:00:00.000Z");
      const afterReset = await keys("2025-12-01T00:00:00.000Z");
      expect(before).toHaveLength(1);
      expect(afterReset).toHaveLength(1);
      expect(afterReset[0]).not.toBe(before[0]);
    } finally {
      (PEER as Record<string, unknown>).last_sync_at = undefined;
    }
  });

  it("still counts any other 403 as failed (control)", async () => {
    state.outboundRows = [
      { id: "obs_1", entity_id: "ent_1", observed_at: "2026-01-01T00:00:00.000Z" },
    ];
    state.responses = [UNAUTHORIZED];

    const result = (await syncPeerFull({ userId: "user-1", peer_id: "central" })) as Record<
      string,
      unknown
    >;

    expect(result.failed).toBe(1);
    expect(result.refused_by_peer ?? 0).toBe(0);
  });
});
