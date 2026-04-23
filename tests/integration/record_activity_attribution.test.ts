/**
 * Integration test: `/record_activity` surfaces attribution for each row.
 *
 * Regression coverage for the Inspector dashboard/activity auth work:
 * - Observations with AAuth provenance surface `attribution_tier` and an
 *   `agent_label`.
 * - Sources with clientInfo-only provenance fall back to the
 *   `unverified_client` tier and use `client_name` as the label.
 * - Relationships look up the latest `relationship_observations.provenance`
 *   rather than the (reducer) snapshot provenance.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const API_PORT = 18103;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

describe("record_activity attribution surfacing", () => {
  let httpServer: ReturnType<typeof createServer>;
  const suffix = Date.now();
  const sourceIdAuthed = `src_attr_${suffix}_a`;
  const entityId = `ent_attr_${suffix}`;
  const relSource = `ent_rel_a_${suffix}`;
  const relTarget = `ent_rel_b_${suffix}`;
  const relType = "related_to";
  const relationshipKey = `${relType}:${relSource}:${relTarget}`;
  const observationId = `obs_attr_${suffix}`;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    await db.from("sources").insert({
      id: sourceIdAuthed,
      user_id: TEST_USER_ID,
      content_hash: `hash_attr_${suffix}`,
      storage_url: `file:///test/attr_${suffix}.txt`,
      mime_type: "text/plain",
      file_size: 0,
      original_filename: "attr.txt",
      source_type: "text",
      provenance: {
        attribution_tier: "unverified_client",
        client_name: "Claude Code",
        client_version: "0.5.0",
      },
    });

    await db.from("entities").insert([
      { id: entityId, user_id: TEST_USER_ID, entity_type: "note", canonical_name: entityId },
      { id: relSource, user_id: TEST_USER_ID, entity_type: "note", canonical_name: relSource },
      { id: relTarget, user_id: TEST_USER_ID, entity_type: "note", canonical_name: relTarget },
    ]);

    await db.from("observations").insert({
      id: observationId,
      entity_id: entityId,
      entity_type: "note",
      schema_version: "1.0",
      source_id: sourceIdAuthed,
      observed_at: new Date().toISOString(),
      specificity_score: 0.5,
      source_priority: 1,
      fields: { title: "attributed observation" },
      user_id: TEST_USER_ID,
      provenance: {
        attribution_tier: "hardware",
        agent_thumbprint: "tp-activity",
        agent_sub: "agent:activity:test",
        client_name: "InspectorActivity",
      },
    });

    await db.from("relationship_observations").insert({
      id: createHash("sha256").update(`${relationshipKey}:activity`).digest("hex"),
      relationship_key: relationshipKey,
      source_entity_id: relSource,
      target_entity_id: relTarget,
      relationship_type: relType,
      observed_at: new Date().toISOString(),
      source_priority: 1,
      metadata: {},
      canonical_hash: createHash("sha256").update(relationshipKey).digest("hex"),
      user_id: TEST_USER_ID,
      provenance: {
        attribution_tier: "software",
        agent_thumbprint: "tp-rel-activity",
      },
    });

    await db.from("relationship_snapshots").upsert({
      relationship_key: relationshipKey,
      relationship_type: relType,
      source_entity_id: relSource,
      target_entity_id: relTarget,
      schema_version: "1.0",
      snapshot: {},
      computed_at: new Date().toISOString(),
      observation_count: 1,
      last_observation_at: new Date().toISOString(),
      provenance: { reducer_field: "obs" },
      user_id: TEST_USER_ID,
    });
  });

  afterAll(async () => {
    await db.from("relationship_observations").delete().eq("relationship_key", relationshipKey);
    await db.from("relationship_snapshots").delete().eq("relationship_key", relationshipKey);
    await db.from("observations").delete().eq("id", observationId);
    await db.from("entities").delete().in("id", [entityId, relSource, relTarget]);
    await db.from("sources").delete().eq("id", sourceIdAuthed);
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns attribution_tier and agent_label for observations, sources, and relationships", async () => {
    const res = await fetch(
      `${API_BASE}/record_activity?user_id=${TEST_USER_ID}&limit=200`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        record_type: string;
        id: string;
        attribution_tier?: string | null;
        agent_label?: string | null;
      }>;
    };

    const obsRow = body.items.find(
      (i) => i.record_type === "observation" && i.id === observationId,
    );
    expect(obsRow, "seeded observation should be in activity feed").toBeDefined();
    expect(obsRow!.attribution_tier).toBe("hardware");
    expect(obsRow!.agent_label).toBe("InspectorActivity");

    const srcRow = body.items.find(
      (i) => i.record_type === "source" && i.id === sourceIdAuthed,
    );
    expect(srcRow, "seeded source should be in activity feed").toBeDefined();
    expect(srcRow!.attribution_tier).toBe("unverified_client");
    expect(srcRow!.agent_label).toBe("Claude Code 0.5.0");

    const relRow = body.items.find(
      (i) => i.record_type === "relationship" && i.id === relationshipKey,
    );
    expect(relRow, "seeded relationship should be in activity feed").toBeDefined();
    expect(relRow!.attribution_tier).toBe("software");
    // Relationship provenance has no client_name/sub → falls back to short thumbprint.
    expect(relRow!.agent_label).toContain("tp-rel-a");
  });
});
