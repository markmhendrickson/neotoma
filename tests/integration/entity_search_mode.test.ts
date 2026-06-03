/**
 * Regression tests for the search_mode response signal (issue #1506).
 *
 * queryEntitiesWithCount silently degraded semantic → lexical search when the
 * embedding provider was unavailable, with no signal to the caller. The
 * response now carries `search_mode` so the degradation is observable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, getServiceRoleClient } from "../../src/db.js";

const semanticMock = vi.hoisted(() => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [] as string[], total: 0 })),
}));

vi.mock("../../src/services/entity_semantic_search.js", () => semanticMock);

import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";

const serviceRoleClient = getServiceRoleClient();

describe("queryEntitiesWithCount search_mode", () => {
  const testUserId = "search-mode-test-user";
  const testEntityIds: string[] = [];

  async function cleanupEntities() {
    if (testEntityIds.length === 0) return;
    await db.from("entity_snapshots").delete().in("entity_id", testEntityIds);
    await db.from("entities").delete().in("id", testEntityIds);
    testEntityIds.length = 0;
  }

  async function createEntity(id: string, entityType: string, canonicalName: string) {
    const now = new Date().toISOString();
    await serviceRoleClient.from("entities").insert({
      id,
      user_id: testUserId,
      entity_type: entityType,
      canonical_name: canonicalName,
    });
    testEntityIds.push(id);
    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: id,
      user_id: testUserId,
      entity_type: entityType,
      schema_version: "1.0",
      canonical_name: canonicalName,
      snapshot: { name: canonicalName },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });
  }

  beforeEach(async () => {
    semanticMock.semanticSearchEntities.mockReset();
    semanticMock.semanticSearchEntities.mockResolvedValue({ entityIds: [], total: 0 });
    await cleanupEntities();
  });

  afterEach(async () => {
    await cleanupEntities();
  });

  it("returns search_mode 'none' when no search text is supplied", async () => {
    const result = await queryEntitiesWithCount({ userId: testUserId, limit: 10, offset: 0 });
    expect(result.search_mode).toBe("none");
  });

  it("returns search_mode 'lexical_fallback' when semantic search yields nothing", async () => {
    const id = `ent_smode_fb_${Date.now()}`;
    await createEntity(id, "research_report", "Newsletter Recipients Report");

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "newsletter recipients",
      limit: 10,
      offset: 0,
    });

    expect(result.search_mode).toBe("lexical_fallback");
    expect(semanticMock.semanticSearchEntities).toHaveBeenCalled();
  });

  it("returns search_mode 'lexical_typed' when a query token names an entity type", async () => {
    const id = `ent_smode_typed_${Date.now()}`;
    await createEntity(id, "plan", "Quarterly Roadmap Plan");

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "plan roadmap",
      limit: 10,
      offset: 0,
    });

    expect(result.search_mode).toBe("lexical_typed");
    // Typed lexical bypasses semantic entirely.
    expect(semanticMock.semanticSearchEntities).not.toHaveBeenCalled();
  });

  it("returns search_mode 'semantic' when semantic search answers the query", async () => {
    const id = `ent_smode_sem_${Date.now()}`;
    await createEntity(id, "research_report", "Embedding Driven Match");

    semanticMock.semanticSearchEntities.mockResolvedValue({ entityIds: [id], total: 1 });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "some free text query",
      limit: 10,
      offset: 0,
    });

    expect(result.search_mode).toBe("semantic");
    expect(result.entities.some((e) => e.entity_id === id)).toBe(true);
  });
});
