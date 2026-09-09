/**
 * Integration test: MCP list_relationships entity-id filters (#2205).
 *
 * ListRelationshipsRequestSchema declares `source_entity_id` and
 * `target_entity_id` alongside `entity_id`, and its `.refine` accepts any one
 * of them alone. The HTTP /list_relationships handler implements all three.
 * The MCP handler (NeotomaServer.listRelationships) filtered ONLY on
 * `entity_id`, so a call passing just `source_entity_id` ran
 * `.eq("source_entity_id", undefined)` and returned a confident **zero** for
 * edges that demonstrably exist — while `entity_id` + direction on the same
 * entity returned them. The tool description points callers at
 * `source_entity_id` + `target_entity_id` for delete-type discovery, so the
 * broken path was the documented one.
 *
 * The contract asserted here is the EQUIVALENCE between the two query paths:
 *   - source_entity_id === entity_id + direction: outbound
 *   - target_entity_id === entity_id + direction: inbound
 * Testing the equivalence directly (rather than "returns > 0 rows") is what
 * catches a partial fix that wires up one filter and not the other.
 */

import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const OWNER_USER_ID = "00000000-0000-0000-0000-0000000022a5";

function makeEntityId(tag: string): string {
  const hex = createHash("sha256").update(tag).digest("hex").slice(0, 24);
  return `ent_${hex}`;
}

type McpResponse = { content: Array<{ type: string; text: string }> };

type ListResult = {
  relationships: Array<{
    relationship_key: string;
    relationship_type: string;
    source_entity_id: string;
    target_entity_id: string;
    direction: string;
  }>;
  total: number;
  limit: number;
  offset: number;
};

async function listRelationships(
  server: NeotomaServer,
  params: Record<string, unknown>
): Promise<ListResult> {
  const raw = (await (
    server as unknown as Record<string, (p: unknown) => Promise<McpResponse>>
  ).listRelationships(params)) as McpResponse;
  return JSON.parse(raw.content[0].text) as ListResult;
}

const keysOf = (result: ListResult): string[] =>
  result.relationships.map((r) => r.relationship_key).sort();

describe("MCP list_relationships entity-id filters (#2205)", () => {
  let server: NeotomaServer;

  const runId = Date.now();
  const hubId = makeEntityId(`lr-filters-hub-${runId}`);
  const childAId = makeEntityId(`lr-filters-child-a-${runId}`);
  const childBId = makeEntityId(`lr-filters-child-b-${runId}`);
  const parentId = makeEntityId(`lr-filters-parent-${runId}`);
  const entityIds = [hubId, childAId, childBId, parentId];

  // Two outbound edges from the hub (differing types) and one inbound edge to
  // it, so the outbound/inbound equivalences are distinguishable and a
  // relationship_type filter has something to narrow.
  const edges = [
    { type: "PART_OF", source: hubId, target: childAId },
    { type: "REFERS_TO", source: hubId, target: childBId },
    { type: "PART_OF", source: parentId, target: hubId },
  ] as const;

  const relationshipKeys = edges.map((e) => `${e.type}:${e.source}:${e.target}`);

  async function seedEdge(
    relationshipType: string,
    sourceId: string,
    targetId: string
  ): Promise<void> {
    const relationshipKey = `${relationshipType}:${sourceId}:${targetId}`;
    const now = new Date().toISOString();

    await db.from("relationship_observations").insert({
      id: createHash("sha256").update(`${relationshipKey}:${OWNER_USER_ID}:obs`).digest("hex"),
      relationship_key: relationshipKey,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      relationship_type: relationshipType,
      source_priority: 1,
      metadata: {},
      canonical_hash: createHash("sha256")
        .update(`${relationshipKey}:${OWNER_USER_ID}`)
        .digest("hex"),
      user_id: OWNER_USER_ID,
      observed_at: now,
      provenance: {},
    });

    await db.from("relationship_snapshots").upsert({
      relationship_key: relationshipKey,
      relationship_type: relationshipType,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      schema_version: "1.0",
      snapshot: {},
      computed_at: now,
      observation_count: 1,
      last_observation_at: now,
      provenance: {},
      user_id: OWNER_USER_ID,
      is_live: 1,
    });
  }

  beforeAll(async () => {
    server = new NeotomaServer();
    // Set authenticated user directly — avoids needing a real MCP initialize
    // handshake (same approach as relationship_delete_discovery_mcp.test.ts).
    (server as unknown as { authenticatedUserId: string }).authenticatedUserId = OWNER_USER_ID;

    for (const id of entityIds) {
      await db.from("entities").insert({
        id,
        user_id: OWNER_USER_ID,
        entity_type: "note",
        canonical_name: id,
      });
    }

    for (const edge of edges) {
      await seedEdge(edge.type, edge.source, edge.target);
    }
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", relationshipKeys);
    await db.from("relationship_observations").delete().in("relationship_key", relationshipKeys);
    await db.from("entities").delete().in("id", entityIds);
  });

  it("baseline: entity_id + direction returns the seeded edges", async () => {
    // Guards the instrument itself: if this is zero, the fixture is wrong and
    // the equivalence assertions below would pass vacuously (0 === 0).
    const outbound = await listRelationships(server, {
      entity_id: hubId,
      direction: "outbound",
      user_id: OWNER_USER_ID,
    });
    expect(outbound.total).toBe(2);

    const inbound = await listRelationships(server, {
      entity_id: hubId,
      direction: "inbound",
      user_id: OWNER_USER_ID,
    });
    expect(inbound.total).toBe(1);
  });

  it("source_entity_id returns the same edges as entity_id + direction: outbound", async () => {
    const viaEntityId = await listRelationships(server, {
      entity_id: hubId,
      direction: "outbound",
      user_id: OWNER_USER_ID,
    });
    const viaSource = await listRelationships(server, {
      source_entity_id: hubId,
      user_id: OWNER_USER_ID,
    });

    expect(viaSource.total).toBe(viaEntityId.total);
    expect(keysOf(viaSource)).toEqual(keysOf(viaEntityId));
    // Non-vacuous: the equivalence is over a non-empty set.
    expect(keysOf(viaSource).length).toBeGreaterThan(0);
  });

  it("target_entity_id returns the same edges as entity_id + direction: inbound", async () => {
    const viaEntityId = await listRelationships(server, {
      entity_id: hubId,
      direction: "inbound",
      user_id: OWNER_USER_ID,
    });
    const viaTarget = await listRelationships(server, {
      target_entity_id: hubId,
      user_id: OWNER_USER_ID,
    });

    expect(viaTarget.total).toBe(viaEntityId.total);
    expect(keysOf(viaTarget)).toEqual(keysOf(viaEntityId));
    expect(keysOf(viaTarget).length).toBeGreaterThan(0);
  });

  it("source_entity_id + target_entity_id discovers the type of a specific edge", async () => {
    // The path the tool description sends callers down before
    // delete_relationship: "pass both source_entity_id and target_entity_id to
    // discover the relationship_type".
    const result = await listRelationships(server, {
      source_entity_id: hubId,
      target_entity_id: childBId,
      user_id: OWNER_USER_ID,
    });

    expect(result.total).toBe(1);
    expect(result.relationships[0].relationship_type).toBe("REFERS_TO");
    expect(result.relationships[0].source_entity_id).toBe(hubId);
    expect(result.relationships[0].target_entity_id).toBe(childBId);
  });

  it("combines relationship_type with source_entity_id", async () => {
    const result = await listRelationships(server, {
      source_entity_id: hubId,
      relationship_type: "PART_OF",
      user_id: OWNER_USER_ID,
    });

    expect(result.total).toBe(1);
    expect(result.relationships[0].relationship_key).toBe(`PART_OF:${hubId}:${childAId}`);
  });

  it("tags rows with the direction relative to the filtered entity", async () => {
    const viaSource = await listRelationships(server, {
      source_entity_id: hubId,
      user_id: OWNER_USER_ID,
    });
    // Assert the population first: `every` on an empty array is vacuously
    // true, so without this the case would pass against the unfixed handler.
    expect(viaSource.relationships).toHaveLength(2);
    expect(viaSource.relationships.every((r) => r.direction === "outbound")).toBe(true);

    const viaTarget = await listRelationships(server, {
      target_entity_id: hubId,
      user_id: OWNER_USER_ID,
    });
    expect(viaTarget.relationships).toHaveLength(1);
    expect(viaTarget.relationships.every((r) => r.direction === "inbound")).toBe(true);
  });

  it("scopes the entity-id filters to the authenticated user", async () => {
    // Tenant isolation must hold on the newly wired path too — a filter that
    // forgets .eq("user_id") would leak another tenant's edges.
    const otherUserServer = new NeotomaServer();
    (otherUserServer as unknown as { authenticatedUserId: string }).authenticatedUserId =
      "00000000-0000-0000-0000-0000000022a6";

    const result = await listRelationships(otherUserServer, {
      source_entity_id: hubId,
      user_id: "00000000-0000-0000-0000-0000000022a6",
    });

    expect(result.total).toBe(0);
  });
});
