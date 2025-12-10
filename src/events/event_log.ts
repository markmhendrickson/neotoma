/**
 * Event Log for Event-Sourcing Foundation (FU-050)
 * 
 * Append-only event log operations for storing and retrieving state events.
 */

import { supabase } from '../db.js';
import { StateEvent } from './event_schema.js';
import { validateEvent } from './event_validator.js';

/**
 * Append event to event log (append-only)
 */
export async function appendEvent(event: Omit<StateEvent, 'created_at'>): Promise<StateEvent> {
  // Validate event before storage
  const validation = validateEvent(event);
  if (!validation.valid) {
    throw new Error(`Event validation failed: ${validation.errors.join(', ')}`);
  }

  const eventWithTimestamp: StateEvent = {
    ...event,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('state_events')
    .insert(eventWithTimestamp)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to append event: ${error.message}`);
  }

  return data as StateEvent;
}

/**
 * Get all events for a record (chronological order)
 */
export async function getEventsByRecordId(recordId: string): Promise<StateEvent[]> {
  const { data, error } = await supabase
    .from('state_events')
    .select('*')
    .eq('record_id', recordId)
    .order('timestamp', { ascending: true });

  if (error) {
    throw new Error(`Failed to get events for record ${recordId}: ${error.message}`);
  }

  return (data || []) as StateEvent[];
}

/**
 * Get events by timestamp range
 */
export async function getEventsByTimestampRange(
  startTimestamp: string,
  endTimestamp: string
): Promise<StateEvent[]> {
  const { data, error } = await supabase
    .from('state_events')
    .select('*')
    .gte('timestamp', startTimestamp)
    .lte('timestamp', endTimestamp)
    .order('timestamp', { ascending: true });

  if (error) {
    throw new Error(`Failed to get events by timestamp range: ${error.message}`);
  }

  return (data || []) as StateEvent[];
}

/**
 * Get all events (for testing/debugging)
 */
export async function getAllEvents(limit?: number): Promise<StateEvent[]> {
  let query = supabase.from('state_events').select('*').order('timestamp', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get events: ${error.message}`);
  }

  return (data || []) as StateEvent[];
}


