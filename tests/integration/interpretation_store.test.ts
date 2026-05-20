import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";

describe("interpretation-aware structured store", () => {
  const userId = "test-user-interpretation-store";
  const entityType = "interpretation_store_test_note";

  afterEach(async () => {
    const { data: observations } = await db
      .from("observations")
      .select("entity_id, source_id, interpretation_id")
      .eq("user_id", userId);
    const entityIds = Array.from(
      new Set((observations ?? []).map((obs: any) => obs.entity_id).filter(Boolean))
    );
    const sourceIds = Array.from(
      new Set((observations ?? []).map((obs: any) => obs.source_id).filter(Boolean))
    );
    const interpretationIds = Array.from(
      new Set((observations ?? []).map((obs: any) => obs.interpretation_id).filter(Boolean))
    );

    await db.from("timeline_events").delete().eq("user_id", userId);
    if (entityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    }
    await db.from("observations").delete().eq("user_id", userId);
    if (interpretationIds.length > 0) {
      await db.from("interpretations").delete().in("id", interpretationIds);
    }
    if (sourceIds.length > 0) {
      await db.from("sources").delete().in("id", sourceIds);
    }
    if (entityIds.length > 0) {
      await db.from("entities").delete().in("id", entityIds);
    }
  });

  it("keeps interpretation_id null for ordinary structured stores", async () => {
    const result = await storeStructuredForApi({
      userId,
      entities: [
        {
          entity_type: entityType,
          title: `Ordinary structured note ${randomUUID()}`,
          content: "Structured fact supplied directly by the caller.",
        },
      ],
      sourcePriority: 100,
      idempotencyKey: `ordinary-${randomUUID()}`,
    });

    const observationId = (result.entities[0] as any).observation_id as string;
    const { data: observation, error } = await db
      .from("observations")
      .select("interpretation_id")
      .eq("id", observationId)
      .single();

    expect(error).toBeNull();
    expect(observation?.interpretation_id).toBeNull();
  });

  it("creates an interpretation row and links observations when requested", async () => {
    const sourceId = randomUUID();
    const { data: source, error: sourceError } = await db
      .from("sources")
      .insert({
        id: sourceId,
        user_id: userId,
        content_hash: `interpretation-source-${randomUUID()}`,
        storage_url: "file:///tmp/source.txt",
        mime_type: "text/plain",
        file_size: 42,
      })
      .select("id")
      .single();
    expect(sourceError).toBeNull();

    const result = await storeStructuredForApi({
      userId,
      entities: [
        {
          entity_type: entityType,
          title: `Interpreted note ${randomUUID()}`,
          content: "Extracted from a raw source by an agent parser.",
        },
      ],
      sourcePriority: 100,
      idempotencyKey: `interpreted-${randomUUID()}`,
      interpretation: {
        source_id: source!.id,
        interpretation_config: {
          extractor_type: "agent",
          extractor_version: "test",
          schema_version: "1.0",
        },
      },
    });

    const observationId = (result.entities[0] as any).observation_id as string;
    expect(result.interpretation_id).toBeTruthy();
    expect(result.interpretation_source_id).toBe(source!.id);

    const { data: observation, error } = await db
      .from("observations")
      .select("source_id, interpretation_id")
      .eq("id", observationId)
      .single();
    expect(error).toBeNull();
    expect(observation?.source_id).toBe(source!.id);
    expect(observation?.interpretation_id).toBe(result.interpretation_id);

    const { data: interpretation } = await db
      .from("interpretations")
      .select("source_id, status")
      .eq("id", result.interpretation_id as string)
      .single();
    expect(interpretation?.source_id).toBe(source!.id);
    expect(interpretation?.status).toBe("completed");
  });
});
