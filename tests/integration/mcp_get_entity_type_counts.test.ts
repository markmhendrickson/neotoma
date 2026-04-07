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
    const result = await (server as any).getEntityTypeCounts({ user_id: testUserId });
    const response = JSON.parse(result.content[0].text);
    const expected = await getDashboardStats(testUserId);

    expect(response.entities_by_type).toEqual(sortCounts(expected.entities_by_type ?? {}));
    expect(response.total_entities).toBe(expected.total_entities ?? 0);
    expect(response.last_updated).toBeDefined();
    expect(response.count_source).toBe("dashboard_stats");
    expect(response.scope).toBe("authenticated_user");
  });
});
