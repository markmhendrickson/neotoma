/**
 * Regression test for issue #203: exercise_log entities silently dropped when
 * batched with workout_session in a single store call with intra-batch PART_OF
 * relationships.
 *
 * Root cause: storeStructuredInternal committed entities one-by-one inside the
 * entity loop. If an entity failed to resolve (e.g. ERR_CANONICAL_NAME_UNRESOLVED)
 * any earlier entities were already written and the error caused the loop to exit
 * early, leaving later entities unwritten with no indication to the caller.
 *
 * Fix: a pre-resolution pass using commit=false validates all entities before any
 * writes occur. If any entity fails, the entire batch is rejected with a clear
 * error listing all failures.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("MCP store: intra-batch relationships (issue #203)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    await cleanupEntityType("workout_session", TEST_USER_ID);
    await cleanupEntityType("exercise_log", TEST_USER_ID);
  });

  it("creates all entities and PART_OF relationships when batched together", async () => {
    const idempotencyKey = `issue-203-regression-${Date.now()}`;

    const result = await (
      server as unknown as {
        store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: idempotencyKey,
      commit: true,
      entities: [
        {
          entity_type: "workout_session",
          name: "Metropolitan Bench Press Session",
          date: "2026-05-16",
          location: "Metropolitan Gym",
        },
        {
          entity_type: "exercise_log",
          name: "Bench Press – Set 1 – Metropolitan 2026-05-16",
          exercise: "Bench Press",
          set_number: 1,
          weight_kg: 80,
          reps: 8,
        },
        {
          entity_type: "exercise_log",
          name: "Bench Press – Set 2 – Metropolitan 2026-05-16",
          exercise: "Bench Press",
          set_number: 2,
          weight_kg: 80,
          reps: 8,
        },
        {
          entity_type: "exercise_log",
          name: "Bench Press – Set 3 – Metropolitan 2026-05-16",
          exercise: "Bench Press",
          set_number: 3,
          weight_kg: 82.5,
          reps: 6,
        },
        {
          entity_type: "exercise_log",
          name: "Bench Press – Set 4 – Metropolitan 2026-05-16",
          exercise: "Bench Press",
          set_number: 4,
          weight_kg: 82.5,
          reps: 5,
        },
      ],
      relationships: [
        { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
        { relationship_type: "PART_OF", source_index: 2, target_index: 0 },
        { relationship_type: "PART_OF", source_index: 3, target_index: 0 },
        { relationship_type: "PART_OF", source_index: 4, target_index: 0 },
      ],
    });

    const body = JSON.parse(result.content[0].text) as {
      entities?: Array<{ entity_id: string; entity_type: string }>;
      error?: { code?: string; message?: string };
    };

    // All 5 entities must be present — the original bug returned only 1.
    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.entities).toHaveLength(5);

    const entityTypes = body.entities!.map((e) => e.entity_type);
    const workoutCount = entityTypes.filter((t) => t === "workout_session").length;
    const logCount = entityTypes.filter((t) => t === "exercise_log").length;

    expect(workoutCount).toBe(1);
    expect(logCount).toBe(4);

    // All entity IDs must be distinct and non-empty.
    const entityIds = body.entities!.map((e) => e.entity_id);
    expect(new Set(entityIds).size).toBe(5);
    for (const id of entityIds) {
      expect(id).toMatch(/^ent_/);
    }
  });

  it("returns a clear error (not silent drop) when an entity in the batch cannot be resolved", async () => {
    // Send a batch where one entity intentionally lacks any identity fields so
    // the pre-resolution pass will catch the failure and reject the whole batch.
    // The pre-resolution pass throws McpError when any entity fails, preventing
    // any partial writes. We expect the call to throw (not silently return).
    const storeCall = (
      server as unknown as {
        store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-203-error-regression-${Date.now()}`,
      commit: true,
      strict: true, // strict mode forces hard failure on unresolvable entities
      entities: [
        {
          entity_type: "workout_session",
          name: "Good Session",
        },
        {
          // No identity fields at all in strict mode — resolver should fail
          entity_type: "exercise_log",
        },
      ],
    });

    // The batch must be rejected with an error, not silently partial-written.
    // The pre-resolution pass throws McpError, so we expect a rejection.
    await expect(storeCall).rejects.toThrow(/entity resolution issue/);
  });
});
