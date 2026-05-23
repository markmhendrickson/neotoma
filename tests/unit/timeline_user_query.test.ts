import { describe, expect, it, beforeEach } from "vitest";
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";
import {
  getTimelineEventForUser,
  listTimelineEventsForUser,
} from "../../src/services/timeline_user_query.js";

const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";

function seedTimelineFixture(): { eventId: string; sourceId: string } {
  const sqlite = getSqliteDb();
  const sourceId = "src_timeline_user_query_test";
  const eventId = "tev_timeline_user_query_test";

  sqlite
    .prepare(
      `INSERT OR REPLACE INTO sources (id, user_id, content_hash, mime_type, storage_url, file_size, created_at)
       VALUES (?, ?, 'hash', 'text/plain', 'file://test', 1, datetime('now'))`
    )
    .run(sourceId, USER_A);

  sqlite
    .prepare(
      `INSERT OR REPLACE INTO timeline_events (
        id, event_type, event_timestamp, source_id, entity_id, created_at, user_id
      ) VALUES (?, 'GenericEvent', '2024-06-01T00:00:00.000Z', ?, 'ent_test', datetime('now'), ?)`
    )
    .run(eventId, sourceId, USER_A);

  return { eventId, sourceId };
}

describe("timeline_user_query", () => {
  beforeEach(() => {
    seedTimelineFixture();
  });

  it("lists events for the owning user via sources subquery", () => {
    const { data, count } = listTimelineEventsForUser({
      userId: USER_A,
      limit: 50,
      offset: 0,
      orderByColumn: "event_timestamp",
    });
    expect(count).toBeGreaterThanOrEqual(1);
    expect(data.some((row) => row.id === "tev_timeline_user_query_test")).toBe(true);
  });

  it("does not return another user's events", () => {
    const { data } = listTimelineEventsForUser({
      userId: USER_B,
      limit: 50,
      offset: 0,
      orderByColumn: "event_timestamp",
    });
    expect(data.some((row) => row.id === "tev_timeline_user_query_test")).toBe(false);
  });

  it("gets one event by id for the owning user", () => {
    const row = getTimelineEventForUser(USER_A, "tev_timeline_user_query_test");
    expect(row?.id).toBe("tev_timeline_user_query_test");
  });

  it("returns null for another user's get by id", () => {
    expect(getTimelineEventForUser(USER_B, "tev_timeline_user_query_test")).toBeNull();
  });
});
