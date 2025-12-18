/**
 * Database EventRepository implementation (FU-051)
 *
 * DB-based event repository using Supabase.
 */

import { supabase } from "../../db.js";
import { StateEvent } from "../../events/event_schema.js";
import { validateEvent } from "../../events/event_validator.js";
import type { EventRepository } from "../interfaces.js";

export class DbEventRepository implements EventRepository {
  async appendEvent(
    event: Omit<StateEvent, "created_at">,
  ): Promise<StateEvent> {
    // Validate event before storage
    const validation = validateEvent(event);
    if (!validation.valid) {
      throw new Error(
        `Event validation failed: ${validation.errors.join(", ")}`,
      );
    }

    const eventWithTimestamp: StateEvent = {
      ...event,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("state_events")
      .insert(eventWithTimestamp)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to append event: ${error.message}`);
    }

    return data as StateEvent;
  }

  async getEventsByRecordId(recordId: string): Promise<StateEvent[]> {
    const { data, error } = await supabase
      .from("state_events")
      .select("*")
      .eq("record_id", recordId)
      .order("timestamp", { ascending: true });

    if (error) {
      throw new Error(
        `Failed to get events for record ${recordId}: ${error.message}`,
      );
    }

    return (data || []) as StateEvent[];
  }

  async getEventsByTimestampRange(
    startTimestamp: string,
    endTimestamp: string,
  ): Promise<StateEvent[]> {
    const { data, error } = await supabase
      .from("state_events")
      .select("*")
      .gte("timestamp", startTimestamp)
      .lte("timestamp", endTimestamp)
      .order("timestamp", { ascending: true });

    if (error) {
      throw new Error(
        `Failed to get events by timestamp range: ${error.message}`,
      );
    }

    return (data || []) as StateEvent[];
  }

  async getAllEvents(limit?: number): Promise<StateEvent[]> {
    let query = supabase
      .from("state_events")
      .select("*")
      .order("timestamp", { ascending: true });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get events: ${error.message}`);
    }

    return (data || []) as StateEvent[];
  }
}
