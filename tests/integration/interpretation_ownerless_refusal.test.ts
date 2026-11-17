/**
 * Regression guard: an ownerless interpretation (null, undefined, empty or
 * whitespace-only userId) is refused before anything is written.
 *
 * The refusal surfaces as "Failed to create observation: Entity lifecycle
 * authority acquisition is incomplete or inconsistent". That message used to
 * be raised from the snapshot recompute that runs after the observation
 * insert, so the refused call left an interpretation run, an entity row and
 * an observation row behind. The call must now leave no rows at all.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { runInterpretation } from "../../src/services/interpretation.js";
import type { InterpretationConfig } from "../../src/services/interpretation.js";

const ENTITY_TYPE = "ownerless_refusal_regression_test";

const CONFIG: InterpretationConfig = {
  provider: "test",
  model_id: "test-model",
  temperature: 0.0,
  prompt_hash: "test_hash_ownerless",
  code_version: "1.0.0",
};

async function seedSchema(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
  const { error } = await db.from("schema_registry").insert({
    entity_type: ENTITY_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: { title: { type: "string" } },
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: { title: { strategy: "last_write", tie_breaker: "observed_at" } },
    },
    active: true,
    scope: "global",
    user_id: null,
  });
  if (error) throw new Error(`Failed to seed schema: ${error.message}`);
}

async function insertOwnerlessSource(): Promise<string> {
  const { data, error } = await db
    .from("sources")
    .insert({
      user_id: null,
      original_filename: "ownerless.json",
      mime_type: "application/json",
      file_size: 42,
      content_hash: `hash_ownerless_${randomUUID()}`,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to insert source: ${error?.message}`);
  return data.id;
}

async function countBySource(table: string, sourceId: string): Promise<number> {
  const { data, error } = await db.from(table).select("id").eq("source_id", sourceId);
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return (data ?? []).length;
}

async function countByEntityType(table: string): Promise<number> {
  const { data, error } = await db.from(table).select("entity_id").eq("entity_type", ENTITY_TYPE);
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return (data ?? []).length;
}

async function countEntities(): Promise<number> {
  const { data, error } = await db.from("entities").select("id").eq("entity_type", ENTITY_TYPE);
  if (error) throw new Error(`Failed to count entities: ${error.message}`);
  return (data ?? []).length;
}

describe("ownerless interpretation refusal leaves no rows", () => {
  let sourceId: string;

  beforeEach(async () => {
    await db.from("observations").delete().eq("entity_type", ENTITY_TYPE);
    await db.from("entity_snapshots").delete().eq("entity_type", ENTITY_TYPE);
    await db.from("entities").delete().eq("entity_type", ENTITY_TYPE);
    await seedSchema();
    sourceId = await insertOwnerlessSource();
  });

  // A refused run writes nothing, so the row deletes below only matter if the
  // refusal regresses: they keep leftovers from one case out of the next
  // case's entity-type counts. The source and schema rows are this test's own
  // seed data and are always removed.
  afterEach(async () => {
    await db.from("raw_fragments").delete().eq("source_id", sourceId);
    await db.from("interpretations").delete().eq("source_id", sourceId);
    await db.from("observations").delete().eq("entity_type", ENTITY_TYPE);
    await db.from("entity_snapshots").delete().eq("entity_type", ENTITY_TYPE);
    await db.from("entities").delete().eq("entity_type", ENTITY_TYPE);
    await db.from("sources").delete().eq("id", sourceId);
    await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace-only", "   "],
  ])(
    "refuses a %s userId and writes no interpretation, entity, observation, fragment or snapshot",
    async (_label, userId) => {
      await expect(
        runInterpretation({
          userId: userId as unknown as string,
          sourceId,
          // `undeclared_extra` would become a raw_fragment if the call got that far.
          extractedData: [{ entity_type: ENTITY_TYPE, title: "Ownerless", undeclared_extra: "x" }],
          config: CONFIG,
        })
      ).rejects.toThrow(
        "Failed to create observation: Entity lifecycle authority acquisition is incomplete or inconsistent"
      );

      const remaining = {
        interpretations: await countBySource("interpretations", sourceId),
        observations: await countBySource("observations", sourceId),
        raw_fragments: await countBySource("raw_fragments", sourceId),
        timeline_events: await countBySource("timeline_events", sourceId),
        relationship_observations: await countBySource("relationship_observations", sourceId),
        entities: await countEntities(),
        entity_snapshots: await countByEntityType("entity_snapshots"),
      };
      expect(remaining).toEqual({
        interpretations: 0,
        observations: 0,
        raw_fragments: 0,
        timeline_events: 0,
        relationship_observations: 0,
        entities: 0,
        entity_snapshots: 0,
      });
    }
  );
});
