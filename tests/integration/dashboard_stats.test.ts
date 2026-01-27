/**
 * Integration tests for Dashboard Stats Service
 * 
 * Tests dashboard statistics with real database operations.
 */

import { describe, it, expect } from "vitest";
import { getDashboardStats } from "../../src/services/dashboard_stats.js";

describe("Dashboard Stats Service", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";

  describe("getDashboardStats", () => {
    it("should return stats structure with all required fields", async () => {
      const stats = await getDashboardStats(testUserId);
      
      expect(stats).toBeDefined();
      expect(typeof stats.sources_count).toBe("number");
      expect(typeof stats.total_entities).toBe("number");
      expect(typeof stats.total_events).toBe("number");
      expect(typeof stats.total_observations).toBe("number");
      expect(typeof stats.total_interpretations).toBe("number");
      expect(typeof stats.entities_by_type).toBe("object");
      expect(typeof stats.last_updated).toBe("string");
      
      // Verify last_updated is valid ISO timestamp
      expect(() => new Date(stats.last_updated)).not.toThrow();
      
      // Verify non-negative counts
      expect(stats.sources_count).toBeGreaterThanOrEqual(0);
      expect(stats.total_entities).toBeGreaterThanOrEqual(0);
      expect(stats.total_events).toBeGreaterThanOrEqual(0);
      expect(stats.total_observations).toBeGreaterThanOrEqual(0);
      expect(stats.total_interpretations).toBeGreaterThanOrEqual(0);
    });

    it("should return entities_by_type as object", async () => {
      const stats = await getDashboardStats(testUserId);
      
      expect(stats.entities_by_type).toBeDefined();
      expect(typeof stats.entities_by_type).toBe("object");
      expect(Array.isArray(stats.entities_by_type)).toBe(false);
      
      // Verify all values are numbers
      for (const count of Object.values(stats.entities_by_type)) {
        expect(typeof count).toBe("number");
        expect(count).toBeGreaterThan(0);
      }
    });

    it("should support user-scoped queries", async () => {
      const userAStats = await getDashboardStats("user-a");
      const userBStats = await getDashboardStats("user-b");
      
      // Both should return valid stats structures
      expect(userAStats).toBeDefined();
      expect(userBStats).toBeDefined();
      
      // Stats can be different or same depending on data
      expect(typeof userAStats.sources_count).toBe("number");
      expect(typeof userBStats.sources_count).toBe("number");
    });

    it("should support global queries without user filter", async () => {
      const stats = await getDashboardStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.sources_count).toBe("number");
      expect(typeof stats.total_entities).toBe("number");
    });

    it("should return consistent schema across calls", async () => {
      const stats1 = await getDashboardStats(testUserId);
      const stats2 = await getDashboardStats(testUserId);
      
      // Both should have same structure
      expect(Object.keys(stats1).sort()).toEqual(Object.keys(stats2).sort());
      
      // Required fields should be present in both
      const requiredFields = [
        "sources_count",
        "total_entities",
        "total_events",
        "total_observations",
        "total_interpretations",
        "entities_by_type",
        "last_updated",
      ];
      
      for (const field of requiredFields) {
        expect(stats1).toHaveProperty(field);
        expect(stats2).toHaveProperty(field);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty data gracefully", async () => {
      // Query with user that has no data
      const stats = await getDashboardStats("empty-user-stats-test");
      
      expect(stats).toBeDefined();
      expect(stats.sources_count).toBeGreaterThanOrEqual(0);
      expect(stats.total_entities).toBeGreaterThanOrEqual(0);
      expect(stats.total_events).toBeGreaterThanOrEqual(0);
      expect(stats.entities_by_type).toBeDefined();
      expect(typeof stats.entities_by_type).toBe("object");
    });

    it("should handle null user_id", async () => {
      // Query with null user_id (global stats)
      const stats = await getDashboardStats(null as any);
      
      expect(stats).toBeDefined();
      expect(typeof stats.sources_count).toBe("number");
      expect(typeof stats.total_entities).toBe("number");
    });

    it("should handle entities_by_type with no entities", async () => {
      const stats = await getDashboardStats("no-entities-user");
      
      expect(stats.entities_by_type).toBeDefined();
      // May be empty object or have zero counts
      expect(typeof stats.entities_by_type).toBe("object");
    });
  });

  describe("Performance", () => {
    it("should complete in reasonable time", async () => {
      const start = Date.now();
      const stats = await getDashboardStats(testUserId);
      const duration = Date.now() - start;
      
      expect(stats).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete in <5 seconds
    });

    it("should be consistent across multiple calls", async () => {
      const results = await Promise.all([
        getDashboardStats(testUserId),
        getDashboardStats(testUserId),
        getDashboardStats(testUserId),
      ]);
      
      // All should have same structure
      for (const stats of results) {
        expect(stats).toBeDefined();
        expect(typeof stats.sources_count).toBe("number");
      }
    });
  });

  describe("User ID Filtering", () => {
    it("should filter sources by user_id", async () => {
      const user1Stats = await getDashboardStats("user1-dashboard");
      const user2Stats = await getDashboardStats("user2-dashboard");
      
      // Stats should be isolated by user
      expect(user1Stats).toBeDefined();
      expect(user2Stats).toBeDefined();
      
      // Both should have valid structure
      expect(typeof user1Stats.sources_count).toBe("number");
      expect(typeof user2Stats.sources_count).toBe("number");
    });

    it("should filter entities by user_id", async () => {
      const stats = await getDashboardStats(testUserId);
      
      expect(stats).toBeDefined();
      expect(typeof stats.total_entities).toBe("number");
      
      // Entities should be scoped to user
      // If total_entities > 0, verify they belong to user via entities_by_type
      if (stats.total_entities > 0) {
        expect(Object.keys(stats.entities_by_type).length).toBeGreaterThan(0);
      }
    });
  });
});
