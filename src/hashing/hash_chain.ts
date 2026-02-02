/**
 * Hash Chaining Utilities for Hash Chaining Schema Fields (FU-054)
 *
 * Utilities for computing event hashes and hash chains (stub for future implementation).
 */

import { StateEvent } from "../events/event_schema.js";

/**
 * Compute hash of event (stub)
 *
 * Future implementation will compute SHA-256 hash of event payload + metadata.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function computeEventHash(_event: StateEvent): string {
  // Stub: Future implementation will compute actual hash
  // For now, return placeholder
  throw new Error("Event hash computation not yet implemented");
}

/**
 * Compute hash of previous event (stub)
 *
 * Future implementation will retrieve previous event and compute its hash.
 */
export function computePreviousEventHash(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _recordId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currentEventTimestamp: string,
): Promise<string | null> {
  // Stub: Future implementation will retrieve previous event and compute hash
  // For now, return null (no hash chaining)
  return Promise.resolve(null);
}

/**
 * Compute Merkle root from events (stub)
 *
 * Future implementation will compute Merkle root for blockchain anchoring.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function computeMerkleRoot(_events: StateEvent[]): string {
  // Stub: Future implementation will compute Merkle root
  throw new Error("Merkle root computation not yet implemented");
}

/**
 * Validate hash chain integrity (stub)
 *
 * Future implementation will verify event hash chain is unbroken.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function validateHashChain(_events: StateEvent[]): boolean {
  // Stub: Future implementation will validate hash chain
  // For now, return true (no validation)
  return true;
}
