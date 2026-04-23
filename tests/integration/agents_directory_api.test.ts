/**
 * Integration test: `/agents`, `/agents/:key`, `/agents/:key/records` for
 * the Inspector agents-directory surface.
 *
 * Seeds a source (unverified_client), an observation (hardware), and a
 * relationship observation (software) under three distinct agent
 * identities and asserts:
 *   - GET /agents returns one entry per identity with the right tier,
 *     label, and per-record-type counts.
 *   - GET /agents/:key returns the specific entry.
 *   - GET /agents/:key/records only includes records stamped by that agent.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const API_PORT = 18104;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

describe("agents directory API", () => {
  let httpServer: ReturnType<typeof createServer>;
  const suffix = Date.now();
  const sourceId = `src_dir_${suffix}`;
  const entityId = `ent_dir_${suffix}`;
  const relSource = `ent_dir_rel_a_${suffix}`;
  const relTarget = `ent_dir_rel_b_${suffix}`;
  const relType = "related_to";
  const relationshipKey = `${relType}:${relSource}:${relTarget}`;
  const observationId = `obs_dir_${suffix}`;

  const sourceAgentKey = "name:Claude Code@0.5.0";
  const observationAgentKey = "thumb:tp-dir-hw";
  const relationshipAgentKey = "thumb:tp-dir-sw";

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    await db.from("sources").insert({
      id: sourceId,
      user_id: TEST_USER_ID,
      content_hash: `hash_dir_${suffix}`,
      storage_url: `file:///test/dir_${suffix}.txt`,
      mime_type: "text/plain",
      file_size: 0,
      original_filename: "dir.txt",
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
      source_id: sourceId,
      observed_at: new Date().toISOString(),
      specificity_score: 0.5,
      source_priority: 1,
      fields: { title: "attributed observation" },
      user_id: TEST_USER_ID,
      provenance: {
        attribution_tier: "hardware",
        agent_thumbprint: "tp-dir-hw",
        agent_sub: "agent:dir:hw",
        client_name: "Hardware Agent",
      },
    });

    await db.from("relationship_observations").insert({
      id: createHash("sha256").update(`${relationshipKey}:dir`).digest("hex"),
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
        agent_thumbprint: "tp-dir-sw",
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
    await db.from("sources").delete().eq("id", sourceId);
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("GET /agents returns one entry per distinct writer", async () => {
    const res = await fetch(`${API_BASE}/agents?user_id=${TEST_USER_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agents: Array<{
        agent_key: string;
        label: string;
        tier: string;
        total_records: number;
        record_counts: Record<string, number>;
      }>;
      total: number;
    };

    const byKey = new Map(body.agents.map((a) => [a.agent_key, a]));

    const source = byKey.get(sourceAgentKey);
    expect(source, "seeded source's agent should appear").toBeDefined();
    expect(source!.tier).toBe("unverified_client");
    expect(source!.label).toBe("Claude Code 0.5.0");
    expect(source!.record_counts.source ?? 0).toBeGreaterThanOrEqual(1);

    const observation = byKey.get(observationAgentKey);
    expect(observation, "seeded observation's agent should appear").toBeDefined();
    expect(observation!.tier).toBe("hardware");
    expect(observation!.record_counts.observation ?? 0).toBeGreaterThanOrEqual(1);

    const relationship = byKey.get(relationshipAgentKey);
    expect(relationship, "seeded relationship's agent should appear").toBeDefined();
    expect(relationship!.tier).toBe("software");
    expect(relationship!.record_counts.relationship ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("GET /agents/:key returns a single directory entry", async () => {
    const res = await fetch(
      `${API_BASE}/agents/${encodeURIComponent(observationAgentKey)}?user_id=${TEST_USER_ID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agent: {
        agent_key: string;
        tier: string;
        agent_thumbprint?: string | null;
        label: string;
      };
    };
    expect(body.agent.agent_key).toBe(observationAgentKey);
    expect(body.agent.tier).toBe("hardware");
    expect(body.agent.agent_thumbprint).toBe("tp-dir-hw");
  });

  it("GET /agents/:key 404s on unknown agent", async () => {
    const res = await fetch(
      `${API_BASE}/agents/${encodeURIComponent("thumb:does-not-exist")}?user_id=${TEST_USER_ID}`,
    );
    expect(res.status).toBe(404);
  });

  it("GET /agents/:key/records only returns that agent's records", async () => {
    const res = await fetch(
      `${API_BASE}/agents/${encodeURIComponent(observationAgentKey)}/records?user_id=${TEST_USER_ID}&limit=50`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string; record_type: string; attribution_tier?: string | null }>;
    };

    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const obsRow = body.items.find(
      (i) => i.record_type === "observation" && i.id === observationId,
    );
    expect(obsRow, "the agent's observation should be included").toBeDefined();
    expect(obsRow!.attribution_tier).toBe("hardware");

    // No rows from other agents (source/relationship) should leak in.
    const foreign = body.items.find(
      (i) =>
        (i.record_type === "source" && i.id === sourceId) ||
        (i.record_type === "relationship" && i.id === relationshipKey),
    );
    expect(foreign, "other agents' records must not leak").toBeUndefined();
  });
});
