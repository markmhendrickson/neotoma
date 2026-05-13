/**
 * Regression tests for issue #84:
 * identity_opt_out schema silently drops supplied canonical_name.
 *
 * When a caller supplies an explicit top-level `canonical_name` and the schema
 * declares `identity_opt_out: "heuristic_canonical_name"` (rather than
 * canonical_name_fields), the resolver must use the supplied value — not fall
 * back to heuristic derivation from `title` or another fallback field.
 *
 * Related: #76 / #77 (same root area, different symptom).
 */

import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { randomUUID } from "crypto";
import { cleanupTestEntityType } from "../helpers/test_schema_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("store: explicit canonical_name on identity_opt_out schema (#84)", () => {
  const server = new NeotomaServer();
  // Inject test auth bypass (same user ID as test-connection-bypass path)
  (server as any).authenticatedUserId = TEST_USER_ID;
  const entityType = `test_decision_${randomUUID().replace(/-/g, "").substring(0, 8)}`;
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];

  afterEach(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    await cleanupTestEntityType(entityType, TEST_USER_ID);
  });

  it("uses supplied canonical_name instead of falling back to title", async () => {
    // Register a schema with identity_opt_out (mirrors the `decision` entity type
    // described in issue #84) — title is present but canonical_name is not a
    // schema field.
    await db.from("schema_registry").insert({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: false },
          rationale: { type: "string", required: false },
          decided_at: { type: "date", required: false },
          schema_version: { type: "string", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          rationale: { strategy: "last_write" },
          decided_at: { strategy: "last_write" },
          schema_version: { strategy: "last_write" },
        },
      },
      active: true,
      scope: "user",
      user_id: TEST_USER_ID,
    });

    const explicitCanonicalName = "content-addressed-sources-mail-granola";

    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-84-${randomUUID()}`,
      entities: [
        {
          entity_type: entityType,
          canonical_name: explicitCanonicalName,
          schema_version: "1.0",
          title: "Mail-body + granola-transcript as content-addressed source",
          rationale: "Sources are content-addressed; mail bodies qualify.",
          decided_at: "2026-05-11",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.entities).toHaveLength(1);

    const entityEntry = response.entities[0];
    createdEntityIds.push(entityEntry.entity_id);
    createdSourceIds.push(response.source_id);

    // The canonical_name in the trace must reflect the explicitly supplied value,
    // not a title-derived heuristic like "Mail body + granola transcript as
    // content addressed source".
    expect(entityEntry.canonical_name).toBe(explicitCanonicalName);
    expect(entityEntry.identity_basis).toBe("heuristic_name");
    expect(entityEntry.identity_rule).toBe("name_key:canonical_name");
    expect(entityEntry.resolver_path).toContain("name_key:canonical_name");

    // canonical_name must NOT appear as an unknown field.
    expect(response.unknown_fields_count).toBe(0);
  });

  it("two stores with the same explicit canonical_name resolve to the same entity", async () => {
    await db.from("schema_registry").insert({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: false },
          schema_version: { type: "string", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          schema_version: { strategy: "last_write" },
        },
      },
      active: true,
      scope: "user",
      user_id: TEST_USER_ID,
    });

    const sharedCanonicalName = "shared-decision-abc";

    const storeOne = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-84-store1-${randomUUID()}`,
      entities: [
        {
          entity_type: entityType,
          canonical_name: sharedCanonicalName,
          title: "First title",
          schema_version: "1.0",
        },
      ],
    });
    const responseOne = JSON.parse(storeOne.content[0].text);
    createdEntityIds.push(responseOne.entities[0].entity_id);
    createdSourceIds.push(responseOne.source_id);

    const storeTwo = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-84-store2-${randomUUID()}`,
      entities: [
        {
          entity_type: entityType,
          canonical_name: sharedCanonicalName,
          title: "Updated title",
          schema_version: "1.0",
        },
      ],
    });
    const responseTwo = JSON.parse(storeTwo.content[0].text);
    createdSourceIds.push(responseTwo.source_id);

    // Both stores should produce the same entity_id because the canonical_name
    // is the same (deterministic hashing).
    expect(responseTwo.entities[0].entity_id).toBe(responseOne.entities[0].entity_id);
    // "matched_existing" means the resolver found the same entity by canonical_name hash
    expect(["matched_existing", "extended"]).toContain(responseTwo.entities[0].action);
  });

  it("does not count canonical_name as an unknown field", async () => {
    await db.from("schema_registry").insert({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: false },
          schema_version: { type: "string", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          schema_version: { strategy: "last_write" },
        },
      },
      active: true,
      scope: "user",
      user_id: TEST_USER_ID,
    });

    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-84-unknown-${randomUUID()}`,
      entities: [
        {
          entity_type: entityType,
          canonical_name: "my-explicit-name",
          title: "Some title",
          schema_version: "1.0",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    createdEntityIds.push(response.entities[0].entity_id);
    createdSourceIds.push(response.source_id);

    expect(response.unknown_fields_count).toBe(0);

    // Also confirm no raw_fragment row was created for canonical_name.
    const { count } = await db
      .from("raw_fragments")
      .select("id", { count: "exact", head: true })
      .eq("source_id", response.source_id)
      .eq("fragment_key", "canonical_name")
      .eq("user_id", TEST_USER_ID);
    expect(count).toBe(0);
  });
});
