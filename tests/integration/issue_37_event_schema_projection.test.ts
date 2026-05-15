import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

describe("issue 37 event schema projection", () => {
  const testUserId = randomUUID();
  const createdEntityIds: string[] = [];
  let server: NeotomaServer & {
    authenticatedUserId?: string | null;
    store: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
    retrieveEntitySnapshot: (
      args: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
    updateSchemaIncremental: (
      args: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
    retrieveFieldProvenance: (
      args: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  };

  async function cleanup(): Promise<void> {
    if (createdEntityIds.length > 0) {
      const entityIds = [...createdEntityIds];
      createdEntityIds.length = 0;

      const { data: observations } = await db
        .from("observations")
        .select("source_id")
        .in("entity_id", entityIds);

      const sourceIds = Array.from(
        new Set(
          (observations ?? [])
            .map((row) => row.source_id)
            .filter((value): value is string => typeof value === "string"),
        ),
      );

      await db.from("entity_snapshots").delete().in("entity_id", entityIds);
      await db.from("raw_fragments").delete().in("entity_id", entityIds);
      await db.from("observations").delete().in("entity_id", entityIds);
      await db.from("entities").delete().in("id", entityIds);

      if (sourceIds.length > 0) {
        await db.from("sources").delete().in("id", sourceIds);
      }
    }

    await db
      .from("schema_registry")
      .delete()
      .eq("entity_type", "event")
      .eq("scope", "user")
      .eq("user_id", testUserId);
  }

  beforeAll(async () => {
    server = new NeotomaServer() as typeof server;
    server.authenticatedUserId = testUserId;
  });

  beforeEach(async () => {
    server.authenticatedUserId = testUserId;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("bootstraps built-in event schema updates and projects promoted recurrence fields", async () => {
    const title = `Issue 37 Birthday ${Date.now()}`;
    const birthdayEvent = {
      entity_type: "event",
      title,
      date: "1988-05-10",
      event_type: "birthday",
      person_name: "Alice",
      month: "05",
      day: "10",
      recurrence: "annual",
      recurrence_rule: "FREQ=YEARLY",
      all_day: true,
      notes: "birthday reminder",
    };

    const firstStore = JSON.parse(
      (await server.store({
        idempotency_key: `issue-37-first-${Date.now()}`,
        entities: [birthdayEvent],
      })).content[0].text,
    );
    const entityId = firstStore.entities?.[0]?.entity_id as string;
    createdEntityIds.push(entityId);

    const initialSnapshot = JSON.parse(
      (await server.retrieveEntitySnapshot({
        entity_id: entityId,
        format: "json",
      })).content[0].text,
    );
    expect(initialSnapshot.snapshot.recurrence).toBeUndefined();
    expect(initialSnapshot.raw_fragments.recurrence).toBe("annual");

    const schemaUpdate = JSON.parse(
      (await server.updateSchemaIncremental({
        user_specific: true,
        entity_type: "event",
        fields_to_add: [
          { field_name: "date", field_type: "date" },
          { field_name: "person_name", field_type: "string" },
          { field_name: "month", field_type: "string" },
          { field_name: "day", field_type: "string" },
          { field_name: "recurrence", field_type: "string" },
          { field_name: "recurrence_rule", field_type: "string" },
          { field_name: "all_day", field_type: "boolean" },
        ],
        activate: true,
        migrate_existing: true,
      })).content[0].text,
    );
    expect(schemaUpdate.success).toBe(true);
    expect(schemaUpdate.schema_version).toBe("1.1.0");

    const migratedSnapshot = JSON.parse(
      (await server.retrieveEntitySnapshot({
        entity_id: entityId,
        format: "json",
      })).content[0].text,
    );
    expect(migratedSnapshot.snapshot.recurrence).toBe("annual");
    expect(migratedSnapshot.snapshot.recurrence_rule).toBe("FREQ=YEARLY");
    expect(migratedSnapshot.snapshot.person_name).toBe("Alice");

    const migratedProvenance = JSON.parse(
      (await server.retrieveFieldProvenance({
        entity_id: entityId,
        field: "recurrence",
      })).content[0].text,
    );
    expect(migratedProvenance.field).toBe("recurrence");
    expect(migratedProvenance.value).toBe("annual");

    await server.store({
      idempotency_key: `issue-37-second-${Date.now()}`,
      entities: [birthdayEvent],
    });

    const refreshedSnapshot = JSON.parse(
      (await server.retrieveEntitySnapshot({
        entity_id: entityId,
        format: "json",
      })).content[0].text,
    );
    expect(refreshedSnapshot.snapshot.recurrence).toBe("annual");
    expect(refreshedSnapshot.snapshot.recurrence_rule).toBe("FREQ=YEARLY");
    expect(refreshedSnapshot.snapshot.all_day).toBe(true);
    expect(refreshedSnapshot.raw_fragments?.recurrence).toBeUndefined();
  });
});
