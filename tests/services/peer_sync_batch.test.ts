import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../src/db.js";
import { listObservationsForPeerSyncOutbound } from "../../src/services/sync/peer_sync_batch.js";

vi.mock("../../src/db.js", () => ({
  db: {
    from: vi.fn(),
  },
}));

function observationsQuery(rows: unknown[]) {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return query;
}

function snapshotsQuery(rows: unknown[]) {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return query;
}

describe("peer sync batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes sync-originated observations from outbound batches", async () => {
    vi.mocked(db.from)
      .mockReturnValueOnce(
        observationsQuery([
          {
            id: "obs_local",
            entity_id: "ent_local",
            entity_type: "issue",
            observed_at: "2026-05-07T00:00:00.000Z",
            observation_source: "human",
          },
          {
            id: "obs_sync",
            entity_id: "ent_sync",
            entity_type: "issue",
            observed_at: "2026-05-07T00:00:01.000Z",
            observation_source: "sync",
          },
        ]),
      );

    const rows = await listObservationsForPeerSyncOutbound({
      userId: "user",
      entityTypes: ["issue"],
      observedAfterIso: null,
      limit: 100,
    });

    expect(rows.map((row) => row.id)).toEqual(["obs_local"]);
  });

  it("keeps only entities tagged for the peer when sync_scope is tagged", async () => {
    vi.mocked(db.from)
      .mockReturnValueOnce(
        observationsQuery([
          {
            id: "obs_a",
            entity_id: "ent_a",
            entity_type: "issue",
            observed_at: "2026-05-07T00:00:00.000Z",
            observation_source: "human",
          },
          {
            id: "obs_b",
            entity_id: "ent_b",
            entity_type: "issue",
            observed_at: "2026-05-07T00:00:01.000Z",
            observation_source: "human",
          },
        ]),
      )
      .mockReturnValueOnce(
        snapshotsQuery([
          { entity_id: "ent_a", snapshot: { sync_peers: ["peer-a"] } },
          { entity_id: "ent_b", snapshot: { sync_peers: ["peer-b"] } },
        ]),
      );

    const rows = await listObservationsForPeerSyncOutbound({
      userId: "user",
      entityTypes: ["issue"],
      observedAfterIso: null,
      limit: 100,
      syncScope: "tagged",
      peerId: "peer-a",
    });

    expect(rows.map((row) => row.entity_id)).toEqual(["ent_a"]);
  });
});
