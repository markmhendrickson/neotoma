import { beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { getDashboardStats } from "../../src/services/dashboard_stats.js";

function sortCounts(byType: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(byType).sort((a, b) => {
      const diff = b[1] - a[1];
      return diff !== 0 ? diff : a[0].localeCompare(b[0]);
    })
  );
}

describe("MCP get_entity_type_counts tool", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeAll(() => {
    server = new NeotomaServer();
    (server as any).authenticatedUserId = testUserId;
  });

  it("returns canonical entity counts by type for the authenticated user", async () => {
    const before = await getDashboardStats(testUserId);
    const result = await (server as any).getEntityTypeCounts({ user_id: testUserId });
    const response = JSON.parse(result.content[0].text);
    const after = await getDashboardStats(testUserId);
    const beforeCounts = sortCounts(before.entities_by_type ?? {});
    const afterCounts = sortCounts(after.entities_by_type ?? {});
    const allTypes = new Set([
      ...Object.keys(beforeCounts),
      ...Object.keys(afterCounts),
      ...Object.keys(response.entities_by_type ?? {}),
    ]);

    for (const entityType of allTypes) {
      const beforeCount = beforeCounts[entityType] ?? 0;
      const afterCount = afterCounts[entityType] ?? 0;
      const responseCount = response.entities_by_type?.[entityType] ?? 0;
      const minCount = Math.min(beforeCount, afterCount);
      const maxCount = Math.max(beforeCount, afterCount);
      expect(responseCount).toBeGreaterThanOrEqual(minCount);
      expect(responseCount).toBeLessThanOrEqual(maxCount);
    }

    const minTotal = Math.min(before.total_entities ?? 0, after.total_entities ?? 0);
    const maxTotal = Math.max(before.total_entities ?? 0, after.total_entities ?? 0);
    expect(response.total_entities).toBeGreaterThanOrEqual(minTotal);
    expect(response.total_entities).toBeLessThanOrEqual(maxTotal);
    expect(response.last_updated).toBeDefined();
    expect(response.count_source).toBe("dashboard_stats");
    expect(response.scope).toBe("authenticated_user");
  });
});
