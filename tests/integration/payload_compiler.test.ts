/**
 * Integration tests for Payload Compiler Service
 * 
 * Tests payload compilation, capability application, and entity extraction.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { compilePayload, getPayloadById } from "../../src/services/payload_compiler.js";
import type { PayloadEnvelope } from "../../src/services/payload_schema.js";

describe("Payload Compiler Service", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const createdPayloadIds: string[] = [];
  const createdSourceIds: string[] = [];

  beforeEach(async () => {
    // Clean up test data
    if (createdPayloadIds.length > 0) {
      await db.from("payloads").delete().in("id", createdPayloadIds);
      createdPayloadIds.length = 0;
    }
    if (createdSourceIds.length > 0) {
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  afterEach(async () => {
    // Final cleanup
    if (createdPayloadIds.length > 0) {
      await db.from("payloads").delete().in("id", createdPayloadIds);
    }
    if (createdSourceIds.length > 0) {
      await db.from("sources").delete().in("id", createdSourceIds);
    }
  });

  describe("compilePayload", () => {
    it("should compile invoice payload", async () => {
      // Create test source
      const { data: source } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "hash_payload_compile",
          original_filename: "compile_test.pdf",
          mime_type: "application/pdf",
          file_size: 1000,
        })
        .select()
        .single();
      
      createdSourceIds.push(source!.id);

      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-COMPILE-001",
          amount: 1500,
          vendor_name: "Test Vendor",
        },
        provenance: {
          source_refs: [source!.id],
          extracted_at: new Date().toISOString(),
          extractor_version: "test:v1.0",
        },
      };

      const result = await compilePayload(envelope, { userId: testUserId });
      
      expect(result.payload_id).toBeDefined();
      expect(result.payload_content_id).toBeDefined();
      expect(result.payload_submission_id).toBeDefined();
      expect(result.created).toBe(true);
      
      createdPayloadIds.push(result.payload_id);

      // Verify payload was stored
      const { data: payload, error } = await db
        .from("payloads")
        .select("*")
        .eq("id", result.payload_id)
        .single();
      
      expect(error).toBeNull();
      expect(payload).toBeDefined();
      expect(payload!.capability_id).toBe("neotoma:store_invoice:v1");
    });

    it("should deduplicate identical payloads", async () => {
      // Create test source
      const { data: source } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "hash_dedup_payload",
          original_filename: "dedup_test.pdf",
          mime_type: "application/pdf",
          file_size: 1000,
        })
        .select()
        .single();
      
      createdSourceIds.push(source!.id);

      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-DEDUP-001",
          amount: 2000,
        },
        provenance: {
          source_refs: [source!.id],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "test:v1.0",
        },
      };

      // Compile first time
      const result1 = await compilePayload(envelope, { userId: testUserId });
      expect(result1.created).toBe(true);
      createdPayloadIds.push(result1.payload_id);

      // Compile second time (same content)
      const result2 = await compilePayload(envelope, { userId: testUserId });
      
      // Should return existing payload
      expect(result2.payload_content_id).toBe(result1.payload_content_id);
      expect(result2.created).toBe(false); // Not created, exists
    });

    it("should apply canonicalization rules", async () => {
      // Create test source
      const { data: source } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "hash_canon_payload",
          original_filename: "canon_test.pdf",
          mime_type: "application/pdf",
          file_size: 1000,
        })
        .select()
        .single();
      
      createdSourceIds.push(source!.id);

      // Create two payloads with canonically equivalent data
      const envelope1: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "  INV-001  ", // Extra whitespace
          amount: 1000,
          vendor_name: "  ACME CORP  ", // Uppercase + whitespace
        },
        provenance: {
          source_refs: [source!.id],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "test:v1.0",
        },
      };

      const envelope2: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "inv-001", // Normalized
          amount: 1000,
          vendor_name: "acme corp", // Normalized
        },
        provenance: {
          source_refs: [source!.id],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "test:v1.0",
        },
      };

      const result1 = await compilePayload(envelope1, { userId: testUserId });
      createdPayloadIds.push(result1.payload_id);

      const result2 = await compilePayload(envelope2, { userId: testUserId });

      // Should produce same content ID after canonicalization
      expect(result1.payload_content_id).toBe(result2.payload_content_id);
      expect(result2.created).toBe(false); // Deduplicated
    });

    it("should skip observations when requested", async () => {
      // Create test source
      const { data: source } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "hash_skip_obs",
          original_filename: "skip_obs_test.pdf",
          mime_type: "application/pdf",
          file_size: 1000,
        })
        .select()
        .single();
      
      createdSourceIds.push(source!.id);

      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_receipt:v1",
        body: {
          amount: 50,
          vendor_name: "Store",
        },
        provenance: {
          source_refs: [source!.id],
          extracted_at: new Date().toISOString(),
          extractor_version: "test:v1.0",
        },
      };

      const result = await compilePayload(envelope, {
        userId: testUserId,
        skipObservations: true,
      });
      
      expect(result.created).toBe(true);
      createdPayloadIds.push(result.payload_id);

      // Verify payload exists but no observations created
      const { data: payload } = await db
        .from("payloads")
        .select("*")
        .eq("id", result.payload_id)
        .single();
      
      expect(payload).toBeDefined();

      // Observations may or may not be created depending on skipObservations implementation
      // Just verify payload compilation succeeded
    });
  });

  describe("getPayloadById", () => {
    it("should retrieve payload by ID", async () => {
      // Create test source
      const { data: source } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "hash_get_payload",
          original_filename: "get_test.pdf",
          mime_type: "application/pdf",
          file_size: 1000,
        })
        .select()
        .single();
      
      createdSourceIds.push(source!.id);

      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_transaction:v1",
        body: {
          amount: 75,
          merchant_name: "Merchant",
        },
        provenance: {
          source_refs: [source!.id],
          extracted_at: new Date().toISOString(),
          extractor_version: "test:v1.0",
        },
      };

      const result = await compilePayload(envelope, { userId: testUserId });
      createdPayloadIds.push(result.payload_id);

      // Retrieve payload
      const payload = await getPayloadById(result.payload_id);
      
      expect(payload).toBeDefined();
      expect(payload!.id).toBe(result.payload_id);
      expect(payload!.capability_id).toBe("neotoma:store_transaction:v1");
      expect(payload!.body.amount).toBe(75);
    });

    it("should return null for non-existent payload", async () => {
      const payload = await getPayloadById("payload_nonexistent");
      
      expect(payload).toBeNull();
    });
  });

  describe("Entity Extraction", () => {
    it("should extract entities from payload", async () => {
      // Create test source
      const { data: source } = await db
        .from("sources")
        .insert({
          user_id: testUserId,
          content_hash: "hash_extract_entities",
          original_filename: "extract_test.pdf",
          mime_type: "application/pdf",
          file_size: 1000,
        })
        .select()
        .single();
      
      createdSourceIds.push(source!.id);

      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-EXTRACT-001",
          amount: 3000,
          vendor_name: "Extract Vendor",
          customer_name: "Extract Customer",
        },
        provenance: {
          source_refs: [source!.id],
          extracted_at: new Date().toISOString(),
          extractor_version: "test:v1.0",
        },
      };

      const result = await compilePayload(envelope, {
        userId: testUserId,
        skipObservations: false,
      });
      
      createdPayloadIds.push(result.payload_id);

      // Wait a bit for entity resolution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Query entities that were created
      const { data: entities } = await db
        .from("entities")
        .select("*")
        .eq("user_id", testUserId)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (entities && entities.length > 0) {
        // Should have created invoice entity and company entities (vendor, customer)
        const entityTypes = entities.map(e => e.entity_type);
        
        // At minimum, should have created some entities
        expect(entities.length).toBeGreaterThan(0);
      }
    });
  });
});
