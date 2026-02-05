/**
 * Repository Interfaces for Repository Abstractions (FU-051)
 *
 * Defines repository interfaces to isolate domain logic from storage implementations.
 * Enables multi-backend support (file, DB, blockchain) for future decentralization.
 */

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
    source_id: string;
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
    source_id: string;
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
      source_id: string;
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
