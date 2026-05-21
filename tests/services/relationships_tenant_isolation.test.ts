/**
 * Regression test for GHSA-wrr4-782v-jhwh /
 * docs/security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md
 *
 * Invariant: getRelationshipsForEntity and getRelationshipsByType MUST apply
 * an .eq("user_id", userId) filter on the relationship_snapshots query when
 * a userId is provided. Without this filter, callers can read relationship
 * edges belonging to other users on the same instance.
 *
 * The test records the chained calls against a mock db and asserts the
 * expected filter clauses are present.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type Call = { method: string; args: unknown[] };
const recordedCalls: Call[] = [];

function makeChainable() {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then" || typeof prop === "symbol") return undefined;
        return (...args: unknown[]) => {
          recordedCalls.push({ method: prop, args });
          if (prop === "order") {
            // terminal: resolve with empty data
            return Promise.resolve({ data: [], error: null });
          }
          return proxy;
        };
      },
    }
  );
  return proxy;
}

vi.mock("../../src/db.js", () => ({
  db: {
    from: (table: string) => {
      recordedCalls.push({ method: "from", args: [table] });
      return makeChainable();
    },
  },
}));

import { relationshipsService } from "../../src/services/relationships.js";

describe("relationships tenant isolation (GHSA-wrr4-782v-jhwh)", () => {
  beforeEach(() => {
    recordedCalls.length = 0;
  });

  it("getRelationshipsForEntity outgoing applies user_id filter when userId provided", async () => {
    await relationshipsService.getRelationshipsForEntity(
      "ent_abc",
      "outgoing",
      true, // includeDeleted to skip the deletion-observation second query
      "user-1"
    );

    const eqCalls = recordedCalls.filter((c) => c.method === "eq");
    const hasUserIdEq = eqCalls.some(
      (c) => c.args[0] === "user_id" && c.args[1] === "user-1"
    );
    expect(hasUserIdEq).toBe(true);
  });

  it("getRelationshipsForEntity incoming applies user_id filter when userId provided", async () => {
    await relationshipsService.getRelationshipsForEntity(
      "ent_abc",
      "incoming",
      true,
      "user-1"
    );

    const eqCalls = recordedCalls.filter((c) => c.method === "eq");
    const hasUserIdEq = eqCalls.some(
      (c) => c.args[0] === "user_id" && c.args[1] === "user-1"
    );
    expect(hasUserIdEq).toBe(true);
  });

  it("getRelationshipsForEntity both directions applies user_id filter when userId provided", async () => {
    await relationshipsService.getRelationshipsForEntity(
      "ent_abc",
      "both",
      true,
      "user-1"
    );

    const eqCalls = recordedCalls.filter((c) => c.method === "eq");
    const hasUserIdEq = eqCalls.some(
      (c) => c.args[0] === "user_id" && c.args[1] === "user-1"
    );
    expect(hasUserIdEq).toBe(true);
  });

  it("getRelationshipsByType applies user_id filter when userId provided", async () => {
    await relationshipsService.getRelationshipsByType(
      "WORKS_AT" as any,
      true,
      "user-1"
    );

    const eqCalls = recordedCalls.filter((c) => c.method === "eq");
    const hasUserIdEq = eqCalls.some(
      (c) => c.args[0] === "user_id" && c.args[1] === "user-1"
    );
    expect(hasUserIdEq).toBe(true);
  });

  it("does NOT apply user_id filter when userId omitted (back-compat for internal callers)", async () => {
    await relationshipsService.getRelationshipsForEntity("ent_abc", "outgoing", true);

    const eqCalls = recordedCalls.filter((c) => c.method === "eq");
    const hasUserIdEq = eqCalls.some((c) => c.args[0] === "user_id");
    expect(hasUserIdEq).toBe(false);
  });
});
