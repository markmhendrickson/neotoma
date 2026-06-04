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

  it("matches plan titles that end with a registered entity type name", async () => {
    const entityId = `ent_lex_plan_strategy_title_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "plan",
      canonicalName: "plan:Schema Packs Strategy",
      snapshot: {
        title: "Schema Packs Strategy",
        status: "pending",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "Schema Packs Strategy",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("#1496 bridges 'bank account' concept to financial_account via partial fallback", async () => {
    // financial_account whose only identity-bearing text is the institution
    // field. The query "bank account Ibercaja Wise" names a concept (bank
    // account), not the literal entity_type, and the strict all-token gate
    // cannot match because "bank"/"account" are absent from the row's text.
    const entityId = `ent_fa_ibercaja_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "financial_account",
      canonicalName: "ibercaja regular (spain domestic)",
      snapshot: {
        institution: "Ibercaja",
        account_name: "Ibercaja Regular",
        provider: "Wise",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "bank account Ibercaja Wise",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("#1551 recovers a descriptive multi-term query via partial-token overlap", async () => {
    // Long descriptive query whose terms only partially overlap the stored
    // title. The strict every-token gate drops it; the partial fallback should
    // recover it because a majority of meaningful tokens overlap.
    const entityId = `ent_inspector_build_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "plan",
      canonicalName: "plan:unified server build inspector",
      snapshot: {
        title: "Unified server build: serve site, inspector sandbox",
        body: "Build the unified server and inspector sandbox for agentic evaluation.",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search:
        "unified server build serve site inspector sandbox agentic try now evaluate experience",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("#1551 partial fallback matches a subset query against a stored title", async () => {
    const entityId = `ent_build_server_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_build_server",
      snapshot: { title: "Build Server architecture and deployment notes" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "build serve deployment notes architecture",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("partial fallback does not match an entity sharing only a single stop-ish token", async () => {
    // Precision guard: a row that overlaps only one meaningful token must not
    // be surfaced by the partial fallback (min overlap is 2 / 50%).
    const targetId = `ent_partial_target_${Date.now()}`;
    const decoyId = `ent_partial_decoy_${Date.now()}`;
    await createEntityWithSnapshot({
      id: targetId,
      entityType: "research_report",
      canonicalName: "doc_partial_target",
      snapshot: { title: "Quarterly revenue forecast spreadsheet" },
    });
    await createEntityWithSnapshot({
      id: decoyId,
      entityType: "research_report",
      canonicalName: "doc_partial_decoy",
      snapshot: { title: "Unrelated revenue document" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "quarterly forecast spreadsheet planning",
      limit: 25,
      offset: 0,
    });

    const ids = result.entities.map((entity) => entity.entity_id);
    expect(ids).toContain(targetId);
    expect(ids).not.toContain(decoyId);
  });

  it("partial fallback boundary: 3-of-6 meaningful tokens passes, 2-of-6 fails", async () => {
    // Six meaningful query tokens => required overlap = ceil(6 * 0.5) = 3.
    // The target overlaps exactly 3 tokens (boundary pass); the decoy overlaps
    // exactly 2 (boundary fail). Tokens chosen to avoid PARTIAL_MATCH_STOP_TOKENS.
    const passId = `ent_overlap_pass_${Date.now()}`;
    const failId = `ent_overlap_fail_${Date.now()}`;
    await createEntityWithSnapshot({
      id: passId,
      entityType: "research_report",
      canonicalName: "doc_overlap_pass",
      // Contains alpha, beta, gamma => 3 of 6.
      snapshot: { title: "alpha beta gamma unrelated heading" },
    });
    await createEntityWithSnapshot({
      id: failId,
      entityType: "research_report",
      canonicalName: "doc_overlap_fail",
      // Contains only alpha, beta => 2 of 6.
      snapshot: { title: "alpha beta unrelated heading" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "alpha beta gamma delta epsilon zeta",
      limit: 25,
      offset: 0,
    });

    const ids = result.entities.map((entity) => entity.entity_id);
    expect(ids).toContain(passId);
    expect(ids).not.toContain(failId);
  });

  it("partial fallback boundary: 2-token minimum requires both tokens to match", async () => {
    // Two meaningful query tokens => required overlap = max(2, ceil(2 * 0.5)) = 2,
    // i.e. BOTH must match. A row overlapping only one token must not surface.
    const bothId = `ent_two_token_both_${Date.now()}`;
    const oneId = `ent_two_token_one_${Date.now()}`;
    await createEntityWithSnapshot({
      id: bothId,
      entityType: "research_report",
      canonicalName: "doc_two_token_both",
      snapshot: { title: "kappa lambda combined report" },
    });
    await createEntityWithSnapshot({
      id: oneId,
      entityType: "research_report",
      canonicalName: "doc_two_token_one",
      snapshot: { title: "kappa only report" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "kappa lambda",
      limit: 25,
      offset: 0,
    });

    const ids = result.entities.map((entity) => entity.entity_id);
    expect(ids).toContain(bothId);
    expect(ids).not.toContain(oneId);
  });

  it("partial fallback: an all-stop-token query returns empty without throwing", async () => {
    // Every token is a stop token, so there are zero meaningful tokens and the
    // partial fallback must short-circuit (no overlap pass, no exception).
    const entityId = `ent_all_stop_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_all_stop",
      snapshot: { title: "the report for now" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "the to of for with now",
      limit: 25,
      offset: 0,
    });

    // No meaningful tokens => no strict and no partial matches; the call must
    // resolve cleanly rather than throw.
    expect(result.entities.map((entity) => entity.entity_id)).not.toContain(entityId);
  });

  it("surfaces applied_search_strategies including concept_bridge for the #1496 path", async () => {
    const entityId = `ent_fa_strategy_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "financial_account",
      canonicalName: "account_xyz_002",
      snapshot: { institution: "Revolut", account_name: "Revolut Main", provider: "Revolut" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "bank account Revolut Main",
      limit: 25,
      offset: 0,
    });

    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
    expect(result.applied_search_strategies).toBeDefined();
    expect(result.applied_search_strategies).toEqual(
      expect.arrayContaining(["partial_overlap", "concept_bridge"])
    );
  });

  it("omits applied_search_strategies for non-search listings", async () => {
    const entityId = `ent_list_no_strategy_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_list_no_strategy",
      snapshot: { title: "Plain listing entry" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      limit: 25,
      offset: 0,
    });

    expect(result.applied_search_strategies).toBeUndefined();
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
