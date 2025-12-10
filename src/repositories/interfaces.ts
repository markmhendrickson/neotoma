/**
 * Repository Interfaces for Repository Abstractions (FU-051)
 *
 * Defines repository interfaces to isolate domain logic from storage implementations.
 * Enables multi-backend support (file, DB, blockchain) for future decentralization.
 */

import { StateEvent } from "../events/event_schema.js";
import type { NeotomaRecord } from "../db.js";

/**
 * EventRepository interface for event log operations
 */
export interface EventRepository {
  /**
   * Append event to event log (append-only)
   */
  appendEvent(event: Omit<StateEvent, "created_at">): Promise<StateEvent>;

  /**
   * Get all events for a record (chronological order)
   */
  getEventsByRecordId(recordId: string): Promise<StateEvent[]>;

  /**
   * Get events by timestamp range
   */
  getEventsByTimestampRange(
    startTimestamp: string,
    endTimestamp: string
  ): Promise<StateEvent[]>;

  /**
   * Get all events (for testing/debugging)
   */
  getAllEvents(limit?: number): Promise<StateEvent[]>;
}

/**
 * StateRepository interface for state operations
 */
export interface StateRepository {
  /**
   * Get current state for a record
   */
  getState(recordId: string): Promise<NeotomaRecord | null>;

  /**
   * Get state at specific timestamp (requires event replay)
   */
  getStateAtTimestamp(
    recordId: string,
    timestamp: string
  ): Promise<NeotomaRecord | null>;

  /**
   * Save state (for materialized views/snapshots)
   */
  saveState(record: NeotomaRecord): Promise<void>;

  /**
   * Get multiple states by record IDs
   */
  getStates(recordIds: string[]): Promise<Map<string, NeotomaRecord | null>>;
}

/**
 * ObservationRepository interface for observation operations (FU-055)
 */
export interface ObservationRepository {
  /**
   * Create observation
   */
  createObservation(observation: {
    entity_id: string;
    entity_type: string;
    schema_version: string;
    source_record_id: string;
    observed_at: string;
    specificity_score?: number | null;
    source_priority?: number;
    fields: Record<string, unknown>;
    user_id: string;
  }): Promise<{
    id: string;
    entity_id: string;
    entity_type: string;
    schema_version: string;
    source_record_id: string;
    observed_at: string;
    specificity_score: number | null;
    source_priority: number;
    fields: Record<string, unknown>;
    created_at: string;
    user_id: string;
  }>;

  /**
   * Get observations for entity
   */
  getObservationsByEntityId(entityId: string): Promise<
    Array<{
      id: string;
      entity_id: string;
      entity_type: string;
      schema_version: string;
      source_record_id: string;
      observed_at: string;
      specificity_score: number | null;
      source_priority: number;
      fields: Record<string, unknown>;
      created_at: string;
      user_id: string;
    }>
  >;
}

/**
 * SnapshotRepository interface for entity snapshot operations (FU-055)
 */
export interface SnapshotRepository {
  /**
   * Get entity snapshot
   */
  getSnapshot(entityId: string): Promise<{
    entity_id: string;
    entity_type: string;
    schema_version: string;
    snapshot: Record<string, unknown>;
    computed_at: string;
    observation_count: number;
    last_observation_at: string;
    provenance: Record<string, unknown>;
    user_id: string;
  } | null>;

  /**
   * Save entity snapshot
   */
  saveSnapshot(snapshot: {
    entity_id: string;
    entity_type: string;
    schema_version: string;
    snapshot: Record<string, unknown>;
    computed_at: string;
    observation_count: number;
    last_observation_at: string;
    provenance: Record<string, unknown>;
    user_id: string;
  }): Promise<void>;
}

/**
 * CapabilityRepository interface for capability operations (stub for future)
 */
export interface CapabilityRepository {
  /**
   * Store capability
   */
  storeCapability(capability: unknown): Promise<void>;

  /**
   * Get capability
   */
  getCapability(capabilityId: string): Promise<unknown | null>;

  /**
   * Validate capability
   */
  validateCapability(capabilityId: string): Promise<boolean>;
}
