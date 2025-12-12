/**
 * Event Schema for Event-Sourcing Foundation (FU-050)
 * 
 * Defines canonical event schema with crypto/hash fields for blockchain-ready architecture.
 */

export interface StateEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  timestamp: string; // ISO 8601 timestamp
  record_id?: string | null;
  previous_event_hash?: string | null;
  event_hash?: string | null;
  signer_public_key?: string | null;
  signature?: string | null;
  reducer_version: string;
  created_at: string;
}

export type EventType = 'RecordCreated' | 'RecordUpdated' | 'RecordDeleted';

export interface RecordCreatedEvent {
  event_type: 'RecordCreated';
  payload: {
    id: string;
    type: string;
    properties: Record<string, unknown>;
    file_urls?: string[];
    external_source?: string | null;
    external_id?: string | null;
    external_hash?: string | null;
    created_at: string;
    updated_at: string;
  };
}

export interface RecordUpdatedEvent {
  event_type: 'RecordUpdated';
  payload: {
    id: string;
    properties?: Record<string, unknown>;
    file_urls?: string[];
    updated_at: string;
  };
}

export interface RecordDeletedEvent {
  event_type: 'RecordDeleted';
  payload: {
    id: string;
    deleted_at: string;
  };
}

export type RecordEventPayload = RecordCreatedEvent | RecordUpdatedEvent | RecordDeletedEvent;

/**
 * Validates event schema structure
 */
export function validateEventSchema(event: Partial<StateEvent>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!event.id || typeof event.id !== 'string') {
    errors.push('Event id is required and must be a string');
  }

  if (!event.event_type || typeof event.event_type !== 'string') {
    errors.push('Event type is required and must be a string');
  }

  if (!event.payload || typeof event.payload !== 'object') {
    errors.push('Event payload is required and must be an object');
  }

  if (!event.timestamp || typeof event.timestamp !== 'string') {
    errors.push('Event timestamp is required and must be an ISO 8601 string');
  }

  if (!event.reducer_version || typeof event.reducer_version !== 'string') {
    errors.push('Event reducer_version is required and must be a string');
  }

  // Validate timestamp format (ISO 8601)
  if (event.timestamp) {
    try {
      const date = new Date(event.timestamp);
      if (isNaN(date.getTime())) {
        errors.push('Event timestamp must be a valid ISO 8601 date string');
      }
    } catch {
      errors.push('Event timestamp must be a valid ISO 8601 date string');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}







