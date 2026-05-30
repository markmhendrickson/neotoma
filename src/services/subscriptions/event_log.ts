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
 */
export function getEventsAfterSeq(userId: string, afterSeq: number, limit = 1000): DurableEvent[] {
  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT seq, payload FROM substrate_events
       WHERE user_id = ? AND seq > ?
       ORDER BY seq ASC
       LIMIT ?`
    )
    .all(userId, afterSeq, limit) as Array<{ seq: number; payload: string }>;
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
 * True when the durable log still holds an event at or before `seq` for the
 * user — i.e. the requested cursor is within the retained window and resume is
 * gap-free. False when the cursor predates the oldest retained event (a real
 * gap that requires reconciliation).
 */
export function hasDurableCursor(userId: string, seq: number): boolean {
  const db = getSqliteDb();
  const row = db
    .prepare(`SELECT MIN(seq) AS min_seq FROM substrate_events WHERE user_id = ?`)
    .get(userId) as { min_seq: number | null } | undefined;
  if (!row || row.min_seq === null) return false;
  return seq >= row.min_seq;
}

/**
 * Delete events older than the retention window. Returns the number of rows
 * pruned. `nowMs` is injectable for deterministic tests.
 */
export function pruneEventLog(retentionDays = EVENT_RETENTION_DAYS, nowMs?: number): number {
  const db = getSqliteDb();
  const cutoffMs = (nowMs ?? Date.now()) - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const info = db
    .prepare(`DELETE FROM substrate_events WHERE created_at < ?`)
    .run(cutoffIso);
  return Number(info.changes ?? 0);
}
