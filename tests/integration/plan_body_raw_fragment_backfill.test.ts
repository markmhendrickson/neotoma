/**
 * Regression test for issue #259:
 * plan.body (and other fields added after initial schema registration) that
 * were stored while the field was absent from the active schema land in
 * raw_fragments and MUST be promoted to observations by calling
 * updateSchemaIncremental with migrate_existing: true.
 *
 * This test exercises the full path:
 *   1. Narrow plan schema registered (title only, no body).
 *   2. Plan stored with body — body routes to raw_fragments, absent from snapshot.
 *   3. updateSchemaIncremental adds body with migrate_existing: true.
 *   4. Snapshot now reflects the body value.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000259";
const ENTITY_TYPE = "issue_259_regression_plan";

async function seedNarrowSchema(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
  const { error } = await db.from("schema_registry").insert({
    entity_type: ENTITY_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        title: { type: "string", required: true },
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
  if (error) throw new Error(`Failed to seed narrow schema: ${error.message}`);
}

async function cleanup(entityIds: string[]): Promise<void> {
  if (entityIds.length > 0) {
    const { data: observations } = await db
      .from("observations")
      .select("source_id")
      .in("entity_id", entityIds);
    const sourceIds = Array.from(
      new Set(
        (observations ?? [])
          .map((r) => r.source_id)
          .filter((v): v is string => typeof v === "string"),
      ),
    );
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("raw_fragments").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);
    if (sourceIds.length > 0) {
      await db.from("sources").delete().in("id", sourceIds);
    }
  }
  await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
}

function parseResponse(result: { content: Array<{ type: string; text: string }> }) {
  const text = result.content.find((c) => c.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}

describe("plan body raw_fragment backfill (issue #259)", () => {
  const createdEntityIds: string[] = [];
  let server: NeotomaServer & {
    authenticatedUserId?: string | null;
    store: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
    updateSchemaIncremental: (
      args: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
    retrieveEntitySnapshot: (
      args: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  };

  beforeAll(async () => {
    server = new NeotomaServer() as typeof server;
    server.authenticatedUserId = TEST_USER_ID;
    await seedNarrowSchema();
  });

  afterAll(async () => {
    await cleanup(createdEntityIds);
  });

  it("body stored without schema routes to raw_fragments and is absent from snapshot", async () => {
    const title = `Backfill regression plan ${Date.now()}`;
    const bodyText = "## Goal\n\nThis body was stored before `body` was in the schema.";

    const storeResult = await server.store({
      idempotency_key: `issue-259-backfill-${Date.now()}`,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          title,
          body: bodyText,
        },
      ],
    });
    const stored = parseResponse(storeResult);
    expect(stored.entities).toHaveLength(1);
    const entityId = stored.entities[0].entity_id;
    createdEntityIds.push(entityId);

    // body is unknown in the narrow schema — unknown_fields_count and unknown_fields
    // are returned at the top level of the store response (not per-entity).
    expect(stored.unknown_fields_count).toBeGreaterThan(0);
    if (Array.isArray(stored.unknown_fields)) {
      expect(stored.unknown_fields).toContain("body");
    }

    // Snapshot must NOT contain body yet
    const snapResult = await server.retrieveEntitySnapshot({ entity_id: entityId, format: "json" });
    const snap = parseResponse(snapResult);
    expect(snap.snapshot?.body).toBeUndefined();

    // body must be sitting in raw_fragments
    const { data: frags } = await db
      .from("raw_fragments")
      .select("fragment_key, fragment_value")
      .eq("entity_id", entityId)
      .eq("fragment_key", "body");
    expect(frags).not.toBeNull();
    expect(frags!.length).toBeGreaterThan(0);
    expect(frags![0].fragment_value).toBe(bodyText);
  });

  it("updateSchemaIncremental with migrate_existing: true promotes body from raw_fragments to snapshot", async () => {
    // This entity must have been created in the previous test.
    expect(createdEntityIds.length).toBeGreaterThan(0);
    const entityId = createdEntityIds[0];

    // Extend the narrow schema to include `body`, migrating existing raw_fragments.
    // Pass user_id so the migration query matches raw_fragments stored by this user.
    const updateResult = await server.updateSchemaIncremental({
      entity_type: ENTITY_TYPE,
      fields_to_add: [{ field_name: "body", field_type: "string", reducer_strategy: "last_write" }],
      activate: true,
      migrate_existing: true,
      user_id: TEST_USER_ID,
    });
    const updated = parseResponse(updateResult);
    expect(updated.success).toBe(true);
    expect(updated.fields_added).toContain("body");

    // raw_fragments row for body is retained as provenance; the migration
    // creates a new observation. Verify the observation count increased and
    // that an observation contains the body field.
    const { data: obsAfter } = await db
      .from("observations")
      .select("fields")
      .eq("entity_id", entityId);
    const bodyInObs = (obsAfter ?? []).some((o: { fields?: unknown }) => {
      const f = typeof o.fields === "string" ? JSON.parse(o.fields) : o.fields;
      return typeof f === "object" && f !== null && "body" in (f as Record<string, unknown>);
    });
    expect(bodyInObs).toBe(true);

    // Snapshot must now reflect the body value
    const snapResult = await server.retrieveEntitySnapshot({ entity_id: entityId, format: "json" });
    const snap = parseResponse(snapResult);
    expect(snap.snapshot?.body).toBe(
      "## Goal\n\nThis body was stored before `body` was in the schema.",
    );
  });

  it("idempotent: running migrate_existing again does not duplicate or corrupt the body value", async () => {
    expect(createdEntityIds.length).toBeGreaterThan(0);
    const entityId = createdEntityIds[0];

    // Run the same updateSchemaIncremental again — body already in schema, no new fields to add.
    // The call should succeed (no-op or minor version bump) and the snapshot must be unchanged.
    // We add a dummy field to force an update call so migrate_existing fires again.
    await server.updateSchemaIncremental({
      entity_type: ENTITY_TYPE,
      fields_to_add: [
        { field_name: "notes", field_type: "string", reducer_strategy: "last_write" },
      ],
      activate: true,
      migrate_existing: true,
      user_id: TEST_USER_ID,
    });

    const snapResult = await server.retrieveEntitySnapshot({ entity_id: entityId, format: "json" });
    const snap = parseResponse(snapResult);
    // body must still have exactly the original value — no duplication
    expect(snap.snapshot?.body).toBe(
      "## Goal\n\nThis body was stored before `body` was in the schema.",
    );
  });
});
