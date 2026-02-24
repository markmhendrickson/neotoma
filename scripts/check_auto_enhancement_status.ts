#!/usr/bin/env tsx
/**
 * Check auto-enhancement status for a given entity type
 * Shows queue status, recommendations, and schema changes
 */

import { db } from "../src/db.js";

const entityType = process.argv[2] || "task";
const userId = process.argv[3] || "00000000-0000-0000-0000-000000000000";

async function checkEnhancementStatus() {
  console.log(`\n🔍 Checking auto-enhancement status for entity_type: ${entityType}\n`);

  // 1. Check auto-enhancement queue (check all user_ids for this entity_type)
  console.log("📋 Auto-Enhancement Queue Status:");
  const { data: queueItems, error: queueError } = await db
    .from("auto_enhancement_queue")
    .select("*")
    .eq("entity_type", entityType)
    .order("created_at", { ascending: false })
    .limit(50);

  if (queueError) {
    console.error("❌ Error querying queue:", queueError);
    return;
  }

  if (!queueItems || queueItems.length === 0) {
    console.log("  ⚠️  No queue items found");
    console.log("  💡 This suggests queue items were never created or were already processed/deleted");
  } else {
    const byStatus = queueItems.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`  Total items: ${queueItems.length}`);
    console.log(`  Status breakdown:`, byStatus);
    console.log(`\n  Recent items (last 10):`);
    queueItems.slice(0, 10).forEach((item) => {
      console.log(
        `    - ${item.fragment_key}: ${item.status} (freq: ${item.frequency_count || "N/A"}, confidence: ${item.confidence_score || "N/A"})`
      );
      if (item.error_message) {
        console.log(`      Error: ${item.error_message}`);
      }
    });
  }

  // 2. Check schema recommendations (check all user_ids for this entity_type)
  console.log("\n📊 Schema Recommendations:");
  const { data: recommendations, error: recError } = await db
    .from("schema_recommendations")
    .select("*")
    .eq("entity_type", entityType)
    .order("created_at", { ascending: false })
    .limit(50);

  if (recError) {
    console.error("❌ Error querying recommendations:", recError);
    return;
  }

  if (!recommendations || recommendations.length === 0) {
    console.log("  ⚠️  No schema recommendations found");
  } else {
    const byStatus = recommendations.reduce((acc, rec) => {
      acc[rec.status] = (acc[rec.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`  Total recommendations: ${recommendations.length}`);
    console.log(`  Status breakdown:`, byStatus);
    console.log(`\n  Recent recommendations (last 10):`);
    recommendations.slice(0, 10).forEach((rec) => {
      console.log(
        `    - ${rec.field_name}: ${rec.status} (confidence: ${rec.confidence_score || "N/A"})`
      );
      if (rec.reasoning) {
        console.log(`      Reasoning: ${rec.reasoning}`);
      }
    });
  }

  // 3. Check raw_fragments
  console.log("\n📦 Raw Fragments:");
  const { data: fragments, error: fragError } = await db
    .from("raw_fragments")
    .select("fragment_key, frequency_count, entity_type")
    .eq("entity_type", entityType)
    .eq("user_id", userId)
    .order("frequency_count", { ascending: false })
    .limit(20);

  if (fragError) {
    console.error("❌ Error querying fragments:", fragError);
    return;
  }

  if (!fragments || fragments.length === 0) {
    console.log("  ⚠️  No raw fragments found");
  } else {
    console.log(`  Total fragments: ${fragments.length}`);
    console.log(`  Top fields by frequency:`);
    fragments.forEach((frag) => {
      console.log(`    - ${frag.fragment_key}: ${frag.frequency_count || 1} occurrences`);
    });
  }

  // 4. Check current schema
  console.log("\n📋 Current Schema:");
  let schemaQuery = db
    .from("schema_registry")
    .select("schema_version, schema_definition")
    .eq("entity_type", entityType)
    .eq("active", true);
  
  if (userId && userId !== "00000000-0000-0000-0000-000000000000") {
    schemaQuery = schemaQuery.eq("user_id", userId);
  } else {
    schemaQuery = schemaQuery.is("user_id", null);
  }
  
  const { data: schema, error: schemaError } = await schemaQuery.maybeSingle();

  if (schemaError) {
    console.error("❌ Error querying schema:", schemaError);
    return;
  }

  if (!schema) {
    console.log("  ⚠️  No active schema found");
  } else {
    const fields = Object.keys(schema.schema_definition.fields || {});
    console.log(`  Schema version: ${schema.schema_version}`);
    console.log(`  Total fields: ${fields.length}`);
    console.log(`  Fields: ${fields.join(", ")}`);
  }

  // 5. Check observations count and details
  console.log("\n👁️  Observations:");
  const { data: observations, error: obsError } = await db
    .from("observations")
    .select("id, source_id, entity_type, user_id")
    .eq("entity_type", entityType)
    .limit(10);

  if (obsError) {
    console.error("❌ Error querying observations:", obsError);
    return;
  }

  if (!observations || observations.length === 0) {
    console.log("  ⚠️  No observations found");
  } else {
    console.log(`  Total observations: ${observations.length} (showing first 10)`);
    const uniqueSources = new Set(observations.map(o => o.source_id)).size;
    const uniqueUsers = new Set(observations.map(o => o.user_id)).size;
    console.log(`  Unique sources: ${uniqueSources}`);
    console.log(`  Unique users: ${uniqueUsers}`);
    observations.forEach((obs, idx) => {
      console.log(`    ${idx + 1}. source_id: ${obs.source_id}, user_id: ${obs.user_id || 'null'}`);
    });
  }
  
  // Also check count
  const { count: obsCount } = await db
    .from("observations")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType);
  console.log(`  Total count: ${obsCount || 0}`);

  // 6. Check for source_id from recent store
  console.log("\n🔍 Recent Store Action Check:");
  const recentSourceId = "232dc440-3f12-410f-a815-1fb5070796e4"; // From store response
  const { data: recentObs, error: recentObsError } = await db
    .from("observations")
    .select("id, source_id, entity_type, user_id")
    .eq("source_id", recentSourceId)
    .eq("entity_type", entityType)
    .limit(10);

  if (recentObsError) {
    console.error("❌ Error querying recent observations:", recentObsError);
  } else if (!recentObs || recentObs.length === 0) {
    console.log(`  ⚠️  No observations found for source_id: ${recentSourceId}`);
    console.log("  💡 This suggests the store action didn't create observations, or they were created with a different source_id");
  } else {
    console.log(`  ✅ Found ${recentObs.length} observations from recent store action`);
    console.log(`  Source ID: ${recentSourceId}`);
    recentObs.forEach((obs, idx) => {
      console.log(`    ${idx + 1}. user_id: ${obs.user_id || 'null'}`);
    });
    
    // Check raw_fragments for this source
    const { data: recentFrags, error: fragError } = await db
      .from("raw_fragments")
      .select("fragment_key, frequency_count, source_id")
      .eq("source_id", recentSourceId)
      .eq("entity_type", entityType)
      .limit(10);
    
    if (!fragError && recentFrags && recentFrags.length > 0) {
      console.log(`\n  📦 Raw fragments from recent store: ${recentFrags.length} fields`);
      recentFrags.forEach((frag) => {
        console.log(`    - ${frag.fragment_key}: ${frag.frequency_count || 1} occurrences`);
      });
    }
  }

  console.log("\n✅ Status check complete\n");
}

checkEnhancementStatus().catch(console.error);
