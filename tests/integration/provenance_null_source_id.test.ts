/**
 * #2026 — retrieve_field_provenance throws InternalError when an
 * observation has a NULL source_id (provenance unreadable on corrected
 * fields).
 *
 * `correct()` stamps `source_id: null` on every correction observation
 * (src/services/correction.ts), and corrections win the snapshot by
 * priority. `retrieveFieldProvenance` (src/server.ts) throws
 * `McpError(InternalError, "Observation does not have source_id")` when the
 * winning observation for a field has a NULL source_id — so provenance
 * lookup fails on exactly the fields most likely to have been corrected.
 *
 * This test exercises the REAL write + read path end to end: store an
 * entity, correct one of its fields via the MCP `correct()` handler
 * (producing the NULL-source_id observation), then call
 * `retrieveFieldProvenance` on that field and assert it does not throw.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

describe("#2026 retrieve_field_provenance on a corrected (NULL source_id) field", () => {
  const testUserId = randomUUID();
  const createdEntityIds: string[] = [];
  let server: NeotomaServer & {
    authenticatedUserId?: string | null;
    store: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
    correct: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
    retrieveFieldProvenance: (
      args: unknown
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  };

  async function cleanup(): Promise<void> {
    if (createdEntityIds.length === 0) return;
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
          .filter((value): value is string => typeof value === "string")
      )
    );

    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("raw_fragments").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);

    if (sourceIds.length > 0) {
      await db.from("sources").delete().in("id", sourceIds);
    }
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

  it("does not throw and returns meaningful provenance for a corrected field", async () => {
    const title = `Provenance NULL source_id ${Date.now()}`;

    const firstStore = JSON.parse(
      (
        await server.store({
          idempotency_key: `provenance-null-source-first-${Date.now()}`,
          entities: [
            {
              entity_type: "task",
              title,
              canonical_name: title,
            },
          ],
        })
      ).content[0].text
    );
    const entityId = firstStore.entities?.[0]?.entity_id as string;
    expect(entityId).toBeTruthy();
    createdEntityIds.push(entityId);

    // correct() stamps source_id: null on the resulting observation, and
    // corrections win the snapshot by priority (1000).
    await server.correct({
      entity_id: entityId,
      entity_type: "task",
      field: "title",
      value: "Corrected Title",
      idempotency_key: `provenance-null-source-correct-${Date.now()}`,
    });

    let threw = false;
    let provenance: Record<string, unknown> | undefined;
    try {
      const raw = await server.retrieveFieldProvenance({
        entity_id: entityId,
        field: "title",
      });
      provenance = JSON.parse(raw.content[0].text);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(provenance).toBeDefined();
    expect(provenance?.field).toBe("title");
    expect(provenance?.value).toBe("Corrected Title");
    expect(provenance?.source).toBeNull();
  });
});
