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
    const acceptableCounts = [
      sortCounts(before.entities_by_type ?? {}),
      sortCounts(after.entities_by_type ?? {}),
    ];
    const acceptableTotals = [before.total_entities ?? 0, after.total_entities ?? 0];

    expect(acceptableCounts).toContainEqual(response.entities_by_type);
    expect(acceptableTotals).toContain(response.total_entities);
    expect(response.last_updated).toBeDefined();
    expect(response.count_source).toBe("dashboard_stats");
    expect(response.scope).toBe("authenticated_user");
  });
});
