/**
 * Governance entity types on the configured-peer sync paths, and the single
 * source every peer-ingest path shares.
 *
 *   - Inbound `POST /sync/webhook` (applyInboundSyncWebhook) and the pull leg of
 *     `syncPeerFull` refuse every governance type by default, even when the
 *     peer is configured to sync it, and admit one only when that peer's
 *     `peer_config.accept_governance_entity_types` names it. Protected types and
 *     `peer_config` are refused even when listed.
 *   - The store payload is the admitted type with the snapshot's own store
 *     directives (`entity_type`, `target_id`, `intent`) removed.
 *   - All three peer-ingest paths (these two and `resolve_sync_conflict`
 *     prefer_remote) run the same admission from `remote_snapshot_admission.ts`.
 *
 * The store is mocked; a refused snapshot must never reach it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyInboundSyncWebhook } from "../../src/services/sync/sync_webhook_inbound.js";
import { syncPeerFull } from "../../src/services/sync/full_sync.js";
import { resolveSyncConflict } from "../../src/services/sync/conflict_resolver.js";
import { signWebhookBody } from "../../src/services/subscriptions/webhook_delivery.js";
import * as admission from "../../src/services/sync/remote_snapshot_admission.js";
import { logger } from "../../src/utils/logger.js";

/** Kept literal so this suite is red on a source tree with no governance list. */
const GOVERNANCE_TYPES = [
  "conformance_policy",
  "guest_access_token",
  "instance_policy",
  "issue",
  "peer_config",
  "skill",
  "standing_rule",
  "submission_config",
  "subscription",
];
const OPT_IN_TYPES = GOVERNANCE_TYPES.filter((t) => t !== "peer_config");

/**
 * Markers the instance writes on its own observations and reads back as state
 * (lifecycle, encryption, repair rollback). Never data a peer may supply.
 */
const RESERVED_MARKERS: Record<string, unknown> = {
  _deleted: true,
  _encrypted: true,
  _iv: "AAAA",
  _migration_run_id: "run-from-peer",
};

const state = vi.hoisted(() => ({
  pullRows: [] as Array<Record<string, unknown>>,
  remote: {} as Record<string, unknown>,
}));

const PEER: Record<string, unknown> = {
  entity_id: "ent_peer",
  peer_id: "peer-1",
  peer_name: "Peer 1",
  peer_url: "https://registered.example",
  direction: "bidirectional",
  // Configured to SYNC every governance type and agent_grant, so a refusal here
  // comes from the governance rule, not from entity_types.
  entity_types: [
    "note",
    "issue",
    "agent_grant",
    "conformance_policy",
    "guest_access_token",
    "instance_policy",
    "peer_config",
    "skill",
    "standing_rule",
    "submission_config",
    "subscription",
  ],
  sync_scope: "all",
  auth_method: "shared_secret",
  shared_secret: "secret",
  sync_target_user_id: "remote-user",
  conflict_strategy: "last_write_wins",
  active: true,
  accept_governance_entity_types: [] as string[],
};

vi.mock("../../src/services/sync/peer_ops.js", () => ({
  getPeerForAAuthVerification: vi.fn(),
  getPeerSecretForVerification: vi.fn(async () => "secret"),
  listPeersWithSecrets: vi.fn(async () => [PEER]),
  findActivePeerForUrl: vi.fn(async (_userId: string, url: string) =>
    url.replace(/\/$/, "") === PEER.peer_url ? PEER : null
  ),
}));

vi.mock("../../src/services/sync/remote_snapshot_admission.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/sync/remote_snapshot_admission.js")>();
  return {
    ...original,
    admitRemoteSnapshotType: vi.fn(original.admitRemoteSnapshotType),
  };
});

vi.mock("../../src/services/net/private_host_guard.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/net/private_host_guard.js")>();
  return {
    ...original,
    isPublicFetchUrlAllowed: () => true,
    guardedFetch: async () =>
      new Response(JSON.stringify(state.remote), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  };
});

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

function remoteSnapshot(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entity_id: "ent_remote",
    label: "from peer",
    webhook_url: "https://hostile.example/hook",
    accept_governance_entity_types: OPT_IN_TYPES,
    ...extra,
  };
}

function stubRemote(entity_type: unknown, extra: Record<string, unknown> = {}): void {
  // The webhook fetches through guardedFetch, which this suite mocks to serve
  // state.remote; the global stub is kept for any plain fetch.
  state.remote = { entity_type, snapshot: remoteSnapshot(extra) };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ entity_type, snapshot: remoteSnapshot(extra) }),
    }))
  );
}

function pullRow(entity_type: string, n: number, extra: Record<string, unknown> = {}) {
  return {
    entity_id: `ent_${n}`,
    entity_type,
    observed_at: `2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`,
    source_observation_id: `obs_${n}`,
    snapshot: { entity_id: `ent_${n}`, title: `row ${n}`, ...extra },
  };
}

function storedEntities(): Array<Record<string, unknown>> {
  return storeMock.mock.calls.map(
    (call) => (call as unknown as [{ entities: Array<Record<string, unknown>> }])[0].entities[0]
  );
}

beforeEach(() => {
  storeMock.mockClear();
  vi.mocked(admission.admitRemoteSnapshotType).mockClear();
  state.pullRows = [];
  PEER.accept_governance_entity_types = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inbound /sync/webhook: governance types", () => {
  for (const governanceType of GOVERNANCE_TYPES) {
    it(`refuses "${governanceType}" by default, though the peer is configured to sync it`, async () => {
      stubRemote(governanceType);
      await expect(applyInboundSyncWebhook(signedWebhook())).rejects.toThrow(
        /REMOTE_ENTITY_TYPE_REFUSED/
      );
      expect(storeMock).not.toHaveBeenCalled();
    });
  }

  for (const governanceType of OPT_IN_TYPES) {
    it(`admits "${governanceType}" only when the peer's allow-list names it`, async () => {
      PEER.accept_governance_entity_types = OPT_IN_TYPES.filter((t) => t !== governanceType);
      stubRemote(governanceType);
      await expect(applyInboundSyncWebhook(signedWebhook())).rejects.toThrow(
        /REMOTE_ENTITY_TYPE_REFUSED/
      );
      expect(storeMock).not.toHaveBeenCalled();

      PEER.accept_governance_entity_types = [governanceType];
      stubRemote(governanceType);
      await expect(applyInboundSyncWebhook(signedWebhook())).resolves.toMatchObject({
        status: "applied",
      });
      expect(storedEntities().map((e) => e.entity_type)).toEqual([governanceType]);
    });
  }

  for (const neverType of ["agent_grant", "peer_config"]) {
    it(`refuses "${neverType}" even when the peer's allow-list names it`, async () => {
      PEER.accept_governance_entity_types = [neverType, ...OPT_IN_TYPES];
      stubRemote(neverType);
      await expect(applyInboundSyncWebhook(signedWebhook())).rejects.toThrow(
        /REMOTE_ENTITY_TYPE_REFUSED/
      );
      expect(storeMock).not.toHaveBeenCalled();
    });
  }

  it("stores the admitted type, never a type or target named inside the snapshot", async () => {
    stubRemote("note", {
      entity_type: "peer_config",
      target_id: "ent_peer",
      intent: "create_new",
    });
    await applyInboundSyncWebhook(signedWebhook());
    const [stored] = storedEntities();
    expect(stored.entity_type).toBe("note");
    expect(stored).not.toHaveProperty("target_id");
    expect(stored).not.toHaveProperty("intent");
  });

  it("logs a refusal for this instance's operator, without the peer's type string", async () => {
    const warn = vi.spyOn(logger, "warn");
    try {
      stubRemote("issue\u0000peer text");
      await expect(applyInboundSyncWebhook(signedWebhook())).rejects.toThrow(
        /REMOTE_ENTITY_TYPE_REFUSED/
      );
      const call = warn.mock.calls.find((c) => String(c[0]).includes("refused an inbound"));
      expect(call, "no refusal log line").toBeTruthy();
      expect(call?.[1]).toMatchObject({ peer_id: "peer-1" });
      expect(JSON.stringify(call)).not.toContain("peer text");
    } finally {
      warn.mockRestore();
    }
  });

  it("drops the instance's reserved underscore markers from the snapshot", async () => {
    stubRemote("note", RESERVED_MARKERS);
    await applyInboundSyncWebhook(signedWebhook());
    const [stored] = storedEntities();
    expect(stored.entity_type).toBe("note");
    expect(stored.label).toBe("from peer");
    for (const key of Object.keys(RESERVED_MARKERS)) expect(stored).not.toHaveProperty(key);
  });
});

describe("syncPeerFull pull leg: governance types", () => {
  it("refuses every governance type by default and agent_grant / peer_config even when listed", async () => {
    PEER.accept_governance_entity_types = ["agent_grant", "peer_config"];
    state.pullRows = [
      pullRow("note", 1),
      ...GOVERNANCE_TYPES.map((t, i) => pullRow(t, i + 2)),
      pullRow("agent_grant", 20),
    ];

    const result = await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });

    expect(storedEntities().map((e) => e.entity_type)).toEqual(["note"]);
    expect(result.refused).toBe(state.pullRows.length - 1);
  });

  it("admits a governance type only when the peer's allow-list names it", async () => {
    PEER.accept_governance_entity_types = ["subscription"];
    state.pullRows = [pullRow("subscription", 1), pullRow("standing_rule", 2)];

    const result = await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });

    expect(storedEntities().map((e) => e.entity_type)).toEqual(["subscription"]);
    expect(result.refused).toBe(1);
  });

  it("stores the admitted type, never a type or target named inside the row's snapshot", async () => {
    state.pullRows = [pullRow("note", 1, { entity_type: "agent_grant", target_id: "ent_peer" })];
    await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });
    const [stored] = storedEntities();
    expect(stored.entity_type).toBe("note");
    expect(stored).not.toHaveProperty("target_id");
  });

  it("recovers rows refused before an opt-in once last_sync_at is set back (documented recovery)", async () => {
    const outbound = await import("../../src/services/sync/sync_webhook_outbound.js");
    const request = vi.mocked(outbound.postOutboundSyncEntitiesRequest);
    const savedLastSync = PEER.last_sync_at;
    try {
      state.pullRows = [pullRow("issue", 5)];
      const first = await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });
      expect(first.refused).toBe(1);
      expect(storedEntities()).toEqual([]);

      // Operator: opt the peer in, then correct last_sync_at to before the refusal.
      PEER.accept_governance_entity_types = ["issue"];
      PEER.last_sync_at = "2026-01-01T00:00:00.000Z";
      request.mockClear();
      const second = await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ observed_after: "2026-01-01T00:00:00.000Z" }),
        })
      );
      expect(second.refused).toBe(0);
      expect(storedEntities().map((e) => e.entity_type)).toEqual(["issue"]);
    } finally {
      PEER.last_sync_at = savedLastSync;
    }
  });

  it("logs refused pulled rows with counts by reason", async () => {
    const warn = vi.spyOn(logger, "warn");
    try {
      state.pullRows = [pullRow("note", 1), pullRow("issue", 2), pullRow("agent_grant", 3)];
      await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });
      const call = warn.mock.calls.find((c) => String(c[0]).includes("refused pulled peer rows"));
      expect(call, "no refusal log line").toBeTruthy();
      expect(call?.[1]).toMatchObject({
        peer_id: "peer-1",
        refused: 2,
        reasons: { governance_entity_type: 1, protected_entity_type: 1 },
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("drops the instance's reserved underscore markers from the row's snapshot", async () => {
    state.pullRows = [pullRow("note", 1, RESERVED_MARKERS)];
    await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });
    const [stored] = storedEntities();
    expect(stored.entity_type).toBe("note");
    expect(stored.title).toBe("row 1");
    for (const key of Object.keys(RESERVED_MARKERS)) expect(stored).not.toHaveProperty(key);
  });
});

describe("one source for every peer-ingest path", () => {
  it("declares exactly the governance types this ruling covers", () => {
    expect(admission.getPeerGovernanceEntityTypes()).toEqual(GOVERNANCE_TYPES);
  });

  it("runs the shared admission on /sync/webhook, the pull leg, and prefer_remote", async () => {
    const admit = vi.mocked(admission.admitRemoteSnapshotType);

    stubRemote("note");
    await applyInboundSyncWebhook(signedWebhook());
    expect(admit).toHaveBeenLastCalledWith("note", expect.objectContaining({ userId: "user-1" }));

    state.pullRows = [pullRow("standing_rule", 1)];
    await syncPeerFull({ userId: "user-1", peer_id: "peer-1" });
    expect(admit).toHaveBeenLastCalledWith(
      "standing_rule",
      expect.objectContaining({ userId: "user-1" })
    );

    state.remote = { entity_type: "subscription", snapshot: remoteSnapshot() };
    const result = await resolveSyncConflict({
      userId: "user-1",
      entity_id: "ent_remote",
      strategy: "prefer_remote",
      sender_peer_url: "https://unknown.example",
    });
    expect(result.ok).toBe(false);
    expect(admit).toHaveBeenLastCalledWith(
      "subscription",
      expect.objectContaining({ userId: "user-1" })
    );
    expect(admit).toHaveBeenCalledTimes(3);
  });

  it("no other sync module spells out a governance type", () => {
    const dir = join(__dirname, "../../src/services/sync");
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file === "remote_snapshot_admission.ts") continue;
      const source = readFileSync(join(dir, file), "utf8");
      for (const t of GOVERNANCE_TYPES.filter((g) => g !== "peer_config")) {
        if (source.includes(`"${t}"`)) offenders.push(`${file}: "${t}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
