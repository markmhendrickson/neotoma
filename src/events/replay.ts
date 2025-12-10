/**
 * Event Replay for Event-Sourcing Foundation (FU-050)
 * 
 * Historical replay functionality to reconstruct state from events.
 */

import { getEventsByRecordId, getEventsByTimestampRange } from './event_log.js';
import { StateEvent } from './event_schema.js';
import { applyVersionedReducer } from '../reducers/reducer_registry.js';
import type { NeotomaRecord } from '../db.js';

/**
 * Replay events to reconstruct state
 * 
 * @param recordId - Record ID to replay events for
 * @param upToTimestamp - Optional timestamp to replay up to (exclusive)
 * @returns Reconstructed record state, or null if record doesn't exist
 */
export async function replayEvents(
  recordId: string,
  upToTimestamp?: string
): Promise<NeotomaRecord | null> {
  let events: StateEvent[];

  if (upToTimestamp) {
    // Get events up to timestamp
    const allEvents = await getEventsByRecordId(recordId);
    events = allEvents.filter((e) => e.timestamp < upToTimestamp);
  } else {
    // Get all events
    events = await getEventsByRecordId(recordId);
  }

  if (events.length === 0) {
    return null;
  }

  // Replay events in chronological order (using version-aware reducers)
  let state: NeotomaRecord | null = null;

  for (const event of events) {
    state = applyVersionedReducer(event, state);
  }

  return state;
}

/**
 * Get record state at specific timestamp
 * 
 * @param recordId - Record ID
 * @param timestamp - ISO 8601 timestamp
 * @returns Record state at timestamp, or null if record doesn't exist at that time
 */
export async function getRecordAtTimestamp(
  recordId: string,
  timestamp: string
): Promise<NeotomaRecord | null> {
  // Validate timestamp
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp format: ${timestamp}. Must be ISO 8601.`);
  }

  return replayEvents(recordId, timestamp);
}

/**
 * Replay events for multiple records
 */
export async function replayEventsForRecords(
  recordIds: string[],
  upToTimestamp?: string
): Promise<Map<string, NeotomaRecord | null>> {
  const results = new Map<string, NeotomaRecord | null>();

  for (const recordId of recordIds) {
    const state = await replayEvents(recordId, upToTimestamp);
    results.set(recordId, state);
  }

  return results;
}

