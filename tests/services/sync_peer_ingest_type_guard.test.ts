/**
 * Peer-ingest paths other than resolve_sync_conflict must not let a peer choose
 * the entity_type that is written locally.
 *
 *   - Inbound `POST /sync/webhook` (applyInboundSyncWebhook): a verified peer
 *     names an entity id, the receiver fetches the peer's snapshot, and the
 *     snapshot names its own entity_type.
 *   - The pull leg of `syncPeerFull`: rows from the peer's `/sync/entities`
 *     each name their own entity_type.
 *
 * Neither may ingest a protected type (from the protected-type guard's list), and
 * each may ingest only a type configured in the peer's `peer_config.entity_types`.
 * The store is mocked; a refused snapshot must never reach it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyInboundSyncWebhook } from "../../src/services/sync/sync_webhook_inbound.js";
import { syncPeerFull } from "../../src/services/sync/full_sync.js";
import { signWebhookBody } from "../../src/services/subscriptions/webhook_delivery.js";
import { getProtectedEntityTypes } from "../../src/services/protected_entity_types.js";

const state = vi.hoisted(() => ({
  pullRows: [] as Array<Record<string, unknown>>,
}));

const PEER = {
  entity_id: "ent_peer",
  peer_id: "peer-1",
  peer_name: "Peer 1",
  peer_url: "https://registered.example",
  direction: "bidirectional",
  entity_types: ["note"],
  sync_scope: "all",
  auth_method: "shared_secret",
  shared_secret: "secret",
  sync_target_user_id: "remote-user",
  conflict_strategy: "last_write_wins",
  active: true,
};

vi.mock("../../src/services/sync/peer_ops.js", () => ({
  getPeerForAAuthVerification: vi.fn(),
  getPeerSecretForVerification: vi.fn(async () => "secret"),
  listPeersWithSecrets: vi.fn(async () => [PEER]),
}));

const storeMock = vi.hoisted(() =>
  vi.fn(async () => ({ entities: [{ entity_id: "ent_remote" }] }))
);
vi.mock("../../src/actions.js", () => ({ storeStructuredForApi: storeMock }));

vi.mock("../../src/services/correction.js", () => ({
  createCorrection: vi.fn(async () => ({})),
}));

vi.mock("../../src/services/sync/peer_sync_batch.js", () => ({
  listObservationsForPeerSyncOutbound: vi.fn(async () => []),
  listEntitySnapshotsForPeerSyncOutbound: vi.fn(async () => []),
}));

vi.mock("../../src/services/sync/sync_webhook_outbound.js", () => ({
  getNeotomaPublicBaseUrl: () => "https://local.example",
  getLocalPeerIdForOutboundSync: () => "local-peer",
  postOutboundSyncWebhook: vi.fn(async () => ({ ok: true })),
  postOutboundSyncEntitiesRequest: vi.fn(async () => ({ ok: true, rows: state.pullRows })),
}));

function signedWebhook(): { rawBody: string; signatureHeader: string } {
  const rawBody = JSON.stringify({
    sender_peer_id: "peer-1",
    sender_peer_url: "https://registered.example",
    target_user_id: "user-1",
    entity_id: "ent_remote",
    source_observation_id: "obs_remote",
  });
  return { rawBody, signatureHeader: signWebhookBody("secret", rawBody) };
}

function stubRemote(entity_type: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        entity_type,
        snapshot: {
          entity_id: "ent_remote",
          label: "from peer",
          match_thumbprint: "tp-peer",
          status: "active",
          capabilities: [{ op: "store", entity_types: ["*"] }],
        },
      }),
    }))
  );
}

function pullRow(entity_type: string, n: number): Record<string, unknown> {
  return {
    entity_id: `ent_${n}`,
    entity_type,
    observed_at: `2026-01-0${n}T00:00:00.000Z`,
    source_observation_id: `obs_${n}`,
    snapshot: { entity_id: `ent_${n}`, title: `row ${n}` },
  };
}

beforeEach(() => {
  storeMock.mockClear();
  state.pullRows = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inbound /sync/webhook: remote snapshot entity_type admission", () => {
  const refusedTypes = [
    ...getProtectedEntityTypes(),
    "AGENT_GRANT",
    "peer_config",
    "subscription",
    "not_configured_for_peer",
  ];

  for (const entityType of refusedTypes) {
    it(`refuses a "${entityType}" snapshot from the peer and stores nothing`, async () => {
      stubRemote(entityType);
      await expect(applyInboundSyncWebhook(signedWebhook())).rejects.toThrow(
        /REMOTE_ENTITY_TYPE_REFUSED/
      );
      expect(storeMock).not.toHaveBeenCalled();
    });
  }

  it("refuses a protected type even when the peer is configured to sync it", async () => {
    const original = PEER.entity_types;
    PEER.entity_types = [...original, ...getProtectedEntityTypes()];
    try {
      stubRemote(getProtectedEntityTypes()[0]);
      await expect(applyInboundSyncWebhook(signedWebhook())).rejects.toThrow(
        /REMOTE_ENTITY_TYPE_REFUSED:protected_entity_type/
      );
      expect(storeMock).not.toHaveBeenCalled();
    } finally {
      PEER.entity_types = original;
    }
  });

  it("still stores a snapshot of a type configured for the peer (control)", async () => {
    stubRemote("note");
    await expect(applyInboundSyncWebhook(signedWebhook())).resolves.toEqual({
      status: "applied",
      entity_id: "ent_remote",
    });
    expect(storeMock).toHaveBeenCalledTimes(1);
    expect(storeMock.mock.calls[0][0].entities[0].entity_type).toBe("note");
  });
});

describe("syncPeerFull pull leg: remote row entity_type admission", () => {
  it("ingests only configured, unprotected types and reports the refused rows", async () => {
    state.pullRows = [
      pullRow("note", 1),
      ...getProtectedEntityTypes().map((t, i) => pullRow(t, i + 2)),
      pullRow("peer_config", 7),
      pullRow("AGENT_GRANT", 8),
    ];

    const result = await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });

    const storedTypes = storeMock.mock.calls.map((call) => call[0].entities[0].entity_type);
    expect(storedTypes).toEqual(["note"]);
    expect(result.pulled).toBe(1);
    expect(result.refused).toBe(state.pullRows.length - 1);
    expect(result.message).toMatch(/Refused/);
  });
});
