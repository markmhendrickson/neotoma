/**
 * Timeline event derivation from entity snapshots.
 * Creates timeline_events rows from date fields in entity snapshots (structured store and interpretation paths).
 */

import { createHash } from "node:crypto";

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
 * Normalize a value to an ISO date string for event_timestamp, or null if not a valid date.
 */
export function toISODate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
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
 * Derive timeline events from an entity snapshot.
 * Scans snapshot for known date fields and returns one event per (field, date) with deterministic ids.
 */
export function deriveTimelineEventsFromSnapshot(
  entityType: string,
  entityId: string,
  sourceId: string,
  userId: string,
  snapshot: Record<string, unknown>
): TimelineEventRow[] {
  const rows: TimelineEventRow[] = [];
  const now = new Date().toISOString();

  for (const [fieldName, value] of Object.entries(snapshot)) {
    if (!DATE_FIELD_NAMES.has(fieldName)) continue;
    const eventTimestamp = toISODate(value);
    if (!eventTimestamp) continue;

    const eventType = mapFieldToEventType(entityType, fieldName);
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
 * Use when there is exactly one entity of this type in the source so fragments can be attributed.
 */
export function deriveTimelineEventsFromRawFragments(
  rawFragments: Array<{ fragment_key: string; fragment_value: unknown }>,
  entityType: string,
  entityId: string,
  sourceId: string,
  userId: string,
  snapshotFieldKeys: Set<string>
): TimelineEventRow[] {
  const rows: TimelineEventRow[] = [];
  const now = new Date().toISOString();

  for (const { fragment_key: fieldName, fragment_value: value } of rawFragments) {
    if (snapshotFieldKeys.has(fieldName)) continue;
    if (!DATE_FIELD_NAMES.has(fieldName) && toISODate(value) === null) continue;
    const eventTimestamp = toISODate(value);
    if (!eventTimestamp) continue;

    const eventType = mapFieldToEventType(entityType, fieldName);
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
 * From a record of unknown (e.g. non-schema) fields, return only those that are date-like:
 * key is a known date field name, or value parses as a date.
 * Used so observations can carry date-like unknowns into the snapshot for timeline derivation
 * even when those fields are not yet in the entity schema.
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
