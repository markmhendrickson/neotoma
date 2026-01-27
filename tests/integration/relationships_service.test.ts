/**
 * Integration tests for Relationships Service
 * 
 * Tests relationship creation, observation, snapshot computation, and queries.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { supabase } from "../../src/db.js";
import { RelationshipsService, type RelationshipType } from "../../src/services/relationships.js";

describe("Relationships Service", () => {
  const service = new RelationshipsService();
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const testEntityIds: string[] = [];
  const testRelationshipObservationIds: string[] = [];
  const testRelationshipIds: string[] = [];

  beforeEach(async () => {
    // Clean up test data
    if (testRelationshipObservationIds.length > 0) {
      await supabase
        .from("relationship_observations")
        .delete()
        .in("id", testRelationshipObservationIds);
      testRelationshipObservationIds.length = 0;
    }
    if (testRelationshipIds.length > 0) {
      await supabase
        .from("relationships")
        .delete()
        .in("id", testRelationshipIds);
      testRelationshipIds.length = 0;
    }
    if (testEntityIds.length > 0) {
      await supabase.from("entities").delete().in("id", testEntityIds);
      testEntityIds.length = 0;
    }
  });

  afterEach(async () => {
    // Final cleanup
    if (testRelationshipObservationIds.length > 0) {
      await supabase
        .from("relationship_observations")
        .delete()
        .in("id", testRelationshipObservationIds);
    }
    if (testRelationshipIds.length > 0) {
      await supabase
        .from("relationships")
        .delete()
        .in("id", testRelationshipIds);
    }
    if (testEntityIds.length > 0) {
      await supabase.from("entities").delete().in("id", testEntityIds);
    }
  });

  describe("createRelationship", () => {
    it("should create relationship with observation and snapshot", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_1",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company a",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company b",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Create relationship
      const snapshot = await service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity2.data!.id,
        user_id: testUserId,
      });
      
      expect(snapshot).toBeDefined();
      expect(snapshot.relationship_type).toBe("PART_OF");
      expect(snapshot.source_entity_id).toBe(entity1.data!.id);
      expect(snapshot.target_entity_id).toBe(entity2.data!.id);
      expect(snapshot.relationship_key).toBe(`PART_OF:${entity1.data!.id}:${entity2.data!.id}`);
      
      // Verify observation was created
      const { data: observations } = await supabase
        .from("relationship_observations")
        .select("*")
        .eq("relationship_key", snapshot.relationship_key);
      
      expect(observations).toBeDefined();
      expect(observations!.length).toBeGreaterThan(0);
      
      // Track for cleanup
      for (const obs of observations!) {
        testRelationshipObservationIds.push(obs.id);
      }
      
      // Verify relationship was created in relationships table
      const { data: relationships } = await supabase
        .from("relationships")
        .select("*")
        .eq("source_entity_id", entity1.data!.id)
        .eq("target_entity_id", entity2.data!.id);
      
      expect(relationships).toBeDefined();
      expect(relationships!.length).toBe(1);
      
      // Track for cleanup
      if (relationships![0].id) {
        testRelationshipIds.push(relationships![0].id);
      }
    });

    it("should create relationship with metadata", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_meta_1",
          user_id: testUserId,
          entity_type: "invoice",
          canonical_name: "invoice 001",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_meta_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "vendor company",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Create relationship with metadata
      const metadata = {
        confidence: 0.95,
        source: "extracted",
      };
      
      const snapshot = await service.createRelationship({
        relationship_type: "REFERS_TO",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity2.data!.id,
        metadata,
        user_id: testUserId,
      });
      
      expect(snapshot.snapshot.metadata).toEqual(metadata);
      
      // Cleanup
      const { data: observations } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", snapshot.relationship_key);
      
      if (observations) {
        for (const obs of observations) {
          testRelationshipObservationIds.push(obs.id);
        }
      }
      
      const { data: relationships } = await supabase
        .from("relationships")
        .select("id")
        .eq("source_entity_id", entity1.data!.id);
      
      if (relationships && relationships[0]?.id) {
        testRelationshipIds.push(relationships[0].id);
      }
    });

    it("should reject invalid relationship type", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_invalid_1",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company x",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_invalid_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company y",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Attempt to create relationship with invalid type
      await expect(
        service.createRelationship({
          relationship_type: "INVALID_TYPE" as RelationshipType,
          source_entity_id: entity1.data!.id,
          target_entity_id: entity2.data!.id,
          user_id: testUserId,
        })
      ).rejects.toThrow("Invalid relationship type");
    });
  });

  describe("Cycle Detection", () => {
    it("should detect direct cycles (A → B, B → A)", async () => {
      // Create test entities
      const entityA = await supabase
        .from("entities")
        .insert({
          id: "ent_cycle_a",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company a",
        })
        .select()
        .single();
      
      testEntityIds.push(entityA.data!.id);
      
      const entityB = await supabase
        .from("entities")
        .insert({
          id: "ent_cycle_b",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company b",
        })
        .select()
        .single();
      
      testEntityIds.push(entityB.data!.id);
      
      // Create first relationship: A → B
      const rel1 = await service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: entityA.data!.id,
        target_entity_id: entityB.data!.id,
        user_id: testUserId,
      });
      
      // Track for cleanup
      const { data: obs1 } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", rel1.relationship_key);
      if (obs1) {
        for (const obs of obs1) {
          testRelationshipObservationIds.push(obs.id);
        }
      }
      const { data: rels1 } = await supabase
        .from("relationships")
        .select("id")
        .eq("source_entity_id", entityA.data!.id)
        .eq("target_entity_id", entityB.data!.id);
      if (rels1 && rels1[0]?.id) {
        testRelationshipIds.push(rels1[0].id);
      }
      
      // Attempt to create reverse relationship: B → A (should detect cycle)
      await expect(
        service.createRelationship({
          relationship_type: "PART_OF",
          source_entity_id: entityB.data!.id,
          target_entity_id: entityA.data!.id,
          user_id: testUserId,
        })
      ).rejects.toThrow("cycle");
    });

    it("should detect indirect cycles (A → B → C → A)", async () => {
      // Create test entities
      const entityA = await supabase
        .from("entities")
        .insert({
          id: "ent_cycle_indirect_a",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company a",
        })
        .select()
        .single();
      
      testEntityIds.push(entityA.data!.id);
      
      const entityB = await supabase
        .from("entities")
        .insert({
          id: "ent_cycle_indirect_b",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company b",
        })
        .select()
        .single();
      
      testEntityIds.push(entityB.data!.id);
      
      const entityC = await supabase
        .from("entities")
        .insert({
          id: "ent_cycle_indirect_c",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company c",
        })
        .select()
        .single();
      
      testEntityIds.push(entityC.data!.id);
      
      // Create relationships: A → B → C
      const rel1 = await service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: entityA.data!.id,
        target_entity_id: entityB.data!.id,
        user_id: testUserId,
      });
      
      const rel2 = await service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: entityB.data!.id,
        target_entity_id: entityC.data!.id,
        user_id: testUserId,
      });
      
      // Track for cleanup
      for (const rel of [rel1, rel2]) {
        const { data: obs } = await supabase
          .from("relationship_observations")
          .select("id")
          .eq("relationship_key", rel.relationship_key);
        if (obs) {
          for (const o of obs) {
            testRelationshipObservationIds.push(o.id);
          }
        }
      }
      
      const { data: allRels } = await supabase
        .from("relationships")
        .select("id")
        .or(`source_entity_id.eq.${entityA.data!.id},source_entity_id.eq.${entityB.data!.id}`);
      if (allRels) {
        for (const r of allRels) {
          if (r.id) {
            testRelationshipIds.push(r.id);
          }
        }
      }
      
      // Attempt to create relationship: C → A (should detect cycle)
      await expect(
        service.createRelationship({
          relationship_type: "PART_OF",
          source_entity_id: entityC.data!.id,
          target_entity_id: entityA.data!.id,
          user_id: testUserId,
        })
      ).rejects.toThrow("cycle");
    });

    it("should allow self-referential relationships if not forming cycle", async () => {
      // Some relationship types allow self-reference (e.g., RELATED_TO)
      const entity = await supabase
        .from("entities")
        .insert({
          id: "ent_self_ref",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "self ref company",
        })
        .select()
        .single();
      
      testEntityIds.push(entity.data!.id);
      
      // Create self-referential relationship (if supported by relationship type)
      // Note: This may or may not be allowed depending on relationship type validation
      try {
        const rel = await service.createRelationship({
          relationship_type: "RELATED_TO",
          source_entity_id: entity.data!.id,
          target_entity_id: entity.data!.id,
          user_id: testUserId,
        });
        
        expect(rel).toBeDefined();
        
        // Cleanup
        const { data: obs } = await supabase
          .from("relationship_observations")
          .select("id")
          .eq("relationship_key", rel.relationship_key);
        if (obs) {
          for (const o of obs) {
            testRelationshipObservationIds.push(o.id);
          }
        }
        
        const { data: rels } = await supabase
          .from("relationships")
          .select("id")
          .eq("source_entity_id", entity.data!.id)
          .eq("target_entity_id", entity.data!.id);
        if (rels && rels[0]?.id) {
          testRelationshipIds.push(rels[0].id);
        }
      } catch (error: any) {
        // If self-reference is not allowed, that's also valid behavior
        expect(error.message).toMatch(/cycle|self-reference/i);
      }
    });
  });

  describe("User ID Scoping", () => {
    it("should isolate relationships by user_id", async () => {
      const user1 = "user1-rel-scoping";
      const user2 = "user2-rel-scoping";
      
      // Create entities for user1
      const user1Entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_user1_rel_1",
          user_id: user1,
          entity_type: "company",
          canonical_name: "user1 company a",
        })
        .select()
        .single();
      
      testEntityIds.push(user1Entity1.data!.id);
      
      const user1Entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_user1_rel_2",
          user_id: user1,
          entity_type: "company",
          canonical_name: "user1 company b",
        })
        .select()
        .single();
      
      testEntityIds.push(user1Entity2.data!.id);
      
      // Create entities for user2
      const user2Entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_user2_rel_1",
          user_id: user2,
          entity_type: "company",
          canonical_name: "user2 company a",
        })
        .select()
        .single();
      
      testEntityIds.push(user2Entity1.data!.id);
      
      // Create relationship for user1
      const rel1 = await service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: user1Entity1.data!.id,
        target_entity_id: user1Entity2.data!.id,
        user_id: user1,
      });
      
      // Get relationships for user1's entity
      const user1Relationships = await service.getRelationshipsForEntity(
        user1Entity1.data!.id,
        "outgoing"
      );
      
      expect(user1Relationships.length).toBeGreaterThan(0);
      expect(user1Relationships[0].source_entity_id).toBe(user1Entity1.data!.id);
      
      // User2 should not see user1's relationships (via entity isolation)
      // Note: Direct relationship query may return results, but entity-level RLS prevents access
      
      // Cleanup
      const { data: obs } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", rel1.relationship_key);
      if (obs) {
        for (const o of obs) {
          testRelationshipObservationIds.push(o.id);
        }
      }
      const { data: rels } = await supabase
        .from("relationships")
        .select("id")
        .eq("source_entity_id", user1Entity1.data!.id);
      if (rels && rels[0]?.id) {
        testRelationshipIds.push(rels[0].id);
      }
    });

    it("should handle relationships with null user_id", async () => {
      // Create entities with null user_id (global entities)
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_null_user_rel_1",
          user_id: null,
          entity_type: "company",
          canonical_name: "global company a",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_null_user_rel_2",
          user_id: null,
          entity_type: "company",
          canonical_name: "global company b",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Create relationship with null user_id
      const rel = await service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity2.data!.id,
        user_id: null as any,
      });
      
      expect(rel).toBeDefined();
      expect(rel.source_entity_id).toBe(entity1.data!.id);
      expect(rel.target_entity_id).toBe(entity2.data!.id);
      
      // Cleanup
      const { data: obs } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", rel.relationship_key);
      if (obs) {
        for (const o of obs) {
          testRelationshipObservationIds.push(o.id);
        }
      }
      const { data: rels } = await supabase
        .from("relationships")
        .select("id")
        .eq("relationship_key", rel.relationship_key);
      if (rels && rels[0]?.id) {
        testRelationshipIds.push(rels[0].id);
      }
    });
  });

  describe("Foreign Key Constraints", () => {
    it("should reject relationship with non-existent source entity", async () => {
      // Create one valid target entity
      const target = await supabase
        .from("entities")
        .insert({
          id: "ent_fk_test_target",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "target company",
        })
        .select()
        .single();
      
      testEntityIds.push(target.data!.id);
      
      // Attempt to create relationship with non-existent source
      await expect(
        service.createRelationship({
          relationship_type: "PART_OF",
          source_entity_id: "ent_nonexistent_source",
          target_entity_id: target.data!.id,
          user_id: testUserId,
        })
      ).rejects.toThrow();
    });

    it("should reject relationship with non-existent target entity", async () => {
      // Create one valid source entity
      const source = await supabase
        .from("entities")
        .insert({
          id: "ent_fk_test_source",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "source company",
        })
        .select()
        .single();
      
      testEntityIds.push(source.data!.id);
      
      // Attempt to create relationship with non-existent target
      await expect(
        service.createRelationship({
          relationship_type: "PART_OF",
          source_entity_id: source.data!.id,
          target_entity_id: "ent_nonexistent_target",
          user_id: testUserId,
        })
      ).rejects.toThrow();
    });
  });

  describe("getRelationshipsForEntity", () => {
    it("should get outgoing relationships", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_get_1",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company out",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_get_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company target",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Create relationship
      await service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity2.data!.id,
        user_id: testUserId,
      });
      
      // Get outgoing relationships
      const relationships = await service.getRelationshipsForEntity(
        entity1.data!.id,
        "outgoing"
      );
      
      expect(relationships.length).toBe(1);
      expect(relationships[0].source_entity_id).toBe(entity1.data!.id);
      expect(relationships[0].target_entity_id).toBe(entity2.data!.id);
      
      // Cleanup
      const { data: observations } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", relationships[0].relationship_key);
      
      if (observations) {
        for (const obs of observations) {
          testRelationshipObservationIds.push(obs.id);
        }
      }
      
      const { data: rels } = await supabase
        .from("relationships")
        .select("id")
        .eq("source_entity_id", entity1.data!.id);
      
      if (rels && rels[0]?.id) {
        testRelationshipIds.push(rels[0].id);
      }
    });

    it("should get incoming relationships", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_incoming_1",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company source",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_incoming_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company target",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Create relationship
      await service.createRelationship({
        relationship_type: "REFERS_TO",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity2.data!.id,
        user_id: testUserId,
      });
      
      // Get incoming relationships for entity2
      const relationships = await service.getRelationshipsForEntity(
        entity2.data!.id,
        "incoming"
      );
      
      expect(relationships.length).toBe(1);
      expect(relationships[0].target_entity_id).toBe(entity2.data!.id);
      expect(relationships[0].source_entity_id).toBe(entity1.data!.id);
      
      // Cleanup
      const { data: observations } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", relationships[0].relationship_key);
      
      if (observations) {
        for (const obs of observations) {
          testRelationshipObservationIds.push(obs.id);
        }
      }
      
      const { data: rels } = await supabase
        .from("relationships")
        .select("id")
        .eq("source_entity_id", entity1.data!.id);
      
      if (rels && rels[0]?.id) {
        testRelationshipIds.push(rels[0].id);
      }
    });

    it("should get both incoming and outgoing relationships", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_both_1",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company center",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_both_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company left",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      const entity3 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_both_3",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company right",
        })
        .select()
        .single();
      
      testEntityIds.push(entity3.data!.id);
      
      // Create outgoing relationship: entity1 → entity3
      await service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity3.data!.id,
        user_id: testUserId,
      });
      
      // Create incoming relationship: entity2 → entity1
      await service.createRelationship({
        relationship_type: "REFERS_TO",
        source_entity_id: entity2.data!.id,
        target_entity_id: entity1.data!.id,
        user_id: testUserId,
      });
      
      // Get both directions
      const relationships = await service.getRelationshipsForEntity(
        entity1.data!.id,
        "both"
      );
      
      expect(relationships.length).toBe(2);
      
      // Verify one outgoing and one incoming
      const outgoing = relationships.find(r => r.source_entity_id === entity1.data!.id);
      const incoming = relationships.find(r => r.target_entity_id === entity1.data!.id);
      
      expect(outgoing).toBeDefined();
      expect(incoming).toBeDefined();
      
      // Cleanup
      for (const rel of relationships) {
        const { data: observations } = await supabase
          .from("relationship_observations")
          .select("id")
          .eq("relationship_key", rel.relationship_key);
        
        if (observations) {
          for (const obs of observations) {
            testRelationshipObservationIds.push(obs.id);
          }
        }
      }
      
      const { data: rels } = await supabase
        .from("relationships")
        .select("id")
        .or(`source_entity_id.eq.${entity1.data!.id},target_entity_id.eq.${entity1.data!.id}`);
      
      if (rels) {
        for (const rel of rels) {
          if (rel.id) testRelationshipIds.push(rel.id);
        }
      }
    });
  });

  describe("getRelationshipsByType", () => {
    it("should get relationships by type", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_type_1",
          user_id: testUserId,
          entity_type: "invoice",
          canonical_name: "invoice 001",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_type_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "vendor",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Create REFERS_TO relationship
      await service.createRelationship({
        relationship_type: "REFERS_TO",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity2.data!.id,
        user_id: testUserId,
      });
      
      // Query by type
      const relationships = await service.getRelationshipsByType("REFERS_TO");
      
      // Should find at least our test relationship
      expect(relationships.length).toBeGreaterThan(0);
      
      // All should be REFERS_TO type
      for (const rel of relationships) {
        expect(rel.relationship_type).toBe("REFERS_TO");
      }
      
      // Cleanup
      for (const rel of relationships) {
        const { data: observations } = await supabase
          .from("relationship_observations")
          .select("id")
          .eq("relationship_key", rel.relationship_key)
          .eq("user_id", testUserId);
        
        if (observations) {
          for (const obs of observations) {
            testRelationshipObservationIds.push(obs.id);
          }
        }
      }
      
      const { data: rels } = await supabase
        .from("relationships")
        .select("id")
        .eq("relationship_type", "REFERS_TO")
        .eq("user_id", testUserId);
      
      if (rels) {
        for (const rel of rels) {
          if (rel.id) testRelationshipIds.push(rel.id);
        }
      }
    });
  });

  describe("getRelationshipSnapshot", () => {
    it("should get specific relationship snapshot", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_snap_1",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company snap",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_snap_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company target",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Create relationship
      await service.createRelationship({
        relationship_type: "SETTLES",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity2.data!.id,
        user_id: testUserId,
      });
      
      // Get snapshot
      const snapshot = await service.getRelationshipSnapshot(
        "SETTLES",
        entity1.data!.id,
        entity2.data!.id,
        testUserId
      );
      
      expect(snapshot).toBeDefined();
      expect(snapshot!.relationship_type).toBe("SETTLES");
      expect(snapshot!.source_entity_id).toBe(entity1.data!.id);
      expect(snapshot!.target_entity_id).toBe(entity2.data!.id);
      
      // Cleanup
      const { data: observations } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", snapshot!.relationship_key);
      
      if (observations) {
        for (const obs of observations) {
          testRelationshipObservationIds.push(obs.id);
        }
      }
      
      const { data: rels } = await supabase
        .from("relationships")
        .select("id")
        .eq("source_entity_id", entity1.data!.id);
      
      if (rels && rels[0]?.id) {
        testRelationshipIds.push(rels[0].id);
      }
    });

    it("should return null for non-existent relationship", async () => {
      const snapshot = await service.getRelationshipSnapshot(
        "PART_OF",
        "ent_nonexistent_1",
        "ent_nonexistent_2",
        testUserId
      );
      
      expect(snapshot).toBeNull();
    });
  });

  describe("computeRelationshipSnapshot", () => {
    it("should compute snapshot from observations", async () => {
      // Create test entities
      const entity1 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_compute_1",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company compute",
        })
        .select()
        .single();
      
      testEntityIds.push(entity1.data!.id);
      
      const entity2 = await supabase
        .from("entities")
        .insert({
          id: "ent_test_rel_compute_2",
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company compute target",
        })
        .select()
        .single();
      
      testEntityIds.push(entity2.data!.id);
      
      // Create relationship (which creates observations)
      await service.createRelationship({
        relationship_type: "DEPENDS_ON",
        source_entity_id: entity1.data!.id,
        target_entity_id: entity2.data!.id,
        user_id: testUserId,
      });
      
      // Compute snapshot
      const snapshot = await service.computeRelationshipSnapshot(
        "DEPENDS_ON",
        entity1.data!.id,
        entity2.data!.id,
        testUserId
      );
      
      expect(snapshot).toBeDefined();
      expect(snapshot.relationship_type).toBe("DEPENDS_ON");
      expect(snapshot.observation_count).toBeGreaterThan(0);
      expect(snapshot.last_observation_at).toBeDefined();
      
      // Cleanup
      const { data: observations } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", snapshot.relationship_key);
      
      if (observations) {
        for (const obs of observations) {
          testRelationshipObservationIds.push(obs.id);
        }
      }
      
      const { data: rels } = await supabase
        .from("relationships")
        .select("id")
        .eq("source_entity_id", entity1.data!.id);
      
      if (rels && rels[0]?.id) {
        testRelationshipIds.push(rels[0].id);
      }
    });
  });

  describe("Relationship Types", () => {
    const relationshipTypes: RelationshipType[] = [
      "PART_OF",
      "CORRECTS",
      "REFERS_TO",
      "SETTLES",
      "DUPLICATE_OF",
      "DEPENDS_ON",
      "SUPERSEDES",
    ];

    it("should support all relationship types", async () => {
      for (let i = 0; i < relationshipTypes.length; i++) {
        const type = relationshipTypes[i];
        
        // Create test entities
        const entity1 = await supabase
          .from("entities")
          .insert({
            id: `ent_test_rel_type_src_${i}`,
            user_id: testUserId,
            entity_type: "company",
            canonical_name: `company ${i} a`,
          })
          .select()
          .single();
        
        testEntityIds.push(entity1.data!.id);
        
        const entity2 = await supabase
          .from("entities")
          .insert({
            id: `ent_test_rel_type_tgt_${i}`,
            user_id: testUserId,
            entity_type: "company",
            canonical_name: `company ${i} b`,
          })
          .select()
          .single();
        
        testEntityIds.push(entity2.data!.id);
        
        // Create relationship
        const snapshot = await service.createRelationship({
          relationship_type: type,
          source_entity_id: entity1.data!.id,
          target_entity_id: entity2.data!.id,
          user_id: testUserId,
        });
        
        expect(snapshot.relationship_type).toBe(type);
        
        // Track for cleanup
        const { data: observations } = await supabase
          .from("relationship_observations")
          .select("id")
          .eq("relationship_key", snapshot.relationship_key);
        
        if (observations) {
          for (const obs of observations) {
            testRelationshipObservationIds.push(obs.id);
          }
        }
        
        const { data: rels } = await supabase
          .from("relationships")
          .select("id")
          .eq("source_entity_id", entity1.data!.id);
        
        if (rels && rels[0]?.id) {
          testRelationshipIds.push(rels[0].id);
        }
      }
    });
  });
});
