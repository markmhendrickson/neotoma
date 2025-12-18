/**
 * Reducer Registry for Reducer Versioning (FU-052)
 *
 * Registry that maps reducer versions to reducer functions.
 */

import { StateEvent } from "../events/event_schema.js";
import { applyReducer } from "./record_reducer.js";
import type { NeotomaRecord } from "../db.js";

export type ReducerFunction = (
  event: StateEvent,
  currentState: NeotomaRecord | null,
) => NeotomaRecord;

export class ReducerRegistry {
  private reducers: Map<string, ReducerFunction> = new Map();
  private defaultVersion: string = "1.0";

  constructor() {
    // Register default reducer version 1.0
    this.register("1.0", applyReducer);
  }

  /**
   * Register a reducer function for a specific version
   */
  register(version: string, reducer: ReducerFunction): void {
    this.reducers.set(version, reducer);
  }

  /**
   * Get reducer function for a specific version
   */
  getReducer(version: string): ReducerFunction {
    const reducer = this.reducers.get(version);
    if (!reducer) {
      // Fallback to default version if version not found
      const defaultReducer = this.reducers.get(this.defaultVersion);
      if (!defaultReducer) {
        throw new Error(
          `No reducer found for version ${version} and default version ${this.defaultVersion} not available`,
        );
      }
      return defaultReducer;
    }
    return reducer;
  }

  /**
   * Apply reducer for event (version-aware)
   */
  apply(event: StateEvent, currentState: NeotomaRecord | null): NeotomaRecord {
    const version = event.reducer_version || this.defaultVersion;
    const reducer = this.getReducer(version);
    return reducer(event, currentState);
  }

  /**
   * Get default reducer version
   */
  getDefaultVersion(): string {
    return this.defaultVersion;
  }

  /**
   * Set default reducer version
   */
  setDefaultVersion(version: string): void {
    this.defaultVersion = version;
  }
}

// Global reducer registry instance
export const reducerRegistry = new ReducerRegistry();

/**
 * Get reducer version for event (with default fallback)
 */
export function getReducerVersion(event: StateEvent): string {
  return event.reducer_version || reducerRegistry.getDefaultVersion();
}

/**
 * Apply versioned reducer (convenience function using global registry)
 */
export function applyVersionedReducer(
  event: StateEvent,
  currentState: NeotomaRecord | null,
): NeotomaRecord {
  return reducerRegistry.apply(event, currentState);
}

/**
 * Migrate event to new reducer version (stub for future migrations)
 */
export function migrateEventToVersion(
  event: StateEvent,
  targetVersion: string,
): StateEvent {
  // Stub: Future implementation will handle event migration
  // For now, return event as-is
  if (event.reducer_version === targetVersion) {
    return event;
  }

  // In future, this will transform event payload to match new reducer version
  throw new Error(
    `Event migration from version ${event.reducer_version || "1.0"} to ${targetVersion} not yet implemented`,
  );
}
