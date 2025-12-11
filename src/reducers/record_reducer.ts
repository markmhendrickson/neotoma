/**
 * Record Reducer for Event-Sourcing Foundation (FU-050)
 * 
 * Pure reducer functions for computing record state from events.
 * Reducers are deterministic: same events → same state.
 */

import { StateEvent, RecordCreatedEvent, RecordUpdatedEvent, RecordDeletedEvent } from '../events/event_schema.js';
import type { NeotomaRecord } from '../db.js';

/**
 * Reduce RecordCreated event to initial record state
 */
export function reduceRecordCreated(event: StateEvent): NeotomaRecord {
  if (event.event_type !== 'RecordCreated') {
    throw new Error(`Invalid event type for reduceRecordCreated: ${event.event_type}`);
  }

  const payload = event.payload as RecordCreatedEvent['payload'];

  return {
    id: payload.id,
    type: payload.type,
    properties: payload.properties as Record<string, unknown>,
    file_urls: payload.file_urls || [],
    external_source: payload.external_source ?? null,
    external_id: payload.external_id ?? null,
    external_hash: payload.external_hash ?? null,
    embedding: null,
    summary: null,
    created_at: payload.created_at,
    updated_at: payload.updated_at,
  };
}

/**
 * Reduce RecordUpdated event to updated record state
 */
export function reduceRecordUpdated(event: StateEvent, currentState: NeotomaRecord): NeotomaRecord {
  if (event.event_type !== 'RecordUpdated') {
    throw new Error(`Invalid event type for reduceRecordUpdated: ${event.event_type}`);
  }

  const payload = event.payload as RecordUpdatedEvent['payload'];

  // Merge properties (payload properties override current state)
  const mergedProperties = {
    ...currentState.properties,
    ...(payload.properties || {}),
  };

  return {
    ...currentState,
    properties: mergedProperties,
    file_urls: payload.file_urls !== undefined ? payload.file_urls : currentState.file_urls,
    updated_at: payload.updated_at,
  };
}

/**
 * Reduce RecordDeleted event to deleted record state
 */
export function reduceRecordDeleted(event: StateEvent, currentState: NeotomaRecord): NeotomaRecord {
  if (event.event_type !== 'RecordDeleted') {
    throw new Error(`Invalid event type for reduceRecordDeleted: ${event.event_type}`);
  }

  const payload = event.payload as RecordDeletedEvent['payload'];

  // Mark record as deleted by adding deleted_at to properties
  return {
    ...currentState,
    properties: {
      ...currentState.properties,
      deleted_at: payload.deleted_at,
    },
    updated_at: payload.deleted_at,
  };
}

/**
 * Apply reducer to event and current state
 */
export function applyReducer(event: StateEvent, currentState: NeotomaRecord | null): NeotomaRecord {
  switch (event.event_type) {
    case 'RecordCreated':
      if (currentState !== null) {
        throw new Error('Cannot create record that already exists');
      }
      return reduceRecordCreated(event);

    case 'RecordUpdated':
      if (currentState === null) {
        throw new Error('Cannot update record that does not exist');
      }
      return reduceRecordUpdated(event, currentState);

    case 'RecordDeleted':
      if (currentState === null) {
        throw new Error('Cannot delete record that does not exist');
      }
      return reduceRecordDeleted(event, currentState);

    default:
      throw new Error(`Unknown event type: ${event.event_type}`);
  }
}




