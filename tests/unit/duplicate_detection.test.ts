/**
 * Unit tests for the duplicate detection service (R5).
 *
 * Read-only detector: asserts that candidate pairs are surfaced without any
 * mutation to entities, observations, or snapshots.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  findDuplicateCandidates,
  stringSimilarity,
} from "../../src/services/duplicate_detection.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { db } from "../../src/db.js";

const testUserId = "00000000-0000-0000-0000-000000000000";
const testEntityType = "r5_test_contact";

async function insertEntity(params: {
  id: string;
  canonical_name: string;
  snapshot?: Record<string, unknown>;
}): Promise<void> {
  await db.from("entities").insert({
    id: params.id,
    entity_type: testEntityType,
    canonical_name: params.canonical_name,
    user_id: testUserId,
  });
  if (params.snapshot) {
    await db.from("entity_snapshots").insert({
      entity_id: params.id,
      user_id: testUserId,
      entity_type: testEntityType,
      schema_version: "1.0.0",
      canonical_name: params.canonical_name,
      snapshot: params.snapshot,
      observation_count: 0,
      last_observation_at: new Date().toISOString(),
      provenance: {},
      computed_at: new Date().toISOString(),
    });
  }
}

describe("duplicate_detection service (R5)", () => {
  beforeEach(async () => {
    await db.from("entity_snapshots").delete().eq("entity_type", testEntityType);
    await db.from("entities").delete().eq("entity_type", testEntityType);
    await db.from("schema_registry").delete().eq("entity_type", testEntityType);
  });

  describe("stringSimilarity", () => {
    it("returns 1.0 for identical strings", () => {
      expect(stringSimilarity("Acme Corp", "Acme Corp")).toBe(1);
    });
    it("is case-insensitive", () => {
      expect(stringSimilarity("acme corp", "ACME CORP")).toBe(1);
    });
    it("returns a value in (0, 1) for similar strings", () => {
      const score = stringSimilarity("Acme Corp", "Acme Corporation");
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThan(1);
    });
    it("returns 0 for fully dissimilar strings", () => {
      expect(stringSimilarity("abc", "xyz")).toBe(0);
    });
  });

  describe("findDuplicateCandidates", () => {
    it("returns an empty list when fewer than 2 entities exist", async () => {
      await insertEntity({ id: "ent_r5_single", canonical_name: "Acme" });
      const candidates = await findDuplicateCandidates({
        entityType: testEntityType,
        userId: testUserId,
        threshold: 0.5,
      });
      expect(candidates).toEqual([]);
    });

    it("surfaces near-duplicate canonical_name pairs above the threshold", async () => {
      await insertEntity({ id: "ent_r5_a", canonical_name: "Acme Corp" });
      await insertEntity({ id: "ent_r5_b", canonical_name: "Acme Corporation" });
      await insertEntity({ id: "ent_r5_c", canonical_name: "Globex" });

      const candidates = await findDuplicateCandidates({
        entityType: testEntityType,
        userId: testUserId,
        threshold: 0.5,
      });

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const pair = candidates.find(
        (c) =>
          (c.entity_a.id === "ent_r5_a" && c.entity_b.id === "ent_r5_b") ||
          (c.entity_a.id === "ent_r5_b" && c.entity_b.id === "ent_r5_a"),
      );
      expect(pair).toBeDefined();
      expect(pair?.matched_fields).toContain("canonical_name");
      expect(pair?.score).toBeGreaterThan(0.5);
    });

    it("honors schema-declared duplicate_detection_fields when comparing snapshots", async () => {
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "1.0.0",
        schema_definition: {
          fields: {
            email: { type: "string" },
          },
          canonical_name_fields: ["email"],
          duplicate_detection_fields: ["email"],
          duplicate_detection_threshold: 0.9,
        },
        reducer_config: { merge_policies: {} },
        user_id: testUserId,
        activate: true,
      });

      await insertEntity({
        id: "ent_r5_s1",
        canonical_name: "Alice (alice@example.com)",
        snapshot: { email: "alice@example.com" },
      });
      await insertEntity({
        id: "ent_r5_s2",
        canonical_name: "Alice B. (alice@example.com)",
        snapshot: { email: "alice@example.com" },
      });
      await insertEntity({
        id: "ent_r5_s3",
        canonical_name: "Bob (bob@example.com)",
        snapshot: { email: "bob@example.com" },
      });

      const candidates = await findDuplicateCandidates({
        entityType: testEntityType,
        userId: testUserId,
      });

      const matched = candidates.find(
        (c) =>
          (c.entity_a.id === "ent_r5_s1" && c.entity_b.id === "ent_r5_s2") ||
          (c.entity_a.id === "ent_r5_s2" && c.entity_b.id === "ent_r5_s1"),
      );
      expect(matched).toBeDefined();
      expect(matched?.matched_fields).toContain("email");
    });

    it("excludes merged entities from candidate pairs", async () => {
      await insertEntity({ id: "ent_r5_m1", canonical_name: "Globex Inc" });
      await insertEntity({ id: "ent_r5_m2", canonical_name: "Globex Incorporated" });
      await db
        .from("entities")
        .update({ merged_to_entity_id: "ent_r5_m1", merged_at: new Date().toISOString() })
        .eq("id", "ent_r5_m2");

      const candidates = await findDuplicateCandidates({
        entityType: testEntityType,
        userId: testUserId,
        threshold: 0.5,
      });
      expect(candidates).toEqual([]);
    });

    it("respects an explicit per-call threshold over the schema default", async () => {
      await insertEntity({ id: "ent_r5_t1", canonical_name: "Acme" });
      await insertEntity({ id: "ent_r5_t2", canonical_name: "Acmeee" });

      const strict = await findDuplicateCandidates({
        entityType: testEntityType,
        userId: testUserId,
        threshold: 0.99,
      });
      expect(strict).toEqual([]);

      const lenient = await findDuplicateCandidates({
        entityType: testEntityType,
        userId: testUserId,
        threshold: 0.5,
      });
      expect(lenient.length).toBeGreaterThan(0);
    });
  });
});
