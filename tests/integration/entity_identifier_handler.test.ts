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
});
