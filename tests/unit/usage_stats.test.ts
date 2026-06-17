import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";
import { getUsageStats } from "../../src/services/dashboard_stats.js";

const TEST_USER_ID = `usage-stats-${randomUUID().slice(0, 8)}`;
const OTHER_USER_ID = `usage-stats-other-${randomUUID().slice(0, 8)}`;
const NOW = "2026-06-16T08:00:00.000Z";
const TEN_DAYS_AGO = "2026-06-06T08:00:00.000Z";

function insertEntity(input: {
  id: string;
  entityType: string;
  createdAt: string;
  userId: string;
  mergedToEntityId?: string | null;
}) {
  getSqliteDb()
    .prepare(
      `INSERT OR REPLACE INTO entities
        (id, entity_type, canonical_name, aliases, created_at, updated_at, user_id, first_seen_at, last_seen_at, merged_to_entity_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.entityType,
      input.id,
      JSON.stringify([]),
      input.createdAt,
      input.createdAt,
      input.userId,
      input.createdAt,
      input.createdAt,
      input.mergedToEntityId ?? null
    );
}

function insertObservation(input: {
  id: string;
  entityId: string;
  entityType: string;
  observationSource: string | null;
  userId: string;
}) {
  getSqliteDb()
    .prepare(
      `INSERT OR REPLACE INTO observations
        (id, entity_id, entity_type, schema_version, observed_at, observation_source, fields, created_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.entityId,
      input.entityType,
      "1.0",
      NOW,
      input.observationSource,
      JSON.stringify({}),
      NOW,
      input.userId
    );
}

function insertSchema(input: { id: string; entityType: string; userId?: string | null }) {
  getSqliteDb()
    .prepare(
      `INSERT OR REPLACE INTO schema_registry
        (id, entity_type, schema_version, schema_definition, reducer_config, active, created_at, user_id, scope, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.entityType,
      "1.0",
      JSON.stringify({ fields: {} }),
      JSON.stringify({}),
      1,
      NOW,
      input.userId ?? null,
      input.userId ? "user" : "global",
      JSON.stringify({})
    );
}

describe("getUsageStats", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterAll(() => {
    const db = getSqliteDb();
    db.prepare("DELETE FROM observations WHERE user_id IN (?, ?)").run(TEST_USER_ID, OTHER_USER_ID);
    db.prepare("DELETE FROM entities WHERE user_id IN (?, ?)").run(TEST_USER_ID, OTHER_USER_ID);
    db.prepare("DELETE FROM schema_registry WHERE id LIKE ?").run("usage-stats-%");
    vi.useRealTimers();
  });

  it("returns user-scoped aggregate usage statistics", async () => {
    insertEntity({ id: "usage-stats-task-1", entityType: "usage_stats_alpha", createdAt: NOW, userId: TEST_USER_ID });
    insertEntity({ id: "usage-stats-task-2", entityType: "usage_stats_alpha", createdAt: TEN_DAYS_AGO, userId: TEST_USER_ID });
    insertEntity({ id: "usage-stats-note-1", entityType: "usage_stats_beta", createdAt: NOW, userId: TEST_USER_ID });
    insertEntity({
      id: "usage-stats-merged-note",
      entityType: "usage_stats_beta",
      createdAt: NOW,
      userId: TEST_USER_ID,
      mergedToEntityId: "usage-stats-note-1",
    });
    insertEntity({ id: "usage-stats-other-user-task", entityType: "usage_stats_alpha", createdAt: NOW, userId: OTHER_USER_ID });

    insertObservation({
      id: "usage-stats-observation-1",
      entityId: "usage-stats-task-1",
      entityType: "usage_stats_alpha",
      observationSource: "llm_summary",
      userId: TEST_USER_ID,
    });
    insertObservation({
      id: "usage-stats-observation-2",
      entityId: "usage-stats-task-2",
      entityType: "usage_stats_alpha",
      observationSource: null,
      userId: TEST_USER_ID,
    });
    insertObservation({
      id: "usage-stats-observation-other-user",
      entityId: "usage-stats-other-user-task",
      entityType: "usage_stats_alpha",
      observationSource: "sensor",
      userId: OTHER_USER_ID,
    });

    insertSchema({ id: "usage-stats-schema-task", entityType: "usage_stats_alpha" });

    const stats = await getUsageStats(TEST_USER_ID);

    expect(stats.entities_by_type).toEqual({ usage_stats_alpha: 2, usage_stats_beta: 1 });
    expect(stats.total_entities).toBe(3);
    expect(stats.observations_by_source).toEqual({ llm_summary: 1, unclassified: 1 });
    expect(stats.total_observations).toBe(2);
    expect(stats.entities_created_last_7_days).toBe(2);
    expect(stats.entities_created_last_30_days).toBe(3);
    expect(stats.entity_types_total).toBe(2);
    expect(stats.entity_types_with_schema).toBe(1);
    expect(stats.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
