/**
 * Unit tests for AutoEnhancementProcessor
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  processAutoEnhancementQueue,
  startAutoEnhancementProcessor,
  cleanupOldQueueItems,
} from "../../src/services/auto_enhancement_processor.js";
import { supabase } from "../../src/db.js";
import { schemaRecommendationService } from "../../src/services/schema_recommendation.js";

// Mock the database module
vi.mock("../../src/db.js", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock schema recommendation service
vi.mock("../../src/services/schema_recommendation.js", () => ({
  schemaRecommendationService: {
    checkAutoEnhancementEligibility: vi.fn(),
    autoEnhanceSchema: vi.fn(),
  },
}));

describe("AutoEnhancementProcessor", () => {
  let mockFrom: any;

  beforeEach(() => {
    mockFrom = vi.fn();
    (supabase.from as any) = mockFrom;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("processAutoEnhancementQueue", () => {
    it("should return zeros when no pending items", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      mockFrom.mockReturnValue(mockQuery);

      const result = await processAutoEnhancementQueue();

      expect(result).toEqual({
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      });
    });

    it("should process eligible items successfully", async () => {
      const queueItem = {
        id: "queue-1",
        entity_type: "transaction",
        fragment_key: "new_field",
        user_id: "test-user",
        frequency_count: 5,
        retry_count: 0,
      };

      // Mock queue fetch
      const mockSelectQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [queueItem],
          error: null,
        }),
      };

      // Mock status update to processing
      const mockUpdateProcessing = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };

      // Mock eligibility check
      vi.mocked(
        schemaRecommendationService.checkAutoEnhancementEligibility,
      ).mockResolvedValue({
        eligible: true,
        confidence: 0.9,
        inferred_type: "string",
        reasoning: "High confidence field",
      });

      // Mock auto-enhance
      vi.mocked(schemaRecommendationService.autoEnhanceSchema).mockResolvedValue(
        undefined,
      );

      // Mock status update to completed
      const mockUpdateCompleted = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };

      mockFrom
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(mockUpdateProcessing)
        .mockReturnValueOnce(mockUpdateCompleted);

      const result = await processAutoEnhancementQueue();

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(
        schemaRecommendationService.checkAutoEnhancementEligibility,
      ).toHaveBeenCalledWith({
        entity_type: "transaction",
        fragment_key: "new_field",
        user_id: "test-user",
      });
      expect(schemaRecommendationService.autoEnhanceSchema).toHaveBeenCalledWith(
        {
          entity_type: "transaction",
          field_name: "new_field",
          field_type: "string",
          user_id: "test-user",
        },
      );
    });

    it("should skip ineligible items", async () => {
      const queueItem = {
        id: "queue-2",
        entity_type: "transaction",
        fragment_key: "test_field",
        user_id: null,
        frequency_count: 1,
        retry_count: 0,
      };

      const mockSelectQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [queueItem],
          error: null,
        }),
      };

      const mockUpdateProcessing = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };

      const mockUpdateSkipped = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };

      vi.mocked(
        schemaRecommendationService.checkAutoEnhancementEligibility,
      ).mockResolvedValue({
        eligible: false,
        confidence: 0.5,
        inferred_type: "string",
        reasoning: "Low frequency",
      });

      mockFrom
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(mockUpdateProcessing)
        .mockReturnValueOnce(mockUpdateSkipped);

      const result = await processAutoEnhancementQueue();

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(
        schemaRecommendationService.autoEnhanceSchema,
      ).not.toHaveBeenCalled();
    });

    it("should handle processing errors and retry", async () => {
      const queueItem = {
        id: "queue-3",
        entity_type: "transaction",
        fragment_key: "error_field",
        user_id: null,
        frequency_count: 5,
        retry_count: 0,
      };

      const mockSelectQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [queueItem],
          error: null,
        }),
      };

      const mockUpdateProcessing = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };

      const mockUpdateFailed = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };

      vi.mocked(
        schemaRecommendationService.checkAutoEnhancementEligibility,
      ).mockResolvedValue({
        eligible: true,
        confidence: 0.9,
        inferred_type: "string",
        reasoning: "High confidence",
      });

      vi.mocked(
        schemaRecommendationService.autoEnhanceSchema,
      ).mockRejectedValue(new Error("Enhancement failed"));

      mockFrom
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(mockUpdateProcessing)
        .mockReturnValueOnce(mockUpdateFailed);

      const result = await processAutoEnhancementQueue();

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(mockUpdateFailed.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          retry_count: 1,
          error_message: "Enhancement failed",
        }),
      );
    });

    it("should process multiple items in batch", async () => {
      const queueItems = [
        {
          id: "queue-1",
          entity_type: "transaction",
          fragment_key: "field1",
          user_id: null,
          frequency_count: 5,
          retry_count: 0,
        },
        {
          id: "queue-2",
          entity_type: "transaction",
          fragment_key: "field2",
          user_id: null,
          frequency_count: 5,
          retry_count: 0,
        },
      ];

      const mockSelectQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: queueItems,
          error: null,
        }),
      };

      const createChainableUpdate = () => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      vi.mocked(
        schemaRecommendationService.checkAutoEnhancementEligibility,
      ).mockResolvedValue({
        eligible: true,
        confidence: 0.9,
        inferred_type: "string",
        reasoning: "High confidence",
      });

      vi.mocked(schemaRecommendationService.autoEnhanceSchema).mockResolvedValue(
        undefined,
      );

      // Setup mocks for 2 items × 3 calls each (select, update processing, update completed)
      mockFrom
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(createChainableUpdate()) // item 1: processing
        .mockReturnValueOnce(createChainableUpdate()) // item 1: completed
        .mockReturnValueOnce(createChainableUpdate()) // item 2: processing
        .mockReturnValueOnce(createChainableUpdate()); // item 2: completed

      const result = await processAutoEnhancementQueue();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it("should handle fetch errors gracefully", async () => {
      const mockSelectQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      mockFrom.mockReturnValue(mockSelectQuery);

      const result = await processAutoEnhancementQueue();

      expect(result).toEqual({
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe("startAutoEnhancementProcessor", () => {
    it("should start processor and return cleanup function", () => {
      vi.useFakeTimers();
      
      // Mock the processAutoEnhancementQueue function
      vi.spyOn(
        {
          processAutoEnhancementQueue,
        },
        "processAutoEnhancementQueue",
      ).mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      });

      const cleanup = startAutoEnhancementProcessor(1000);

      expect(cleanup).toBeDefined();
      expect(typeof cleanup).toBe("function");

      // Advance timer
      vi.advanceTimersByTime(1000);

      cleanup();
      vi.useRealTimers();
    });
  });

  describe("cleanupOldQueueItems", () => {
    it("should delete old completed items", async () => {
      const mockDeleteQuery = {
        delete: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [{ id: "old-1" }, { id: "old-2" }],
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockDeleteQuery);

      const result = await cleanupOldQueueItems(7);

      expect(result).toBe(2);
      expect(mockDeleteQuery.in).toHaveBeenCalledWith("status", [
        "completed",
        "skipped",
      ]);
    });

    it("should return 0 on error", async () => {
      const mockDeleteQuery = {
        delete: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Delete failed" },
        }),
      };

      mockFrom.mockReturnValue(mockDeleteQuery);

      const result = await cleanupOldQueueItems(7);

      expect(result).toBe(0);
    });

    it("should use default daysToKeep of 7", async () => {
      const mockDeleteQuery = {
        delete: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockDeleteQuery);

      await cleanupOldQueueItems();

      expect(mockDeleteQuery.lt).toHaveBeenCalled();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      // Verify the date is approximately correct (within 1 second)
      const calledDate = new Date(
        mockDeleteQuery.lt.mock.calls[0][1] as string,
      );
      expect(
        Math.abs(calledDate.getTime() - cutoffDate.getTime()),
      ).toBeLessThan(1000);
    });
  });
});
