/**
 * Observation Identity Service
 * 
 * Generates deterministic observation IDs and checks for duplicates.
 * Core of the idempotence pattern - ensures same canonical fields produce same observation ID.
 */

import { createHash } from "crypto";
import { db } from "../db.js";

export interface Observation {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  interpretation_id: string | null;
  observed_at: string;
  specificity_score: number;
  source_priority: number;
  fields: Record<string, unknown>;
  canonical_hash: string | null;
  user_id: string;
}

/**
 * Generate deterministic observation ID from canonical fields
 * 
 * Format: UUID v4-like format from SHA-256 hash
 * 
 * This ensures:
 * - Same source + same interpretation + same entity + same fields → same observation ID
 * - Idempotence: re-running interpretation doesn't create duplicates
 * - Valid UUID format for database compatibility
 */
export function generateObservationId(
  sourceId: string,
  interpretationId: string,
  entityId: string,
  canonicalFields: Record<string, unknown>
): string {
  const canonical = {
    source_id: sourceId,
    interpretation_id: interpretationId,
    entity_id: entityId,
    fields: canonicalFields, // Already canonicalized
  };
  
  // JSON.stringify on canonical object is deterministic because:
  // - canonicalFields has sorted keys
  // - All values are normalized
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
  
  // Convert hash to UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // Take first 32 hex characters and format as UUID
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32),
  ].join("-");
  
  return uuid;
}

/**
 * Compute canonical hash from canonical fields
 * Used for deduplication and fixed-point convergence
 */
export function computeCanonicalHash(
  canonicalFields: Record<string, unknown>
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(canonicalFields))
    .digest("hex");
  return hash;
}

/**
 * Check if observation with this ID already exists
 */
export async function checkObservationExists(
  observationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("observations")
    .select("id")
    .eq("id", observationId)
    .eq("user_id", userId)
    .maybeSingle();
  
  if (error) {
    console.warn(`Failed to check observation existence: ${error.message}`);
    return false;
  }
  
  return data !== null;
}

/**
 * Get existing observation by ID
 */
export async function getExistingObservation(
  observationId: string,
  userId: string
): Promise<Observation | null> {
  const { data, error } = await db
    .from("observations")
    .select("*")
    .eq("id", observationId)
    .eq("user_id", userId)
    .single();
  
  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    console.warn(`Failed to get existing observation: ${error.message}`);
    return null;
  }
  
  return data as Observation;
}

/**
 * Check if observation with this canonical hash already exists
 * for this source + interpretation + entity combination
 */
export async function checkObservationExistsByHash(
  sourceId: string,
  interpretationId: string,
  entityId: string,
  canonicalHash: string,
  userId: string
): Promise<Observation | null> {
  const { data, error } = await db
    .from("observations")
    .select("*")
    .eq("source_id", sourceId)
    .eq("interpretation_id", interpretationId)
    .eq("entity_id", entityId)
    .eq("canonical_hash", canonicalHash)
    .eq("user_id", userId)
    .maybeSingle();
  
  if (error) {
    console.warn(`Failed to check observation by hash: ${error.message}`);
    return null;
  }
  
  return data as Observation | null;
}
