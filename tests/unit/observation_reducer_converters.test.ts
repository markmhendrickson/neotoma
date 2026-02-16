/**
 * Unit tests for ObservationReducer converter application during snapshot computation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ObservationReducer, type Observation } from "../../src/reducers/observation_reducer.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { supabase } from "../../src/db.js";
import { config } from "../../src/config.js";

const isLocalBackend = config.storageBackend === "local";

describe("ObservationReducer - Converter Application", () => {
  const reducer = new ObservationReducer();
  const testEntityId = "ent_test_123";
  const testEntityType = "invoice";
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeEach(async () => {
    // Clean up test data
    await supabase.from("observations").delete().eq("entity_id", testEntityId);
    await supabase.from("entity_snapshots").delete().eq("entity_id", testEntityId);
  });

  describe("Type conversion during snapshot computation", () => {
    it("should convert string to number when schema type changes", async () => {
      // Register schema 1.0.0 with amount_due as string
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "1.0.0",
        schema_definition: {
          fields: {
            invoice_number: { type: "string", required: true },
            amount_due: { type: "string", required: true },
          },
        },
        reducer_config: {
          merge_policies: {
            invoice_number: { strategy: "last_write" },
            amount_due: { strategy: "last_write" },
          },
        },
        activate: false,
      });

      // Create observation with schema 1.0.0 (string type)
      const obs1: Observation = {
        id: "obs_001",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_001",
        observed_at: "2025-01-15T10:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          invoice_number: "INV-001",
          amount_due: "1000.00", // String value
        },
        created_at: "2025-01-15T10:00:00Z",
        user_id: testUserId,
      };

      await supabase.from("observations").insert(obs1);

      // Register schema 2.0.0 with amount_due as number + converter
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "2.0.0",
        schema_definition: {
          fields: {
            invoice_number: { type: "string", required: true },
            amount_due: {
              type: "number",
              required: true,
              converters: [
                {
                  from: "string",
                  to: "number",
                  function: "string_to_number",
                  deterministic: true,
                },
              ],
            },
          },
        },
        reducer_config: {
          merge_policies: {
            invoice_number: { strategy: "last_write" },
            amount_due: { strategy: "last_write" },
          },
        },
        activate: true, // Activate new schema
      });

      // Compute snapshot with schema 2.0.0
      const observations = [obs1];
      const snapshot = await reducer.computeSnapshot(testEntityId, observations);

      // Verify snapshot uses schema 2.0.0
      expect(snapshot.schema_version).toBe("2.0.0");

      // Verify amount_due was converted from string to number
      expect(snapshot.snapshot.amount_due).toBe(1000.0);
      expect(typeof snapshot.snapshot.amount_due).toBe("number");

      // Verify other fields unchanged
      expect(snapshot.snapshot.invoice_number).toBe("INV-001");
    });

    it.skipIf(isLocalBackend)("should convert numeric timestamp to ISO date string", async () => {
      // Register schema 1.0.0 with created_at as number
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "1.0.0",
        schema_definition: {
          fields: {
            invoice_number: { type: "string", required: true },
            created_at: { type: "number", required: false },
          },
        },
        reducer_config: {
          merge_policies: {
            invoice_number: { strategy: "last_write" },
            created_at: { strategy: "last_write" },
          },
        },
        activate: false,
      });

      // Create observation with numeric timestamp (nanoseconds)
      const nanosTimestamp = BigInt("1766102400000000000"); // 2025-12-16 in nanoseconds
      const obs1: Observation = {
        id: "obs_001",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_001",
        observed_at: "2025-01-15T10:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          invoice_number: "INV-001",
          created_at: Number(nanosTimestamp), // Numeric timestamp
        },
        created_at: "2025-01-15T10:00:00Z",
        user_id: testUserId,
      };

      await supabase.from("observations").insert(obs1);

      // Register schema 2.0.0 with created_at as date + converter
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "2.0.0",
        schema_definition: {
          fields: {
            invoice_number: { type: "string", required: true },
            created_at: {
              type: "date",
              required: false,
              converters: [
                {
                  from: "number",
                  to: "date",
                  function: "timestamp_nanos_to_iso",
                  deterministic: true,
                },
              ],
            },
          },
        },
        reducer_config: {
          merge_policies: {
            invoice_number: { strategy: "last_write" },
            created_at: { strategy: "last_write" },
          },
        },
        activate: true,
      });

      // Compute snapshot
      const snapshot = await reducer.computeSnapshot(testEntityId, [obs1]);

      // Verify created_at was converted to ISO date string
      expect(snapshot.snapshot.created_at).toBeDefined();
      expect(typeof snapshot.snapshot.created_at).toBe("string");
      expect(snapshot.snapshot.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should maintain determinism with converters", async () => {
      // Setup schema with converter
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "1.0.0",
        schema_definition: {
          fields: {
            amount_due: {
              type: "number",
              required: true,
              converters: [
                {
                  from: "string",
                  to: "number",
                  function: "string_to_number",
                  deterministic: true,
                },
              ],
            },
          },
        },
        reducer_config: {
          merge_policies: {
            amount_due: { strategy: "last_write" },
          },
        },
        activate: true,
      });

      const obs1: Observation = {
        id: "obs_001",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_001",
        observed_at: "2025-01-15T10:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          amount_due: "1000.00", // String that will be converted
        },
        created_at: "2025-01-15T10:00:00Z",
        user_id: testUserId,
      };

      await supabase.from("observations").insert(obs1);

      // Compute snapshot twice
      const snapshot1 = await reducer.computeSnapshot(testEntityId, [obs1]);
      const snapshot2 = await reducer.computeSnapshot(testEntityId, [obs1]);

      // Should produce identical results
      expect(snapshot1.snapshot).toEqual(snapshot2.snapshot);
      expect(snapshot1.provenance).toEqual(snapshot2.provenance);
      expect(snapshot1.snapshot.amount_due).toBe(1000.0);
    });

    it("should handle mixed types from old and new observations", async () => {
      // Register schema 1.0.0
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "1.0.0",
        schema_definition: {
          fields: {
            amount_due: { type: "string", required: true },
          },
        },
        reducer_config: {
          merge_policies: {
            amount_due: { strategy: "last_write" },
          },
        },
        activate: false,
      });

      // Old observation with string
      const obs1: Observation = {
        id: "obs_001",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_001",
        observed_at: "2025-01-15T10:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          amount_due: "1000.00", // String
        },
        created_at: "2025-01-15T10:00:00Z",
        user_id: testUserId,
      };

      // Register schema 2.0.0 with converter
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "2.0.0",
        schema_definition: {
          fields: {
            amount_due: {
              type: "number",
              required: true,
              converters: [
                {
                  from: "string",
                  to: "number",
                  function: "string_to_number",
                  deterministic: true,
                },
              ],
            },
          },
        },
        reducer_config: {
          merge_policies: {
            amount_due: { strategy: "last_write" },
          },
        },
        activate: true,
      });

      // New observation with number
      const obs2: Observation = {
        id: "obs_002",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "2.0.0",
        source_id: "src_002",
        observed_at: "2025-01-20T14:00:00Z", // More recent
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          amount_due: 1200.0, // Number (native type)
        },
        created_at: "2025-01-20T14:00:00Z",
        user_id: testUserId,
      };

      await supabase.from("observations").insert([obs1, obs2]);

      // Compute snapshot - should use obs2 (most recent) and convert if needed
      const snapshot = await reducer.computeSnapshot(testEntityId, [obs1, obs2]);

      // Should use obs2's value (most recent) - already a number
      expect(snapshot.snapshot.amount_due).toBe(1200.0);
      expect(typeof snapshot.snapshot.amount_due).toBe("number");
      expect(snapshot.provenance.amount_due).toBe("obs_002");
    });

    it.skipIf(isLocalBackend)("should convert old observation value if it wins merge strategy", async () => {
      // Register schema 1.0.0
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "1.0.0",
        schema_definition: {
          fields: {
            amount_due: { type: "string", required: true },
          },
        },
        reducer_config: {
          merge_policies: {
            amount_due: { strategy: "highest_priority" }, // Priority-based, not time-based
          },
        },
        activate: false,
      });

      // Old observation with string, higher priority
      const obs1: Observation = {
        id: "obs_001",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0.0",
        source_id: "src_001",
        observed_at: "2025-01-15T10:00:00Z",
        specificity_score: 1.0,
        source_priority: 200, // Higher priority
        fields: {
          amount_due: "1000.00", // String
        },
        created_at: "2025-01-15T10:00:00Z",
        user_id: testUserId,
      };

      // Register schema 2.0.0 with converter
      await schemaRegistry.register({
        entity_type: testEntityType,
        schema_version: "2.0.0",
        schema_definition: {
          fields: {
            amount_due: {
              type: "number",
              required: true,
              converters: [
                {
                  from: "string",
                  to: "number",
                  function: "string_to_number",
                  deterministic: true,
                },
              ],
            },
          },
        },
        reducer_config: {
          merge_policies: {
            amount_due: { strategy: "highest_priority" },
          },
        },
        activate: true,
      });

      // New observation with number, lower priority
      const obs2: Observation = {
        id: "obs_002",
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "2.0.0",
        source_id: "src_002",
        observed_at: "2025-01-20T14:00:00Z", // More recent
        specificity_score: 1.0,
        source_priority: 100, // Lower priority
        fields: {
          amount_due: 1200.0, // Number
        },
        created_at: "2025-01-20T14:00:00Z",
        user_id: testUserId,
      };

      await supabase.from("observations").insert([obs1, obs2]);

      // Compute snapshot - obs1 wins (higher priority) but should be converted
      const snapshot = await reducer.computeSnapshot(testEntityId, [obs1, obs2]);

      // Should use obs1's value (higher priority) but converted to number
      expect(snapshot.snapshot.amount_due).toBe(1000.0);
      expect(typeof snapshot.snapshot.amount_due).toBe("number");
      expect(snapshot.provenance.amount_due).toBe("obs_001");
    });
  });
});
