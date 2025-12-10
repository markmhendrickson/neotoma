/**
 * Event Validator for Event-Sourcing Foundation (FU-050)
 * 
 * Validates events before storage to ensure data integrity.
 */

import { StateEvent, EventType, validateEventSchema } from './event_schema.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_EVENT_TYPES: Set<EventType> = new Set(['RecordCreated', 'RecordUpdated', 'RecordDeleted']);

/**
 * Validates event type exists
 */
export function validateEventType(eventType: string): boolean {
  return VALID_EVENT_TYPES.has(eventType as EventType);
}

/**
 * Validates payload structure matches event type
 */
export function validateEventPayload(eventType: string, payload: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  switch (eventType) {
    case 'RecordCreated':
      if (!payload.id || typeof payload.id !== 'string') {
        errors.push('RecordCreated payload must have id (string)');
      }
      if (!payload.type || typeof payload.type !== 'string') {
        errors.push('RecordCreated payload must have type (string)');
      }
      if (!payload.properties || typeof payload.properties !== 'object') {
        errors.push('RecordCreated payload must have properties (object)');
      }
      if (!payload.created_at || typeof payload.created_at !== 'string') {
        errors.push('RecordCreated payload must have created_at (ISO 8601 string)');
      }
      if (!payload.updated_at || typeof payload.updated_at !== 'string') {
        errors.push('RecordCreated payload must have updated_at (ISO 8601 string)');
      }
      break;

    case 'RecordUpdated':
      if (!payload.id || typeof payload.id !== 'string') {
        errors.push('RecordUpdated payload must have id (string)');
      }
      if (!payload.updated_at || typeof payload.updated_at !== 'string') {
        errors.push('RecordUpdated payload must have updated_at (ISO 8601 string)');
      }
      break;

    case 'RecordDeleted':
      if (!payload.id || typeof payload.id !== 'string') {
        errors.push('RecordDeleted payload must have id (string)');
      }
      if (!payload.deleted_at || typeof payload.deleted_at !== 'string') {
        errors.push('RecordDeleted payload must have deleted_at (ISO 8601 string)');
      }
      break;

    default:
      errors.push(`Unknown event type: ${eventType}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates complete event before storage
 */
export function validateEvent(event: Partial<StateEvent>): ValidationResult {
  const schemaValidation = validateEventSchema(event);

  if (!schemaValidation.valid) {
    return schemaValidation;
  }

  if (!event.event_type) {
    return { valid: false, errors: ['Event type is required'] };
  }

  if (!validateEventType(event.event_type)) {
    return {
      valid: false,
      errors: [`Invalid event type: ${event.event_type}. Valid types: ${Array.from(VALID_EVENT_TYPES).join(', ')}`],
    };
  }

  if (!event.payload) {
    return { valid: false, errors: ['Event payload is required'] };
  }

  const payloadValidation = validateEventPayload(event.event_type, event.payload as Record<string, unknown>);

  return payloadValidation;
}


