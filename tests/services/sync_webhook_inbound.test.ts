import { afterEach, describe, expect, it, vi } from "vitest";

import { applyInboundSyncWebhook } from "../../src/services/sync/sync_webhook_inbound.js";
import { signWebhookBody } from "../../src/services/subscriptions/webhook_delivery.js";

const peerState = vi.hoisted(() => ({
  peerUrl: "https://registered.example",
}));

vi.mock("../../src/services/sync/peer_ops.js", () => ({
  getPeerForAAuthVerification: vi.fn(),
  getPeerSecretForVerification: vi.fn(async () => "secret"),
  listPeersWithSecrets: vi.fn(async () => [
    {
      entity_id: "ent_peer",
      peer_id: "peer-1",
      peer_name: "Peer 1",
      peer_url: peerState.peerUrl,
      direction: "bidirectional",
      entity_types: ["issue"],
      sync_scope: "all",
      auth_method: "shared_secret",
      shared_secret: "secret",
      conflict_strategy: "last_write_wins",
      active: true,
    },
  ]),
}));

vi.mock("../../src/actions.js", () => ({
  storeStructuredForApi: vi.fn(async () => ({
    entities: [{ entity_id: "ent_remote" }],
  })),
}));

function signedBody(senderPeerUrl: string): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify({
    sender_peer_id: "peer-1",
    sender_peer_url: senderPeerUrl,
    target_user_id: "user-1",
    entity_id: "ent_remote",
    source_observation_id: "obs_remote",
  });
  return {
    rawBody,
    signature: signWebhookBody("secret", rawBody),
  };
}

describe("sync webhook inbound sender URL validation", () => {
  afterEach(() => {
    peerState.peerUrl = "https://registered.example";
    delete process.env.NEOTOMA_HOSTED_MODE;
    vi.unstubAllGlobals();
  });

  it("rejects a sender_peer_url that does not match the configured peer_url", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { rawBody, signature } = signedBody("https://evil.example");

    await expect(
      applyInboundSyncWebhook({
        rawBody,
        signatureHeader: signature,
      }),
    ).rejects.toThrow("SENDER_PEER_URL_MISMATCH");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects private sender_peer_url hosts in hosted mode before fetching", async () => {
    process.env.NEOTOMA_HOSTED_MODE = "1";
    peerState.peerUrl = "http://127.0.0.1:3080";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { rawBody, signature } = signedBody("http://127.0.0.1:3080");

    await expect(
      applyInboundSyncWebhook({
        rawBody,
        signatureHeader: signature,
      }),
    ).rejects.toThrow("SENDER_PEER_URL_PRIVATE_HOST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches from the configured peer URL when sender_peer_url matches", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        entity_type: "issue",
        snapshot: { title: "Synced issue" },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { rawBody, signature } = signedBody("https://registered.example/");

    await expect(
      applyInboundSyncWebhook({
        rawBody,
        signatureHeader: signature,
      }),
    ).resolves.toEqual({ status: "applied", entity_id: "ent_remote" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://registered.example/entities/ent_remote",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
