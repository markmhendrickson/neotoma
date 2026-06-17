import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";
import {
  getTimelineEventForUser,
  listTimelineEventsForUser,
} from "../../src/services/timeline_query.js";

const TEST_RUN_ID = randomUUID().slice(0, 8);
const TEST_USER_ID = `timeline-query-user-${TEST_RUN_ID}`;
const OTHER_USER_ID = `timeline-query-other-${TEST_RUN_ID}`;
const TARGET_ENTITY_ID = `timeline-query-entity-${TEST_RUN_ID}`;
const OTHER_ENTITY_ID = `timeline-query-other-entity-${TEST_RUN_ID}`;
const TARGET_EVENT_ID = `timeline-query-event-${TEST_RUN_ID}`;
const OTHER_EVENT_ID = `timeline-query-other-event-${TEST_RUN_ID}`;
const NOW = "2026-06-17T08:00:00.000Z";

function insertSource(id: string, userId: string) {
  getSqliteDb()
    .prepare(
      `INSERT OR REPLACE INTO sources
        (id, user_id, content_hash, mime_type, storage_url, file_size, original_filename, source_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      `${id}-hash`,
      "text/plain",
      null,
      0,
      `${id}.txt`,
      "test",
      NOW,
    );
}

function insertEntity(id: string, userId: string, canonicalName: string) {
  getSqliteDb()
    .prepare(
      `INSERT OR REPLACE INTO entities
        (id, entity_type, canonical_name, aliases, created_at, updated_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, "task", canonicalName, JSON.stringify([]), NOW, NOW, userId);
}

function insertTimelineEvent(input: {
  id: string;
  userId: string;
  sourceId: string;
  entityId: string;
  timestamp: string;
}) {
  getSqliteDb()
    .prepare(
      `INSERT OR REPLACE INTO timeline_events
        (id, event_type, event_timestamp, source_id, source_field, entity_id, created_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      "TaskDue",
      input.timestamp,
      input.sourceId,
      "due_date",
      input.entityId,
      NOW,
      input.userId,
    );
}

describe("timeline_query", () => {
  beforeAll(() => {
    insertEntity(TARGET_ENTITY_ID, TEST_USER_ID, "Target Task");
    insertEntity(OTHER_ENTITY_ID, OTHER_USER_ID, "Other Task");

    for (let i = 0; i < 1100; i += 1) {
      insertSource(`timeline-query-source-${TEST_RUN_ID}-${i}`, TEST_USER_ID);
    }
    insertSource(`timeline-query-other-source-${TEST_RUN_ID}`, OTHER_USER_ID);

    insertTimelineEvent({
      id: TARGET_EVENT_ID,
      userId: TEST_USER_ID,
      sourceId: `timeline-query-source-${TEST_RUN_ID}-0`,
      entityId: TARGET_ENTITY_ID,
      timestamp: "2026-06-18T00:00:00.000Z",
    });
    insertTimelineEvent({
      id: OTHER_EVENT_ID,
      userId: OTHER_USER_ID,
      sourceId: `timeline-query-other-source-${TEST_RUN_ID}`,
      entityId: OTHER_ENTITY_ID,
      timestamp: "2026-06-19T00:00:00.000Z",
    });
  });

  afterAll(() => {
    const db = getSqliteDb();
    db.prepare("DELETE FROM timeline_events WHERE user_id IN (?, ?)").run(TEST_USER_ID, OTHER_USER_ID);
    db.prepare("DELETE FROM sources WHERE user_id IN (?, ?)").run(TEST_USER_ID, OTHER_USER_ID);
    db.prepare("DELETE FROM entities WHERE user_id IN (?, ?)").run(TEST_USER_ID, OTHER_USER_ID);
  });

  it("lists entity timeline events without building a large source_id IN filter", async () => {
    const result = await listTimelineEventsForUser(TEST_USER_ID, {
      entityId: TARGET_ENTITY_ID,
      limit: 3,
      offset: 0,
      orderBy: "event_timestamp",
    });

    expect(result.total).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe(TARGET_EVENT_ID);
    expect(result.events[0].entity_name).toBe("Target Task");
    expect(result.events[0].entity_type).toBe("task");
  });

  it("does not return timeline events from another user", async () => {
    await expect(getTimelineEventForUser(TEST_USER_ID, OTHER_EVENT_ID)).resolves.toBeNull();
  });
});
