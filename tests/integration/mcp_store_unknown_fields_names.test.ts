/**
 * Regression tests for issue #185:
 * store response MUST list unknown field names (string array), not just a count.
 *
 * This test exercises:
 * - `unknown_fields` string array populated in the MCP store response
 * - `unknown_fields_count` matches the length of the array
 * - Field names are sorted alphabetically
 * - When there are no unknown fields, `unknown_fields` is absent
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000185";
// Entity type with a narrow schema that will treat most fields as unknown.
const ENTITY_TYPE = "issue_185_regression_plan";

async function seedNarrowSchema(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
  const { error } = await db.from("schema_registry").insert({
    entity_type: ENTITY_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        title: { type: "string" },
      },
      canonical_name_fields: ["title"],
    },
    reducer_config: {
      merge_policies: {
        title: { strategy: "last_write", tie_breaker: "observed_at" },
      },
    },
    active: true,
    scope: "global",
    user_id: null,
  });
  if (error) throw new Error(`Failed to seed schema: ${error.message}`);
}

async function cleanupTestData(): Promise<void> {
  await db.from("raw_fragments").delete().eq("entity_type", ENTITY_TYPE).eq("user_id", TEST_USER_ID);
  await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);

  const { data: entities } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", ENTITY_TYPE);
  if (entities && entities.length > 0) {
    const ids = entities.map((e) => e.id);
    await db.from("observations").delete().in("entity_id", ids);
    await db.from("entity_snapshots").delete().in("entity_id", ids);
    await db.from("entities").delete().in("id", ids);
  }
}

describe("MCP store: unknown field names surfaced in response (issue #185)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    await cleanupTestData();
    await seedNarrowSchema();
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("includes unknown_fields array listing each dropped field name", async () => {
    const result = await (server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-185-unknown-fields-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          title: "My Plan",
          goals: "Launch product",
          architecture: "Microservices",
          cost_estimate: "50000",
          next_steps: "Write spec",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as {
      unknown_fields_count?: number;
      unknown_fields?: string[];
      entities?: Array<{ entity_id: string }>;
      error?: { code?: string };
    };

    expect(body.error).toBeUndefined();
    // Entity was created (title is the schema field).
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.entities!.length).toBeGreaterThan(0);

    // The four undeclared fields must appear by name.
    expect(body.unknown_fields_count).toBe(4);
    expect(Array.isArray(body.unknown_fields)).toBe(true);
    expect(body.unknown_fields).toHaveLength(4);

    // Names must be sorted alphabetically.
    expect(body.unknown_fields).toEqual([
      "architecture",
      "cost_estimate",
      "goals",
      "next_steps",
    ]);
  });

  it("omits unknown_fields when all fields are schema-declared", async () => {
    const result = await (server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-185-no-unknown-fields-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          title: "Clean Plan",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as {
      unknown_fields_count?: number;
      unknown_fields?: string[];
      entities?: Array<{ entity_id: string }>;
      error?: { code?: string };
    };

    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.entities!.length).toBeGreaterThan(0);

    // No unknown fields — count should be 0 and the array should be absent.
    expect(body.unknown_fields_count ?? 0).toBe(0);
    expect(body.unknown_fields).toBeUndefined();
  });

  it("deduplicates field names across multiple entities in one batch", async () => {
    const result = await (server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-185-dedup-batch-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          title: "Plan A",
          goals: "Goal A",
          notes: "Note A",
        },
        {
          entity_type: ENTITY_TYPE,
          title: "Plan B",
          goals: "Goal B",
          owner: "Alice",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as {
      unknown_fields_count?: number;
      unknown_fields?: string[];
      entities?: Array<{ entity_id: string }>;
      error?: { code?: string };
    };

    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.entities!.length).toBe(2);

    // goals appears in both entities but should only be listed once.
    expect(Array.isArray(body.unknown_fields)).toBe(true);
    // Distinct unknown field names across both entities: goals, notes, owner.
    const names = body.unknown_fields ?? [];
    expect(names).toContain("goals");
    expect(names).toContain("notes");
    expect(names).toContain("owner");
    // goals must not appear twice.
    expect(names.filter((n) => n === "goals")).toHaveLength(1);
  });
});
