/**
 * Integration tests for GDPR deletion workflows (Phase 4)
 *
 * Tests complete soft + hard deletion flows, deadline monitoring, and retention periods.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { generateEntityId } from "../../src/services/entity_resolution.js";
import {
  softDeleteEntity,
  isEntityDeleted,
} from "../../src/services/deletion.js";
import {
  createDeletionRequest,
  processDeletionRequest,
  getDeletionRequests,
  extendDeletionDeadline,
  cryptographicErasure,
} from "../../src/services/gdpr_deletion.js";
import {
  checkDeletionDeadlines,
  processOverdueRequests,
  checkRetentionExpirations,
  dailyCronJob,
} from "../../src/services/deletion_monitor.js";
import { queryEntities } from "../../src/services/entity_queries.js";
import { observationReducer } from "../../src/reducers/observation_reducer.js";

describe("GDPR Deletion Integration Tests", () => {
  const userId = "test-gdpr-user-id";
  const testEntityType = "company";
  const testCanonicalName = "GDPR Test Company";
  const testEntityId = generateEntityId(testEntityType, testCanonicalName);

  beforeEach(async () => {
    // Clean up test data
    await db.from("observations").delete().eq("user_id", userId);
    await db.from("entity_snapshots").delete().eq("user_id", userId);
    await db.from("entities").delete().eq("user_id", userId);
    await db.from("deletion_requests").delete().eq("user_id", userId);
  });

  afterEach(async () => {
    // Clean up test data
    await db.from("observations").delete().eq("user_id", userId);
    await db.from("entity_snapshots").delete().eq("user_id", userId);
    await db.from("entities").delete().eq("user_id", userId);
    await db.from("deletion_requests").delete().eq("user_id", userId);
  });

  describe("Complete Soft Deletion Workflow", () => {
    it("should soft delete entity and filter from queries", async () => {
      // Create entity
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      // Create regular observation
      await db.from("observations").insert({
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0",
        observed_at: new Date().toISOString(),
        source_priority: 0,
        fields: { name: "GDPR Test Company" },
        user_id: userId,
      });

      // Query should return entity
      let entities = await queryEntities({
        userId,
        entityType: testEntityType,
        includeDeleted: false,
      });
      expect(entities.length).toBeGreaterThan(0);

      // Soft delete
      await softDeleteEntity(testEntityId, testEntityType, userId);

      // Query should NOT return entity (filtered by default)
      entities = await queryEntities({
        userId,
        entityType: testEntityType,
        includeDeleted: false,
      });
      expect(entities.length).toBe(0);

      // Query with includeDeleted should return entity
      entities = await queryEntities({
        userId,
        entityType: testEntityType,
        includeDeleted: true,
      });
      expect(entities.length).toBeGreaterThan(0);

      // Verify entity is deleted
      const deleted = await isEntityDeleted(testEntityId, userId);
      expect(deleted).toBe(true);
    });

    it("should return null snapshot for deleted entity", async () => {
      // Create entity and observations
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      const observations = [
        {
          entity_id: testEntityId,
          entity_type: testEntityType,
          schema_version: "1.0",
          observed_at: "2025-01-01T00:00:00Z",
          source_priority: 0,
          fields: { name: "GDPR Test Company" },
          user_id: userId,
        },
      ];

      await db.from("observations").insert(observations);

      // Compute snapshot before deletion
      let result = await db
        .from("observations")
        .select("*")
        .eq("entity_id", testEntityId);

      let snapshot = await observationReducer.computeSnapshot(
        testEntityId,
        result.data as any
      );
      expect(snapshot).not.toBeNull();
      expect(snapshot?.snapshot.name).toBe("GDPR Test Company");

      // Soft delete
      await softDeleteEntity(testEntityId, testEntityType, userId);

      // Compute snapshot after deletion (should return null)
      result = await db
        .from("observations")
        .select("*")
        .eq("entity_id", testEntityId);

      snapshot = await observationReducer.computeSnapshot(
        testEntityId,
        result.data as any
      );
      expect(snapshot).toBeNull();
    });
  });

  describe("GDPR Deletion Request Workflow", () => {
    it("should create deletion request with correct deadline", async () => {
      // Create deletion request
      const result = await createDeletionRequest(
        userId,
        "entity",
        testEntityId,
        undefined,
        "user_request"
      );

      expect(result.success).toBe(true);
      expect(result.deletion_request_id).toBeDefined();

      // Verify request created
      const requests = await getDeletionRequests(userId);
      expect(requests.length).toBe(1);
      expect(requests[0].deletion_type).toBe("entity");
      expect(requests[0].status).toBe("pending");

      // Verify deadline is 30 days from now
      const deadline = new Date(requests[0].deadline);
      const expectedDeadline = new Date();
      expectedDeadline.setDate(expectedDeadline.getDate() + 30);
      const diffDays = Math.abs(
        (deadline.getTime() - expectedDeadline.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBeLessThan(1); // Within 1 day
    });

    it("should process deletion request (soft + hard deletion)", async () => {
      // Create entity
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      // Create deletion request
      const createResult = await createDeletionRequest(
        userId,
        "entity",
        testEntityId,
        undefined,
        "user_request"
      );

      expect(createResult.success).toBe(true);

      // Process deletion request
      const processResult = await processDeletionRequest(
        createResult.deletion_request_id!
      );

      expect(processResult.success).toBe(true);

      // Verify status updated to completed
      const requests = await getDeletionRequests(userId);
      expect(requests[0].status).toBe("completed");
      expect(requests[0].soft_deleted_at).toBeDefined();
      expect(requests[0].hard_deleted_at).toBeDefined();
      expect(requests[0].completed_at).toBeDefined();
    });

    it("should handle retention period correctly", async () => {
      // Create entity
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      // Create deletion request with retention period
      const result = await createDeletionRequest(
        userId,
        "entity",
        testEntityId,
        undefined,
        "legal_obligation",
        2555, // 7 years in days
        "Tax records - 7 years"
      );

      expect(result.success).toBe(true);

      // Get request
      const requests = await getDeletionRequests(userId);
      expect(requests[0].deletion_method).toBe("soft_only");
      expect(requests[0].retention_period_days).toBe(2555);
      expect(requests[0].retention_reason).toBe("Tax records - 7 years");
    });

    it("should extend deletion deadline (max 90 days)", async () => {
      // Create deletion request
      const createResult = await createDeletionRequest(
        userId,
        "entity",
        testEntityId
      );

      // Extend deadline by 30 days
      const extendResult = await extendDeletionDeadline(
        createResult.deletion_request_id!,
        "Complex request requiring additional time",
        30
      );

      expect(extendResult.success).toBe(true);

      // Verify extension
      const requests = await getDeletionRequests(userId);
      expect(requests[0].status).toBe("extended");
      expect(requests[0].extension_granted).toBe(true);
      expect(requests[0].extension_reason).toBe(
        "Complex request requiring additional time"
      );

      // Try to extend beyond 90 days
      const extendResult2 = await extendDeletionDeadline(
        createResult.deletion_request_id!,
        "More time needed",
        60
      );

      expect(extendResult2.success).toBe(false);
      expect(extendResult2.error).toContain("90-day maximum");
    });
  });

  describe("Cryptographic Erasure", () => {
    it("should encrypt observations and delete encryption key", async () => {
      // Create entity and observation
      await db.from("entities").insert({
        id: testEntityId,
        entity_type: testEntityType,
        canonical_name: testCanonicalName,
        user_id: userId,
      });

      await db.from("observations").insert({
        entity_id: testEntityId,
        entity_type: testEntityType,
        schema_version: "1.0",
        observed_at: new Date().toISOString(),
        source_priority: 0,
        fields: { name: "Sensitive Data", ssn: "123-45-6789" },
        user_id: userId,
      });

      // Get original observation
      let { data: beforeObs } = await db
        .from("observations")
        .select("fields")
        .eq("entity_id", testEntityId);

      expect(beforeObs![0].fields.name).toBe("Sensitive Data");
      expect(beforeObs![0].fields.ssn).toBe("123-45-6789");

      // Perform cryptographic erasure
      await cryptographicErasure(userId, testEntityId);

      // Get encrypted observation
      let { data: afterObs } = await db
        .from("observations")
        .select("fields")
        .eq("entity_id", testEntityId);

      // Should be encrypted
      expect(afterObs![0].fields._encrypted).toBeDefined();
      expect(afterObs![0].fields._iv).toBeDefined();
      expect(afterObs![0].fields.name).toBeUndefined();
      expect(afterObs![0].fields.ssn).toBeUndefined();
    });
  });

  describe("Deadline Monitoring", () => {
    it("should detect approaching deadlines", async () => {
      // Create deletion request with deadline in 5 days
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 5);

      await db.from("deletion_requests").insert({
        user_id: userId,
        entity_id: testEntityId,
        deletion_type: "entity",
        status: "pending",
        deadline: deadline.toISOString(),
      });

      // Check deadlines (alert threshold 7 days)
      const alerts = await checkDeletionDeadlines(7);

      expect(alerts.length).toBe(1);
      expect(alerts[0].status).toBe("approaching");
      expect(alerts[0].days_remaining).toBeLessThanOrEqual(7);
    });

    it("should detect overdue requests", async () => {
      // Create deletion request with past deadline
      const deadline = new Date();
      deadline.setDate(deadline.getDate() - 5);

      await db.from("deletion_requests").insert({
        user_id: userId,
        entity_id: testEntityId,
        deletion_type: "entity",
        status: "pending",
        deadline: deadline.toISOString(),
      });

      // Check deadlines
      const alerts = await checkDeletionDeadlines();

      expect(alerts.length).toBe(1);
      expect(alerts[0].status).toBe("overdue");
      expect(alerts[0].days_remaining).toBeLessThan(0);
    });

    it("should check retention expirations", async () => {
      // Create soft-deleted request with expired retention period
      const softDeletedAt = new Date();
      softDeletedAt.setDate(softDeletedAt.getDate() - 10); // 10 days ago

      await db.from("deletion_requests").insert({
        user_id: userId,
        entity_id: testEntityId,
        deletion_type: "entity",
        status: "pending",
        deadline: new Date().toISOString(),
        soft_deleted_at: softDeletedAt.toISOString(),
        deletion_method: "soft_only",
        retention_period_days: 7, // 7 days retention
      });

      // Check retention expirations
      const results = await checkRetentionExpirations();

      expect(results.processed).toBeGreaterThan(0);
    });

    it("should run daily cron job successfully", async () => {
      // Create various deletion requests
      const deadline1 = new Date();
      deadline1.setDate(deadline1.getDate() + 5);

      const deadline2 = new Date();
      deadline2.setDate(deadline2.getDate() - 2);

      await db.from("deletion_requests").insert([
        {
          user_id: userId,
          entity_id: testEntityId,
          deletion_type: "entity",
          status: "pending",
          deadline: deadline1.toISOString(),
        },
        {
          user_id: userId,
          entity_id: generateEntityId("company", "Another Company"),
          deletion_type: "entity",
          status: "pending",
          deadline: deadline2.toISOString(),
        },
      ]);

      // Run daily cron job
      const report = await dailyCronJob(false); // Don't auto-process

      expect(report.report.total_pending).toBeGreaterThan(0);
      expect(report.report.approaching_deadline).toBeGreaterThan(0);
      expect(report.report.overdue).toBeGreaterThan(0);
    });
  });
});
