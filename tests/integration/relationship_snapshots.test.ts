/**
 * Integration tests for relationship snapshots
 */

import { describe, it, expect, beforeEach } from "vitest";
import { supabase } from "../../src/db.js";
import { createRelationshipObservations } from "../../src/services/interpretation.js";
import { relationshipReducer } from "../../src/reducers/relationship_reducer.js";

describe("Relationship Snapshots Integration", () => {
  const userId = "00000000-0000-0000-0000-000000000000";

  beforeEach(async () => {
    // Clean up test data
    await supabase
      .from("relationship_observations")
      .delete()
      .eq("user_id", userId);
    await supabase
      .from("relationship_snapshots")
      .delete()
      .eq("user_id", userId);
  });

  it("should create relationship observation and snapshot", async () => {
    const relationships = [
      {
        relationship_type: "SETTLES",
        source_entity_id: "test_payment_1",
        target_entity_id: "test_invoice_1",
        metadata: {
          amount: 1500,
          currency: "USD",
          payment_method: "bank_transfer",
        },
      },
    ];

    await createRelationshipObservations(
      relationships,
      "test_source_1",
      null,
      userId,
      100,
    );

    // Verify observation was created
    const { data: observations } = await supabase
      .from("relationship_observations")
      .select("*")
      .eq("relationship_type", "SETTLES")
      .eq("source_entity_id", "test_payment_1")
      .eq("target_entity_id", "test_invoice_1");

    expect(observations).toHaveLength(1);
    expect(observations![0].metadata).toEqual({
      amount: 1500,
      currency: "USD",
      payment_method: "bank_transfer",
    });

    // Verify snapshot was created
    const { data: snapshot } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", "SETTLES:test_payment_1:test_invoice_1")
      .single();

    expect(snapshot).toBeTruthy();
    expect(snapshot!.snapshot).toEqual({
      amount: 1500,
      currency: "USD",
      payment_method: "bank_transfer",
    });
    expect(snapshot!.observation_count).toBe(1);
  });

  it("should merge observations from multiple sources", async () => {
    // First source
    await createRelationshipObservations(
      [
        {
          relationship_type: "SETTLES",
          source_entity_id: "test_payment_2",
          target_entity_id: "test_invoice_2",
          metadata: {
            amount: 2000,
            currency: "USD",
          },
        },
      ],
      "test_source_1",
      null,
      userId,
      100,
    );

    // Second source
    await createRelationshipObservations(
      [
        {
          relationship_type: "SETTLES",
          source_entity_id: "test_payment_2",
          target_entity_id: "test_invoice_2",
          metadata: {
            amount: 2100,
            payment_method: "wire_transfer",
            notes: "Late payment",
          },
        },
      ],
      "test_source_2",
      null,
      userId,
      100,
    );

    // Verify observations were created
    const { data: observations } = await supabase
      .from("relationship_observations")
      .select("*")
      .eq("relationship_key", "SETTLES:test_payment_2:test_invoice_2")
      .order("observed_at", { ascending: false });

    expect(observations).toHaveLength(2);

    // Verify snapshot merged both observations
    const { data: snapshot } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", "SETTLES:test_payment_2:test_invoice_2")
      .single();

    expect(snapshot).toBeTruthy();
    expect(snapshot!.observation_count).toBe(2);

    // Most recent observation should win for amount (last_write strategy)
    expect(snapshot!.snapshot.amount).toBe(2100);
    expect(snapshot!.snapshot.currency).toBe("USD"); // From first observation
    expect(snapshot!.snapshot.payment_method).toBe("wire_transfer");
    expect(snapshot!.snapshot.notes).toBe("Late payment");

    // Verify provenance tracks sources
    expect(snapshot!.provenance).toBeTruthy();
    expect(Object.keys(snapshot!.provenance)).toContain("amount");
    expect(Object.keys(snapshot!.provenance)).toContain("currency");
  });

  it("should handle idempotence - duplicate observations are not created", async () => {
    const relationships = [
      {
        relationship_type: "PART_OF",
        source_entity_id: "test_item_1",
        target_entity_id: "test_invoice_3",
        metadata: {
          quantity: 2,
          unit_price: 500,
        },
      },
    ];

    // Create same observation twice from same source
    await createRelationshipObservations(
      relationships,
      "test_source_1",
      null,
      userId,
      100,
    );

    await createRelationshipObservations(
      relationships,
      "test_source_1",
      null,
      userId,
      100,
    );

    // Should only have one observation
    const { data: observations } = await supabase
      .from("relationship_observations")
      .select("*")
      .eq("relationship_key", "PART_OF:test_item_1:test_invoice_3");

    expect(observations).toHaveLength(1);

    // Snapshot should show single observation
    const { data: snapshot } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", "PART_OF:test_item_1:test_invoice_3")
      .single();

    expect(snapshot!.observation_count).toBe(1);
  });

  it("should compute snapshot with provenance", async () => {
    await createRelationshipObservations(
      [
        {
          relationship_type: "REFERS_TO",
          source_entity_id: "test_doc_1",
          target_entity_id: "test_contract_1",
          metadata: {
            section: "2.3",
            page: 5,
            clause: "termination",
          },
        },
      ],
      "test_source_1",
      null,
      userId,
      100,
    );

    const { data: snapshot } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", "REFERS_TO:test_doc_1:test_contract_1")
      .single();

    expect(snapshot).toBeTruthy();

    // Verify provenance maps fields to observation IDs
    expect(snapshot!.provenance).toBeTruthy();
    expect(snapshot!.provenance.section).toBeTruthy();
    expect(snapshot!.provenance.page).toBeTruthy();
    expect(snapshot!.provenance.clause).toBeTruthy();

    // All fields should map to same observation (only one source)
    const observationIds = Object.values(snapshot!.provenance);
    expect(new Set(observationIds).size).toBe(1);
  });
});
