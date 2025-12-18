/**
 * Event Emitter for Event-Sourcing Foundation (FU-050)
 *
 * Helper functions for emitting events from MCP actions.
 */

import { randomUUID } from "node:crypto";
import { appendEvent } from "./event_log.js";
import {
  StateEvent,
  RecordCreatedEvent,
  RecordUpdatedEvent,
  RecordDeletedEvent,
} from "./event_schema.js";
import type { NeotomaRecord } from "../db.js";

/**
 * Emit RecordCreated event
 */
export async function emitRecordCreated(
  record: NeotomaRecord,
): Promise<StateEvent> {
  const now = new Date().toISOString();
  const eventId = randomUUID();

  const event: Omit<StateEvent, "created_at"> = {
    id: eventId,
    event_type: "RecordCreated",
    payload: {
      id: record.id,
      type: record.type,
      properties: record.properties,
      file_urls: record.file_urls,
      external_source: record.external_source,
      external_id: record.external_id,
      external_hash: record.external_hash,
      created_at: record.created_at,
      updated_at: record.updated_at,
    },
    timestamp: now,
    record_id: record.id,
    reducer_version: "1.0",
    previous_event_hash: null,
    event_hash: null,
    signer_public_key: null,
    signature: null,
  };

  return appendEvent(event);
}

/**
 * Emit RecordUpdated event
 */
export async function emitRecordUpdated(
  recordId: string,
  updates: {
    properties?: Record<string, unknown>;
    file_urls?: string[];
    updated_at: string;
  },
): Promise<StateEvent> {
  const eventId = randomUUID();

  const event: Omit<StateEvent, "created_at"> = {
    id: eventId,
    event_type: "RecordUpdated",
    payload: {
      id: recordId,
      properties: updates.properties,
      file_urls: updates.file_urls,
      updated_at: updates.updated_at,
    },
    timestamp: updates.updated_at,
    record_id: recordId,
    reducer_version: "1.0",
    previous_event_hash: null,
    event_hash: null,
    signer_public_key: null,
    signature: null,
  };

  return appendEvent(event);
}

/**
 * Emit RecordDeleted event
 */
export async function emitRecordDeleted(recordId: string): Promise<StateEvent> {
  const now = new Date().toISOString();
  const eventId = randomUUID();

  const event: Omit<StateEvent, "created_at"> = {
    id: eventId,
    event_type: "RecordDeleted",
    payload: {
      id: recordId,
      deleted_at: now,
    },
    timestamp: now,
    record_id: recordId,
    reducer_version: "1.0",
    previous_event_hash: null,
    event_hash: null,
    signer_public_key: null,
    signature: null,
  };

  return appendEvent(event);
}
