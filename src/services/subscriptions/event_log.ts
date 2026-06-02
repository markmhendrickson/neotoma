/**
 * Durable substrate-event log (#1464 Tier 2).
 *
 * The in-memory SSE ring (`sse_hub.ts`) gives fast, gap-free resume within a
 * bounded window, but it does not survive a server restart or a gap larger than
 * the buffer. This module persists every emitted SubstrateEvent to the
 * `substrate_events` table so resume can fall back to durable storage when the
 * cursor has left the ring.
 *
 * Writes are synchronous (in the same path as the ring push) so an event is
 * durable as soon as it is emitted. The log is pruned to a rolling retention
 * window (NEOTOMA_EVENT_RETENTION_DAYS, default 7).
 */

import { getSqliteDb } from "../../repositories/sqlite/sqlite_client.js";
import { logger } from "../../utils/logger.js";
import type { SubstrateEvent } from "../../events/types.js";

export const EVENT_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.NEOTOMA_EVENT_RETENTION_DAYS ?? "7", 10) || 7
);

export interface DurableEvent {
  seq: number;
  event: SubstrateEvent;
}

/**
 * SQL-pushable narrowing for a durable read. Only the columns the durable log
 * materializes (`event_type`, `entity_id`) are pushed down; richer predicates
 * (e.g. `entity_type`, which lives in the JSON payload) remain the caller's
 * responsibility in JS. Narrowing is an optimization: it reduces rows scanned
 * for a narrow subscription, never changes which events ultimately match.
 */
export interface DurableEventFilter {
  /** Restrict to these event types (column `event_type`). Empty/undefined = no restriction. */
  eventTypes?: readonly string[];
  /** Restrict to these entity ids (column `entity_id`). Empty/undefined = no restriction. */
  entityIds?: readonly string[];
}

/**
 * Persist a substrate event to the durable log. Synchronous: returns the
 * assigned durable `seq` (monotonic, distinct from the in-memory ring id).
 * `nowIso` is injectable for deterministic tests; defaults to wall clock.
 */
export function persistSubstrateEvent(
  event: SubstrateEvent,
  ringId: string | null,
  nowIso?: string
): number {
  const db = getSqliteDb();
  const createdAt = nowIso ?? new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO substrate_events (ring_id, event_type, user_id, entity_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      ringId,
      event.event_type,
      event.user_id ?? null,
      event.entity_id ?? null,
      JSON.stringify(event),
      createdAt
    );
  return Number(info.lastInsertRowid);
}

/**
 * Read durable events strictly after `afterSeq` for a user, oldest first.
 * Used as the resume fallback when the requested cursor is no longer in the
 * in-memory ring. `limit` bounds a single read.
 *
 * `filter` pushes the subscription's column-backed predicates (`event_type`,
 * `entity_id`) into SQL so a narrow subscription does not scan the whole user
 * log. It is purely an optimization — payload-only predicates (e.g.
 * `entity_type`) MUST still be applied by the caller — and never widens the
 * result set.
 */
export function getEventsAfterSeq(
  userId: string,
  afterSeq: number,
  limit = 1000,
  filter?: DurableEventFilter
): DurableEvent[] {
  const db = getSqliteDb();
  const clauses: string[] = ["user_id = ?", "seq > ?"];
  const params: Array<string | number> = [userId, afterSeq];

  const eventTypes = filter?.eventTypes?.filter((t) => typeof t === "string" && t.length > 0);
  if (eventTypes && eventTypes.length > 0) {
    clauses.push(`event_type IN (${eventTypes.map(() => "?").join(", ")})`);
    params.push(...eventTypes);
  }

  const entityIds = filter?.entityIds?.filter((i) => typeof i === "string" && i.length > 0);
  if (entityIds && entityIds.length > 0) {
    clauses.push(`entity_id IN (${entityIds.map(() => "?").join(", ")})`);
    params.push(...entityIds);
  }

  params.push(limit);
  const rows = db
    .prepare(
      `SELECT seq, payload FROM substrate_events
       WHERE ${clauses.join(" AND ")}
       ORDER BY seq ASC
       LIMIT ?`
    )
    .all(...params) as Array<{ seq: number; payload: string }>;
  const out: DurableEvent[] = [];
  for (const row of rows) {
    try {
      out.push({ seq: row.seq, event: JSON.parse(row.payload) as SubstrateEvent });
    } catch {
      // Skip a corrupt payload rather than fail the whole resume.
      logger.warn("[event_log] skipping unparseable durable event", { seq: row.seq });
    }
  }
  return out;
}

/**
 * True when the durable log can replay everything strictly after `seq` for the
 * user without a gap — i.e. the cursor sits inside the retained window.
 *
 * The cursor is recoverable only when it falls in `[min_seq - 1, max_seq]`:
 *  - below `min_seq - 1` → the cursor predates the oldest retained event, so
 *    events between the cursor and the window were pruned (a real gap requiring
 *    reconciliation);
 *  - above `max_seq` → the cursor is newer than anything durable (a ring-only
 *    id, or a future/foreign seq). Treating it as durably-recoverable would
 *    enter the replay loop, read zero rows, and silently deliver nothing; it
 *    MUST fall through to the ring instead. This is the quiet-user / ahead-of-
 *    head false-positive the upper bound closes.
 *
 * Returns false for a user with no durable events (nothing to recover from).
 */
export function hasDurableCursor(userId: string, seq: number): boolean {
  const db = getSqliteDb();
  const row = db
    .prepare(
      `SELECT MIN(seq) AS min_seq, MAX(seq) AS max_seq FROM substrate_events WHERE user_id = ?`
    )
    .get(userId) as { min_seq: number | null; max_seq: number | null } | undefined;
  if (!row || row.min_seq === null || row.max_seq === null) return false;
  // `seq` is the last delivered cursor; replay covers (seq, max]. The cursor is
  // recoverable when at least one retained event is strictly newer than it
  // (seq < max) and no retained event was skipped below it (seq >= min - 1).
  return seq >= row.min_seq - 1 && seq <= row.max_seq;
}

/**
 * Delete events older than the retention window. Returns the number of rows
 * pruned. `nowMs` is injectable for deterministic tests.
 */
export function pruneEventLog(retentionDays = EVENT_RETENTION_DAYS, nowMs?: number): number {
  const db = getSqliteDb();
  const cutoffMs = (nowMs ?? Date.now()) - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const info = db.prepare(`DELETE FROM substrate_events WHERE created_at < ?`).run(cutoffIso);
  return Number(info.changes ?? 0);
}
