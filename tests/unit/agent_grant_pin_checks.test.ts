/**
 * Grant-service pin checks that need a pre-existing duplicate pin, which
 * the write checks now prevent from being created through any entrance.
 * Storage (entity query, snapshot read, owner lookup) is stubbed so the
 * duplicate can be seeded directly.
 *
 * Also covers the bound on the identity-lookup cache.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type GrantRow = {
  entity_id: string;
  user_id: string;
  snapshot: Record<string, unknown>;
  last_observation_at: string;
  created_at: string;
};

const grantRows: GrantRow[] = [];

vi.mock("../../src/services/entity_queries.js", () => ({
  queryEntities: vi.fn(async () =>
    grantRows.map((r) => ({
      entity_id: r.entity_id,
      snapshot: r.snapshot,
      last_observation_at: r.last_observation_at,
      created_at: r.created_at,
    }))
  ),
  getEntityWithProvenance: vi.fn(async (id: string) => {
    const row = grantRows.find((r) => r.entity_id === id);
    return row
      ? {
          entity_id: row.entity_id,
          entity_type: "agent_grant",
          snapshot: row.snapshot,
          created_at: row.created_at,
          last_observation_at: row.last_observation_at,
        }
      : null;
  }),
}));

vi.mock("../../src/db.js", () => ({
  db: {
    from: () => {
      let id: string | null = null;
      const chain = {
        select: () => chain,
        eq: (_col: string, value: string) => {
          id = value;
          return chain;
        },
        maybeSingle: async () => {
          const row = grantRows.find((r) => r.entity_id === id);
          return row
            ? { data: { user_id: row.user_id, entity_type: "agent_grant" }, error: null }
            : { data: null, error: null };
        },
      };
      return chain;
    },
  },
}));

const createCorrection = vi.fn(async () => ({}));
vi.mock("../../src/services/correction.js", () => ({
  createCorrection: (...args: unknown[]) => createCorrection(...(args as [])),
}));

import {
  AgentGrantPinConflictError,
  assertGrantWriteKeepsPinUnique,
  clearGrantCacheForTests,
  grantCacheSizeForTests,
  lookupGrantForIdentity,
  setStatus,
} from "../../src/services/agent_grants.js";

const OWNER_A = "user-owner-a";
const OWNER_B = "user-owner-b";
const TP = "shared-thumbprint-value";

function putGrant(id: string, owner: string, fields: Record<string, unknown>) {
  grantRows.push({
    entity_id: id,
    user_id: owner,
    snapshot: {
      label: `grant ${id}`,
      status: "active",
      capabilities: [{ op: "retrieve", entity_types: ["task"] }],
      ...fields,
    },
    last_observation_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
  });
}

beforeEach(() => {
  grantRows.length = 0;
  createCorrection.mockClear();
  clearGrantCacheForTests();
});

describe("returning a grant to service when another owner pins its key", () => {
  it("setStatus refuses to restore a revoked grant whose key another owner pins", async () => {
    putGrant("ent_grant_a", OWNER_A, { match_thumbprint: TP, status: "revoked" });
    putGrant("ent_grant_b", OWNER_B, { match_thumbprint: TP, status: "active" });

    await expect(setStatus(OWNER_A, "ent_grant_a", "active")).rejects.toBeInstanceOf(
      AgentGrantPinConflictError
    );
    expect(createCorrection).not.toHaveBeenCalled();
  });

  it("setStatus refuses to restore a suspended grant whose key another owner pins", async () => {
    putGrant("ent_grant_a", OWNER_A, { match_thumbprint: TP, status: "suspended" });
    putGrant("ent_grant_b", OWNER_B, { match_thumbprint: TP, status: "active" });

    await expect(setStatus(OWNER_A, "ent_grant_a", "active")).rejects.toBeInstanceOf(
      AgentGrantPinConflictError
    );
    expect(createCorrection).not.toHaveBeenCalled();
  });

  it("setStatus still allows revoking a grant whose key another owner pins", async () => {
    putGrant("ent_grant_a", OWNER_A, { match_thumbprint: TP, status: "active" });
    putGrant("ent_grant_b", OWNER_B, { match_thumbprint: TP, status: "active" });

    await setStatus(OWNER_A, "ent_grant_a", "revoked");
    expect(createCorrection).toHaveBeenCalledTimes(1);
  });

  it("setStatus restores a revoked grant when no other owner pins its key", async () => {
    putGrant("ent_grant_a", OWNER_A, { match_thumbprint: TP, status: "revoked" });

    await setStatus(OWNER_A, "ent_grant_a", "active");
    expect(createCorrection).toHaveBeenCalledTimes(1);
  });

  it("a status correction to active is refused when another owner pins the grant's key", async () => {
    putGrant("ent_grant_a", OWNER_A, { match_thumbprint: TP, status: "revoked" });
    putGrant("ent_grant_b", OWNER_B, { match_thumbprint: TP, status: "active" });

    await expect(
      assertGrantWriteKeepsPinUnique({
        userId: OWNER_A,
        entityType: "agent_grant",
        fields: { status: "active" },
        entityId: "ent_grant_a",
      })
    ).rejects.toBeInstanceOf(AgentGrantPinConflictError);
  });

  it("a status correction to revoked is allowed", async () => {
    putGrant("ent_grant_a", OWNER_A, { match_thumbprint: TP, status: "active" });
    putGrant("ent_grant_b", OWNER_B, { match_thumbprint: TP, status: "active" });

    await expect(
      assertGrantWriteKeepsPinUnique({
        userId: OWNER_A,
        entityType: "agent_grant",
        fields: { status: "revoked" },
        entityId: "ent_grant_a",
      })
    ).resolves.toBeUndefined();
  });

  it("writes to other entity types are not checked", async () => {
    putGrant("ent_grant_b", OWNER_B, { match_thumbprint: TP, status: "active" });

    await expect(
      assertGrantWriteKeepsPinUnique({
        userId: OWNER_A,
        entityType: "task",
        fields: { match_thumbprint: TP },
      })
    ).resolves.toBeUndefined();
  });
});

describe("identity-lookup cache", () => {
  it("stays bounded under many distinct presented keys", async () => {
    for (let i = 0; i < 5_200; i += 1) {
      await lookupGrantForIdentity({ thumbprint: `tp-${i}`, sub: null, iss: null });
    }
    expect(grantCacheSizeForTests()).toBeLessThanOrEqual(5_000);
  });
});
