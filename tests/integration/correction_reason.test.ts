/**
 * `correct()` cannot record WHY a value changed (see task/PR description).
 *
 * `delete_entity`, `delete_relationship`, `restore_entity`,
 * `restore_relationship`, `merge_entities` (as `merge_reason`), and
 * `split_entity` all accept an optional `reason` field. `correct()` — the
 * engine's most common mutating operation — did not, and `createCorrection`
 * hard-codes `source_id: null`, closing off the indirect "point at the
 * motivating document" route too.
 *
 * This test exercises the REAL write path (`CorrectEntityRequestSchema` +
 * `createCorrection`), not a raw DB insert, so it fails for the right
 * reason: the schema rejecting the field, or the persisted observation
 * row lacking it.
 */

import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { createCorrection } from "../../src/services/correction.js";
import { CorrectEntityRequestSchema } from "../../src/shared/action_schemas.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

describe("correct() reason field", () => {
  const tracker = new TestIdTracker();
  const testUserId = "test-user-correction-reason";

  afterEach(async () => {
    await tracker.cleanup();
  });

  it("CorrectEntityRequestSchema accepts an optional reason field", () => {
    const parsed = CorrectEntityRequestSchema.parse({
      entity_id: "ent_reason_schema_test",
      entity_type: "task",
      field: "title",
      value: "Corrected Title",
      idempotency_key: "idem_reason_schema_test",
      reason: "operator confirmed the correct spelling by phone",
    });

    expect(parsed.reason).toBe("operator confirmed the correct spelling by phone");
  });

  it("createCorrection persists the reason onto the observation row", async () => {
    const entityId = `ent_correct_reason_${Date.now()}`;
    tracker.trackEntity(entityId);

    await db.from("observations").insert({
      entity_id: entityId,
      entity_type: "task",
      source_id: null,
      fields: { title: "Original Title" },
      user_id: testUserId,
      schema_version: "1.0",
      observed_at: new Date().toISOString(),
    });

    const reasonText = "operator corrected after verifying against the source invoice";

    const result = await createCorrection({
      entity_id: entityId,
      entity_type: "task",
      field: "title",
      value: "Corrected Title",
      schema_version: "1.0",
      user_id: testUserId,
      idempotency_key: `idem_${entityId}`,
      reason: reasonText,
    } as Parameters<typeof createCorrection>[0] & { reason: string });

    const { data: row, error } = await db
      .from("observations")
      .select("*")
      .eq("id", result.observation_id)
      .single();

    expect(error).toBeNull();
    expect(row).toBeDefined();
    expect((row as Record<string, unknown>).reason).toBe(reasonText);
  });
});
