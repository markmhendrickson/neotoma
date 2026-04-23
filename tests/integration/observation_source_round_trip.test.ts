/**
 * Round-trip test for the `observation_source` classification field
 * (fleet-general write integrity layer — item-1-observation-source).
 *
 * Exercises the local SQLite write path end-to-end:
 *   1. Callers that omit `observation_source` fall through to the
 *      documented default (`llm_summary`).
 *   2. Every documented enum value round-trips to the row unchanged.
 *   3. Reading back via `listObservationsForEntity` preserves the value
 *      (guards against column pruning / serialization drift).
 *
 * Uses the local SQLite backend via the service layer — no HTTP — so we
 * only exercise the storage contract, not transport. HTTP and MCP share
 * this seam via `createObservation`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import {
  createObservation,
  listObservationsForEntity,
  DEFAULT_OBSERVATION_SOURCE,
} from "../../src/services/observation_storage.js";
import { OBSERVATION_SOURCE_VALUES } from "../../src/shared/action_schemas.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

describe("observation_source round-trip", () => {
  const tracker = new TestIdTracker();
  const userId = `test-user-obssource-${Date.now()}`;
  let sourceId: string;

  beforeAll(async () => {
    const { data: source } = await db
      .from("sources")
      .insert({
        user_id: userId,
        content_hash: `obssource_hash_${Date.now()}`,
        storage_url: "file:///test/obssource.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();
    sourceId = (source as { id: string }).id;
    tracker.trackSource(sourceId);
  });

  afterAll(async () => {
    await tracker.cleanup();
  });

  it("applies DEFAULT_OBSERVATION_SOURCE when caller omits the field", async () => {
    const entityId = `ent_default_${Date.now()}`;
    const obs = await createObservation({
      entity_id: entityId,
      entity_type: "note",
      schema_version: "1.0",
      source_id: sourceId,
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 0.5,
      source_priority: 100,
      fields: { title: "default kind" },
      user_id: userId,
    });
    tracker.trackObservation(obs.id);

    expect(DEFAULT_OBSERVATION_SOURCE).toBe("llm_summary");
    expect(obs.observation_source).toBe(DEFAULT_OBSERVATION_SOURCE);
  });

  it("persists every documented observation_source value and reads it back unchanged", async () => {
    for (const kind of OBSERVATION_SOURCE_VALUES) {
      const entityId = `ent_${kind}_${Date.now()}`;
      const created = await createObservation({
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        source_id: sourceId,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 0.5,
        source_priority: 100,
        observation_source: kind,
        fields: { title: `kind=${kind}` },
        user_id: userId,
      });
      tracker.trackObservation(created.id);

      expect(
        created.observation_source,
        `createObservation dropped observation_source for ${kind}`,
      ).toBe(kind);

      const readBack = await listObservationsForEntity(entityId, userId);
      expect(readBack.data.length).toBeGreaterThan(0);
      expect(
        readBack.data[0]!.observation_source,
        `listObservationsForEntity dropped observation_source for ${kind}`,
      ).toBe(kind);
    }
  });
});
