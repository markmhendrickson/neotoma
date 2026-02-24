#!/usr/bin/env tsx
/**
 * Manually queue auto-enhancement checks for raw_fragments
 * Useful for testing or recovering from missed queue creation
 */

import { db } from "../src/db.js";
import { SchemaRecommendationService } from "../src/services/schema_recommendation.js";

const entityType = process.argv[2] || "task";
const userId = process.argv[3] || "00000000-0000-0000-0000-000000000000";

async function manuallyQueueEnhancements() {
  console.log(`\n🔄 Manually queuing auto-enhancement checks for entity_type: ${entityType}\n`);

  // Get all unique fragment_keys from raw_fragments
  const { data: fragments, error: fragError } = await db
    .from("raw_fragments")
    .select("fragment_key, frequency_count, entity_type, user_id")
    .eq("entity_type", entityType)
    .eq("user_id", userId);

  if (fragError) {
    console.error("❌ Error querying fragments:", fragError);
    return;
  }

  if (!fragments || fragments.length === 0) {
    console.log("⚠️  No fragments found");
    return;
  }

  // Group by fragment_key to get unique fields
  const fieldMap = new Map<string, number>();
  for (const frag of fragments) {
    const key = frag.fragment_key;
    const freq = frag.frequency_count || 1;
    fieldMap.set(key, (fieldMap.get(key) || 0) + freq);
  }

  console.log(`Found ${fieldMap.size} unique fields to queue:\n`);

  const schemaRecommendationService = new SchemaRecommendationService();
  let queued = 0;
  let failed = 0;

  for (const [fragmentKey, frequency] of fieldMap.entries()) {
    try {
      await schemaRecommendationService.queueAutoEnhancementCheck({
        entity_type: entityType,
        fragment_key: fragmentKey,
        user_id: userId,
        frequency_count: frequency,
      });
      console.log(`  ✅ Queued: ${fragmentKey} (frequency: ${frequency})`);
      queued++;
    } catch (error: any) {
      console.error(`  ❌ Failed to queue ${fragmentKey}:`, error.message);
      failed++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Queued: ${queued}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${fieldMap.size}\n`);

  // Check queue items before processing
  console.log("\n📋 Checking queue items before processing...");
  const { data: queueCheck, error: queueCheckError } = await db
    .from("auto_enhancement_queue")
    .select("*")
    .eq("entity_type", entityType)
    .in("status", ["pending", "failed", "skipped"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (queueCheckError) {
    console.error("❌ Error checking queue:", queueCheckError);
  } else if (!queueCheck || queueCheck.length === 0) {
    console.log("  ⚠️  No pending/failed/skipped queue items found");
  } else {
    const byStatus = queueCheck.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`  Found ${queueCheck.length} queue items`);
    console.log(`  Status breakdown:`, byStatus);
    console.log(`  Sample items (showing skipped with error messages):`);
    queueCheck.filter(item => item.status === "skipped").slice(0, 5).forEach((item) => {
      console.log(`    - ${item.fragment_key}: ${item.status}`);
      if (item.error_message) {
        console.log(`      Reason: ${item.error_message}`);
      }
    });
  }

  // Now process the queue
  console.log("\n🔄 Processing auto-enhancement queue...\n");
  const { processAutoEnhancementQueue } = await import("../src/services/auto_enhancement_processor.js");
  const result = await processAutoEnhancementQueue();

  console.log(`📊 Processing Results:`);
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Succeeded: ${result.succeeded}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  Skipped: ${result.skipped}\n`);

  // Check skipped items for error messages
  console.log("\n🔍 Checking why items were skipped...");
  const { data: skippedItems } = await db
    .from("auto_enhancement_queue")
    .select("fragment_key, error_message, status")
    .eq("entity_type", entityType)
    .eq("status", "skipped")
    .order("processed_at", { ascending: false })
    .limit(10);

  if (skippedItems && skippedItems.length > 0) {
    console.log(`  Found ${skippedItems.length} skipped items:`);
    const reasons = new Map<string, number>();
    skippedItems.forEach((item) => {
      const reason = item.error_message || "Unknown";
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
    });
    console.log(`  Skip reasons:`);
    reasons.forEach((count, reason) => {
      console.log(`    - ${reason}: ${count} items`);
    });
    console.log(`  Sample skipped items:`);
    skippedItems.slice(0, 5).forEach((item) => {
      console.log(`    - ${item.fragment_key}: ${item.error_message || "No error message"}`);
    });
  }

  // Check for schema recommendations
  const { data: recommendations } = await db
    .from("schema_recommendations")
    .select("*")
    .eq("entity_type", entityType)
    .order("created_at", { ascending: false })
    .limit(10);

  if (recommendations && recommendations.length > 0) {
    console.log(`\n✅ Schema Recommendations Created: ${recommendations.length}`);
    recommendations.forEach((rec) => {
      console.log(`  - ${rec.field_name}: ${rec.status} (confidence: ${rec.confidence_score || "N/A"})`);
    });
  } else {
    console.log("\n⚠️  No schema recommendations created");
  }

  console.log("\n✅ Manual queue processing complete\n");
}

manuallyQueueEnhancements().catch(console.error);
