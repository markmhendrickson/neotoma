/**
 * Governance entity types from a remote peer are refused by default.
 *
 * resolve_sync_conflict with prefer_remote fetches GET /entities/:id from a
 * caller-supplied peer URL and ingests the response, whose snapshot names its
 * own entity_type. Beyond the protected types, a peer must not be able to plant
 * a type that grants access, changes policy, schedules outbound calls, steers
 * agents, or alters sync (a peer_config, a subscription, an instance_policy,
 * ...), unless the operator has opted a CONFIGURED peer in for that exact type
 * through `peer_config.accept_governance_entity_types`.
 *
 * The SSRF-guarded fetch is replaced with a canned remote response; everything
 * on the local side runs against the real test database.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { createCorrection } from "../../src/services/correction.js";
import { addPeerForUser, listPeersWithSecrets } from "../../src/services/sync/peer_ops.js";
import {
  clearGrantCacheForTests,
  findActiveGrantByIdentity,
  listGrantsForUser,
} from "../../src/services/agent_grants.js";

let remoteBody: Record<string, unknown> = {};

vi.mock("../../src/services/net/private_host_guard.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/net/private_host_guard.js")>();
  return {
    ...original,
    isPublicFetchUrlAllowed: () => true,
    guardedFetch: async () =>
      new Response(JSON.stringify(remoteBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  };
});

vi.mock("../../src/embeddings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings.js")>();
  return { ...original, generateEmbedding: vi.fn().mockResolvedValue(null) };
});

const USER_ID = LOCAL_DEV_USER_ID;
const CONFIGURED_PEER_URL = "https://configured-peer.example";
const UNKNOWN_PEER_URL = "https://unknown-peer.example";
const ORDINARY_TYPE = "test_remote_governance_ordinary";

/**
 * The governance types the operator ruling names, plus the others found in the
 * codebase that grant access, change policy, schedule outbound calls, steer
 * agents, or alter sync. Kept literal here so this suite is red on a source
 * tree that has no governance list at all.
 */
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

/** Governance types an operator can opt a configured peer into (all but peer_config). */
const OPT_IN_TYPES = GOVERNANCE_TYPES.filter((t) => t !== "peer_config");

let peerEntityId = "";
let peerId = "";

async function deleteEntities(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.from("timeline_events").delete().in("entity_id", ids);
  await db.from("entity_snapshots").delete().in("entity_id", ids);
  await db.from("raw_fragments").delete().in("entity_id", ids);
  await db.from("observations").delete().in("entity_id", ids);
  await db.from("entities").delete().in("id", ids);
}

/** Entities (any type) whose observations carry `marker`. */
async function entitiesCarrying(marker: string): Promise<Array<{ id: string; type: string }>> {
  const { data } = await db.from("observations").select("entity_id, entity_type, fields");
  const out = new Map<string, string>();
  for (const row of (data ?? []) as Array<{
    entity_id: string;
    entity_type: string;
    fields?: unknown;
  }>) {
    if (JSON.stringify(row.fields ?? {}).includes(marker)) out.set(row.entity_id, row.entity_type);
  }
  return [...out.entries()].map(([id, type]) => ({ id, type }));
}

async function cleanupMarker(marker: string): Promise<void> {
  await deleteEntities((await entitiesCarrying(marker)).map((e) => e.id));
}

/** A snapshot shaped enough like `entityType` that store would accept it. */
function governanceSnapshot(entityType: string, marker: string): Record<string, unknown> {
  const base: Record<string, unknown> = { entity_id: `ent_${marker}`, label: marker, name: marker };
  switch (entityType) {
    case "peer_config":
      return {
        ...base,
        peer_id: `hostile-${marker}`,
        peer_name: marker,
        peer_url: "https://hostile.example",
        direction: "bidirectional",
        entity_types: ["*"],
        sync_scope: "all",
        auth_method: "shared_secret",
        shared_secret: marker,
        conflict_strategy: "last_write_wins",
        active: true,
        accept_governance_entity_types: OPT_IN_TYPES,
      };
    case "subscription":
      return { ...base, webhook_url: `https://hostile.example/${marker}`, active: true };
    case "standing_rule":
      return { ...base, rule: `obey ${marker}`, enabled: true, priority: 100 };
    case "issue":
      return {
        ...base,
        local_issue_id: marker,
        title: marker,
        body: marker,
        status: "open",
        visibility: "public",
      };
    default:
      return base;
  }
}

async function preferRemote(entityId: string, senderPeerUrl: string) {
  const { resolveSyncConflict } = await import("../../src/services/sync/conflict_resolver.js");
  return resolveSyncConflict({
    userId: USER_ID,
    entity_id: entityId,
    strategy: "prefer_remote",
    sender_peer_url: senderPeerUrl,
  });
}

/** Operator action: set the configured peer's allow-list (what `correct` does). */
async function setAllowList(types: string[]): Promise<void> {
  await createCorrection({
    entity_id: peerEntityId,
    entity_type: "peer_config",
    field: "accept_governance_entity_types",
    value: types,
    schema_version: "1.0",
    user_id: USER_ID,
    idempotency_key: `test-allow-list:${peerEntityId}:${randomUUID()}`,
  });
}

async function configuredPeerAllowList(): Promise<unknown> {
  const peers = await listPeersWithSecrets(USER_ID);
  const peer = peers.find((p) => p.entity_id === peerEntityId) as
    | (Record<string, unknown> & { entity_id: string })
    | undefined;
  return peer?.accept_governance_entity_types;
}

async function snapshotOf(entityId: string): Promise<Record<string, unknown>> {
  const { data } = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .maybeSingle();
  return ((data as { snapshot?: Record<string, unknown> } | null)?.snapshot ?? {}) as Record<
    string,
    unknown
  >;
}

describe("prefer_remote: governance entity types from a peer", () => {
  beforeAll(async () => {
    const { data: stale } = await db
      .from("schema_registry")
      .select("id")
      .eq("entity_type", ORDINARY_TYPE);
    if ((stale ?? []).length > 0) {
      await db.from("schema_registry").delete().eq("entity_type", ORDINARY_TYPE);
    }
    await schemaRegistry.register({
      entity_type: ORDINARY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: { label: { type: "string", required: true } },
        canonical_name_fields: ["label"],
      },
      reducer_config: { merge_policies: { label: { strategy: "last_write" } } },
      user_id: USER_ID,
      user_specific: true,
      activate: true,
      force: true,
    });

    peerId = `governance-test-peer-${randomUUID()}`;
    const added = await addPeerForUser({
      userId: USER_ID,
      peer_id: peerId,
      peer_name: "governance test peer",
      peer_url: CONFIGURED_PEER_URL,
      direction: "bidirectional",
      // Configured to sync every opt-in type, so a refusal below comes from the
      // allow-list, not from entity_types (prefer_remote requires both).
      entity_types: [ORDINARY_TYPE, ...OPT_IN_TYPES],
      sync_scope: "all",
      auth_method: "shared_secret",
      conflict_strategy: "last_write_wins",
    });
    peerEntityId = added.entity_id;
  });

  afterAll(async () => {
    await deleteEntities(peerEntityId ? [peerEntityId] : []);
    const { data: ordinary } = await db
      .from("entities")
      .select("id")
      .eq("entity_type", ORDINARY_TYPE)
      .eq("user_id", USER_ID);
    await deleteEntities(((ordinary ?? []) as Array<{ id: string }>).map((e) => e.id));
    await db.from("schema_registry").delete().eq("entity_type", ORDINARY_TYPE);
  });

  beforeEach(async () => {
    clearGrantCacheForTests();
    await setAllowList([]);
  });

  afterEach(async () => {
    await setAllowList([]);
  });

  for (const governanceType of GOVERNANCE_TYPES) {
    it(`refuses a remote "${governanceType}" snapshot from an unconfigured peer URL`, async () => {
      const marker = `gov-unknown-${randomUUID()}`;
      remoteBody = {
        entity_type: governanceType,
        snapshot: governanceSnapshot(governanceType, marker),
      };
      try {
        const result = await preferRemote(`ent_${marker}`, UNKNOWN_PEER_URL);
        expect(result.ok).toBe(false);
        expect(result.message).toContain(governanceType);
        expect(await entitiesCarrying(marker)).toEqual([]);
      } finally {
        await cleanupMarker(marker);
      }
    });

    it(`refuses a remote "${governanceType}" snapshot from a configured peer with no allow-list`, async () => {
      const marker = `gov-configured-${randomUUID()}`;
      remoteBody = {
        entity_type: governanceType,
        snapshot: governanceSnapshot(governanceType, marker),
      };
      try {
        const result = await preferRemote(`ent_${marker}`, CONFIGURED_PEER_URL);
        expect(result.ok).toBe(false);
        expect(result.message).toContain(governanceType);
        expect(await entitiesCarrying(marker)).toEqual([]);
      } finally {
        await cleanupMarker(marker);
      }
    });
  }

  for (const governanceType of OPT_IN_TYPES) {
    it(`admits "${governanceType}" only from the configured peer whose allow-list names it`, async () => {
      const others = OPT_IN_TYPES.filter((t) => t !== governanceType);
      const listedMarker = `gov-listed-${randomUUID()}`;
      const unlistedMarker = `gov-unlisted-${randomUUID()}`;
      const unknownMarker = `gov-listed-unknown-${randomUUID()}`;
      try {
        // Allow-list names a different type: still refused.
        await setAllowList(others);
        remoteBody = {
          entity_type: governanceType,
          snapshot: governanceSnapshot(governanceType, unlistedMarker),
        };
        const unlisted = await preferRemote(`ent_${unlistedMarker}`, CONFIGURED_PEER_URL);
        expect(unlisted.ok).toBe(false);
        expect(await entitiesCarrying(unlistedMarker)).toEqual([]);

        // Allow-list names it: admitted from the configured peer...
        await setAllowList([governanceType]);
        remoteBody = {
          entity_type: governanceType,
          snapshot: governanceSnapshot(governanceType, listedMarker),
        };
        const listed = await preferRemote(`ent_${listedMarker}`, CONFIGURED_PEER_URL);
        expect(listed.ok).toBe(true);
        const written = await entitiesCarrying(listedMarker);
        expect(written.length).toBeGreaterThan(0);
        expect(written.every((e) => e.type === governanceType)).toBe(true);

        // ...and still refused from any URL nobody configured.
        remoteBody = {
          entity_type: governanceType,
          snapshot: governanceSnapshot(governanceType, unknownMarker),
        };
        const unknown = await preferRemote(`ent_${unknownMarker}`, UNKNOWN_PEER_URL);
        expect(unknown.ok).toBe(false);
        expect(await entitiesCarrying(unknownMarker)).toEqual([]);
      } finally {
        await cleanupMarker(listedMarker);
        await cleanupMarker(unlistedMarker);
        await cleanupMarker(unknownMarker);
      }
    });
  }

  it("refuses a remote agent_grant even when the configured peer's allow-list names it", async () => {
    const marker = `grant-listed-${randomUUID()}`;
    await setAllowList(["agent_grant", ...OPT_IN_TYPES]);
    remoteBody = {
      entity_type: "agent_grant",
      snapshot: {
        entity_id: `ent_${marker}`,
        label: marker,
        match_thumbprint: `tp-${marker}`,
        status: "active",
        capabilities: [{ op: "store", entity_types: ["*"] }],
      },
    };
    try {
      const result = await preferRemote(`ent_${marker}`, CONFIGURED_PEER_URL);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/protected/i);
      expect(await entitiesCarrying(marker)).toEqual([]);
      expect(await listGrantsForUser(USER_ID, { query: marker })).toEqual([]);
      clearGrantCacheForTests();
      expect(await findActiveGrantByIdentity({ thumbprint: `tp-${marker}` })).toBeNull();
    } finally {
      await cleanupMarker(marker);
    }
  });

  it("refuses a remote peer_config even when the configured peer's allow-list names it", async () => {
    const marker = `peer-config-listed-${randomUUID()}`;
    await setAllowList(["peer_config"]);
    remoteBody = {
      entity_type: "peer_config",
      snapshot: governanceSnapshot("peer_config", marker),
    };
    try {
      const result = await preferRemote(`ent_${marker}`, CONFIGURED_PEER_URL);
      expect(result.ok).toBe(false);
      expect(await entitiesCarrying(marker)).toEqual([]);
    } finally {
      await cleanupMarker(marker);
    }
  });

  for (const variant of ["agent_grants", "peer_configs", "subscriptions", "Standing Rules"]) {
    it(`refuses ${JSON.stringify(variant)}, which store would persist as a protected or governance type`, async () => {
      const marker = `variant-${randomUUID()}`;
      const canonical = variant === "agent_grants" ? "agent_grant" : "peer_config";
      remoteBody = {
        entity_type: variant,
        snapshot: {
          ...governanceSnapshot(canonical, marker),
          match_thumbprint: `tp-${marker}`,
          status: "active",
          capabilities: [{ op: "store", entity_types: ["*"] }],
        },
      };
      try {
        const result = await preferRemote(`ent_${marker}`, CONFIGURED_PEER_URL);
        expect(result.ok).toBe(false);
        expect(await entitiesCarrying(marker)).toEqual([]);
        clearGrantCacheForTests();
        expect(await findActiveGrantByIdentity({ thumbprint: `tp-${marker}` })).toBeNull();
      } finally {
        await cleanupMarker(marker);
      }
    });
  }

  describe("the allow-list cannot be set through peer data", () => {
    it("a remote peer_config naming the configured peer's url does not change its allow-list", async () => {
      const marker = `self-allow-${randomUUID()}`;
      remoteBody = {
        entity_type: "peer_config",
        snapshot: {
          ...governanceSnapshot("peer_config", marker),
          peer_id: peerId,
          peer_url: CONFIGURED_PEER_URL,
        },
      };
      try {
        const result = await preferRemote(peerEntityId, CONFIGURED_PEER_URL);
        expect(result.ok).toBe(false);
        expect(await configuredPeerAllowList()).toEqual([]);
        expect(await entitiesCarrying(marker)).toEqual([]);
      } finally {
        await cleanupMarker(marker);
      }
    });

    it("a remote snapshot's own entity_type field cannot turn an admitted type into peer_config", async () => {
      const marker = `type-override-${randomUUID()}`;
      remoteBody = {
        entity_type: ORDINARY_TYPE,
        snapshot: {
          ...governanceSnapshot("peer_config", marker),
          entity_type: "peer_config",
          peer_id: peerId,
          peer_url: CONFIGURED_PEER_URL,
        },
      };
      try {
        await preferRemote(`ent_${marker}`, CONFIGURED_PEER_URL);
        const written = await entitiesCarrying(marker);
        expect(written.filter((e) => e.type === "peer_config")).toEqual([]);
        expect(await configuredPeerAllowList()).toEqual([]);
      } finally {
        await cleanupMarker(marker);
      }
    });

    it("a remote snapshot's own entity_type field cannot turn an admitted type into agent_grant", async () => {
      const marker = `grant-override-${randomUUID()}`;
      remoteBody = {
        entity_type: ORDINARY_TYPE,
        snapshot: {
          entity_id: `ent_${marker}`,
          entity_type: "agent_grant",
          label: marker,
          match_thumbprint: `tp-${marker}`,
          status: "active",
          capabilities: [{ op: "store", entity_types: ["*"] }],
        },
      };
      try {
        await preferRemote(`ent_${marker}`, CONFIGURED_PEER_URL);
        const written = await entitiesCarrying(marker);
        expect(written.filter((e) => e.type === "agent_grant")).toEqual([]);
        clearGrantCacheForTests();
        expect(await findActiveGrantByIdentity({ thumbprint: `tp-${marker}` })).toBeNull();
      } finally {
        await cleanupMarker(marker);
      }
    });

    it("a remote snapshot's target_id cannot append peer data to the local peer_config", async () => {
      const marker = `target-${randomUUID()}`;
      const before = await snapshotOf(peerEntityId);
      remoteBody = {
        entity_type: ORDINARY_TYPE,
        snapshot: {
          entity_id: `ent_${marker}`,
          target_id: peerEntityId,
          label: marker,
          accept_governance_entity_types: OPT_IN_TYPES,
          shared_secret: marker,
          peer_url: "https://hostile.example",
        },
      };
      try {
        await preferRemote(`ent_${marker}`, CONFIGURED_PEER_URL);
        const after = await snapshotOf(peerEntityId);
        expect(after.accept_governance_entity_types).toEqual(before.accept_governance_entity_types);
        expect(after.peer_url).toBe(CONFIGURED_PEER_URL);
        expect(after.shared_secret).toBe(before.shared_secret);
        expect(await configuredPeerAllowList()).toEqual([]);
        const { data: appended } = await db
          .from("observations")
          .select("fields")
          .eq("entity_id", peerEntityId);
        expect(JSON.stringify(appended ?? [])).not.toContain(marker);
      } finally {
        await cleanupMarker(marker);
      }
    });
  });

  it("refuses a remote issue that would make a local private issue public", async () => {
    const marker = `issue-visibility-${randomUUID()}`;
    const { storeStructuredForApi } = await import("../../src/actions.js");
    const stored = (await storeStructuredForApi({
      userId: USER_ID,
      entities: [
        {
          entity_type: "issue",
          local_issue_id: marker,
          title: marker,
          body: marker,
          status: "open",
          visibility: "private",
        },
      ],
      idempotencyKey: `seed-${marker}`,
    })) as { entities?: Array<{ entity_id?: string }> };
    const localIssueId = stored.entities?.[0]?.entity_id as string;
    expect(localIssueId).toBeTruthy();
    try {
      expect((await snapshotOf(localIssueId)).visibility).toBe("private");
      for (const url of [UNKNOWN_PEER_URL, CONFIGURED_PEER_URL]) {
        remoteBody = {
          entity_type: "issue",
          snapshot: {
            entity_id: localIssueId,
            local_issue_id: marker,
            title: marker,
            visibility: "public",
          },
        };
        const result = await preferRemote(localIssueId, url);
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/governance type issue/);
        expect((await snapshotOf(localIssueId)).visibility).toBe("private");
      }
    } finally {
      await deleteEntities([localIssueId]);
      await cleanupMarker(marker);
    }
  });

  it("drops reserved underscore markers, so a remote snapshot cannot hide a local entity", async () => {
    const { isEntityDeleted } = await import("../../src/services/deletion.js");
    const { storeStructuredForApi } = await import("../../src/actions.js");
    for (const url of [UNKNOWN_PEER_URL, CONFIGURED_PEER_URL]) {
      const marker = `reserved-${randomUUID()}`;
      const stored = (await storeStructuredForApi({
        userId: USER_ID,
        entities: [{ entity_type: ORDINARY_TYPE, label: marker }],
        idempotencyKey: `seed-${marker}`,
      })) as { entities?: Array<{ entity_id?: string }> };
      const localId = stored.entities?.[0]?.entity_id as string;
      expect(localId).toBeTruthy();
      try {
        expect(await isEntityDeleted(localId, USER_ID)).toBe(false);
        // Same identity (label) under an id the instance does not hold, so
        // prefer_remote takes the no-local-entity branch and stores it.
        remoteBody = {
          entity_type: ORDINARY_TYPE,
          snapshot: {
            entity_id: `ent_other_${marker}`,
            label: marker,
            _deleted: true,
            _encrypted: true,
            _migration_run_id: `run-${marker}`,
          },
        };
        const result = await preferRemote(`ent_other_${marker}`, url);
        expect(result.ok).toBe(true);
        expect(await isEntityDeleted(localId, USER_ID)).toBe(false);
        const { data: rows } = await db
          .from("observations")
          .select("entity_id, fields")
          .eq("user_id", USER_ID);
        const carrying = ((rows ?? []) as Array<{ entity_id: string; fields?: unknown }>).filter(
          (r) => JSON.stringify(r.fields ?? {}).includes(marker)
        );
        expect(carrying.length).toBeGreaterThan(0);
        for (const row of carrying) {
          const fields = (
            typeof row.fields === "string" ? JSON.parse(row.fields) : (row.fields ?? {})
          ) as Record<string, unknown>;
          expect(Object.keys(fields).filter((k) => k.startsWith("_"))).toEqual([]);
        }
      } finally {
        await deleteEntities([localId]);
        await cleanupMarker(marker);
      }
    }
  });

  it("still ingests an ordinary remote snapshot from either peer (control)", async () => {
    for (const url of [CONFIGURED_PEER_URL, UNKNOWN_PEER_URL]) {
      const marker = `ordinary-${randomUUID()}`;
      remoteBody = {
        entity_type: ORDINARY_TYPE,
        snapshot: { entity_id: `ent_${marker}`, label: marker },
      };
      const result = await preferRemote(`ent_${marker}`, url);
      expect(result.ok).toBe(true);
      const written = await entitiesCarrying(marker);
      expect(written.map((e) => e.type)).toEqual([ORDINARY_TYPE]);
    }
  });
});
