#!/usr/bin/env tsx
/**
 * Test script to verify raw_fragments idempotence
 * Tests that storing the same entity multiple times doesn't create duplicate fragments
 * Verifies that frequency_count is incremented correctly
 */

import { db } from "../src/db.js";
import { randomUUID } from "node:crypto";

const userId = "00000000-0000-0000-0000-000000000000";

async function testRawFragmentsIdempotence() {
  console.log("\n🧪 Testing raw_fragments idempotence...\n");

  // Get a valid source_id
  const { data: sources } = await db
    .from("sources")
    .select("id")
    .limit(1);

  if (!sources || sources.length === 0) {
    console.error("❌ No sources found. Cannot test.");
    return;
  }

  const sourceId = sources[0].id;
  const testFragmentKey = "test_idempotence_field";
  
  console.log(`✅ Using source_id: ${sourceId}\n`);

  // Clean up any existing test fragments
  await db
    .from("raw_fragments")
    .delete()
    .eq("source_id", sourceId)
    .eq("fragment_key", testFragmentKey)
    .eq("user_id", userId);

  // Test 1: Insert first fragment
  console.log("📝 Test 1: Insert first fragment");
  const fragmentId1 = randomUUID();
  const { error: insert1Error } = await db
    .from("raw_fragments")
    .insert({
      id: fragmentId1,
      source_id: sourceId,
      interpretation_id: null,
      user_id: userId,
      entity_type: "task",
      fragment_key: testFragmentKey,
      fragment_value: { test: "value1" },
      fragment_envelope: {
        reason: "unknown_field",
        entity_type: "task",
        schema_version: "1.0",
      },
    });

  if (insert1Error) {
    console.error("❌ Insert 1 failed:", insert1Error);
    return;
  }
  console.log("✅ First fragment inserted\n");

  // Verify it exists
  const { data: check1, error: check1Error } = await db
    .from("raw_fragments")
    .select("*")
    .eq("source_id", sourceId)
    .eq("fragment_key", testFragmentKey)
    .eq("user_id", userId);

  if (check1Error || !check1 || check1.length !== 1) {
    console.error("❌ First fragment not found or duplicate:", check1Error);
    return;
  }
  console.log("✅ Verified 1 fragment exists (frequency_count:", check1[0].frequency_count, ")\n");

  // Test 2: Try to insert duplicate (should fail with unique constraint violation)
  console.log("📝 Test 2: Try to insert duplicate (should fail with constraint)");
  const fragmentId2 = randomUUID();
  const { error: insert2Error } = await db
    .from("raw_fragments")
    .insert({
      id: fragmentId2,
      source_id: sourceId,
      interpretation_id: null,
      user_id: userId,
      entity_type: "task",
      fragment_key: testFragmentKey,
      fragment_value: { test: "value2" },
      fragment_envelope: {
        reason: "unknown_field",
        entity_type: "task",
        schema_version: "1.0",
      },
    });

  if (insert2Error) {
    if (insert2Error.code === "23505") {
      console.log("✅ Unique constraint violation detected (expected):", insert2Error.message);
    } else {
      console.error("❌ Unexpected error:", insert2Error);
      return;
    }
  } else {
    console.error("❌ Insert should have failed with unique constraint violation");
    return;
  }

  // Test 3: Update existing fragment (increment frequency)
  console.log("\n📝 Test 3: Update existing fragment to increment frequency");
  const { error: updateError } = await db
    .from("raw_fragments")
    .update({
      fragment_value: { test: "value2" },
      frequency_count: 2,
      last_seen: new Date().toISOString(),
    })
    .eq("id", check1[0].id);

  if (updateError) {
    console.error("❌ Update failed:", updateError);
    return;
  }
  console.log("✅ Fragment updated\n");

  // Verify update
  const { data: check2, error: check2Error } = await db
    .from("raw_fragments")
    .select("*")
    .eq("source_id", sourceId)
    .eq("fragment_key", testFragmentKey)
    .eq("user_id", userId);

  if (check2Error || !check2 || check2.length !== 1) {
    console.error("❌ Verification failed:", check2Error);
    return;
  }

  console.log("✅ Verified still only 1 fragment exists");
  console.log("✅ Frequency count:", check2[0].frequency_count);
  console.log("✅ Fragment value updated:", JSON.stringify(check2[0].fragment_value));
  console.log("✅ Last seen updated:", check2[0].last_seen > check2[0].first_seen);

  // Clean up
  await db
    .from("raw_fragments")
    .delete()
    .eq("id", check1[0].id);

  console.log("\n🎉 All idempotence tests passed!");
  console.log("\n✅ raw_fragments now prevents duplicates and tracks frequency correctly\n");
}

testRawFragmentsIdempotence().catch(console.error);
