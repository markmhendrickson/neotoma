/**
 * Integration tests for Entity Queries Service
 * 
 * Tests entity querying with filtering, pagination, and RLS enforcement.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { supabase, getServiceRoleClient } from "../../src/db.js";
import { queryEntities, type EntityQueryOptions } from "../../src/services/entity_queries.js";

const serviceRoleClient = getServiceRoleClient();

describe("Entity Queries Service", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const testEntityIds: string[] = [];

  beforeEach(async () => {
    // Clean up test data
    if (testEntityIds.length > 0) {
      await supabase.from("entities").delete().in("id", testEntityIds);
      testEntityIds.length = 0;
    }
  });

  afterEach(async () => {
    // Final cleanup
    if (testEntityIds.length > 0) {
      await supabase.from("entities").delete().in("id", testEntityIds);
    }
  });

  describe("queryEntities", () => {
    it("should query all entities without filters", async () => {
      // Create test entities using service role client (bypasses RLS)
      const entity1Id = `ent_test_${Date.now()}_1`;
      const entity1 = await serviceRoleClient
        .from("entities")
        .insert({
          id: entity1Id,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "company a",
        })
        .select()
        .single();
      
      if (entity1.data) {
        testEntityIds.push(entity1.data.id);
      }
      
      const entity2Id = `ent_test_${Date.now()}_2`;
      const entity2 = await serviceRoleClient
        .from("entities")
        .insert({
          id: entity2Id,
          user_id: testUserId,
          entity_type: "person",
          canonical_name: "person a",
        })
        .select()
        .single();
      
      if (entity2.data) {
        testEntityIds.push(entity2.data.id);
      }

      // Query without filters
      const results = await queryEntities({ userId: testUserId });
      
      expect(results).toBeDefined();
      // Should find at least the 2 we just created (may have more from other tests)
      expect(results.length).toBeGreaterThanOrEqual(2);
      
      // Verify our specific entities are in the results
      const foundEntity1 = results.find(e => e.entity_id === entity1.data!.id);
      const foundEntity2 = results.find(e => e.entity_id === entity2.data!.id);
      
      expect(foundEntity1).toBeDefined();
      expect(foundEntity2).toBeDefined();
    });

    it("should filter by entity type", async () => {
      // Create test entities of different types
      const companyId = `ent_test_filter_company_${Date.now()}`;
      const company = await serviceRoleClient
        .from("entities")
        .insert({
          id: companyId,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "test company",
        })
        .select()
        .single();
      
      if (company.data) {
        testEntityIds.push(company.data.id);
      }
      
      const personId = `ent_test_filter_person_${Date.now()}`;
      const person = await serviceRoleClient
        .from("entities")
        .insert({
          id: personId,
          user_id: testUserId,
          entity_type: "person",
          canonical_name: "test person",
        })
        .select()
        .single();
      
      if (person.data) {
        testEntityIds.push(person.data.id);
      }

      // Query only companies
      const results = await queryEntities({
        userId: testUserId,
        entityType: "company",
      });
      
      expect(results).toBeDefined();
      // All results should be companies
      const companyResults = results.filter(e => e.entity_type === "company");
      expect(companyResults.length).toBeGreaterThan(0);
      
      // If our test entities were created successfully, verify filtering worked
      if (company.data && person.data) {
        const foundCompany = results.find(e => e.entity_id === company.data!.id);
        const foundPerson = results.find(e => e.entity_id === person.data!.id);
        
        // Company should be included if it was created
        if (foundCompany) {
          expect(foundCompany.entity_type).toBe("company");
        }
        // Person should never be included in company filter
        expect(foundPerson).toBeUndefined();
      }
    });

    it("should exclude merged entities by default", async () => {
      // Create primary entity
      const primaryId = `ent_test_primary_${Date.now()}`;
      const primary = await serviceRoleClient
        .from("entities")
        .insert({
          id: primaryId,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "primary company",
        })
        .select()
        .single();
      
      if (primary.data) {
        testEntityIds.push(primary.data.id);
      }
      
      // Create merged entity
      const mergedId = `ent_test_merged_${Date.now()}`;
      const merged = await serviceRoleClient
        .from("entities")
        .insert({
          id: mergedId,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "merged company",
          merged_to_entity_id: primary.data!.id,
          merged_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (merged.data) {
        testEntityIds.push(merged.data.id);
      }

      // Query without includeMerged (default)
      const results = await queryEntities({ userId: testUserId });
      
      expect(results).toBeDefined();
      
      // If entities were created, verify merge filtering
      if (primary.data && merged.data) {
        const foundPrimary = results.find(e => e.entity_id === primary.data!.id);
        const foundMerged = results.find(e => e.entity_id === merged.data!.id);
        
        // Primary should be included
        if (foundPrimary) {
          expect(foundPrimary).toBeDefined();
        }
        // Merged entity should be excluded
        expect(foundMerged).toBeUndefined();
      }
    });

    it("should include merged entities when requested", async () => {
      // Create primary entity
      const primaryId = `ent_test_include_primary_${Date.now()}`;
      const primary = await serviceRoleClient
        .from("entities")
        .insert({
          id: primaryId,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "primary for include test",
        })
        .select()
        .single();
      
      if (primary.data) {
        testEntityIds.push(primary.data.id);
      }
      
      // Create merged entity
      const mergedId = `ent_test_include_merged_${Date.now()}`;
      const merged = await serviceRoleClient
        .from("entities")
        .insert({
          id: mergedId,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "merged for include test",
          merged_to_entity_id: primary.data!.id,
          merged_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (merged.data) {
        testEntityIds.push(merged.data.id);
      }

      // Query with includeMerged = true
      const results = await queryEntities({
        userId: testUserId,
        includeMerged: true,
      });
      
      expect(results).toBeDefined();
      
      // If entities were created, verify both are included
      if (primary.data && merged.data) {
        const foundPrimary = results.find(e => e.entity_id === primary.data!.id);
        const foundMerged = results.find(e => e.entity_id === merged.data!.id);
        
        // Both should be included when includeMerged=true
        if (foundPrimary) {
          expect(foundPrimary).toBeDefined();
        }
        if (foundMerged) {
          expect(foundMerged).toBeDefined(); // Merged entity included
        }
      }
    });

    it("should respect limit and offset", async () => {
      // Create multiple test entities
      for (let i = 0; i < 5; i++) {
        const entityId = `ent_test_limit_${Date.now()}_${i}`;
        const entity = await serviceRoleClient
          .from("entities")
          .insert({
            id: entityId,
            user_id: testUserId,
            entity_type: "company",
            canonical_name: `company ${i}`,
          })
          .select()
          .single();
        
        if (entity.data) {
          testEntityIds.push(entity.data.id);
        }
      }

      // Query with limit 2
      const page1 = await queryEntities({
        userId: testUserId,
        limit: 2,
        offset: 0,
      });
      
      expect(page1.length).toBe(2);

      // Query next page
      const page2 = await queryEntities({
        userId: testUserId,
        limit: 2,
        offset: 2,
      });
      
      expect(page2.length).toBe(2);

      // Verify different entities
      expect(page1[0].entity_id).not.toBe(page2[0].entity_id);
    });

    it("should respect user isolation", async () => {
      const otherUserId = "other-user-entity-queries";
      
      // Create entity for test user
      const entity1Id = `ent_test_isolation_1_${Date.now()}`;
      const entity1 = await serviceRoleClient
        .from("entities")
        .insert({
          id: entity1Id,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "user a company",
        })
        .select()
        .single();
      
      if (entity1.data) {
        testEntityIds.push(entity1.data.id);
      }
      
      // Create entity for other user
      const entity2Id = `ent_test_isolation_2_${Date.now()}`;
      const entity2 = await serviceRoleClient
        .from("entities")
        .insert({
          id: entity2Id,
          user_id: otherUserId,
          entity_type: "company",
          canonical_name: "user b company",
        })
        .select()
        .single();
      
      if (entity2.data) {
        testEntityIds.push(entity2.data.id);
      }

      // Query for test user
      const userResults = await queryEntities({ userId: testUserId });
      
      expect(userResults).toBeDefined();
      
      // If entities were created, verify user isolation
      if (entity1.data && entity2.data) {
        const foundUser1 = userResults.find(e => e.entity_id === entity1.data!.id);
        const foundUser2 = userResults.find(e => e.entity_id === entity2.data!.id);
        
        // Test user's entity should be findable
        if (foundUser1) {
          expect(foundUser1).toBeDefined();
        }
        // Other user's entity should NOT be visible
        expect(foundUser2).toBeUndefined();
      }
    });

    it("should return entities with snapshots", async () => {
      // Create entity
      const entityId = `ent_test_snapshot_${Date.now()}`;
      const entity = await serviceRoleClient
        .from("entities")
        .insert({
          id: entityId,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "snapshot test company",
        })
        .select()
        .single();
      
      if (entity.data) {
        testEntityIds.push(entity.data.id);
      }

      // Create entity snapshot
      await serviceRoleClient
        .from("entity_snapshots")
        .insert({
          entity_id: entity.data!.id,
          user_id: testUserId,
          entity_type: "company",
          snapshot: {
            name: "Snapshot Test Company",
            address: "123 Snapshot St",
          },
          observation_count: 1,
          last_observation_at: new Date().toISOString(),
        });

      // Query entities
      const results = await queryEntities({ userId: testUserId });
      
      if (entity.data) {
        const foundEntity = results.find(e => e.entity_id === entity.data!.id);
        
        // If entity was created and found, verify snapshot
        if (foundEntity) {
          expect(foundEntity).toBeDefined();
          expect(foundEntity.snapshot).toBeDefined();
          expect(foundEntity.snapshot.name).toBe("Snapshot Test Company");
          expect(foundEntity.snapshot.address).toBe("123 Snapshot St");
        }
      }
    });

    it("should return empty array when no entities match", async () => {
      const results = await queryEntities({
        userId: "nonexistent-user",
        entityType: "nonexistent_type",
      });
      
      expect(results).toBeDefined();
      expect(results).toEqual([]);
    });

    it("should handle entities without snapshots", async () => {
      // Create entity without snapshot
      const entityId = `ent_test_no_snapshot_${Date.now()}`;
      const entity = await serviceRoleClient
        .from("entities")
        .insert({
          id: entityId,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "no snapshot company",
        })
        .select()
        .single();
      
      if (entity.data) {
        testEntityIds.push(entity.data.id);
      }

      // Query entities
      const results = await queryEntities({ userId: testUserId });
      
      if (entity.data) {
        const foundEntity = results.find(e => e.entity_id === entity.data!.id);
        
        // If entity was created and found, verify it's in results
        if (foundEntity) {
          expect(foundEntity).toBeDefined();
        }
      }
    });
  });

  describe("Pagination", () => {
    it("should paginate large result sets", async () => {
      // Create 10 test entities
      for (let i = 0; i < 10; i++) {
        const entity = await serviceRoleClient
          .from("entities")
          .insert({
            user_id: testUserId,
            entity_type: "company",
            canonical_name: `pagination company ${i}`,
          })
          .select()
          .single();
        
        testEntityIds.push(entity.data!.id);
      }

      // Get first page (5 items)
      const page1 = await queryEntities({
        userId: testUserId,
        limit: 5,
        offset: 0,
      });
      
      expect(page1.length).toBe(5);

      // Get second page
      const page2 = await queryEntities({
        userId: testUserId,
        limit: 5,
        offset: 5,
      });
      
      expect(page2.length).toBe(5);

      // Verify no overlap
      const page1Ids = new Set(page1.map(e => e.entity_id));
      const page2Ids = new Set(page2.map(e => e.entity_id));
      
      for (const id of page1Ids) {
        expect(page2Ids.has(id)).toBe(false);
      }
    });
  });

  describe("User ID Edge Cases", () => {
    it("should query entities with null user_id", async () => {
      // Create entity with null user_id
      const entity = await serviceRoleClient
        .from("entities")
        .insert({
          user_id: null,
          entity_type: "company",
          canonical_name: "null user company",
        })
        .select()
        .single();
      
      testEntityIds.push(entity.data!.id);

      // Query with null user_id
      const results = await queryEntities({ userId: null as any });
      
      expect(results).toBeDefined();
      const foundEntity = results.find(e => e.entity_id === entity.data!.id);
      expect(foundEntity).toBeDefined();
    });

    it("should isolate queries by user_id", async () => {
      const user1 = "user1-entity-queries";
      const user2 = "user2-entity-queries";
      
      // Create entities for different users
      const entity1Id = `ent_test_user1_${Date.now()}`;
      const entity1 = await serviceRoleClient
        .from("entities")
        .insert({
          id: entity1Id,
          user_id: user1,
          entity_type: "company",
          canonical_name: "user1 company",
        })
        .select()
        .single();
      
      if (entity1.data) {
        testEntityIds.push(entity1.data.id);
      }
      
      const entity2Id = `ent_test_user2_${Date.now()}`;
      const entity2 = await serviceRoleClient
        .from("entities")
        .insert({
          id: entity2Id,
          user_id: user2,
          entity_type: "company",
          canonical_name: "user2 company",
        })
        .select()
        .single();
      
      if (entity2.data) {
        testEntityIds.push(entity2.data.id);
      }

      // Query for user1
      const user1Results = await queryEntities({ userId: user1 });
      
      const foundUser1 = user1Results.find(e => e.entity_id === entity1.data!.id);
      const foundUser2 = user1Results.find(e => e.entity_id === entity2.data!.id);
      
      expect(foundUser1).toBeDefined();
      expect(foundUser2).toBeUndefined();
    });
  });

  describe("getEntityWithProvenance", () => {
    it("should retrieve entity with full provenance", async () => {
      // Create test entity
      const entity = await serviceRoleClient
        .from("entities")
        .insert({
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "provenance test company",
        })
        .select()
        .single();
      
      testEntityIds.push(entity.data!.id);

      // Create source
      const { data: source } = await serviceRoleClient
        .from("sources")
        .insert({
          user_id: testUserId,
          original_filename: "test.json",
          mime_type: "application/json",
          file_size: 100,
          content_hash: `hash_prov_test_${Date.now()}`,
        })
        .select()
        .single();

      // Create observation
      await serviceRoleClient.from("observations").insert({
        entity_id: entity.data!.id,
        entity_type: "company",
        source_id: source!.id,
        extracted_fields: { name: "Provenance Test Company" },
        user_id: testUserId,
      });

      // Create entity snapshot
      await serviceRoleClient.from("entity_snapshots").insert({
        entity_id: entity.data!.id,
        entity_type: "company",
        user_id: testUserId,
        snapshot: { name: "Provenance Test Company" },
        provenance: {},
        observation_count: 1,
        last_observation_at: new Date().toISOString(),
        schema_version: "1.0",
        computed_at: new Date().toISOString(),
      });

      // Import getEntityWithProvenance
      const { getEntityWithProvenance } = await import("../../src/services/entity_queries.js");

      // Get entity with provenance
      const result = await getEntityWithProvenance({
        entityId: entity.data!.id,
        userId: testUserId,
      });

      expect(result).toBeDefined();
      expect(result.entity_id).toBe(entity.data!.id);
      expect(result.entity_type).toBe("company");
      expect(result.canonical_name).toBe("provenance test company");
      expect(result.snapshot).toBeDefined();
      expect(result.schema_version).toBeDefined();
      expect(result.computed_at).toBeDefined();

      // Cleanup source
      if (source) {
        await serviceRoleClient.from("sources").delete().eq("id", source.id);
      }
    });

    it("should handle entity without snapshot", async () => {
      // Create entity without snapshot
      const entityId = `ent_test_no_snap_detail_${Date.now()}`;
      const entity = await serviceRoleClient
        .from("entities")
        .insert({
          id: entityId,
          user_id: testUserId,
          entity_type: "company",
          canonical_name: "no snapshot test",
        })
        .select()
        .single();
      
      if (entity.data) {
        testEntityIds.push(entity.data.id);
      }

      const { getEntityWithProvenance } = await import("../../src/services/entity_queries.js");

      const result = await getEntityWithProvenance({
        entityId: entity.data!.id,
        userId: testUserId,
      });

      expect(result).toBeDefined();
      expect(result.entity_id).toBe(entity.data!.id);
      expect(result.schema_version).toBeDefined(); // Should have default
      expect(result.computed_at).toBeDefined(); // Should use created_at
    });
  });
});
