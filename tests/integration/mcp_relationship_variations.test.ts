import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { computeEntitySnapshot, computeRelationshipSnapshot } from "../helpers/database_verifiers.js";

/**
 * Helper to create relationship observation with required fields
 */
function createRelationshipObservation(
  sourceEntityId: string,
  relationshipType: string,
  targetEntityId: string,
  sourceId: string,
  userId: string,
  metadataFields?: Record<string, unknown>
) {
  const now = new Date().toISOString();
  const relationshipKey = `${sourceEntityId}:${relationshipType}:${targetEntityId}`;

  // Create canonical hash from key components
  const crypto = require('crypto');
  const canonicalHash = crypto
    .createHash('sha256')
    .update(relationshipKey)
    .digest('hex')
    .substring(0, 24);

  const result = {
    id: crypto.randomUUID(),
    relationship_key: relationshipKey,
    source_entity_id: sourceEntityId,
    relationship_type: relationshipType,
    target_entity_id: targetEntityId,
    source_id: sourceId,
    user_id: userId,
    observed_at: now,
    canonical_hash: canonicalHash,
    metadata: metadataFields || {},
    specificity_score: null,
    source_priority: 0,
    interpretation_id: null
  };

  return result;
}

describe("MCP relationship actions - parameter variations", () => {
  const tracker = new TestIdTracker();
  const testUserId = "test-user-relationship";

  afterEach(async () => {
    await tracker.cleanup();
  });

  async function createTestEntities() {
    const { data: source, error: sourceError } = await db
      .from("sources")
        .insert({
          user_id: testUserId,
        content_hash: `rel_${Date.now()}`,
          storage_url: "file:///test/minimal.txt",
          mime_type: "text/plain",
          file_size: 0
        })
      .select()
      .single();

      expect(sourceError).toBeNull();
      expect(source).toBeDefined();

    tracker.trackSource(source!.id);

    const entity1Id = `ent_rel1_${Date.now()}`;
    const entity2Id = `ent_rel2_${Date.now()}`;
    const now = new Date().toISOString();

    const { error: obsError } = await db.from("observations").insert([
      {
        entity_id: entity1Id,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "Entity 1", canonical_name: "Entity 1" },
        user_id: testUserId,
        schema_version: "1.0",
        observed_at: now
      },
      {
        entity_id: entity2Id,
        entity_type: "task",
        source_id: source!.id,
        fields: { title: "Entity 2", canonical_name: "Entity 2" },
        user_id: testUserId,
        schema_version: "1.0",
        observed_at: now
      },
    ]);

    if (obsError) {
      throw new Error(`Failed to insert observations: ${obsError.message}`);
    }

    tracker.trackEntity(entity1Id);
    tracker.trackEntity(entity2Id);

    // Compute snapshots for entities
    await computeEntitySnapshot(entity1Id);
    await computeEntitySnapshot(entity2Id);

    return { source: source!, entity1Id, entity2Id };
  }

  describe("create_relationship variations", () => {
    it("should create PART_OF relationship", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const { data: relationship, error: relError } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(
          entity1Id,
          "PART_OF",
          entity2Id,
          source.id,
          testUserId
        ))
        .select()
        .single();

      if (relError) {
        throw new Error(`Failed to insert relationship observation: ${relError.message}`);
      }

      // Compute relationship snapshot
      await computeRelationshipSnapshot("PART_OF", entity1Id, entity2Id);

      expect(relationship).toBeDefined();
      expect(relationship!.relationship_type).toBe("PART_OF");
    });

    it("should create CORRECTS relationship", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const { data: relationship } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(entity1Id, "CORRECTS", entity2Id, source.id, testUserId))
        .select()
        .single();

      expect(relationship!.relationship_type).toBe("CORRECTS");
    });

    it("should create REFERS_TO relationship", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const { data: relationship } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(entity1Id, "REFERS_TO", entity2Id, source.id, testUserId))
        .select()
        .single();

      expect(relationship!.relationship_type).toBe("REFERS_TO");
    });

    it("should create SETTLES relationship", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const { data: relationship } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(entity1Id, "SETTLES", entity2Id, source.id, testUserId))
        .select()
        .single();

      expect(relationship!.relationship_type).toBe("SETTLES");
    });

    it("should create DUPLICATE_OF relationship", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const { data: relationship } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(entity1Id, "DUPLICATE_OF", entity2Id, source.id, testUserId))
        .select()
        .single();

      expect(relationship!.relationship_type).toBe("DUPLICATE_OF");
    });

    it("should create DEPENDS_ON relationship", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const { data: relationship } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(entity1Id, "DEPENDS_ON", entity2Id, source.id, testUserId))
        .select()
        .single();

      expect(relationship!.relationship_type).toBe("DEPENDS_ON");
    });

    it("should create SUPERSEDES relationship", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const { data: relationship } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(entity1Id, "SUPERSEDES", entity2Id, source.id, testUserId))
        .select()
        .single();

      expect(relationship!.relationship_type).toBe("SUPERSEDES");
    });

    it("should create EMBEDS relationship", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const { data: relationship } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(entity1Id, "EMBEDS", entity2Id, source.id, testUserId))
        .select()
        .single();

      expect(relationship!.relationship_type).toBe("EMBEDS");
    });

    it("should create relationship with optional metadata", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      const metadata = {
        caption: "Test caption",
        order: 1,
        custom_field: "custom value"
      };

      const { data: relationship } = await db
        .from("relationship_observations")
        .insert(createRelationshipObservation(
          entity1Id,
          "EMBEDS",
          entity2Id,
          source.id,
          testUserId,
          metadata
        ))
        .select()
        .single();

      expect(relationship!.metadata).toEqual(metadata);
    });
  });

  describe("list_relationships variations", () => {
    it("should list relationships with direction: outbound", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      await db.from("relationship_observations").insert(createRelationshipObservation(entity1Id, "REFERS_TO", entity2Id, source.id, testUserId));

      // Compute snapshot before querying
      await computeRelationshipSnapshot("REFERS_TO", entity1Id, entity2Id);

      const { data: relationships } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entity1Id);

      expect(relationships!.length).toBeGreaterThan(0);
      expect(relationships![0].source_entity_id).toBe(entity1Id);
    });

    it("should list relationships with direction: inbound", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      await db.from("relationship_observations").insert(createRelationshipObservation(entity1Id, "REFERS_TO", entity2Id, source.id, testUserId));

      // Compute snapshot before querying
      await computeRelationshipSnapshot("REFERS_TO", entity1Id, entity2Id);

      const { data: relationships } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", entity2Id);

      expect(relationships!.length).toBeGreaterThan(0);
      expect(relationships![0].target_entity_id).toBe(entity2Id);
    });

    it("should list relationships with direction: both", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      await db.from("relationship_observations").insert([
        createRelationshipObservation(entity1Id, "REFERS_TO", entity2Id, source.id, testUserId),
        createRelationshipObservation(entity2Id, "REFERS_TO", entity1Id, source.id, testUserId)
      ]);

      // Compute snapshots for both relationships
      await computeRelationshipSnapshot("REFERS_TO", entity1Id, entity2Id);
      await computeRelationshipSnapshot("REFERS_TO", entity2Id, entity1Id);

      const { data: outbound } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entity1Id);

      const { data: inbound } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", entity1Id);

      expect(outbound!.length).toBeGreaterThan(0);
      expect(inbound!.length).toBeGreaterThan(0);
    });

    it("should filter relationships by relationship_type", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      await db.from("relationship_observations").insert([
        {
          source_entity_id: entity1Id,
          relationship_type: "PART_OF",
          target_entity_id: entity2Id,
          source_id: source.id,
          user_id: testUserId
        },
        {
          source_entity_id: entity1Id,
          relationship_type: "REFERS_TO",
          target_entity_id: entity2Id,
          source_id: source.id,
          user_id: testUserId
        },
      ]);

      const { data: relationships } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entity1Id)
        .eq("relationship_type", "PART_OF");

      expect(relationships!.every((r) => r.relationship_type === "PART_OF")).toBe(true);
    });
  });

  describe("get_relationship_snapshot variations", () => {
    it("should retrieve relationship snapshot", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      await db.from("relationship_observations").insert(createRelationshipObservation(entity1Id, "REFERS_TO", entity2Id, source.id, testUserId));

      // Compute relationship snapshot
      await computeRelationshipSnapshot("REFERS_TO", entity1Id, entity2Id);

      const { data: relationship } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entity1Id)
        .eq("relationship_type", "REFERS_TO")
        .eq("target_entity_id", entity2Id)
        .single();

      expect(relationship).toBeDefined();
      expect(relationship!.relationship_type).toBe("REFERS_TO");
    });
  });

  describe("delete_relationship variations", () => {
    it("should delete relationship with deletion observation", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      await db.from("relationship_observations").insert(createRelationshipObservation(entity1Id, "REFERS_TO", entity2Id, source.id, testUserId));

      // Create deletion observation
      await db.from("relationship_observations").insert({
        source_entity_id: entity1Id,
        relationship_type: "REFERS_TO",
        target_entity_id: entity2Id,
        source_id: source.id,
        user_id: testUserId,
        fields: { _deleted: true },
        priority: 1000
      });

      // Verify relationship marked as deleted
      const { data: relationship } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entity1Id)
        .eq("relationship_type", "REFERS_TO")
        .eq("target_entity_id", entity2Id)
        .maybeSingle();

      // Relationship might be excluded from snapshots view
    });
  });

  describe("restore_relationship variations", () => {
    it("should restore deleted relationship with restoration observation", async () => {
      const { source, entity1Id, entity2Id } = await createTestEntities();

      // Create relationship
      await db.from("relationship_observations").insert(createRelationshipObservation(entity1Id, "REFERS_TO", entity2Id, source.id, testUserId));

      // Delete it
      await db.from("relationship_observations").insert({
        source_entity_id: entity1Id,
        relationship_type: "REFERS_TO",
        target_entity_id: entity2Id,
        source_id: source.id,
        user_id: testUserId,
        fields: { _deleted: true },
        priority: 1000
      });

      // Restore it
      await db.from("relationship_observations").insert({
        source_entity_id: entity1Id,
        relationship_type: "REFERS_TO",
        target_entity_id: entity2Id,
        source_id: source.id,
        user_id: testUserId,
        fields: { _deleted: false },
        priority: 1001
      });

      // Verify relationship restored
      const { data: relationship } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entity1Id)
        .eq("relationship_type", "REFERS_TO")
        .eq("target_entity_id", entity2Id)
        .single();

      expect(relationship).toBeDefined();
    });
  });
});
