/**
 * Regression tests for issue #187 (and #1549):
 * store response MUST surface a `hint` directing callers to the recovery path
 * when unknown fields are present.
 *
 * For a schema that declares `canonical_name_fields` (identity config present),
 * the hint prescribes `update_schema_incremental` + `migrate_existing` — the
 * path that works for that schema. (#1549 made the hint conditional: schemas
 * without identity config get a different hint that avoids the
 * `update_schema_incremental` dead-end; that branch is covered in
 * store_required_unknown_field_signals.test.ts.)
 *
 * This test exercises:
 * - `hint` string present in response when `unknown_fields_count > 0`
 * - Hint references `update_schema_incremental` and `migrate_existing`
 * - `hint` absent when all fields are schema-declared (clean payload)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000187";
const ENTITY_TYPE = "issue_187_regression_plan";

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

describe("MCP store: raw_fragments recovery hint surfaced (issue #187)", () => {
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

  it("includes a hint when unknown fields are present", async () => {
    const result = await (server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-187-hint-present-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          title: "My Plan",
          goals: "Launch product",
          architecture: "Microservices",
          cost_estimate: "50000",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as {
      unknown_fields_count?: number;
      hint?: string;
      entities?: Array<{ entity_id: string }>;
      error?: { code?: string };
    };

    expect(body.error).toBeUndefined();
    expect(body.unknown_fields_count).toBe(3);

    // Hint must be present and reference the recovery path. This schema
    // declares canonical_name_fields, so update_schema_incremental is the
    // working path and is prescribed (issue #1549).
    expect(typeof body.hint).toBe("string");
    expect(body.hint).toContain("update_schema_incremental");
    expect(body.hint).toContain("migrate_existing");
    // The undeclared fields are NOT routed to raw_fragments on the structured
    // store path; they are preserved on the observation and excluded from the
    // snapshot projection. The hint reflects that accurately.
    expect(body.hint).toContain("snapshot");
  });

  it("omits the hint when all fields are schema-declared", async () => {
    const result = await (server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-187-hint-absent-${Date.now()}`,
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
      hint?: string;
      entities?: Array<{ entity_id: string }>;
      error?: { code?: string };
    };

    expect(body.error).toBeUndefined();
    expect(body.unknown_fields_count ?? 0).toBe(0);
    // No hint when there are no unknown fields.
    expect(body.hint).toBeUndefined();
  });
});
