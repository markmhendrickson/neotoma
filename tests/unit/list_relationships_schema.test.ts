import { describe, expect, it } from "vitest";

import { ListRelationshipsRequestSchema } from "../../src/shared/action_schemas.js";

describe("ListRelationshipsRequestSchema", () => {
  describe("accepts valid inputs", () => {
    it("accepts entity_id alone (legacy path)", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entity_id).toBe("ent_aaaaaaaaaaaaaaaaaaaaaaaa");
        expect(result.data.direction).toBe("both");
        expect(result.data.limit).toBe(100);
        expect(result.data.offset).toBe(0);
      }
    });

    it("accepts source_entity_id alone", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        source_entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source_entity_id).toBe("ent_aaaaaaaaaaaaaaaaaaaaaaaa");
      }
    });

    it("accepts target_entity_id alone", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        target_entity_id: "ent_bbbbbbbbbbbbbbbbbbbbbbbb",
      });
      expect(result.success).toBe(true);
    });

    it("accepts relationship_type alone", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        relationship_type: "PART_OF",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.relationship_type).toBe("PART_OF");
      }
    });

    it("accepts source_entity_id + target_entity_id pair", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        source_entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
        target_entity_id: "ent_bbbbbbbbbbbbbbbbbbbbbbbb",
      });
      expect(result.success).toBe(true);
    });

    it("accepts source_entity_id + relationship_type", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        source_entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
        relationship_type: "works_at",
      });
      expect(result.success).toBe(true);
    });

    it("accepts target_entity_id + relationship_type", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        target_entity_id: "ent_bbbbbbbbbbbbbbbbbbbbbbbb",
        relationship_type: "REFERS_TO",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all three filter params together", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        source_entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
        target_entity_id: "ent_bbbbbbbbbbbbbbbbbbbbbbbb",
        relationship_type: "PART_OF",
      });
      expect(result.success).toBe(true);
    });

    it("accepts entity_id with direction filter", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
        direction: "outbound",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.direction).toBe("outbound");
      }
    });

    it("accepts entity_id with relationship_type and direction", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
        direction: "inbound",
        relationship_type: "PART_OF",
      });
      expect(result.success).toBe(true);
    });

    it("applies default limit and offset", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
        expect(result.data.offset).toBe(0);
      }
    });

    it("accepts custom limit and offset", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
        limit: 25,
        offset: 50,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(result.data.offset).toBe(50);
      }
    });
  });

  describe("rejects invalid inputs", () => {
    it("rejects empty object (no filter provided)", () => {
      const result = ListRelationshipsRequestSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/At least one filter is required/);
      }
    });

    it("rejects when only pagination params are provided (no filter)", () => {
      const result = ListRelationshipsRequestSchema.safeParse({ limit: 10, offset: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/At least one filter is required/);
      }
    });

    it("rejects non-positive limit", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative offset", () => {
      const result = ListRelationshipsRequestSchema.safeParse({
        entity_id: "ent_aaaaaaaaaaaaaaaaaaaaaaaa",
        offset: -1,
      });
      expect(result.success).toBe(false);
    });
  });
});
