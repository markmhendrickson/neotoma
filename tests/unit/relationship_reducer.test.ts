/**
 * Unit tests for RelationshipReducer
 */

import { describe, it, expect } from "vitest";
import {
  RelationshipReducer,
  type RelationshipObservation,
} from "../../src/reducers/relationship_reducer.js";

describe("RelationshipReducer", () => {
  const reducer = new RelationshipReducer();

  describe("computeSnapshot", () => {
    it("should compute snapshot from single observation", async () => {
      const observations: RelationshipObservation[] = [
        {
          id: "obs1",
          relationship_key: "SETTLES:payment1:invoice1",
          relationship_type: "SETTLES",
          source_entity_id: "payment1",
          target_entity_id: "invoice1",
          source_id: "src1",
          interpretation_id: null,
          observed_at: "2024-01-01T00:00:00Z",
          specificity_score: 0.8,
          source_priority: 100,
          metadata: {
            amount: 1500,
            currency: "USD",
            payment_method: "bank_transfer",
          },
          canonical_hash: "hash1",
          created_at: "2024-01-01T00:00:00Z",
          user_id: "user1",
        },
      ];

      const snapshot = await reducer.computeSnapshot(
        "SETTLES:payment1:invoice1",
        observations,
      );

      expect(snapshot.relationship_key).toBe("SETTLES:payment1:invoice1");
      expect(snapshot.relationship_type).toBe("SETTLES");
      expect(snapshot.source_entity_id).toBe("payment1");
      expect(snapshot.target_entity_id).toBe("invoice1");
      expect(snapshot.observation_count).toBe(1);
      expect(snapshot.snapshot).toEqual({
        amount: 1500,
        currency: "USD",
        payment_method: "bank_transfer",
      });
      expect(snapshot.provenance).toEqual({
        amount: "obs1",
        currency: "obs1",
        payment_method: "obs1",
      });
    });

    it("should merge multiple observations with last_write strategy", async () => {
      const observations: RelationshipObservation[] = [
        {
          id: "obs1",
          relationship_key: "SETTLES:payment1:invoice1",
          relationship_type: "SETTLES",
          source_entity_id: "payment1",
          target_entity_id: "invoice1",
          source_id: "src1",
          interpretation_id: null,
          observed_at: "2024-01-01T00:00:00Z",
          specificity_score: 0.8,
          source_priority: 100,
          metadata: {
            amount: 1500,
            currency: "USD",
          },
          canonical_hash: "hash1",
          created_at: "2024-01-01T00:00:00Z",
          user_id: "user1",
        },
        {
          id: "obs2",
          relationship_key: "SETTLES:payment1:invoice1",
          relationship_type: "SETTLES",
          source_entity_id: "payment1",
          target_entity_id: "invoice1",
          source_id: "src2",
          interpretation_id: null,
          observed_at: "2024-01-02T00:00:00Z",
          specificity_score: 0.9,
          source_priority: 100,
          metadata: {
            amount: 1600,
            payment_method: "wire_transfer",
          },
          canonical_hash: "hash2",
          created_at: "2024-01-02T00:00:00Z",
          user_id: "user1",
        },
      ];

      const snapshot = await reducer.computeSnapshot(
        "SETTLES:payment1:invoice1",
        observations,
      );

      // Most recent observation (obs2) should win for overlapping fields
      expect(snapshot.snapshot.amount).toBe(1600); // Updated in obs2
      expect(snapshot.snapshot.currency).toBe("USD"); // Only in obs1
      expect(snapshot.snapshot.payment_method).toBe("wire_transfer"); // From obs2
      expect(snapshot.observation_count).toBe(2);

      // Provenance should track which observation provided each field
      expect(snapshot.provenance.amount).toBe("obs2");
      expect(snapshot.provenance.currency).toBe("obs1");
      expect(snapshot.provenance.payment_method).toBe("obs2");
    });

    it("should handle observations with no overlapping metadata fields", async () => {
      const observations: RelationshipObservation[] = [
        {
          id: "obs1",
          relationship_key: "REFERS_TO:doc1:contract1",
          relationship_type: "REFERS_TO",
          source_entity_id: "doc1",
          target_entity_id: "contract1",
          source_id: "src1",
          interpretation_id: null,
          observed_at: "2024-01-01T00:00:00Z",
          specificity_score: 0.8,
          source_priority: 100,
          metadata: {
            section: "2.3",
            page: 5,
          },
          canonical_hash: "hash1",
          created_at: "2024-01-01T00:00:00Z",
          user_id: "user1",
        },
        {
          id: "obs2",
          relationship_key: "REFERS_TO:doc1:contract1",
          relationship_type: "REFERS_TO",
          source_entity_id: "doc1",
          target_entity_id: "contract1",
          source_id: "src2",
          interpretation_id: null,
          observed_at: "2024-01-02T00:00:00Z",
          specificity_score: 0.9,
          source_priority: 100,
          metadata: {
            clause: "termination",
            notes: "Referenced in appendix",
          },
          canonical_hash: "hash2",
          created_at: "2024-01-02T00:00:00Z",
          user_id: "user1",
        },
      ];

      const snapshot = await reducer.computeSnapshot(
        "REFERS_TO:doc1:contract1",
        observations,
      );

      // All fields should be present
      expect(snapshot.snapshot).toEqual({
        section: "2.3",
        page: 5,
        clause: "termination",
        notes: "Referenced in appendix",
      });
    });

    it("should throw error for empty observations array", async () => {
      await expect(
        reducer.computeSnapshot("SETTLES:payment1:invoice1", []),
      ).rejects.toThrow("No observations found");
    });
  });

  describe("generateRelationshipKey", () => {
    it("should generate correct composite key", () => {
      const key = RelationshipReducer.generateRelationshipKey(
        "SETTLES",
        "payment1",
        "invoice1",
      );

      expect(key).toBe("SETTLES:payment1:invoice1");
    });

    it("should handle different relationship types", () => {
      const keys = [
        RelationshipReducer.generateRelationshipKey("PART_OF", "item1", "invoice1"),
        RelationshipReducer.generateRelationshipKey("CORRECTS", "invoice2", "invoice1"),
        RelationshipReducer.generateRelationshipKey("REFERS_TO", "doc1", "contract1"),
      ];

      expect(keys).toEqual([
        "PART_OF:item1:invoice1",
        "CORRECTS:invoice2:invoice1",
        "REFERS_TO:doc1:contract1",
      ]);
    });
  });
});
