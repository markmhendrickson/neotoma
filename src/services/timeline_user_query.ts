/**
 * User-scoped timeline reads via a sources subquery (one bind param per user).
 * Avoids loading all source IDs into an IN (...) clause, which hits SQLite's
 * ~999 variable limit on large databases.
 */

import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";

export type TimelineListOrderColumn = "event_timestamp" | "created_at";

export interface ListTimelineEventsForUserInput {
  userId: string;
  startDate?: string;
  endDate?: string;
  eventType?: string;
  entityId?: string;
  limit: number;
  offset: number;
  orderByColumn: TimelineListOrderColumn;
}

function parseTimelineRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  if (typeof out.provenance === "string") {
    try {
      out.provenance = JSON.parse(out.provenance) as unknown;
    } catch {
      // keep raw string
    }
  }
  return out;
}

function buildUserScopedWhere(input: {
  userId: string;
  startDate?: string;
  endDate?: string;
  eventType?: string;
  entityId?: string;
}): { whereSql: string; params: unknown[] } {
  const wheres = ["source_id IN (SELECT id FROM sources WHERE user_id = ?)"];
  const params: unknown[] = [input.userId];

  if (input.startDate) {
    wheres.push("event_timestamp >= ?");
    params.push(input.startDate);
  }
  if (input.endDate) {
    wheres.push("event_timestamp <= ?");
    params.push(input.endDate);
  }
  if (input.eventType) {
    wheres.push("event_type = ?");
    params.push(input.eventType);
  }
  if (input.entityId) {
    wheres.push("entity_id = ?");
    params.push(input.entityId);
  }

  return { whereSql: wheres.join(" AND "), params };
}

export function listTimelineEventsForUser(
  input: ListTimelineEventsForUserInput
): { data: Record<string, unknown>[]; count: number } {
  const { whereSql, params } = buildUserScopedWhere(input);
  const orderCol = input.orderByColumn === "created_at" ? "created_at" : "event_timestamp";
  const sqlite = getSqliteDb();

  const countRow = sqlite
    .prepare(`SELECT COUNT(*) as count FROM timeline_events WHERE ${whereSql}`)
    .get(...params) as { count: number } | undefined;
  const count = countRow?.count ?? 0;

  const rows = sqlite
    .prepare(
      `SELECT * FROM timeline_events WHERE ${whereSql} ORDER BY ${orderCol} DESC, id ASC LIMIT ? OFFSET ?`
    )
    .all(...params, input.limit, input.offset) as Record<string, unknown>[];

  return { data: rows.map(parseTimelineRow), count };
}

export function getTimelineEventForUser(
  userId: string,
  eventId: string
): Record<string, unknown> | null {
  const sqlite = getSqliteDb();
  const row = sqlite
    .prepare(
      `SELECT * FROM timeline_events WHERE id = ? AND source_id IN (SELECT id FROM sources WHERE user_id = ?)`
    )
    .get(eventId, userId) as Record<string, unknown> | undefined;
  return row ? parseTimelineRow(row) : null;
}
