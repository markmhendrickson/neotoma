/**
 * Test Schema Helpers
 * 
 * Utilities for seeding and cleaning up schemas in tests
 */

import { supabase } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

/**
 * Seed a minimal test schema directly in database (for testing)
 */
export async function seedTestSchema(
  server: NeotomaServer,
  entityType: string,
  fields: Record<string, {
    type: "string" | "number" | "date" | "boolean" | "array" | "object";
    required?: boolean;
  }>,
  options: {
    activate?: boolean;
    user_specific?: boolean;
    user_id?: string;
  } = {}
): Promise<string> {
  // First, clean up any existing schema
  await cleanupTestSchema(entityType, options.user_id);
  
  // Insert schema directly for testing (bypass MCP action to avoid circular dependency)
  const { data, error } = await supabase
    .from("schema_registry")
    .insert({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: { fields },
      reducer_config: {
        merge_policies: Object.fromEntries(
          Object.keys(fields).map(field => [
            field,
            { strategy: "last_write", tie_breaker: "observed_at" }
          ])
        ),
      },
      active: options.activate ?? true,
      scope: options.user_specific ? "user" : "global",
      user_id: options.user_id || null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to seed test schema: ${error.message}`);
  }

  return data.id;
}

/**
 * Clean up test schema from database
 */
export async function cleanupTestSchema(entityType: string, userId?: string) {
  const query = supabase
    .from("schema_registry")
    .delete()
    .eq("entity_type", entityType);
  
  if (userId !== undefined) {
    query.eq("user_id", userId);
  }
  
  await query;
}

/**
 * Clean up test entities
 */
export async function cleanupTestEntities(entityIds: string[]) {
  if (entityIds.length === 0) return;
  
  await supabase.from("entity_snapshots").delete().in("entity_id", entityIds);
  await supabase.from("observations").delete().in("entity_id", entityIds);
  await supabase.from("entities").delete().in("id", entityIds);
}

/**
 * Clean up test observations
 */
export async function cleanupTestObservations(observationIds: string[]) {
  if (observationIds.length === 0) return;
  
  await supabase.from("observations").delete().in("id", observationIds);
}

/**
 * Clean up test sources
 */
export async function cleanupTestSources(sourceIds: string[]) {
  if (sourceIds.length === 0) return;
  
  // Clean up related data first
  await supabase.from("observations").delete().in("source_id", sourceIds);
  await supabase.from("raw_fragments").delete().in("source_id", sourceIds);
  await supabase.from("sources").delete().in("id", sourceIds);
}

/**
 * Clean up test raw_fragments
 */
export async function cleanupTestRawFragments(entityType: string, userId?: string) {
  const query = supabase
    .from("raw_fragments")
    .delete()
    .eq("entity_type", entityType);
  
  if (userId !== undefined) {
    query.eq("user_id", userId);
  }
  
  await query;
}

/**
 * Clean up auto_enhancement_queue entries
 */
export async function cleanupAutoEnhancementQueue(entityType: string, userId?: string) {
  const query = supabase
    .from("auto_enhancement_queue")
    .delete()
    .eq("entity_type", entityType);
  
  if (userId !== undefined) {
    query.eq("user_id", userId);
  }
  
  await query;
}

/**
 * Clean up schema_recommendations
 */
export async function cleanupSchemaRecommendations(entityType: string, userId?: string) {
  const query = supabase
    .from("schema_recommendations")
    .delete()
    .eq("entity_type", entityType);
  
  if (userId !== undefined) {
    query.eq("user_id", userId);
  }
  
  await query;
}

/**
 * Comprehensive cleanup for a test entity type
 */
export async function cleanupTestEntityType(entityType: string, userId?: string) {
  await cleanupTestRawFragments(entityType, userId);
  await cleanupAutoEnhancementQueue(entityType, userId);
  await cleanupSchemaRecommendations(entityType, userId);
  await cleanupTestSchema(entityType, userId);
  
  // Clean up entities and observations
  const { data: entities } = await supabase
    .from("entities")
    .select("id")
    .eq("entity_type", entityType);
  
  if (entities && entities.length > 0) {
    await cleanupTestEntities(entities.map(e => e.id));
  }
}

/**
 * Wait for auto-enhancement processor to run
 */
export async function waitForAutoEnhancementProcessor(timeoutMs: number = 35000): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, timeoutMs));
}

/**
 * Verify entity exists in database
 */
export async function verifyEntityExists(entityId: string): Promise<boolean> {
  const { data } = await supabase
    .from("entities")
    .select("id")
    .eq("id", entityId)
    .maybeSingle();
  
  return data !== null;
}

/**
 * Verify observation exists in database
 */
export async function verifyObservationExists(observationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("observations")
    .select("id")
    .eq("id", observationId)
    .maybeSingle();
  
  return data !== null;
}

/**
 * Count raw_fragments for entity type
 */
export async function countRawFragments(entityType: string, userId?: string): Promise<number> {
  // Query by entity_type
  let query = supabase
    .from("raw_fragments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType);
  
  if (userId !== undefined) {
    query = query.eq("user_id", userId);
  }
  
  const { count } = await query;
  return count || 0;
}

/**
 * Create a test user in auth.users for testing user-specific schemas
 * Uses Supabase Admin API (requires service role key)
 */
export async function createTestUser(userId?: string): Promise<string> {
  const email = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}@test.neotoma.local`;
  
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "test-password-123456",
    email_confirm: true,
    user_metadata: {
      test_user: true,
    },
  });

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  // If a specific userId was requested, verify it matches (or use the created one)
  if (userId && data.user.id !== userId) {
    // Clean up the created user and throw error
    await supabase.auth.admin.deleteUser(data.user.id);
    throw new Error(`Created user ID ${data.user.id} does not match requested ${userId}`);
  }

  return data.user.id;
}

/**
 * Delete a test user from auth.users
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    // Don't throw - user might already be deleted
    console.warn(`Failed to delete test user ${userId}: ${error.message}`);
  }
}
