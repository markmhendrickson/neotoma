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
