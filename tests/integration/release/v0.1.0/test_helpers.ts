/**
 * Test helpers for v0.1.0 release integration tests
 */

import type { AddressInfo } from "node:net";
import type { Application } from "express";
import { randomBytes } from "node:crypto";
import { supabase } from "../../../../src/db.js";

export interface TestContext {
  baseUrl: string;
  bearerToken: string;
  server: ReturnType<Application["listen"]> | null;
  testPrefix: string;
}

/**
 * Generate a unique test prefix for isolation
 */
export function generateTestPrefix(testName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitized = testName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  return `${sanitized}-${timestamp}-${random}`;
}

export async function setupTestServer(testName?: string): Promise<TestContext> {
  // Ensure database migrations are applied before running tests
  // Use a timeout to prevent hanging
  try {
    const migrationPromise = import(
      "../../../../scripts/run_migrations.js"
    ).then((module) => module.runMigrations(false));
    await Promise.race([
      migrationPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Migration timeout")), 5000)
      ),
    ]);
  } catch (error) {
    // Silently continue - migrations might already be applied or might timeout
    // This is OK since migrations run automatically via vitest.setup.ts
  }

  const originalAutostart = process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART;
  process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";

  const actionsModule = await import("../../../../src/actions.js");
  const testApp: Application = actionsModule.app;

  if (originalAutostart === undefined) {
    delete process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART;
  } else {
    process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = originalAutostart;
  }

  const server = testApp.listen(0);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const bearerToken = Buffer.from(randomBytes(32)).toString("base64url");
  const testPrefix = generateTestPrefix(testName || "test");

  return { baseUrl, bearerToken, server, testPrefix };
}

export async function teardownTestServer(
  context: TestContext | undefined
): Promise<void> {
  return new Promise((resolve) => {
    if (context && context.server) {
      context.server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

export async function cleanupTestRecords(recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;
  await supabase.from("records").delete().in("id", recordIds);
}

export async function cleanupTestEvents(recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;
  await supabase.from("state_events").delete().in("record_id", recordIds);
}

export async function cleanupTestEntities(entityIds: string[]): Promise<void> {
  if (entityIds.length === 0) return;
  await supabase.from("entity_snapshots").delete().in("entity_id", entityIds);
  await supabase.from("observations").delete().in("entity_id", entityIds);
}

export async function cleanupTestRelationships(
  recordIds: string[]
): Promise<void> {
  if (recordIds.length === 0) return;

  // Get entity IDs from observations for these records
  const { data: observations } = await supabase
    .from("observations")
    .select("entity_id")
    .in("source_record_id", recordIds);

  const entityIds = new Set<string>();
  if (observations) {
    for (const obs of observations) {
      if (obs.entity_id) {
        entityIds.add(obs.entity_id);
      }
    }
  }

  // Delete relationships where source_entity_id or target_entity_id matches
  if (entityIds.size > 0) {
    const entityIdArray = Array.from(entityIds);
    // Delete in batches to avoid query size limits
    for (let i = 0; i < entityIdArray.length; i += 100) {
      const batch = entityIdArray.slice(i, i + 100);
      await supabase
        .from("relationships")
        .delete()
        .in("source_entity_id", batch);
      await supabase
        .from("relationships")
        .delete()
        .in("target_entity_id", batch);
    }
  }

  // Also delete relationships where source_id or target_id matches record IDs
  for (const recordId of recordIds) {
    await supabase
      .from("relationships")
      .delete()
      .or(`source_id.eq.${recordId},target_id.eq.${recordId}`);
  }
}

/**
 * Clean up all test data in correct dependency order
 */
export async function cleanupAllTestData(recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;

  // Step 1: Get all entity IDs from observations for these records
  const { data: observations } = await supabase
    .from("observations")
    .select("entity_id")
    .in("source_record_id", recordIds);

  const entityIds = new Set<string>();
  if (observations) {
    for (const obs of observations) {
      if (obs.entity_id && typeof obs.entity_id === "string") {
        entityIds.add(obs.entity_id);
      }
    }
  }

  // Step 2: Clean up in reverse dependency order
  // Relationships first (they reference entities and records)
  await cleanupTestRelationships(recordIds);

  // Events next (they reference records)
  await cleanupTestEvents(recordIds);

  // Entities and observations (observations reference records and entities)
  if (entityIds.size > 0) {
    const entityIdArray = Array.from(entityIds);
    await cleanupTestEntities(entityIdArray);
  }

  // Records last (they're the root)
  await cleanupTestRecords(recordIds);
}

/**
 * Clean up test data by prefix (for beforeEach cleanup)
 */
export async function cleanupTestDataByPrefix(prefix: string): Promise<void> {
  // Find records with properties containing the prefix
  const { data: records } = await supabase
    .from("records")
    .select("id, properties")
    .limit(1000); // Reasonable limit for test cleanup

  if (!records || records.length === 0) return;

  const matchingRecordIds: string[] = [];
  for (const record of records) {
    const props = record.properties as Record<string, unknown>;
    if (props && typeof props === "object") {
      // Check if any property value contains the prefix
      const propsStr = JSON.stringify(props);
      if (propsStr.includes(prefix)) {
        matchingRecordIds.push(record.id);
      }
    }
  }

  if (matchingRecordIds.length > 0) {
    await cleanupAllTestData(matchingRecordIds);
  }
}
