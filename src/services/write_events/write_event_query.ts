/**
 * Query the durable write record (write events, #2508 lane 6).
 *
 * Reads `substrate_events` — the durable log every write already lands in —
 * and returns one {@link WriteEventRecord} per event, including the
 * server-side write context (operation, actor, turn) that the delivery paths
 * strip. Service-level only: no MCP tool or REST route exposes this yet (see
 * docs/subsystems/write_events.md, "Read surface", for why that is a separate
 * change).
 *
 * Filtering by turn or conversation happens in JS after the payload is read,
 * because the payload may be encrypted at rest and the table has no turn
 * column (adding one is a schema migration, deliberately out of this change).
 * The SQL narrows by user, time window and, when given, entity id — the
 * columns the table already indexes — and a scan cap bounds the work.
 */

import { getDb } from "../../repositories/db/connection.js";
import { logger } from "../../utils/logger.js";
import type {
  SubstrateEvent,
  SubstrateEventType,
  WriteEventActor,
  WriteOperation,
} from "../../events/types.js";
import { maybeDecryptPayload } from "../subscriptions/event_log.js";
import { writeOperationForEventType } from "./write_context.js";

export interface WriteEventRecord {
  /** Durable log sequence number (monotonic per instance). */
  seq: number;
  event_id: string;
  event_type: SubstrateEventType;
  operation: WriteOperation;
  occurred_at: string;
  entity_id: string;
  entity_type: string;
  observation_id?: string;
  relationship_type?: string;
  source_entity_id?: string;
  target_entity_id?: string;
  /** Field names only, never values. */
  fields_changed?: string[];
  actor: WriteEventActor;
  conversation_id?: string;
  turn_key?: string;
  turn_source?: "header" | "mcp_meta";
  /** Set when the write replayed from a sync peer. */
  source_peer_id?: string;
}

export interface ListWriteEventsFilter {
  userId: string;
  /** Inclusive lower bound on the time the event was logged (ISO 8601). */
  since?: string;
  /** Inclusive upper bound on the time the event was logged (ISO 8601). */
  until?: string;
  turnKey?: string;
  conversationId?: string;
  entityId?: string;
  /**
   * Drop the per-observation `observation.created` rows, which duplicate the
   * entity-level created/updated/corrected row of the same write. Default true.
   */
  entityLevelOnly?: boolean;
  /** Maximum records returned. Default 200, capped at 1000. */
  limit?: number;
  /** Maximum log rows scanned. Default 5000, capped at 20000. */
  scanLimit?: number;
}

export interface ListWriteEventsResult {
  write_events: WriteEventRecord[];
  count: number;
  /**
   * True when the scan cap was reached before the window was exhausted, so
   * older matching events may exist. Narrow `since`/`until` to see them.
   */
  truncated: boolean;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const DEFAULT_SCAN_LIMIT = 5000;
const MAX_SCAN_LIMIT = 20000;

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

/** Shape one durable event as a write-event record. */
export function toWriteEventRecord(seq: number, event: SubstrateEvent): WriteEventRecord {
  const ctx = event.write_context;
  const record: WriteEventRecord = {
    seq,
    event_id: event.event_id,
    event_type: event.event_type,
    // Events logged before write context existed still get an operation.
    operation: ctx?.operation ?? writeOperationForEventType(event.event_type),
    occurred_at: event.timestamp,
    entity_id: event.entity_id,
    entity_type: event.entity_type,
    actor:
      ctx?.actor ?? (event.agent_thumbprint ? { agent_thumbprint: event.agent_thumbprint } : {}),
  };
  if (event.observation_id) record.observation_id = event.observation_id;
  if (event.relationship_type) record.relationship_type = event.relationship_type;
  if (event.source_entity_id) record.source_entity_id = event.source_entity_id;
  if (event.target_entity_id) record.target_entity_id = event.target_entity_id;
  if (event.fields_changed) record.fields_changed = event.fields_changed;
  if (ctx?.conversation_id) record.conversation_id = ctx.conversation_id;
  if (ctx?.turn_key) record.turn_key = ctx.turn_key;
  if (ctx?.turn_source) record.turn_source = ctx.turn_source;
  if (event.source_peer_id) record.source_peer_id = event.source_peer_id;
  return record;
}

/**
 * List write events for one user, newest first.
 */
export async function listWriteEvents(
  filter: ListWriteEventsFilter
): Promise<ListWriteEventsResult> {
  const limit = clamp(filter.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const scanLimit = clamp(filter.scanLimit, DEFAULT_SCAN_LIMIT, MAX_SCAN_LIMIT);
  const entityLevelOnly = filter.entityLevelOnly !== false;

  const clauses: string[] = ["user_id = ?"];
  const params: Array<string | number> = [filter.userId];
  if (filter.since) {
    clauses.push("created_at >= ?");
    params.push(filter.since);
  }
  if (filter.until) {
    clauses.push("created_at <= ?");
    params.push(filter.until);
  }
  if (filter.entityId) {
    clauses.push("entity_id = ?");
    params.push(filter.entityId);
  }
  if (entityLevelOnly) {
    clauses.push("event_type <> ?");
    params.push("observation.created");
  }
  params.push(scanLimit);

  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT seq, payload FROM substrate_events
       WHERE ${clauses.join(" AND ")}
       ORDER BY seq DESC
       LIMIT ?`
    )
    .all(...params)) as Array<{ seq: number; payload: string }>;

  const out: WriteEventRecord[] = [];
  for (const row of rows) {
    let event: SubstrateEvent;
    try {
      event = JSON.parse(maybeDecryptPayload(row.payload)) as SubstrateEvent;
    } catch {
      logger.warn("[write_events] skipping unreadable durable event", { seq: row.seq });
      continue;
    }
    const ctx = event.write_context;
    if (filter.turnKey && ctx?.turn_key !== filter.turnKey) continue;
    if (filter.conversationId && ctx?.conversation_id !== filter.conversationId) continue;
    out.push(toWriteEventRecord(row.seq, event));
    if (out.length >= limit) break;
  }

  return {
    write_events: out,
    count: out.length,
    truncated: rows.length >= scanLimit && out.length < limit,
  };
}
