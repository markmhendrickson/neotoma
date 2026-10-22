/**
 * End-to-end regression tests for issue #2033:
 * correct() is not durable — a priority-1000 correction was silently
 * reverted by any later-observed_at write under the default `last_write`
 * merge policy (the default for every auto-discovered field).
 *
 * Exercises the REAL write path (`createObservation` / `createCorrection` /
 * `recomputeSnapshot`) against a live local DB, and separately confirms the
 * MCP `correct` action stamps `observation_source: "correction"`. The
 * reserved-source guard is covered on the public surfaces in
 * correction_durability_surfaces.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { randomUUID } from "crypto";
import { createObservation } from "../../src/services/observation_storage.js";
import { createCorrection } from "../../src/services/correction.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { seedTestSchema, cleanupTestSchema } from "../helpers/test_schema_helpers.js";

const testUserId = "00000000-0000-0000-0000-000000000000";
const testEntityType = "correction_durability_2033";

function callMCPAction(server: NeotomaServer, actionName: string, params: any): Promise<any> {
  const methodName = actionName.replace(/_([a-z])/g, (_: string, letter: string) =>
    letter.toUpperCase()
  );
  return (server as any)[methodName](params);
}

describe("correct() durability against last_write (#2033)", () => {
  const createdEntityIds: string[] = [];

  beforeAll(async () => {
    await seedTestSchema(new NeotomaServer(), testEntityType, {
      field: { type: "string", required: false },
    });
  });

  afterAll(async () => {
    await cleanupTestSchema(testEntityType);
  });

  afterEach(async () => {
    if (createdEntityIds.length > 0) {
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
  });

  it("P0 repro: correction on an auto-discovered (last_write) field survives a later routine re-ingest", async () => {
    const entityId = `ent_2033_repro_${randomUUID()}`;
    createdEntityIds.push(entityId);

    await createObservation({
      entity_id: entityId,
      entity_type: testEntityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date(Date.now() - 3000).toISOString(),
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "import",
      fields: { field: "A" },
      user_id: testUserId,
      idempotency_key: `2033-original-${randomUUID()}`,
    });

    await createCorrection({
      entity_id: entityId,
      entity_type: testEntityType,
      field: "field",
      value: "B",
      schema_version: "1.0",
      user_id: testUserId,
      idempotency_key: `2033-correction-${randomUUID()}`,
    });

    await createObservation({
      entity_id: entityId,
      entity_type: testEntityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date(Date.now() + 3000).toISOString(),
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "import",
      fields: { field: "A" },
      user_id: testUserId,
      idempotency_key: `2033-reingest-${randomUUID()}`,
    });

    const snapshot = await recomputeSnapshot(entityId, testUserId);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.field).toBe("B");
  });

  it("MCP correct stamps observation_source=correction and remains durable", async () => {
    const server = new NeotomaServer();
    (server as any).authenticatedUserId = testUserId;

    const mcpEntityId = `ent_2033_mcp_${randomUUID()}`;
    createdEntityIds.push(mcpEntityId);

    await createObservation({
      entity_id: mcpEntityId,
      entity_type: testEntityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date(Date.now() - 3000).toISOString(),
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "import",
      fields: { field: "before-mcp-correction" },
      user_id: testUserId,
      idempotency_key: `2033-mcp-original-${randomUUID()}`,
    });

    await callMCPAction(server, "correct", {
      user_id: testUserId,
      idempotency_key: `2033-mcp-correct-${randomUUID()}`,
      entity_id: mcpEntityId,
      entity_type: testEntityType,
      field: "field",
      value: "after-mcp-correction",
    });

    await createObservation({
      entity_id: mcpEntityId,
      entity_type: testEntityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date(Date.now() + 3000).toISOString(),
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "import",
      fields: { field: "before-mcp-correction" },
      user_id: testUserId,
      idempotency_key: `2033-mcp-reingest-${randomUUID()}`,
    });

    const mcpSnapshot = await recomputeSnapshot(mcpEntityId, testUserId);
    expect(mcpSnapshot!.snapshot.field).toBe("after-mcp-correction");

    const { data: mcpCorrectionRows } = await db
      .from("observations")
      .select("*")
      .eq("entity_id", mcpEntityId)
      .eq("user_id", testUserId);
    const mcpCorrectionRow = (mcpCorrectionRows ?? []).find(
      (row: any) => row.fields?.field === "after-mcp-correction"
    );
    expect(mcpCorrectionRow).toBeDefined();
    expect(mcpCorrectionRow!.observation_source).toBe("correction");
  });

  it("does not promote an ambiguous unmarked historical row to correction authority", async () => {
    const entityId = `ent_2033_premarker_${randomUUID()}`;
    createdEntityIds.push(entityId);

    await createObservation({
      entity_id: entityId,
      entity_type: testEntityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date(Date.now() - 3000).toISOString(),
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "import",
      fields: { field: "A" },
      user_id: testUserId,
      idempotency_key: `2033-premarker-original-${randomUUID()}`,
    });

    // Ordinary historical writers could create the same priority/null-source
    // shape as correct(). Preserve its row, without inferring authority.
    const preMarkerObsId = `obs_2033_premarker_${randomUUID()}`;
    const { error: insertError } = await db.from("observations").insert({
      id: preMarkerObsId,
      entity_id: entityId,
      entity_type: testEntityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date(Date.now() - 1000).toISOString(),
      specificity_score: 1.0,
      source_priority: 1000,
      observation_source: null,
      fields: { field: "B" },
      user_id: testUserId,
      idempotency_key: `2033-premarker-correction-${randomUUID()}`,
      created_at: new Date().toISOString(),
    });
    expect(insertError).toBeNull();

    await createObservation({
      entity_id: entityId,
      entity_type: testEntityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date(Date.now() + 3000).toISOString(),
      specificity_score: 1.0,
      source_priority: 100,
      observation_source: "import",
      fields: { field: "A" },
      user_id: testUserId,
      idempotency_key: `2033-premarker-reingest-${randomUUID()}`,
    });

    const snapshot = await recomputeSnapshot(entityId, testUserId);
    expect(snapshot!.snapshot.field).toBe("A");
    const { data: historical } = await db
      .from("observations")
      .select("*")
      .eq("id", preMarkerObsId)
      .single();
    expect(historical?.fields).toEqual({ field: "B" });
    expect(historical?.observation_source).toBeNull();
  });
});
