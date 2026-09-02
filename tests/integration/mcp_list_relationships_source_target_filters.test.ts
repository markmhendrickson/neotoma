/**
 * MCP `list_relationships` source/target filters (neotoma#2205, #1973).
 *
 * `ListRelationshipsRequestSchema` accepts `source_entity_id` and
 * `target_entity_id`, and the HTTP handler (`POST /list_relationships`,
 * src/actions.ts) branches on both. The MCP handler
 * (`NeotomaServer.listRelationships`, src/server.ts) does not: it queries
 * `parsed.entity_id` only, so a call filtered solely by `source_entity_id`
 * runs `.eq("source_entity_id", undefined)` and matches nothing.
 *
 * The result is a read path that disagrees with the write path — the defect
 * reported five times (#2205, #1973, #2156, #369, #277) and worked around, for
 * months, with `GET /entities/<id>/relationships` or
 * `retrieve_graph_neighborhood`.
 *
 * Harness mirrors tests/integration/mcp_handler_cross_user_scoping.test.ts:
 * construct a server, set `authenticatedUserId`, call the private handler via
 * a cast, seed rows directly through `db`.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

const PFX = "mcp_lr_filters";

describe("MCP list_relationships source/target filters (#2205, #1973)", () => {
  let server: NeotomaServer;
  const userId = randomUUID();

  const sourceId = `${PFX}_src_${randomUUID().slice(0, 8)}`;
  const targetId = `${PFX}_tgt_${randomUUID().slice(0, 8)}`;
  const otherTargetId = `${PFX}_tgt2_${randomUUID().slice(0, 8)}`;

  const relType = "PART_OF";
  const relKey = `${relType}:${sourceId}:${targetId}`;
  const otherRelKey = `${relType}:${sourceId}:${otherTargetId}`;
  const relKeys = [relKey, otherRelKey];
  const entityIds = [sourceId, targetId, otherTargetId];

  async function seedEntity(id: string): Promise<void> {
    await db.from("entities").insert({
      id,
      user_id: userId,
      entity_type: "test",
      canonical_name: id,
    });
  }

  async function seedEdge(key: string, src: string, tgt: string): Promise<void> {
    const ts = new Date().toISOString();
    await db.from("relationship_snapshots").insert({
      relationship_key: key,
      relationship_type: relType,
      source_entity_id: src,
      target_entity_id: tgt,
      schema_version: "1.0",
      snapshot: {},
      computed_at: ts,
      observation_count: 1,
      last_observation_at: ts,
      provenance: {},
      user_id: userId,
      is_live: 1,
    });
  }

  /** Call the private MCP handler and parse its JSON text payload. */
  async function listRelationships(args: Record<string, unknown>) {
    const res = await (server as any).listRelationships(args);
    return JSON.parse(res.content[0].text) as {
      relationships: Array<{
        source_entity_id: string;
        target_entity_id: string;
        relationship_type: string;
      }>;
      total?: number;
    };
  }

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as any).authenticatedUserId = userId;

    for (const id of entityIds) await seedEntity(id);
    await seedEdge(relKey, sourceId, targetId);
    await seedEdge(otherRelKey, sourceId, otherTargetId);
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", relKeys);
    await db.from("entities").delete().in("id", entityIds);
  });

  it("baseline: the legacy entity_id + direction filter finds the live edges", async () => {
    const out = await listRelationships({ entity_id: sourceId, direction: "outgoing" });
    expect(out.relationships).toHaveLength(2);
  });

  it("source_entity_id alone returns the live out-edges", async () => {
    const out = await listRelationships({ source_entity_id: sourceId });
    expect(out.relationships.length).toBeGreaterThan(0);
    for (const r of out.relationships) {
      expect(r.source_entity_id).toBe(sourceId);
    }
    expect(out.relationships).toHaveLength(2);
  });

  it("target_entity_id alone returns the live in-edges", async () => {
    const out = await listRelationships({ target_entity_id: targetId });
    expect(out.relationships).toHaveLength(1);
    expect(out.relationships[0]!.target_entity_id).toBe(targetId);
  });

  it("source_entity_id + target_entity_id resolves one edge (documented pre-delete type discovery)", async () => {
    const out = await listRelationships({
      source_entity_id: sourceId,
      target_entity_id: targetId,
    });
    expect(out.relationships).toHaveLength(1);
    expect(out.relationships[0]!.relationship_type).toBe(relType);
  });

  it("source_entity_id + relationship_type traverses typed out-edges", async () => {
    const out = await listRelationships({
      source_entity_id: sourceId,
      relationship_type: relType,
    });
    expect(out.relationships).toHaveLength(2);

    const none = await listRelationships({
      source_entity_id: sourceId,
      relationship_type: "REFERS_TO",
    });
    expect(none.relationships).toHaveLength(0);
  });

  it("does not leak edges belonging to another user", async () => {
    (server as any).authenticatedUserId = randomUUID();
    try {
      const out = await listRelationships({ source_entity_id: sourceId });
      expect(out.relationships).toHaveLength(0);
    } finally {
      (server as any).authenticatedUserId = userId;
    }
  });
});
