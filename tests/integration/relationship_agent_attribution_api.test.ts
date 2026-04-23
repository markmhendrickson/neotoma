/**
 * Integration test: relationship APIs expose usable agent attribution.
 *
 * Regression coverage for the Inspector auth-surfacing work:
 * - `GET /relationships` returns a top-level `agent_attribution` derived from
 *   the most recent `relationship_observations.provenance` row, not from the
 *   snapshot-level reducer provenance (which is a `field → observation_id`
 *   map, not an identity payload).
 * - `GET /relationships/:id` exposes the same `agent_attribution` field.
 * - `POST /relationships/snapshot` returns per-observation `provenance` so
 *   the Inspector detail page can render an agent badge per contributing
 *   observation.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const API_PORT = 18102;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

interface AnyObject {
  [key: string]: unknown;
}

describe("relationship agent attribution API", () => {
  let httpServer: ReturnType<typeof createServer>;
  const createdRelationshipKeys: string[] = [];
  const createdEntityIds: string[] = [];
  const suffix = Date.now();
  const sourceEntityId = `ent_rel_attr_src_${suffix}`;
  const targetEntityId = `ent_rel_attr_tgt_${suffix}`;
  const relationshipType = "related_to";
  const relationshipKey = `${relationshipType}:${sourceEntityId}:${targetEntityId}`;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    for (const id of [sourceEntityId, targetEntityId]) {
      await db.from("entities").insert({
        id,
        user_id: TEST_USER_ID,
        entity_type: "note",
        canonical_name: id,
      });
      createdEntityIds.push(id);
    }

    const baseObs = {
      relationship_key: relationshipKey,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      relationship_type: relationshipType,
      source_priority: 1,
      metadata: {},
      canonical_hash: createHash("sha256").update(relationshipKey).digest("hex"),
      user_id: TEST_USER_ID,
    };

    await db.from("relationship_observations").insert({
      ...baseObs,
      id: createHash("sha256").update(`${relationshipKey}:older`).digest("hex"),
      observed_at: new Date(Date.now() - 60_000).toISOString(),
      provenance: {
        attribution_tier: "software",
        agent_thumbprint: "tp-older",
        client_name: "OlderClient",
      },
    });

    await db.from("relationship_observations").insert({
      ...baseObs,
      id: createHash("sha256").update(`${relationshipKey}:newer`).digest("hex"),
      observed_at: new Date().toISOString(),
      provenance: {
        attribution_tier: "hardware",
        agent_thumbprint: "tp-latest",
        agent_sub: "agent:test:rel",
        agent_algorithm: "ES256",
        client_name: "InspectorTest",
        client_version: "1.2.3",
      },
    });

    await db.from("relationship_snapshots").upsert({
      relationship_key: relationshipKey,
      relationship_type: relationshipType,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      schema_version: "1.0",
      snapshot: {},
      computed_at: new Date().toISOString(),
      observation_count: 2,
      last_observation_at: new Date().toISOString(),
      provenance: { some_field: "obs_id_placeholder" },
      user_id: TEST_USER_ID,
    });

    createdRelationshipKeys.push(relationshipKey);
  });

  afterAll(async () => {
    if (createdRelationshipKeys.length > 0) {
      await db
        .from("relationship_observations")
        .delete()
        .in("relationship_key", createdRelationshipKeys);
      await db
        .from("relationship_snapshots")
        .delete()
        .in("relationship_key", createdRelationshipKeys);
      createdRelationshipKeys.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("GET /relationships exposes latest agent_attribution separate from reducer provenance", async () => {
    const res = await fetch(
      `${API_BASE}/relationships?user_id=${TEST_USER_ID}&limit=100`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      relationships: Array<AnyObject & { relationship_key?: string }>;
    };
    const row = body.relationships.find(
      (r) => r.relationship_key === relationshipKey,
    );
    expect(row, "test relationship should be returned").toBeDefined();

    const attribution = row!.agent_attribution as AnyObject | null | undefined;
    expect(attribution, "agent_attribution should be populated").toBeTruthy();
    expect(attribution!.attribution_tier).toBe("hardware");
    expect(attribution!.agent_thumbprint).toBe("tp-latest");
    expect(attribution!.client_name).toBe("InspectorTest");

    const reducerProv = row!.provenance as AnyObject | undefined;
    expect(reducerProv, "snapshot.provenance should remain the reducer map").toBeDefined();
    expect(reducerProv!.attribution_tier).toBeUndefined();
  });

  it("POST /relationships/snapshot returns per-observation provenance and a snapshot-level agent_attribution", async () => {
    const res = await fetch(`${API_BASE}/relationships/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relationship_type: relationshipType,
        source_entity_id: sourceEntityId,
        target_entity_id: targetEntityId,
        user_id: TEST_USER_ID,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      snapshot: AnyObject;
      observations: AnyObject[];
    };

    const snapshotAttribution = body.snapshot.agent_attribution as
      | AnyObject
      | null
      | undefined;
    expect(snapshotAttribution).toBeTruthy();
    expect(snapshotAttribution!.attribution_tier).toBe("hardware");
    expect(snapshotAttribution!.agent_thumbprint).toBe("tp-latest");

    expect(Array.isArray(body.observations)).toBe(true);
    expect(body.observations.length).toBeGreaterThanOrEqual(2);
    for (const obs of body.observations) {
      expect(obs.provenance, "each contributing observation carries its own provenance").toBeDefined();
    }
    const tiers = body.observations
      .map((o) => (o.provenance as AnyObject | undefined)?.attribution_tier)
      .filter(Boolean);
    expect(tiers).toContain("hardware");
    expect(tiers).toContain("software");
  });
});
