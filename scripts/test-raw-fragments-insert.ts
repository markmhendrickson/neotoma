#!/usr/bin/env tsx
/**
 * Test script to diagnose raw_fragments insert issues
 * This will attempt to insert a test fragment and show detailed error information
 */

import { db } from "../src/db.js";
import { randomUUID } from "node:crypto";

const userId = "00000000-0000-0000-0000-000000000000";

async function testRawFragmentsInsert() {
  console.log("\n🧪 Testing raw_fragments insert...\n");

  // First, get a valid source_id from the database
  const { data: sources, error: sourcesError } = await db
    .from("sources")
    .select("id")
    .limit(1);

  if (sourcesError) {
    console.error("❌ Failed to fetch sources:", sourcesError);
    return;
  }

  if (!sources || sources.length === 0) {
    console.error("❌ No sources found in database. Cannot test insert.");
    return;
  }

  const sourceId = sources[0].id;
  console.log(`✅ Found source_id: ${sourceId}\n`);

  // Test insert
  const testFragment = {
    id: randomUUID(),
    source_id: sourceId,
    interpretation_id: null,
    user_id: userId,
    entity_type: "task",
    fragment_key: "test_field",
    fragment_value: { test: "value" },
    fragment_envelope: {
      reason: "unknown_field",
      entity_type: "task",
      schema_version: "1.0",
    },
  };

  console.log("📤 Attempting insert with data:", JSON.stringify(testFragment, null, 2));
  console.log("\n");

  const { data: insertResult, error: insertError } = await db
    .from("raw_fragments")
    .insert(testFragment)
    .select();

  if (insertError) {
    console.error("❌ INSERT FAILED:");
    console.error("Error code:", insertError.code);
    console.error("Error message:", insertError.message);
    console.error("Error details:", insertError.details);
    console.error("Error hint:", insertError.hint);
    console.error("\nFull error object:", JSON.stringify(insertError, null, 2));
  } else {
    console.log("✅ INSERT SUCCEEDED!");
    console.log("Inserted data:", JSON.stringify(insertResult, null, 2));

    // Verify it's actually in the database
    const { data: verifyData, error: verifyError } = await db
      .from("raw_fragments")
      .select("*")
      .eq("id", testFragment.id)
      .single();

    if (verifyError) {
      console.error("⚠️  Insert succeeded but cannot verify:", verifyError);
    } else {
      console.log("\n✅ Verified in database:", JSON.stringify(verifyData, null, 2));
    }

    // Clean up test data
    await db.from("raw_fragments").delete().eq("id", testFragment.id);
    console.log("\n🧹 Cleaned up test data");
  }
}

testRawFragmentsInsert().catch(console.error);
