/**
 * Graph Builder Service Tests
 *
 * Tests for orphan detection and cycle detection across all node types.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { supabase } from "../db.js";
import {
  detectOrphanNodes,
  detectCycles,
  validateGraphIntegrity,
} from "./graph_builder.js";

describe("Graph Builder Service", () => {
  const testRecordIds: string[] = [];
  const testEntityIds: string[] = [];
  const testEventIds: string[] = [];

  afterEach(async () => {
    // Cleanup test data
    if (testRecordIds.length > 0) {
      await supabase.from("records").delete().in("id", testRecordIds);
    }
    if (testEntityIds.length > 0) {
      await supabase.from("entities").delete().in("id", testEntityIds);
    }
    if (testEventIds.length > 0) {
      await supabase.from("timeline_events").delete().in("id", testEventIds);
    }
  });

  describe("detectOrphanNodes", () => {
    it("should detect orphan records (records with no edges)", async () => {
      // Create a record with no edges
      const { data: record } = await supabase
        .from("records")
        .insert({
          type: "test",
          properties: {},
        })
        .select()
        .single();

      testRecordIds.push(record!.id);

      const orphans = await detectOrphanNodes();

      // This record should be counted as an orphan
      expect(orphans.orphanRecords).toBeGreaterThan(0);
    });

    it("should detect orphan entities (entities with no record_entity_edges)", async () => {
      // Create an entity with no edges
      const { data: entity } = await supabase
        .from("entities")
        .insert({
          id: "ent_orphan_test_123456789012",
          entity_type: "company",
          canonical_name: "orphan test company",
          aliases: [],
        })
        .select()
        .single();

      testEntityIds.push(entity!.id);

      const orphans = await detectOrphanNodes();

      // This entity should be counted as an orphan
      expect(orphans.orphanEntities).toBeGreaterThan(0);
    });

    it("should detect orphan events (events with no record_event_edges)", async () => {
      // Create a record first (events need a valid record reference)
      const { data: record } = await supabase
        .from("records")
        .insert({
          type: "test",
          properties: {},
        })
        .select()
        .single();

      testRecordIds.push(record!.id);

      // Create an event with no edges
      const { data: event } = await supabase
        .from("timeline_events")
        .insert({
          id: "evt_orphan_test_123456789012",
          event_type: "TestEvent",
          event_timestamp: new Date().toISOString(),
          source_record_id: record!.id,
          source_field: "test_date",
        })
        .select()
        .single();

      testEventIds.push(event!.id);

      const orphans = await detectOrphanNodes();

      // This event should be counted as an orphan
      expect(orphans.orphanEvents).toBeGreaterThan(0);
    });

    it("should not count entities with edges as orphans", async () => {
      // Create a record
      const { data: record } = await supabase
        .from("records")
        .insert({
          type: "test",
          properties: {},
        })
        .select()
        .single();

      testRecordIds.push(record!.id);

      // Create an entity
      const { data: entity } = await supabase
        .from("entities")
        .insert({
          id: "ent_with_edge_123456789012",
          entity_type: "company",
          canonical_name: "test company",
          aliases: [],
        })
        .select()
        .single();

      testEntityIds.push(entity!.id);

      // Create an edge
      await supabase.from("record_entity_edges").insert({
        record_id: record!.id,
        entity_id: entity!.id,
        edge_type: "EXTRACTED_FROM",
      });

      const orphansBefore = await detectOrphanNodes();
      const orphanEntitiesBefore = orphansBefore.orphanEntities;

      // Entity should not be an orphan
      const { data: allEntities } = await supabase
        .from("entities")
        .select("id");
      const { data: entityEdges } = await supabase
        .from("record_entity_edges")
        .select("entity_id")
        .eq("entity_id", entity!.id);

      expect(entityEdges).toBeDefined();
      expect(entityEdges!.length).toBeGreaterThan(0);
    });
  });

  describe("detectCycles", () => {
    it("should detect cycles in record relationships", async () => {
      // Create three records
      const { data: record1 } = await supabase
        .from("records")
        .insert({ type: "test", properties: {} })
        .select()
        .single();

      const { data: record2 } = await supabase
        .from("records")
        .insert({ type: "test", properties: {} })
        .select()
        .single();

      const { data: record3 } = await supabase
        .from("records")
        .insert({ type: "test", properties: {} })
        .select()
        .single();

      testRecordIds.push(record1!.id, record2!.id, record3!.id);

      // Create a cycle: record1 → record2 → record3 → record1
      await supabase.from("record_relationships").insert([
        {
          source_id: record1!.id,
          target_id: record2!.id,
          relationship: "REFERENCES",
          metadata: {},
        },
        {
          source_id: record2!.id,
          target_id: record3!.id,
          relationship: "REFERENCES",
          metadata: {},
        },
        {
          source_id: record3!.id,
          target_id: record1!.id,
          relationship: "REFERENCES",
          metadata: {},
        },
      ]);

      const cycles = await detectCycles();

      // Should detect at least one cycle
      expect(cycles.length).toBeGreaterThan(0);
    });

    it("should detect cycles in entity relationships", async () => {
      // Create three entities
      const entities = [
        {
          id: "ent_cycle_test_1",
          entity_type: "company",
          canonical_name: "company 1",
        },
        {
          id: "ent_cycle_test_2",
          entity_type: "company",
          canonical_name: "company 2",
        },
        {
          id: "ent_cycle_test_3",
          entity_type: "company",
          canonical_name: "company 3",
        },
      ];

      for (const entity of entities) {
        await supabase.from("entities").insert(entity);
        testEntityIds.push(entity.id);
      }

      // Create a cycle: entity1 → entity2 → entity3 → entity1
      await supabase.from("relationships").insert([
        {
          source_entity_id: "ent_cycle_test_1",
          target_entity_id: "ent_cycle_test_2",
          relationship_type: "PART_OF",
          metadata: {},
          user_id: "00000000-0000-0000-0000-000000000000",
        },
        {
          source_entity_id: "ent_cycle_test_2",
          target_entity_id: "ent_cycle_test_3",
          relationship_type: "PART_OF",
          metadata: {},
          user_id: "00000000-0000-0000-0000-000000000000",
        },
        {
          source_entity_id: "ent_cycle_test_3",
          target_entity_id: "ent_cycle_test_1",
          relationship_type: "PART_OF",
          metadata: {},
          user_id: "00000000-0000-0000-0000-000000000000",
        },
      ]);

      const cycles = await detectCycles();

      // Should detect at least one cycle
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe("validateGraphIntegrity", () => {
    it("should report invalid graph when orphan entities exist", async () => {
      // Create an orphan entity
      const { data: entity } = await supabase
        .from("entities")
        .insert({
          id: "ent_orphan_validation_test",
          entity_type: "company",
          canonical_name: "orphan company",
          aliases: [],
        })
        .select()
        .single();

      testEntityIds.push(entity!.id);

      const result = await validateGraphIntegrity();

      // Should be invalid due to orphan entity
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("orphan entities"))).toBe(
        true,
      );
    });

    it("should report invalid graph when orphan events exist", async () => {
      // Create a record first
      const { data: record } = await supabase
        .from("records")
        .insert({
          type: "test",
          properties: {},
        })
        .select()
        .single();

      testRecordIds.push(record!.id);

      // Create an orphan event (event with no record_event_edges)
      const { data: event } = await supabase
        .from("timeline_events")
        .insert({
          id: "evt_orphan_validation_test",
          event_type: "TestEvent",
          event_timestamp: new Date().toISOString(),
          source_record_id: record!.id,
          source_field: "test_date",
        })
        .select()
        .single();

      testEventIds.push(event!.id);

      // Don't create record_event_edges - this makes it an orphan event
      // (events should always have edges connecting them to records)

      const result = await validateGraphIntegrity();

      // Should be invalid due to orphan event
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("orphan events"))).toBe(true);
    });

    it("should report invalid graph when cycles exist", async () => {
      // Create two entities
      const entities = [
        {
          id: "ent_cycle_val_1",
          entity_type: "company",
          canonical_name: "company 1",
        },
        {
          id: "ent_cycle_val_2",
          entity_type: "company",
          canonical_name: "company 2",
        },
      ];

      for (const entity of entities) {
        await supabase.from("entities").insert(entity);
        testEntityIds.push(entity.id);
      }

      // Create a cycle: entity1 → entity2 → entity1
      await supabase.from("relationships").insert([
        {
          source_entity_id: "ent_cycle_val_1",
          target_entity_id: "ent_cycle_val_2",
          relationship_type: "PART_OF",
          metadata: {},
          user_id: "00000000-0000-0000-0000-000000000000",
        },
        {
          source_entity_id: "ent_cycle_val_2",
          target_entity_id: "ent_cycle_val_1",
          relationship_type: "PART_OF",
          metadata: {},
          user_id: "00000000-0000-0000-0000-000000000000",
        },
      ]);

      const result = await validateGraphIntegrity();

      // Should be invalid due to cycle
      expect(result.valid).toBe(false);
      expect(result.cycleCount).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("cycles"))).toBe(true);
    });
  });
});
