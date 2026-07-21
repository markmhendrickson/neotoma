import { afterEach, describe, expect, it } from "vitest";
import { db, getServiceRoleClient } from "../../src/db.js";
import {
  ENTITY_ID_NOT_FOUND_HINT,
  retrieveEntityByIdentifierWithFallback,
} from "../../src/shared/action_handlers/entity_identifier_handler.js";

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

  it("resolves by=email via the server-side exact pass when the email is NOT the canonical_name", async () => {
    // Regression for the scale bug: the snapshot-field pass previously only
    // JS-scanned an unordered 500-row window, so an exact email whose row sits
    // outside that window (or whose canonical_name is something else entirely,
    // e.g. a title) silently returned nothing — even though the email is
    // present verbatim in the snapshot. This reproduces the live Bottega8
    // failure (a contact whose canonical_name is "General Manager" but whose
    // snapshot email is the real identifier). The server-side snapshot->>email
    // exact pass must find it regardless of scan-window position.
    const userId = "identifier-user-email-not-canonical";
    const entityId = `ent_email_noncanon_${Date.now()}`;
    testEntityIds.push(entityId);
    const now = new Date().toISOString();

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "contact",
      // canonical_name is a TITLE, not the name or email — so neither the
      // canonical_name.ilike query nor an aliases match can resolve the email.
      canonical_name: "General Manager",
    });
    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: entityId,
      user_id: userId,
      entity_type: "contact",
      schema_version: "1.0",
      canonical_name: "General Manager",
      snapshot: {
        name: "Email Noncanon Person",
        email: "email.noncanon@example.com",
        phone: "+15551230000",
      },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });

    // by="email" — the exact case that returned zero before the fix.
    const byEmail = await retrieveEntityByIdentifierWithFallback({
      identifier: "email.noncanon@example.com",
      entityType: "contact",
      userId,
      by: "email",
      limit: 100,
    });
    expect(byEmail.total).toBe(1);
    expect(byEmail.entities[0]?.id).toBe(entityId);
    expect(byEmail.match_mode).toBe("snapshot_field");

    // by="phone" likewise resolves via the exact server-side pass.
    const byPhone = await retrieveEntityByIdentifierWithFallback({
      identifier: "+15551230000",
      entityType: "contact",
      userId,
      by: "phone",
      limit: 100,
    });
    expect(byPhone.total).toBe(1);
    expect(byPhone.entities[0]?.id).toBe(entityId);
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
    // result (not a degraded natural-language search) plus a hint pointing at
    // the direct-fetch path (#1597).
    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: entityId,
      userId: otherId,
      limit: 100,
    });

    expect(result.total).toBe(0);
    expect(result.entities).toHaveLength(0);
    expect(result.match_mode).toBe("none");
    expect(result.hint).toBe(ENTITY_ID_NOT_FOUND_HINT);
  });

  // Regression: issue #1597 — a well-formed but unknown ent_ id returned a
  // silent empty result, giving the caller no signal that the input was an
  // entity_id and that retrieve_entity_snapshot is the direct-fetch path. The
  // not-found path now returns a structured hint instead.
  it("returns a structured not-found hint for an unknown ent_ id (issue #1597)", async () => {
    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: "ent_00000000000000000000dead",
      userId: "identifier-user-unknown-rawid",
      limit: 100,
    });

    expect(result.total).toBe(0);
    expect(result.entities).toHaveLength(0);
    expect(result.match_mode).toBe("none");
    expect(result.hint).toBe(ENTITY_ID_NOT_FOUND_HINT);
    expect(result.hint).toContain("retrieve_entity_snapshot");
  });

  // Regression: issue #1561 — an exact ent_ id whose string also appears in the
  // text/snapshot of other entities (here a conversation_message) returned the
  // tangential text-matching rows instead of the target entity. The primary-key
  // fast path must return the target exclusively, never the rows that merely
  // mention the id.
  it("resolves an exact ent_ id to the target entity, not text-matching rows (issue #1561)", async () => {
    const userId = "identifier-user-1561";
    const targetId = "ent_1561abcdef0123456789abcd";
    const mentioningId = "ent_1561000011112222333344ab";
    testEntityIds.push(targetId, mentioningId);
    const now = new Date().toISOString();

    await serviceRoleClient.from("entities").insert([
      {
        id: targetId,
        user_id: userId,
        entity_type: "plan",
        canonical_name: "schema packs strategy",
      },
      {
        id: mentioningId,
        user_id: userId,
        entity_type: "conversation_message",
        // The message text mentions the target id verbatim — the exact shape
        // that previously won the (wrong) text match.
        canonical_name: `discussion referencing ${targetId}`,
      },
    ]);

    await serviceRoleClient.from("entity_snapshots").upsert([
      {
        entity_id: targetId,
        user_id: userId,
        entity_type: "plan",
        schema_version: "1.0",
        canonical_name: "schema packs strategy",
        snapshot: { title: "Schema Packs Strategy" },
        provenance: {},
        observation_count: 1,
        last_observation_at: now,
        computed_at: now,
      },
      {
        entity_id: mentioningId,
        user_id: userId,
        entity_type: "conversation_message",
        schema_version: "1.0",
        canonical_name: `discussion referencing ${targetId}`,
        snapshot: { content: `Let's revisit ${targetId} next week.` },
        provenance: {},
        observation_count: 1,
        last_observation_at: now,
        computed_at: now,
      },
    ]);

    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: targetId,
      userId,
      limit: 100,
    });

    expect(result.match_mode).toBe("direct");
    expect(result.total).toBe(1);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.id).toBe(targetId);
    expect(result.entities.some((entity) => entity.id === mentioningId)).toBe(false);
  });

  // Regression: issue #1597 — an exact ent_ id resolves even when entity_type is
  // supplied (previously returned {entities: [], total: 0} for entity_type:
  // "plan"). The id is unambiguous, so the type filter does not suppress it.
  it("resolves an exact ent_ id even when entity_type is supplied (issue #1597)", async () => {
    const userId = "identifier-user-1597-typed";
    const entityId = "ent_1597abcdef0123456789abcd";
    testEntityIds.push(entityId);

    await serviceRoleClient.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "plan",
      canonical_name: "typed-id plan",
    });

    const result = await retrieveEntityByIdentifierWithFallback({
      identifier: entityId,
      entityType: "plan",
      userId,
      limit: 100,
    });

    expect(result.match_mode).toBe("direct");
    expect(result.total).toBe(1);
    expect(result.entities[0]?.id).toBe(entityId);
    expect(result.hint).toBeUndefined();
  });
});
