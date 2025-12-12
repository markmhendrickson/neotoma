/**
 * Event Generation Service (FU-102)
 *
 * Deterministic event generation from date fields in records.
 */

import { createHash } from "node:crypto";
import { supabase } from "../db.js";

export interface TimelineEvent {
  id: string;
  event_type: string;
  event_timestamp: string; // ISO 8601
  source_record_id: string;
  source_field: string;
}

/**
 * Generate deterministic event ID
 */
export function generateEventId(
  recordId: string,
  fieldName: string,
  date: string
): string {
  const hash = createHash("sha256")
    .update(`${recordId}:${fieldName}:${date}`)
    .digest("hex");

  return `evt_${hash.substring(0, 24)}`;
}

/**
 * Get date fields for schema type
 */
function getDateFields(schemaType: string): string[] {
  // Schema-specific date field mappings
  const dateFieldMap: Record<string, string[]> = {
    invoice: ["date_issued", "date_due", "date_paid"],
    receipt: ["date", "transaction_date"],
    transaction: ["date", "transaction_date", "posted_date"],
    bank_statement: ["statement_date", "period_start", "period_end"],
    contract: ["date_signed", "effective_date", "expiration_date"],
    travel_document: [
      "departure_datetime",
      "arrival_datetime",
      "check_in_date",
      "check_out_date",
    ],
    identity_document: ["issue_date", "expiration_date", "date_of_birth"],
    contact: ["birthday", "anniversary"],
  };

  return dateFieldMap[schemaType] || [];
}

/**
 * Map field name to event type
 */
function mapFieldToEventType(fieldName: string, schemaType: string): string {
  // Use application types (invoice, travel_document) not schema families
  if (schemaType === "invoice") {
    if (fieldName === "date_issued") return "InvoiceIssued";
    if (fieldName === "date_due") return "InvoiceDue";
    if (fieldName === "date_paid") return "InvoicePaid";
  }

  if (schemaType === "receipt") {
    if (fieldName === "date" || fieldName === "transaction_date")
      return "ReceiptIssued";
  }

  if (schemaType === "transaction") {
    if (fieldName === "date" || fieldName === "transaction_date")
      return "TransactionOccurred";
  }

  if (schemaType === "travel_document") {
    if (fieldName === "departure_datetime") return "FlightDeparture";
    if (fieldName === "arrival_datetime") return "FlightArrival";
    if (fieldName === "check_in_date") return "CheckIn";
    if (fieldName === "check_out_date") return "CheckOut";
  }

  if (schemaType === "contract") {
    if (fieldName === "date_signed") return "ContractSigned";
    if (fieldName === "effective_date") return "ContractEffective";
    if (fieldName === "expiration_date") return "ContractExpired";
  }

  // Generic event type for unknown fields
  const fieldNameCapitalized = fieldName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return `${fieldNameCapitalized}Event`;
}

/**
 * Generate events from record properties
 */
export function generateEvents(
  recordId: string,
  properties: Record<string, unknown>,
  schemaType: string
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const dateFields = getDateFields(schemaType);

  // Sort fields for deterministic order
  for (const fieldName of dateFields.sort()) {
    const dateValue = properties[fieldName];
    if (!dateValue) continue;

    // Ensure date is ISO 8601 string
    let isoDate: string;
    if (typeof dateValue === "string") {
      // Try to parse and normalize
      try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) continue;
        isoDate = date.toISOString();
      } catch {
        continue; // Skip invalid dates
      }
    } else if (dateValue instanceof Date) {
      isoDate = dateValue.toISOString();
    } else {
      continue; // Skip non-date values
    }

    const eventType = mapFieldToEventType(fieldName, schemaType);
    const eventId = generateEventId(recordId, fieldName, isoDate);

    events.push({
      id: eventId,
      event_type: eventType,
      event_timestamp: isoDate,
      source_record_id: recordId,
      source_field: fieldName,
    });
  }

  // Also check for any fields ending in _date, _datetime, _at
  const datePattern = /(_date|_datetime|_at)$/i;
  for (const [fieldName, value] of Object.entries(properties)) {
    if (dateFields.includes(fieldName)) continue; // Already processed

    if (datePattern.test(fieldName) && value) {
      let isoDate: string;
      try {
        if (typeof value === "string") {
          const date = new Date(value);
          if (isNaN(date.getTime())) continue;
          isoDate = date.toISOString();
        } else if (value instanceof Date) {
          isoDate = value.toISOString();
        } else {
          continue;
        }

        const eventType = mapFieldToEventType(fieldName, schemaType);
        const eventId = generateEventId(recordId, fieldName, isoDate);

        events.push({
          id: eventId,
          event_type: eventType,
          event_timestamp: isoDate,
          source_record_id: recordId,
          source_field: fieldName,
        });
      } catch {
        // Skip invalid dates
      }
    }
  }

  // Sort events by timestamp for deterministic order
  return events.sort((a, b) =>
    a.event_timestamp.localeCompare(b.event_timestamp)
  );
}

/**
 * Persist events to database
 */
export async function persistEvents(
  events: TimelineEvent[]
): Promise<TimelineEvent[]> {
  if (events.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const eventsToInsert = events.map((event) => ({
    id: event.id,
    event_type: event.event_type,
    event_timestamp: event.event_timestamp,
    source_record_id: event.source_record_id,
    source_field: event.source_field,
    created_at: now,
  }));

  const { data, error } = await supabase
    .from("timeline_events")
    .upsert(eventsToInsert, { onConflict: "id" })
    .select();

  if (error) {
    console.error("Failed to persist events:", error);
    return events; // Return original events even if persistence fails
  }

  return (data as TimelineEvent[]) || events;
}

/**
 * Get events by record ID
 */
export async function getEventsByRecordId(
  recordId: string
): Promise<TimelineEvent[]> {
  const { data, error } = await supabase
    .from("timeline_events")
    .select("*")
    .eq("source_record_id", recordId)
    .order("event_timestamp", { ascending: true });

  if (error || !data) {
    console.error("Failed to get events by record ID:", error);
    return [];
  }

  return data as TimelineEvent[];
}

/**
 * Get events by entity ID (via record-entity-event edges)
 */
export async function getEventsByEntityId(
  entityId: string
): Promise<TimelineEvent[]> {
  // Query entity_event_edges to find event IDs
  const { data: edges, error: edgesError } = await supabase
    .from("entity_event_edges")
    .select("event_id")
    .eq("entity_id", entityId);

  if (edgesError || !edges || edges.length === 0) {
    return [];
  }

  const eventIds = edges.map((edge) => edge.event_id);

  // Query timeline_events for these event IDs
  const { data: events, error: eventsError } = await supabase
    .from("timeline_events")
    .select("*")
    .in("id", eventIds)
    .order("event_timestamp", { ascending: true });

  if (eventsError || !events) {
    return [];
  }

  return events as TimelineEvent[];
}

/**
 * Generate and persist events (convenience function)
 */
export async function generateAndPersistEvents(
  recordId: string,
  properties: Record<string, unknown>,
  schemaType: string
): Promise<TimelineEvent[]> {
  const events = generateEvents(recordId, properties, schemaType);
  return await persistEvents(events);
}




