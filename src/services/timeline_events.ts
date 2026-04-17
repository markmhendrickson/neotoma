/**
 * Timeline event derivation from entity snapshots.
 * Creates timeline_events rows from date fields in entity snapshots (structured store and interpretation paths).
 */

import { createHash } from "node:crypto";
import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import type { SchemaDefinition } from "./schema_registry.js";

/** Date-like field names that may appear in entity snapshots (order does not matter). */
const DATE_FIELD_NAMES = new Set([
  "start_date",
  "end_date",
  "due_date",
  "invoice_date",
  "date_due",
  "date",
  "income_date",
  "transaction_date",
  "snapshot_date",
  "event_date",
  "date_purchased",
  "created_date",
  "completed_date",
  "started_date",
  "ended_date",
  "flow_date",
  "filed_date",
  "target_date",
  "updated_date",
  "purchase_date",
  "import_date",
]);

/**
 * Snapshot fields that parse as ISO timestamps but are system/provenance noise, not user-facing timeline anchors.
 */
const TIMELINE_SNAPSHOT_FIELD_DENYLIST = new Set([
  "created_at",
  "updated_at",
  "computed_at",
  "deleted_at",
  "observed_at",
  "last_observation_at",
]);

/**
 * Map (entity_type, field_name) to a stable event_type for timeline display.
 * Uses application types; returns GenericEvent when not specified.
 */
function mapFieldToEventType(entityType: string, fieldName: string): string {
  if (entityType === "invoice") {
    if (fieldName === "invoice_date") return "InvoiceIssued";
    if (fieldName === "date_due") return "InvoiceDue";
  }
  if (entityType === "event") {
    if (fieldName === "start_date") return "EventStart";
    if (fieldName === "end_date") return "EventEnd";
  }
  if (entityType === "task") {
    if (fieldName === "start_date") return "TaskStart";
    if (fieldName === "due_date") return "TaskDue";
    if (fieldName === "completed_date") return "TaskCompleted";
  }
  if (entityType === "transaction" && fieldName === "date") return "TransactionDate";
  if (entityType === "income" && fieldName === "income_date") return "IncomeDate";
  if (entityType === "travel_document") {
    if (fieldName === "departure_datetime") return "FlightDeparture";
    if (fieldName === "arrival_datetime") return "FlightArrival";
  }
  const capitalized = fieldName.replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
  return `${capitalized}`;
}

/**
 * Strings that look like dates. Used to reject arbitrary strings that
 * `new Date(...)` happens to accept (e.g. "1.0", "unknown", URLs), which would
 * otherwise create spurious timeline events. Each pattern must match the whole
 * trimmed string.
 *
 * Covers: ISO 8601 dates and datetimes (with optional time and offset),
 * RFC 2822, US/EU slash-separated dates, textual month forms.
 */
const DATE_LIKE_SHAPES: RegExp[] = [
  // ISO date or datetime: 2024-01-15 or 2024-01-15T10:30:00Z or 2024-01-15 10:30:00
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
  // Slash-separated: 01/15/2024, 15/01/2024, 2024/01/15
  /^\d{1,4}\/\d{1,2}\/\d{1,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?$/i,
  // Dot-separated date: 15.01.2024
  /^\d{1,2}\.\d{1,2}\.\d{4}$/,
  // Textual month: "Jan 15, 2024", "15 Jan 2024", "January 15, 2024"
  /^(?:\d{1,2}\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/i,
  /^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}$/i,
  // RFC 2822: "Mon, 15 Jan 2024 10:30:00 GMT"
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+[A-Z]+$/,
  // Year-only: reject; too ambiguous to anchor a timeline event on.
];

/**
 * Normalize a value to an ISO date string for event_timestamp, or null if not a valid date.
 *
 * Strict: strings must match a known date-shape regex before being parsed with
 * `new Date(...)`. This prevents arbitrary strings like "1.0", "usd", "unknown",
 * or free-text descriptions from producing spurious timeline events.
 */
export function toISODate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Shape-gate: reject strings that don't look like dates, even if
    // `new Date(...)` would accept them.
    if (!DATE_LIKE_SHAPES.some((re) => re.test(trimmed))) return null;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = value;
    // Reject small integers/floats (amounts, counts, scores) that are not epoch times.
    let ms: number;
    if (n >= 946684800000 && n < 1e15) ms = n;
    else if (n >= 946684800 && n < 4102444800) ms = n * 1000;
    else return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export interface TimelineEventRow {
  id: string;
  event_type: string;
  event_timestamp: string;
  source_id: string;
  source_field: string;
  entity_id: string | null;
  created_at: string;
  user_id: string;
}

/**
 * Generate a deterministic timeline event id from (source_id, entity_id, source_field, event_timestamp).
 * Returns a UUID-format string (8-4-4-4-12) for compatibility with timeline_events.id (UUID).
 */
export function generateTimelineEventId(
  sourceId: string,
  entityId: string,
  sourceField: string,
  eventTimestamp: string
): string {
  const payload = `${sourceId}:${entityId}:${sourceField}:${eventTimestamp}`;
  const hash = createHash("sha256").update(payload).digest("hex");
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

/**
 * From a record of unknown (e.g. non-schema) fields, return only those that are date-like:
 * key is a known date field name, or value parses as a date (see toISODate).
 * Used for timeline derivation and for merging unknown date-like keys into observations.
 */
export function getDateLikeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    const isKnownDateKey = DATE_FIELD_NAMES.has(key);
    const parsesAsDate = toISODate(value) !== null;
    if (isKnownDateKey || parsesAsDate) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Build an allow-set of temporal field names from a schema definition.
 * Returns null when the schema does not declare temporal_fields, signaling
 * to callers that the legacy heuristic (DATE_FIELD_NAMES / parses-as-date)
 * should be used.
 */
function schemaTemporalFieldAllowlist(
  schema?: Pick<SchemaDefinition, "temporal_fields"> | null,
): Map<string, string | undefined> | null {
  if (!schema?.temporal_fields || schema.temporal_fields.length === 0) {
    return null;
  }
  const out = new Map<string, string | undefined>();
  for (const entry of schema.temporal_fields) {
    if (entry?.field) out.set(entry.field, entry.event_type);
  }
  return out.size > 0 ? out : null;
}

/**
 * Derive timeline events from an entity snapshot.
 *
 * Precedence:
 * - When `schema.temporal_fields` is declared, only those fields emit timeline
 *   events, and their declared `event_type` (if any) is used.
 * - Otherwise, fall back to the heuristic: DATE_FIELD_NAMES or any top-level
 *   value that parses as a date (excluding TIMELINE_SNAPSHOT_FIELD_DENYLIST).
 */
export function deriveTimelineEventsFromSnapshot(
  entityType: string,
  entityId: string,
  sourceId: string,
  userId: string,
  snapshot: Record<string, unknown>,
  schema?: Pick<SchemaDefinition, "temporal_fields"> | null,
): TimelineEventRow[] {
  const rows: TimelineEventRow[] = [];
  const now = new Date().toISOString();
  const allow = schemaTemporalFieldAllowlist(schema);

  const candidateEntries: Array<[string, unknown, string | undefined]> = [];
  if (allow) {
    for (const [field, declaredEventType] of allow.entries()) {
      if (!(field in snapshot)) continue;
      candidateEntries.push([field, snapshot[field], declaredEventType]);
    }
  } else {
    const dateLike = getDateLikeFields(snapshot);
    for (const [fieldName, value] of Object.entries(dateLike)) {
      candidateEntries.push([fieldName, value, undefined]);
    }
  }

  for (const [fieldName, value, declaredEventType] of candidateEntries) {
    if (TIMELINE_SNAPSHOT_FIELD_DENYLIST.has(fieldName)) continue;
    const eventTimestamp = toISODate(value);
    if (!eventTimestamp) continue;

    const eventType =
      declaredEventType ?? mapFieldToEventType(entityType, fieldName);
    const id = generateTimelineEventId(sourceId, entityId, fieldName, eventTimestamp);

    rows.push({
      id,
      event_type: eventType,
      event_timestamp: eventTimestamp,
      source_id: sourceId,
      source_field: fieldName,
      entity_id: entityId,
      created_at: now,
      user_id: userId,
    });
  }

  return rows;
}

/**
 * Derive additional timeline events from raw_fragments (date-like keys not already in snapshot).
 *
 * When `schema.temporal_fields` is declared, only those fields are considered;
 * otherwise the legacy heuristic (DATE_FIELD_NAMES / parses-as-date) applies.
 * Use when there is exactly one entity of this type in the source so fragments
 * can be attributed.
 */
export function deriveTimelineEventsFromRawFragments(
  rawFragments: Array<{ fragment_key: string; fragment_value: unknown }>,
  entityType: string,
  entityId: string,
  sourceId: string,
  userId: string,
  snapshotFieldKeys: Set<string>,
  schema?: Pick<SchemaDefinition, "temporal_fields"> | null,
): TimelineEventRow[] {
  const rows: TimelineEventRow[] = [];
  const now = new Date().toISOString();
  const allow = schemaTemporalFieldAllowlist(schema);

  for (const { fragment_key: fieldName, fragment_value: value } of rawFragments) {
    if (snapshotFieldKeys.has(fieldName)) continue;
    if (allow) {
      if (!allow.has(fieldName)) continue;
    } else if (!DATE_FIELD_NAMES.has(fieldName) && toISODate(value) === null) {
      continue;
    }
    const eventTimestamp = toISODate(value);
    if (!eventTimestamp) continue;

    const eventType =
      allow?.get(fieldName) ?? mapFieldToEventType(entityType, fieldName);
    const id = generateTimelineEventId(sourceId, entityId, fieldName, eventTimestamp);

    rows.push({
      id,
      event_type: eventType,
      event_timestamp: eventTimestamp,
      source_id: sourceId,
      source_field: fieldName,
      entity_id: entityId,
      created_at: now,
      user_id: userId,
    });
  }

  return rows;
}

export interface UpsertTimelineEventsForSnapshotParams {
  entityType: string;
  entityId: string;
  sourceId: string;
  userId: string;
  snapshot: Record<string, unknown>;
  /**
   * When exactly 1, also derive from raw_fragments for this source_id + entity_type (matches structured store).
   * Use &gt;1 when multiple entities of the same type share one source in the same batch (avoids mis-attribution).
   */
  sameTypeInSourceBatch: number;
  /**
   * Optional schema definition. When `temporal_fields` is declared, timeline
   * emission is restricted to those fields (schema-driven). When absent, falls
   * back to the legacy date-like-field heuristic.
   */
  schema?: Pick<SchemaDefinition, "temporal_fields"> | null;
}

/**
 * Derive timeline rows from snapshot (and optionally raw_fragments) and upsert into timeline_events.
 * Shared by structured store, interpretation, and snapshot recomputation.
 */
export async function upsertTimelineEventsForEntitySnapshot(
  params: UpsertTimelineEventsForSnapshotParams
): Promise<void> {
  const {
    entityType,
    entityId,
    sourceId,
    userId,
    snapshot,
    sameTypeInSourceBatch,
    schema,
  } = params;
  const snapshotFields = snapshot || {};
  let timelineRows = deriveTimelineEventsFromSnapshot(
    entityType,
    entityId,
    sourceId,
    userId,
    snapshotFields,
    schema,
  );

  if (sameTypeInSourceBatch === 1 && sourceId) {
    const { data: fragments, error: fragError } = await db
      .from("raw_fragments")
      .select("fragment_key, fragment_value")
      .eq("source_id", sourceId)
      .eq("entity_type", entityType)
      .eq("user_id", userId);
    if (fragError) {
      logger.warn(`upsertTimelineEventsForEntitySnapshot: raw_fragments read failed: ${fragError.message}`);
    } else if (fragments && fragments.length > 0) {
      const snapshotKeys = new Set(Object.keys(snapshotFields));
      const fromFragments = deriveTimelineEventsFromRawFragments(
        fragments,
        entityType,
        entityId,
        sourceId,
        userId,
        snapshotKeys,
        schema,
      );
      timelineRows = timelineRows.concat(fromFragments);
    }
  }

  for (const row of timelineRows) {
    const { error: evtError } = await db.from("timeline_events").upsert(
      {
        id: row.id,
        event_type: row.event_type,
        event_timestamp: row.event_timestamp,
        source_id: row.source_id,
        source_field: row.source_field,
        entity_id: row.entity_id,
        created_at: row.created_at,
        user_id: row.user_id,
      },
      { onConflict: "id" }
    );
    if (evtError) {
      logger.warn(`Failed to upsert timeline event ${row.id}:`, evtError.message);
    }
  }
}
