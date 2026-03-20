import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, getServiceRoleClient } from "../../src/db.js";

vi.mock("../../src/services/entity_semantic_search.js", () => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [], total: 0 })),
}));

import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";

const serviceRoleClient = getServiceRoleClient();

describe("Lexical retrieval fallback", () => {
  const testUserId = "lexical-fallback-test-user";
  const testEntityIds: string[] = [];

  async function cleanupEntities() {
    if (testEntityIds.length === 0) return;
    await db.from("entity_snapshots").delete().in("entity_id", testEntityIds);
    await db.from("entities").delete().in("id", testEntityIds);
    testEntityIds.length = 0;
  }

  async function createEntityWithSnapshot(params: {
    id: string;
    entityType: string;
    canonicalName: string;
    snapshot: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    await serviceRoleClient.from("entities").insert({
      id: params.id,
      user_id: testUserId,
      entity_type: params.entityType,
      canonical_name: params.canonicalName,
    });
    testEntityIds.push(params.id);

    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: params.id,
      user_id: testUserId,
      entity_type: params.entityType,
      schema_version: "1.0",
      canonical_name: params.canonicalName,
      snapshot: params.snapshot,
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });
  }

  beforeEach(async () => {
    await cleanupEntities();
  });

  afterEach(async () => {
    await cleanupEntities();
  });

  it("matches snapshot title when canonical_name does not include search text", async () => {
    const entityId = `ent_lex_title_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_123",
      snapshot: {
        title: "MCP Integrations Assessment for Ateles and Neotoma",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "mcp integrations",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("matches reversed token order for the same report title", async () => {
    const entityId = `ent_lex_reversed_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_456",
      snapshot: {
        title: "MCP Integrations Assessment",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "integrations mcp",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("matches punctuation and hyphen variants", async () => {
    const entityId = `ent_lex_punct_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "post_draft",
      canonicalName: "draft_789",
      snapshot: {
        title: "Neotoma Developer Preview: Truth-Layer Update",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "post_draft",
      search: "neotoma-developer preview truth layer",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("finds matches beyond the first unfiltered page", async () => {
    const runId = Date.now();
    const bulkEntities = Array.from({ length: 220 }, (_, index) => ({
      id: `ent_lex_pagination_${runId}_${String(index).padStart(3, "0")}`,
      user_id: testUserId,
      entity_type: "research_report",
      canonical_name: `doc_${String(index).padStart(3, "0")}`,
    }));

    await serviceRoleClient.from("entities").insert(bulkEntities);
    for (const entity of bulkEntities) {
      testEntityIds.push(entity.id);
    }

    const targetIndex = 150;
    const targetEntityId = bulkEntities[targetIndex].id;
    const now = new Date().toISOString();
    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: targetEntityId,
      user_id: testUserId,
      entity_type: "research_report",
      schema_version: "1.0",
      canonical_name: bulkEntities[targetIndex].canonical_name,
      snapshot: { title: "Newsletter Recipients Report" },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "newsletter recipients",
      limit: 100,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === targetEntityId)).toBe(true);
  });

  it("ranks cross-type lexical matches deterministically without entity_type filter", async () => {
    const runId = Date.now();
    const canonicalFirstId = `ent_lex_rank_canonical_${runId}`;
    const snapshotFirstId = `ent_lex_rank_snapshot_${runId}`;

    await createEntityWithSnapshot({
      id: canonicalFirstId,
      entityType: "note",
      canonicalName: "icp target audience neotoma ideal customer profile",
      snapshot: { title: "Planning note" },
    });
    await createEntityWithSnapshot({
      id: snapshotFirstId,
      entityType: "research_report",
      canonicalName: "doc_rank_001",
      snapshot: { title: "ICP target audience Neotoma ideal customer profile analysis" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "ICP target audience Neotoma ideal customer profile",
      limit: 10,
      offset: 0,
    });

    const ids = result.entities.map((entity) => entity.entity_id);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(ids).toContain(canonicalFirstId);
    expect(ids).toContain(snapshotFirstId);
    expect(ids.indexOf(canonicalFirstId)).toBeLessThan(ids.indexOf(snapshotFirstId));
  });
});
