/**
 * Arch Option B for PR #2313: POST /recompute_snapshots_by_type is
 * intrinsically idempotent (upsert of derived state). Retries of the same
 * live body must converge without creating entities/observations or needing
 * an ingest-style idempotency_key (change_guardrails MUST #11 scopes that
 * key to ingest/store/correct only).
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupTestEntityType } from "../helpers/test_schema_helpers.js";

const TEST_USER_ID = LOCAL_DEV_USER_ID;

type RecomputeLiveResponse = {
  entity_type: string;
  total: number;
  recomputed: number;
  errors: number;
  error_details?: Array<{ entity_id: string; error: string }>;
};

function stripVolatileSnapshot(row: {
  snapshot?: unknown;
  computed_at?: string | null;
  last_observation_at?: string | null;
  [key: string]: unknown;
}): Record<string, unknown> {
  const { computed_at: _c, last_observation_at: _l, ...rest } = row;
  const snap = rest.snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const inner = { ...(snap as Record<string, unknown>) };
    delete inner.computed_at;
    return { ...rest, snapshot: inner };
  }
  return rest;
}

describe("POST /recompute_snapshots_by_type intrinsic idempotency (arch Option B)", () => {
  const entityType = `test_recompute_idemp_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];
  let httpServer: ReturnType<typeof createServer>;
  let apiBase = "";
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const addr = httpServer.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP listen address");
    }
    apiBase = `http://127.0.0.1:${addr.port}`;

    await db.from("schema_registry").insert({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: false },
          note: { type: "string", required: false },
          schema_version: { type: "string", required: false },
        },
        canonical_name_fields: ["name"],
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          note: { strategy: "last_write" },
          schema_version: { strategy: "last_write" },
        },
      },
      active: true,
      scope: "user",
      user_id: TEST_USER_ID,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    if (createdSourceIds.length > 0) {
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
    if (createdEntityIds.length > 0) {
      await db.from("timeline_events").delete().in("entity_id", createdEntityIds);
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
    }
    await cleanupTestEntityType(entityType, TEST_USER_ID);
  });

  it("retries of live recompute converge (arch intrinsic-idempotency exception)", async () => {
    const storeResult = await (
      server as unknown as {
        store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `recompute-idemp-seed-${randomUUID()}`,
      entities: [
        {
          entity_type: entityType,
          schema_version: "1.0",
          name: "Idempotent Recompute Fixture",
          note: "seed",
        },
      ],
    });
    const seeded = JSON.parse(storeResult.content[0].text) as {
      source_id?: string;
      entities?: Array<{ entity_id: string }>;
      error?: unknown;
    };
    expect(seeded.error).toBeUndefined();
    expect(seeded.entities?.[0]?.entity_id).toBeTruthy();
    const entityId = seeded.entities![0].entity_id;
    createdEntityIds.push(entityId);
    if (seeded.source_id) createdSourceIds.push(seeded.source_id);

    const countRows = async () => {
      const [{ count: entityCount }, { count: observationCount }, { count: snapshotCount }] =
        await Promise.all([
          db
            .from("entities")
            .select("id", { count: "exact", head: true })
            .eq("entity_type", entityType)
            .eq("user_id", TEST_USER_ID),
          db
            .from("observations")
            .select("id", { count: "exact", head: true })
            .eq("entity_type", entityType)
            .eq("user_id", TEST_USER_ID),
          db
            .from("entity_snapshots")
            .select("entity_id", { count: "exact", head: true })
            .eq("entity_type", entityType)
            .eq("user_id", TEST_USER_ID),
        ]);
      return {
        entities: entityCount ?? 0,
        observations: observationCount ?? 0,
        snapshots: snapshotCount ?? 0,
      };
    };

    const readSnapshotPayload = async () => {
      const { data } = await db
        .from("entity_snapshots")
        .select("entity_id, entity_type, snapshot, computed_at, last_observation_at, observation_count")
        .eq("entity_id", entityId)
        .eq("user_id", TEST_USER_ID)
        .maybeSingle();
      expect(data).toBeTruthy();
      return stripVolatileSnapshot(data as Record<string, unknown>);
    };

    const body = { entity_type: entityType, dry_run: false };

    const firstRes = await fetch(`${apiBase}/recompute_snapshots_by_type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as RecomputeLiveResponse;
    expect(firstJson.entity_type).toBe(entityType);
    expect(firstJson.total).toBeGreaterThanOrEqual(1);
    expect(firstJson.recomputed).toBeGreaterThanOrEqual(1);
    expect(firstJson.errors).toBe(0);

    const countsAfterFirst = await countRows();
    const snapshotAfterFirst = await readSnapshotPayload();

    const secondRes = await fetch(`${apiBase}/recompute_snapshots_by_type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(secondRes.status).toBe(200);
    const secondJson = (await secondRes.json()) as RecomputeLiveResponse;
    expect(secondJson.entity_type).toBe(entityType);
    expect(secondJson.errors).toBe(0);
    // Counters are per invocation (not ledger-cached), but should still succeed.
    expect(secondJson.total).toBe(firstJson.total);
    expect(secondJson.recomputed).toBeGreaterThanOrEqual(1);

    const countsAfterSecond = await countRows();
    expect(countsAfterSecond.entities).toBe(countsAfterFirst.entities);
    expect(countsAfterSecond.observations).toBe(countsAfterFirst.observations);
    expect(countsAfterSecond.snapshots).toBe(countsAfterFirst.snapshots);

    const snapshotAfterSecond = await readSnapshotPayload();
    expect(snapshotAfterSecond).toEqual(snapshotAfterFirst);
  });
});
