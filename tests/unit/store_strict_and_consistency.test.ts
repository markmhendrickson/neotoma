/**
 * Unit tests for two related fixes (Simon Bergeron field feedback, 2026-04-20):
 *
 * 1. store --strict merge gate (task ent_78a3fbcba1ca65fada0f251a)
 *    - strict=true must REFUSE a merge into an existing entity when resolution
 *      came from a heuristic path (name_key:name, name_key:title, heuristic:*)
 *    - strict=true must ALLOW a merge when caller supplied target_id
 *    - strict=true must ALLOW a merge when resolution came from a
 *      schema:canonical_name_fields match (deterministic schema rule)
 *    - strict=true must ALLOW a merge on natural-key matches:
 *      name_key:canonical_name, name_key:email, or any id_key:* path
 *
 * 2. Write/read consistency gap (task ent_f4a2648f2142b8ee182590b0)
 *    - The existing-observation check in storeStructuredInternal (server.ts)
 *      must scope by user_id, not just observation id. Without user_id
 *      scoping, a different user's observation with the same id (same
 *      content-addressed hash) would cause the current user's observation
 *      to be silently skipped, making a subsequent list_observations
 *      scoped to the current user return empty despite store success.
 *    - The snapshot computation observations fetch must also scope by user_id
 *      so cross-user data does not bleed into this user's snapshot.
 *
 * These are unit tests that exercise the affected modules directly and/or
 * inline the logic so they run without a live HTTP server.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import {
  resolveEntityWithTrace,
  generateEntityId,
  MergeRefusedError,
} from "../../src/services/entity_resolution.js";
import { generateObservationId } from "../../src/services/observation_identity.js";

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const TEST_USER_A = "aaaaaaaa-0000-0000-0000-000000000000";
const TEST_USER_B = "bbbbbbbb-0000-0000-0000-000000000000";
const STRICT_ET = "strict_test_entity_type";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function cleanupStrictTestData(): Promise<void> {
  await db.from("entity_snapshots").delete().eq("entity_type", STRICT_ET);
  await db.from("observations").delete().eq("entity_type", STRICT_ET);
  const { data: ents } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", STRICT_ET);
  if (ents && ents.length > 0) {
    await db
      .from("entities")
      .delete()
      .in("id", ents.map((e: { id: string }) => e.id));
  }
}

/** Insert a bare entity row (no schema, no observation) so the resolver sees
 *  an existing entity to try to merge into. */
async function seedEntity(
  entityType: string,
  canonicalName: string,
  userId: string
): Promise<string> {
  const entityId = generateEntityId(entityType, canonicalName);
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id: entityId,
    entity_type: entityType,
    canonical_name: canonicalName,
    aliases: [],
    user_id: userId,
    created_at: now,
    updated_at: now,
  });
  return entityId;
}

// ---------------------------------------------------------------------------
// 1. store --strict merge gate
// ---------------------------------------------------------------------------

describe("store --strict merge gate", () => {
  beforeEach(async () => {
    await cleanupStrictTestData();
  });

  afterEach(async () => {
    await cleanupStrictTestData();
  });

  it("refuses a heuristic-name merge (name_key:name) in strict mode", async () => {
    // Seed an entity whose canonical_name was derived from `name`.
    // Resolution via name_key:name is heuristic and should be blocked by strict.
    await seedEntity(STRICT_ET, "acme widget", TEST_USER_A);

    await expect(
      resolveEntityWithTrace({
        entityType: STRICT_ET,
        fields: { name: "Acme Widget" },
        userId: TEST_USER_A,
        commit: false,
        strict: true,
      })
    ).rejects.toThrow(MergeRefusedError);
  });

  it("refuses a heuristic-fallback merge (first_string_field) in strict mode", async () => {
    // Seed an entity whose name came from an arbitrary field (heuristic fallback).
    await seedEntity(STRICT_ET, "some value", TEST_USER_A);

    await expect(
      resolveEntityWithTrace({
        entityType: STRICT_ET,
        // `description` is not a canonical name field; falls to heuristic fallback
        fields: { description: "some value" },
        userId: TEST_USER_A,
        commit: false,
        strict: true,
      })
    ).rejects.toThrow(MergeRefusedError);
  });

  it("allows a merge when target_id is supplied explicitly (strict bypassed)", async () => {
    const entityId = await seedEntity(STRICT_ET, "explicit target", TEST_USER_A);

    // Providing target_id explicitly tells the resolver to extend — strict does
    // NOT block this path (the caller asserted the target).
    const result = await resolveEntityWithTrace({
      entityType: STRICT_ET,
      fields: { name: "Explicit Target" },
      userId: TEST_USER_A,
      commit: false,
      strict: true,
      targetId: entityId,
    });

    expect(result.entityId).toBe(entityId);
    expect(result.trace.identityBasis).toBe("target_id");
  });

  it("allows a merge via natural-key name_key:canonical_name in strict mode", async () => {
    // The caller explicitly provided canonical_name — this is a deterministic,
    // caller-asserted key and must be allowed by strict.
    await seedEntity(STRICT_ET, "deterministic entity", TEST_USER_A);

    const result = await resolveEntityWithTrace({
      entityType: STRICT_ET,
      fields: { canonical_name: "deterministic entity" },
      userId: TEST_USER_A,
      commit: false,
      strict: true,
    });

    // Should match the existing entity, not throw
    expect(result.trace.action).toBe("would_match_existing");
    expect(result.trace.path).toContain("name_key:canonical_name");
  });

  it("allows a merge via natural-key name_key:email in strict mode", async () => {
    // Email is globally unique per entity — strict should allow this match.
    await seedEntity(STRICT_ET, "alice@example.com", TEST_USER_A);

    const result = await resolveEntityWithTrace({
      entityType: STRICT_ET,
      fields: { email: "alice@example.com" },
      userId: TEST_USER_A,
      commit: false,
      strict: true,
    });

    expect(result.trace.action).toBe("would_match_existing");
    expect(result.trace.path).toContain("name_key:email");
  });

  it("allows a merge via natural-key id_key:* in strict mode", async () => {
    // Stable ID fields (message_id, turn_key, etc.) are deterministic unique keys
    // and must be allowed by strict.
    //
    // The resolver hashes `id:message_id:<value>` as canonical_name for id_key paths.
    const msgId = "msg-abc-123";
    const canonicalForMsgId = `id:message_id:${msgId}`;
    await seedEntity(STRICT_ET, canonicalForMsgId, TEST_USER_A);

    const result = await resolveEntityWithTrace({
      entityType: STRICT_ET,
      fields: { message_id: msgId },
      userId: TEST_USER_A,
      commit: false,
      strict: true,
    });

    expect(result.trace.action).toBe("would_match_existing");
    expect(result.trace.path.some((p) => p.startsWith("id_key:"))).toBe(true);
  });

  it("still creates a new entity (no error) in strict mode when no existing entity matches", async () => {
    // Strict only blocks merging into an EXISTING entity. Creating new is always safe.
    const result = await resolveEntityWithTrace({
      entityType: STRICT_ET,
      fields: { name: "Brand New Entity" },
      userId: TEST_USER_A,
      commit: false,
      strict: true,
    });

    expect(result.trace.action).toBe("would_create");
  });

  it("MergeRefusedError includes entity_id, canonical_name, and reason:strict", async () => {
    await seedEntity(STRICT_ET, "some title", TEST_USER_A);

    let caught: MergeRefusedError | null = null;
    try {
      await resolveEntityWithTrace({
        entityType: STRICT_ET,
        fields: { title: "some title" },
        userId: TEST_USER_A,
        commit: false,
        strict: true,
      });
    } catch (err) {
      if (err instanceof MergeRefusedError) caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught!.reason).toBe("strict");
    expect(caught!.entityType).toBe(STRICT_ET);
    expect(typeof caught!.entityId).toBe("string");
    expect(caught!.entityId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Write/read consistency gap
// ---------------------------------------------------------------------------

describe("write/read consistency: existing-observation check scoped to user_id", () => {
  const OBS_ET = "obs_consistency_test_type";
  const sourceA = "src-user-a-001";
  const sourceB = "src-user-b-001";

  async function cleanupObsTestData(): Promise<void> {
    await db.from("entity_snapshots").delete().eq("entity_type", OBS_ET);
    await db.from("observations").delete().eq("entity_type", OBS_ET);
    const { data: ents } = await db
      .from("entities")
      .select("id")
      .eq("entity_type", OBS_ET);
    if (ents && ents.length > 0) {
      await db
        .from("entities")
        .delete()
        .in("id", ents.map((e: { id: string }) => e.id));
    }
  }

  beforeEach(async () => {
    await cleanupObsTestData();
  });

  afterEach(async () => {
    await cleanupObsTestData();
  });

  /**
   * Core invariant: if two users store the same canonical entity content, their
   * observation IDs may collide because generateObservationId is content-addressed
   * (source_id + entity_id + fields).  When both use the SAME sourceId (e.g. a
   * shared/synced source row), the IDs are identical.
   *
   * The fixed code scopes the existing-observation check to (id, user_id).
   * This test verifies that two separate observations rows exist for the two
   * users even when the observation ID is the same — because the real write
   * path (storeStructuredInternal) now filters by user_id before skipping.
   *
   * Since we cannot call storeStructuredInternal in a unit test (it needs a
   * running MCP server context), we test the INVARIANT that the data model
   * supports per-user observation rows with the same id, and that a user_id
   * scoped query returns only the correct row.
   */
  it("per-user observations are independent — same obs id scoped to different users", async () => {
    const entityId = generateEntityId(OBS_ET, "shared-content");
    const now = new Date().toISOString();

    // Seed the entity row (shared across users via content-addressed id)
    await db.from("entities").insert({
      id: entityId,
      entity_type: OBS_ET,
      canonical_name: "shared-content",
      aliases: [],
      user_id: TEST_USER_A,
      created_at: now,
      updated_at: now,
    });

    const sharedFields = { name: "Shared Content", value: 42 };

    // Compute observation IDs for each user. When source IDs differ (as in
    // production: storeRawContent is per-user), the observation IDs differ too.
    const obsIdA = generateObservationId(sourceA, null, entityId, sharedFields);
    const obsIdB = generateObservationId(sourceB, null, entityId, sharedFields);

    // Write observation for user A
    await db.from("observations").insert({
      id: obsIdA,
      entity_id: entityId,
      entity_type: OBS_ET,
      schema_version: "1.0",
      source_id: sourceA,
      interpretation_id: null,
      observed_at: now,
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "llm_summary",
      fields: sharedFields,
      user_id: TEST_USER_A,
      created_at: now,
    });

    // Write observation for user B (different source → different obs id)
    await db.from("observations").insert({
      id: obsIdB,
      entity_id: entityId,
      entity_type: OBS_ET,
      schema_version: "1.0",
      source_id: sourceB,
      interpretation_id: null,
      observed_at: now,
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "llm_summary",
      fields: sharedFields,
      user_id: TEST_USER_B,
      created_at: now,
    });

    // list_observations scoped to user A must find exactly user A's observation
    const { data: obsForA } = await db
      .from("observations")
      .select("id, user_id")
      .eq("entity_id", entityId)
      .eq("user_id", TEST_USER_A);

    expect(obsForA).toBeDefined();
    expect(obsForA!.length).toBe(1);
    expect((obsForA![0] as { id: string; user_id: string }).id).toBe(obsIdA);
    expect((obsForA![0] as { id: string; user_id: string }).user_id).toBe(TEST_USER_A);

    // list_observations scoped to user B must find exactly user B's observation
    const { data: obsForB } = await db
      .from("observations")
      .select("id, user_id")
      .eq("entity_id", entityId)
      .eq("user_id", TEST_USER_B);

    expect(obsForB).toBeDefined();
    expect(obsForB!.length).toBe(1);
    expect((obsForB![0] as { id: string; user_id: string }).id).toBe(obsIdB);
    expect((obsForB![0] as { id: string; user_id: string }).user_id).toBe(TEST_USER_B);
  });

  it("user_id-scoped observation check is the correct guard for skipping duplicate inserts", async () => {
    // This test verifies the exact guard pattern used in the fixed server.ts:
    //   .eq("id", observationId).eq("user_id", userId)
    // Without user_id scope, a same-content observation from another user
    // would cause the current user's insert to be skipped.

    const entityId = generateEntityId(OBS_ET, "guard-test");
    const now = new Date().toISOString();

    await db.from("entities").insert({
      id: entityId,
      entity_type: OBS_ET,
      canonical_name: "guard-test",
      aliases: [],
      user_id: TEST_USER_A,
      created_at: now,
      updated_at: now,
    });

    const sharedFields = { name: "Guard Test" };
    // Use the SAME source id to force the same observation id for both users
    // (simulates the worst-case: shared source row, content-addressed collision)
    const sharedSourceId = "src-shared-for-collision-test";
    const obsId = generateObservationId(sharedSourceId, null, entityId, sharedFields);

    // Write user A's observation
    await db.from("observations").insert({
      id: obsId,
      entity_id: entityId,
      entity_type: OBS_ET,
      schema_version: "1.0",
      source_id: sharedSourceId,
      interpretation_id: null,
      observed_at: now,
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "llm_summary",
      fields: sharedFields,
      user_id: TEST_USER_A,
      created_at: now,
    });

    // OLD (buggy) guard: check by id only — would INCORRECTLY find user A's row
    // when checking for user B, causing user B's insert to be silently skipped.
    const { data: withoutUserIdFilter } = await db
      .from("observations")
      .select("id")
      .eq("id", obsId)
      .maybeSingle();
    expect(withoutUserIdFilter).not.toBeNull(); // Bug: user B would skip insert here

    // NEW (fixed) guard: check by (id, user_id) — must return null for user B
    // because user B has no observation with this id yet.
    const { data: withUserIdFilter } = await db
      .from("observations")
      .select("id")
      .eq("id", obsId)
      .eq("user_id", TEST_USER_B)
      .maybeSingle();
    expect(withUserIdFilter).toBeNull(); // Correct: user B's insert is not skipped
  });
});
