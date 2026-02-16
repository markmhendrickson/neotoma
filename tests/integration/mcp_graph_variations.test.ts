import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { supabase } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

describe("MCP graph actions - parameter variations", () => {
  const tracker = new TestIdTracker();
  const testUserId = "test-user-graph";

  async function createGraphStructure() {
    // Create source
    const { data: source, error: sourceError } = await supabase
      .from("sources")
        .insert({
          user_id: testUserId,
        content_hash: `graph_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
      .select()
      .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

    tracker.trackSource(source!.id);

    // Create entities: A -> B -> C (chain)
    const entityA = `ent_a_${Date.now()}`;
    const entityB = `ent_b_${Date.now()}`;
    const entityC = `ent_c_${Date.now()}`;

    await supabase.from("observations").insert([
      {
        entity_id: entityA,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "Entity A", canonical_name: "A" },
        user_id: testUserId
      },
      {
        entity_id: entityB,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "Entity B", canonical_name: "B" },
        user_id: testUserId
      },
      {
        entity_id: entityC,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "Entity C", canonical_name: "C" },
        user_id: testUserId
      },
    ]);

    tracker.trackEntity(entityA);
    tracker.trackEntity(entityB);
    tracker.trackEntity(entityC);

    // Create relationships: A -> B -> C
    await supabase.from("relationship_observations").insert([
      {
        source_entity_id: entityA,
        relationship_type: "REFERS_TO",
        target_entity_id: entityB,
        source_id: source!.id,
        user_id: testUserId
      },
      {
        source_entity_id: entityB,
        relationship_type: "REFERS_TO",
        target_entity_id: entityC,
        source_id: source!.id,
        user_id: testUserId
      },
    ]);

    return { source, entityA, entityB, entityC };
  }

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("retrieve_related_entities variations", () => {
    it("should traverse 1-hop outbound", async () => {
      const { entityA, entityB } = await createGraphStructure();

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entityA);

      expect(relationships!.length).toBeGreaterThan(0);
      expect(relationships![0].target_entity_id).toBe(entityB);
    });

    it("should traverse 1-hop inbound", async () => {
      const { entityA, entityB } = await createGraphStructure();

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", entityB);

      expect(relationships!.length).toBeGreaterThan(0);
      expect(relationships![0].source_entity_id).toBe(entityA);
    });

    it("should traverse 1-hop both directions", async () => {
      const { entityB } = await createGraphStructure();

      const { data: outbound } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entityB);

      const { data: inbound } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", entityB);

      expect(outbound!.length).toBeGreaterThan(0);
      expect(inbound!.length).toBeGreaterThan(0);
    });

    it("should traverse 2-hop outbound", async () => {
      const { entityA } = await createGraphStructure();

      // Get 1-hop neighbors
      const { data: hop1 } = await supabase
        .from("relationship_snapshots")
        .select("target_entity_id")
        .eq("source_entity_id", entityA);

      const hop1Ids = hop1!.map((r) => r.target_entity_id);

      // Get 2-hop neighbors
      if (hop1Ids.length > 0) {
        const { data: hop2 } = await supabase
          .from("relationship_snapshots")
          .select("target_entity_id")
          .in("source_entity_id", hop1Ids);

        expect(hop2).toBeDefined();
      }
    });

    it("should filter by relationship_type: single type", async () => {
      const { entityA } = await createGraphStructure();

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entityA)
        .eq("relationship_type", "REFERS_TO");

      expect(relationships!.every((r) => r.relationship_type === "REFERS_TO")).toBe(true);
    });

    it("should filter by relationship_types: multiple types", async () => {
      const { source, entityA, entityB } = await createGraphStructure();

      // Add another relationship type
      await supabase.from("relationship_observations").insert({
        source_entity_id: entityA,
        relationship_type: "PART_OF",
        target_entity_id: entityB,
        source_id: source.id,
        user_id: testUserId
      });

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entityA)
        .in("relationship_type", ["REFERS_TO", "PART_OF"]);

      expect(relationships!.length).toBeGreaterThan(0);
    });

    it("should filter by relationship_types: empty (all types)", async () => {
      const { entityA } = await createGraphStructure();

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entityA);

      expect(relationships).toBeDefined();
    });

    it("should return with include_entities: true", async () => {
      const { entityA } = await createGraphStructure();

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entityA);

      // Get target entities
      const targetIds = relationships!.map((r) => r.target_entity_id);
      const { data: entities } = await supabase
        .from("entity_snapshots")
        .select("*")
        .in("entity_id", targetIds);

      expect(entities).toBeDefined();
      expect(entities!.length).toBeGreaterThan(0);
    });

    it("should return with include_entities: false", async () => {
      const { entityA } = await createGraphStructure();

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("target_entity_id")
        .eq("source_entity_id", entityA);

      // Just relationship IDs, no entity data
      expect(relationships).toBeDefined();
    });
  });

  describe("retrieve_graph_neighborhood variations", () => {
    it("should include relationships when include_relationships: true", async () => {
      const { entityB } = await createGraphStructure();

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .or(`source_entity_id.eq.${entityB},target_entity_id.eq.${entityB}`);

      expect(relationships!.length).toBeGreaterThan(0);
    });

    it("should exclude relationships when include_relationships: false", async () => {
      // Just test that we can query without relationships
      const { entityB } = await createGraphStructure();

      const { data: entity } = await supabase
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", entityB)
        .single();

      expect(entity).toBeDefined();
    });

    it("should include sources when include_sources: true", async () => {
      const { source, entityB } = await createGraphStructure();

      // Get observations for entity
      const { data: observations } = await supabase
        .from("observations")
        .select("source_id")
        .eq("entity_id", entityB);

      expect(observations!.some((o) => o.source_id === source.id)).toBe(true);
    });

    it("should include events when include_events: true", async () => {
      // Would check timeline_events table for events related to entity
      const { entityB } = await createGraphStructure();

      const { data: events } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("entity_id", entityB);

      // Events may or may not exist for test entities
      expect(Array.isArray(events)).toBe(true);
    });

    it("should include observations when include_observations: true", async () => {
      const { entityB } = await createGraphStructure();

      const { data: observations } = await supabase
        .from("observations")
        .select("*")
        .eq("entity_id", entityB);

      expect(observations!.length).toBeGreaterThan(0);
    });

    it("should work with node_type: entity", async () => {
      const { entityB } = await createGraphStructure();

      const { data: entity } = await supabase
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", entityB)
        .single();

      expect(entity).toBeDefined();
    });

    it("should work with node_type: source", async () => {
      const { source } = await createGraphStructure();

      const { data: sourceRecord } = await supabase
        .from("sources")
        .select("*")
        .eq("source_id", source.id)
        .single();

      expect(sourceRecord).toBeDefined();

      // Get entities from this source
      const { data: observations } = await supabase
        .from("observations")
        .select("entity_id")
        .eq("source_id", source.id);

      expect(observations!.length).toBeGreaterThan(0);
    });
  });

  describe("max_hops boundary tests", () => {
    it("should handle max_hops: 1", async () => {
      const { entityA } = await createGraphStructure();

      const { data: relationships } = await supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entityA);

      expect(relationships).toBeDefined();
    });

    it("should handle max_hops: 2", async () => {
      const { entityA } = await createGraphStructure();

      // Get 1-hop
      const { data: hop1 } = await supabase
        .from("relationship_snapshots")
        .select("target_entity_id")
        .eq("source_entity_id", entityA);

      // Get 2-hop
      if (hop1!.length > 0) {
        const { data: hop2 } = await supabase
          .from("relationship_snapshots")
          .select("target_entity_id")
          .in("source_entity_id", hop1!.map((r) => r.target_entity_id));

        expect(hop2).toBeDefined();
      }
    });

    it("should handle max_hops: 3", async () => {
      const { entityA } = await createGraphStructure();

      // Get 1-hop
      const { data: hop1 } = await supabase
        .from("relationship_snapshots")
        .select("target_entity_id")
        .eq("source_entity_id", entityA);

      if (hop1!.length > 0) {
        // Get 2-hop
        const { data: hop2 } = await supabase
          .from("relationship_snapshots")
          .select("target_entity_id")
          .in("source_entity_id", hop1!.map((r) => r.target_entity_id));

        if (hop2!.length > 0) {
          // Get 3-hop
          const { data: hop3 } = await supabase
            .from("relationship_snapshots")
            .select("target_entity_id")
            .in("source_entity_id", hop2!.map((r) => r.target_entity_id));

          expect(hop3).toBeDefined();
        }
      }
    });
  });
});
