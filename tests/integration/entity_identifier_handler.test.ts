import { afterEach, describe, expect, it } from "vitest";
import { db, getServiceRoleClient } from "../../src/db.js";
import { retrieveEntityByIdentifierWithFallback } from "../../src/shared/action_handlers/entity_identifier_handler.js";

const serviceRoleClient = getServiceRoleClient();

describe("retrieveEntityByIdentifierWithFallback", () => {
  const testEntityIds: string[] = [];

  async function cleanupEntities() {
    if (testEntityIds.length === 0) return;
    await db.from("entity_snapshots").delete().in("entity_id", testEntityIds);
    await db.from("entities").delete().in("id", testEntityIds);
    testEntityIds.length = 0;
  }

  afterEach(async () => {
    await cleanupEntities();
  });

  it("scopes direct identifier matches to authenticated user", async () => {
    const sharedCanonical = "shared-contact@example.com";
    const userA = "identifier-user-a";
    const userB = "identifier-user-b";
    const entityAId = `ent_ident_a_${Date.now()}`;
    const entityBId = `ent_ident_b_${Date.now()}`;
    testEntityIds.push(entityAId, entityBId);

    await serviceRoleClient.from("entities").insert([
      {
        id: entityAId,
        user_id: userA,
        entity_type: "contact",
        canonical_name: sharedCanonical,
      },
      {
        id: entityBId,
        user_id: userB,
        entity_type: "contact",
        canonical_name: sharedCanonical,
      },
    ]);

    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: sharedCanonical,
      entityType: "contact",
      userId: userA,
      limit: 100,
    });

    expect(result.total).toBe(1);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.id).toBe(entityAId);
  });

  it("#1495 resolves a financial_account by institution name in snapshot", async () => {
    const userId = "identifier-user-institution";
    const entityId = `ent_fa_institution_${Date.now()}`;
    testEntityIds.push(entityId);
    const now = new Date().toISOString();

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "financial_account",
      // Canonical name does not lead with the institution token verbatim in a
      // way the caller would type; institution lives in the snapshot field.
      canonical_name: "ibercaja regular (spain domestic)",
    });

    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: entityId,
      user_id: userId,
      entity_type: "financial_account",
      schema_version: "1.0",
      canonical_name: "ibercaja regular (spain domestic)",
      snapshot: { institution: "Ibercaja", account_name: "Ibercaja Regular" },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });

    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: "Ibercaja",
      entityType: "financial_account",
      userId,
      limit: 100,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.id === entityId)).toBe(true);
  });

  it("#1495 resolves a financial_account by account_name in snapshot", async () => {
    const userId = "identifier-user-account-name";
    const entityId = `ent_fa_account_name_${Date.now()}`;
    testEntityIds.push(entityId);
    const now = new Date().toISOString();

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "financial_account",
      canonical_name: "schwab brokerage 0001",
    });

    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: entityId,
      user_id: userId,
      entity_type: "financial_account",
      schema_version: "1.0",
      canonical_name: "schwab brokerage 0001",
      snapshot: { institution: "Charles Schwab", account_name: "My Savings" },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });

    const byAccountName = await retrieveEntityByIdentifierWithFallback({
      identifier: "My Savings",
      entityType: "financial_account",
      userId,
      limit: 100,
    });
    expect(byAccountName.entities.some((entity) => entity.id === entityId)).toBe(true);

    // Multi-word institution partial: "Charles Schwab" must also resolve.
    const byInstitution = await retrieveEntityByIdentifierWithFallback({
      identifier: "Charles Schwab",
      entityType: "financial_account",
      userId,
      limit: 100,
    });
    expect(byInstitution.entities.some((entity) => entity.id === entityId)).toBe(true);
  });

  it("includes snapshot data for direct lexical matches", async () => {
    const userId = "identifier-user-snapshot";
    const entityId = `ent_ident_snapshot_${Date.now()}`;
    testEntityIds.push(entityId);
    const now = new Date().toISOString();

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "contact",
      canonical_name: "snapshot-contact@example.com",
    });

    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: entityId,
      user_id: userId,
      entity_type: "contact",
      schema_version: "1.0",
      canonical_name: "snapshot-contact@example.com",
      snapshot: { name: "Snapshot Contact", email: "snapshot-contact@example.com" },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });

    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: "snapshot-contact@example.com",
      entityType: "contact",
      userId,
      limit: 100,
    });

    expect(result.total).toBe(1);
    expect(result.entities[0]?.id).toBe(entityId);
    expect(result.entities[0]?.snapshot).toBeTruthy();
  });

  it("#1495 resolves via the snapshot-field pass when canonical_name omits the institution token", async () => {
    // Hardest #1495 case: the canonical_name carries no institution/account
    // token at all (an opaque id), so the only path to the row is the
    // snapshot-field pass keyed by the schema-declared identity_search_fields
    // (institution/account_name) for financial_account. A direct
    // canonical_name/alias match is impossible here.
    const userId = "identifier-user-opaque-canonical";
    const entityId = `ent_fa_opaque_${Date.now()}`;
    testEntityIds.push(entityId);
    const now = new Date().toISOString();

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "financial_account",
      canonical_name: "account_xyz_001",
    });

    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: entityId,
      user_id: userId,
      entity_type: "financial_account",
      schema_version: "1.0",
      canonical_name: "account_xyz_001",
      snapshot: { institution: "Ibercaja", account_name: "Ibercaja Regular" },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });

    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: "Ibercaja",
      entityType: "financial_account",
      userId,
      limit: 100,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.id === entityId)).toBe(true);
    // The match could only have come from the snapshot-field pass, not a direct
    // canonical_name/alias hit — assert the surfaced signal reflects that.
    expect(result.match_mode).toBe("snapshot_field");
  });

  it("reports match_mode 'direct' for a canonical_name hit", async () => {
    const userId = "identifier-user-match-mode-direct";
    const entityId = `ent_ident_mode_direct_${Date.now()}`;
    testEntityIds.push(entityId);

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "contact",
      canonical_name: "direct-mode@example.com",
    });

    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: "direct-mode@example.com",
      entityType: "contact",
      userId,
      limit: 100,
    });

    expect(result.entities.some((entity) => entity.id === entityId)).toBe(true);
    expect(result.match_mode).toBe("direct");
  });

  it("reports match_mode 'none' when nothing resolves", async () => {
    const userId = "identifier-user-match-mode-none";
    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: "no-such-identifier-zzz-0001",
      entityType: "contact",
      userId,
      limit: 100,
    });

    expect(result.total).toBe(0);
    expect(result.entities).toHaveLength(0);
    expect(result.match_mode).toBe("none");
  });

  // Regression: issue #1550 — a raw `ent_<hash>` id passed as the identifier
  // resolved to empty (retrieve_entity_snapshot accepted it, this handler did
  // not). The raw-id fast path now resolves it directly.
  it("resolves a raw ent_ entity id directly (issue #1550)", async () => {
    const userId = "identifier-user-rawid";
    const entityId = "ent_0123456789abcdef01234567"; // ent_ + 24 hex chars
    testEntityIds.push(entityId);
    const now = new Date().toISOString();

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "contact",
      canonical_name: "raw-id-contact@example.com",
    });
    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: entityId,
      user_id: userId,
      entity_type: "contact",
      schema_version: "1.0",
      canonical_name: "raw-id-contact@example.com",
      snapshot: { name: "Raw Id Contact" },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });

    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: entityId,
      userId,
      limit: 100,
    });

    expect(result.total).toBe(1);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.id).toBe(entityId);
    expect(result.entities[0]?.snapshot).toBeTruthy();
  });

  it("scopes a raw ent_ id lookup to the authenticated user (issue #1550)", async () => {
    const ownerId = "identifier-user-rawid-owner";
    const otherId = "identifier-user-rawid-other";
    const entityId = "ent_fedcba9876543210fedcba98";
    testEntityIds.push(entityId);

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: ownerId,
      entity_type: "contact",
      canonical_name: "scoped-raw-id@example.com",
    });

    // A different user must not resolve the id, and must get an explicit empty
    // result (not a degraded natural-language search).
    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: entityId,
      userId: otherId,
      limit: 100,
    });

    expect(result.total).toBe(0);
    expect(result.entities).toHaveLength(0);
  });

  it("returns explicit empty for a well-formed but unknown ent_ id (issue #1550)", async () => {
    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: "ent_00000000000000000000dead",
      userId: "identifier-user-unknown-rawid",
      limit: 100,
    });

    expect(result.total).toBe(0);
    expect(result.entities).toHaveLength(0);
  });
});
