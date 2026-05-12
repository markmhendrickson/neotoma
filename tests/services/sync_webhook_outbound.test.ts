import { afterEach, describe, expect, it, vi } from "vitest";

import {
  postOutboundSyncEntitiesRequest,
  postOutboundSyncWebhook,
} from "../../src/services/sync/sync_webhook_outbound.js";
import { signWebhookBody, stableStringify } from "../../src/services/subscriptions/webhook_delivery.js";

describe("sync webhook outbound", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a stable JSON body signed with the peer shared secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      sender_peer_id: "local",
      sender_peer_url: "https://local.example",
      target_user_id: "00000000-0000-0000-0000-000000000000",
      entity_id: "ent_123",
      source_observation_id: "obs_123",
    };
    const result = await postOutboundSyncWebhook({
      peerUrlBase: "https://peer.example/",
      sharedSecret: "secret",
      payload,
    });

    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    const body = stableStringify(payload);
    expect(url).toBe("https://peer.example/sync/webhook");
    expect(init.headers["X-Neotoma-Sync-Signature-256"]).toBe(
      signWebhookBody("secret", body),
    );
    expect(init.body).toBe(body);
  });

  it("rejects shared-secret delivery when no shared secret is configured", async () => {
    const result = await postOutboundSyncWebhook({
      peerUrlBase: "https://peer.example",
      payload: {
        sender_peer_id: "local",
        sender_peer_url: "https://local.example",
        target_user_id: "00000000-0000-0000-0000-000000000000",
        entity_id: "ent_123",
        source_observation_id: "obs_123",
      },
    });

    expect(result).toEqual({ ok: false, error: "missing_shared_secret" });
  });

  it("parses rows returned from /sync/entities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          rows: [
            {
              entity_id: "ent_123",
              entity_type: "issue",
              observed_at: "2026-05-07T00:00:00.000Z",
              source_observation_id: "obs_123",
              snapshot: { title: "A" },
            },
          ],
        }),
      }),
    );

    const result = await postOutboundSyncEntitiesRequest({
      peerUrlBase: "https://peer.example",
      sharedSecret: "secret",
      payload: {
        sender_peer_id: "local",
        target_user_id: "00000000-0000-0000-0000-000000000000",
        entity_types: ["issue"],
        limit: 10,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([
      {
        entity_id: "ent_123",
        entity_type: "issue",
        observed_at: "2026-05-07T00:00:00.000Z",
        source_observation_id: "obs_123",
        snapshot: { title: "A" },
      },
    ]);
  });
});
