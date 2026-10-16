/**
 * resolve_sync_conflict with prefer_remote must still be able to make the remote
 * value win where the local entity holds a correction (issue #2033).
 *
 * A correction wins on every merge strategy until a later correction replaces it,
 * so the old implementation (an ordinary store at priority 1000 with a "human"
 * source kind) became a silent no-op on any locally corrected field while still
 * reporting success. prefer_remote now applies each differing field as a
 * correction, so the explicit remote preference replaces the local one.
 *
 * The SSRF-guarded fetch is replaced with a canned remote snapshot; the local
 * side runs against the real database.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

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
const TYPE = "test_prefer_remote_2033";

type McpTextResult = { content: Array<{ type?: string; text: string }> };
type TestServer = NeotomaServer & {
  authenticatedUserId?: string | null;
  store: (args: Record<string, unknown>) => Promise<McpTextResult>;
  correct: (args: Record<string, unknown>) => Promise<McpTextResult>;
  retrieveEntitySnapshot: (args: Record<string, unknown>) => Promise<McpTextResult>;
};

function parse(result: McpTextResult): Record<string, any> {
  return JSON.parse(result.content.find((c) => c.text)?.text ?? "{}");
}

async function cleanupType(): Promise<void> {
  const { data: entities } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", TYPE)
    .eq("user_id", USER_ID);
  const ids = (entities ?? []).map((e: { id: string }) => e.id);
  if (ids.length > 0) {
    const { data: observations } = await db
      .from("observations")
      .select("source_id")
      .in("entity_id", ids);
    const sourceIds = Array.from(
      new Set(
        (observations ?? [])
          .map((r: { source_id?: string | null }) => r.source_id)
          .filter((v: unknown): v is string => typeof v === "string")
      )
    );
    await db.from("timeline_events").delete().in("entity_id", ids);
    await db.from("entity_snapshots").delete().in("entity_id", ids);
    await db.from("raw_fragments").delete().in("entity_id", ids);
    await db.from("observations").delete().in("entity_id", ids);
    await db.from("entities").delete().in("id", ids);
    if (sourceIds.length > 0) await db.from("sources").delete().in("id", sourceIds);
  }
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("resolve_sync_conflict prefer_remote over local corrections (#2033)", () => {
  let server: TestServer;

  beforeAll(async () => {
    await cleanupType();
    server = new NeotomaServer() as TestServer;
    server.authenticatedUserId = USER_ID;
    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          label: { type: "string", required: true },
          last_write_field: { type: "string", required: false, preserveCase: true },
          priority_field: { type: "string", required: false, preserveCase: true },
        },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write" },
          last_write_field: { strategy: "last_write" },
          priority_field: { strategy: "highest_priority" },
        },
      },
      user_id: USER_ID,
      user_specific: true,
      activate: true,
      force: true,
    });
  });

  afterAll(async () => {
    await cleanupType();
  });

  async function seedLocallyCorrected(label: string): Promise<string> {
    const stored = parse(
      await server.store({
        user_id: USER_ID,
        idempotency_key: `seed-${randomUUID()}`,
        commit: true,
        entities: [{ entity_type: TYPE, label, last_write_field: "L0", priority_field: "P0" }],
      })
    );
    const entityId = stored.entities?.[0]?.entity_id as string;
    for (const [field, value] of [
      ["last_write_field", "L-local-correction"],
      ["priority_field", "P-local-correction"],
    ]) {
      await tick();
      await server.correct({
        user_id: USER_ID,
        entity_id: entityId,
        entity_type: TYPE,
        field,
        value,
        idempotency_key: `local-${field}-${randomUUID()}`,
      });
    }
    return entityId;
  }

  async function snapshot(entityId: string): Promise<Record<string, any>> {
    return parse(await server.retrieveEntitySnapshot({ entity_id: entityId, format: "json" }));
  }

  it("makes the remote value win on fields that hold a local correction, and says which fields it applied", async () => {
    const { resolveSyncConflict } = await import("../../src/services/sync/conflict_resolver.js");
    const label = `prefer-remote-${randomUUID()}`;
    const entityId = await seedLocallyCorrected(label);
    expect((await snapshot(entityId)).snapshot.last_write_field).toBe("L-local-correction");

    remoteBody = {
      entity_type: TYPE,
      snapshot: {
        entity_id: entityId,
        label,
        last_write_field: "L-remote",
        priority_field: "P-remote",
      },
    };
    await tick();
    const result = await resolveSyncConflict({
      userId: USER_ID,
      entity_id: entityId,
      strategy: "prefer_remote",
      sender_peer_url: "https://remote.example",
    });

    expect(result.ok).toBe(true);
    expect([...(result.fields_applied ?? [])].sort()).toEqual([
      "last_write_field",
      "priority_field",
    ]);
    const snap = await snapshot(entityId);
    expect(snap.snapshot.last_write_field).toBe("L-remote");
    expect(snap.snapshot.priority_field).toBe("P-remote");
    expect(snap.snapshot.label).toBe(label);
  });

  it("keeps the remote value against a later ordinary write, and lets a later local correction replace it", async () => {
    const { resolveSyncConflict } = await import("../../src/services/sync/conflict_resolver.js");
    const label = `prefer-remote-later-${randomUUID()}`;
    const entityId = await seedLocallyCorrected(label);
    remoteBody = {
      entity_type: TYPE,
      snapshot: { entity_id: entityId, label, last_write_field: "L-remote" },
    };
    await tick();
    await resolveSyncConflict({
      userId: USER_ID,
      entity_id: entityId,
      strategy: "prefer_remote",
      sender_peer_url: "https://remote.example",
    });

    await tick();
    await server.store({
      user_id: USER_ID,
      idempotency_key: `later-${randomUUID()}`,
      commit: true,
      source_priority: 5000,
      entities: [{ entity_type: TYPE, label, last_write_field: "ordinary-later" }],
    });
    expect((await snapshot(entityId)).snapshot.last_write_field).toBe("L-remote");

    await tick();
    await server.correct({
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "last_write_field",
      value: "L-local-again",
      idempotency_key: `local-again-${randomUUID()}`,
    });
    expect((await snapshot(entityId)).snapshot.last_write_field).toBe("L-local-again");
  });

  it("reports nothing to apply when the snapshots already match, and is idempotent on a rerun", async () => {
    const { resolveSyncConflict } = await import("../../src/services/sync/conflict_resolver.js");
    const label = `prefer-remote-match-${randomUUID()}`;
    const entityId = await seedLocallyCorrected(label);
    remoteBody = {
      entity_type: TYPE,
      snapshot: {
        entity_id: entityId,
        label,
        last_write_field: "L-local-correction",
        priority_field: "P-local-correction",
      },
    };
    const first = await resolveSyncConflict({
      userId: USER_ID,
      entity_id: entityId,
      strategy: "prefer_remote",
      sender_peer_url: "https://remote.example",
    });
    expect(first.ok).toBe(true);
    expect(first.fields_applied).toEqual([]);

    remoteBody = {
      entity_type: TYPE,
      snapshot: { entity_id: entityId, label, last_write_field: "L-remote" },
    };
    const args = {
      userId: USER_ID,
      entity_id: entityId,
      strategy: "prefer_remote" as const,
      sender_peer_url: "https://remote.example",
    };
    await tick();
    expect((await resolveSyncConflict(args)).fields_applied).toEqual(["last_write_field"]);
    // Same remote value again: the local snapshot already matches, so nothing more is written.
    expect((await resolveSyncConflict(args)).fields_applied).toEqual([]);
  });

  it("refuses a remote snapshot of a different entity type instead of reporting success", async () => {
    const { resolveSyncConflict } = await import("../../src/services/sync/conflict_resolver.js");
    const entityId = await seedLocallyCorrected(`prefer-remote-type-${randomUUID()}`);
    remoteBody = {
      entity_type: "some_other_type",
      snapshot: { entity_id: entityId, last_write_field: "L-remote" },
    };
    const result = await resolveSyncConflict({
      userId: USER_ID,
      entity_id: entityId,
      strategy: "prefer_remote",
      sender_peer_url: "https://remote.example",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/some_other_type/);
    expect((await snapshot(entityId)).snapshot.last_write_field).toBe("L-local-correction");
  });
});
