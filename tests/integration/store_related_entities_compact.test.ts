/**
 * The MCP `store` response keeps `related_entities` compact by default.
 *
 * Before this change every related entity came back as its full row plus its
 * whole current snapshot, so a one-entity write that linked to a plan with a
 * large snapshot returned hundreds of kilobytes. The default is now
 * `{id, entity_type, canonical_name}` per related entity, and
 * `include_related_snapshots: true` restores the full shape.
 *
 * Each case runs the real write path and parses the actual response text.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { buildToolDefinitions } from "../../src/tool_definitions.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

vi.mock("../../src/embeddings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings.js")>();
  return {
    ...original,
    generateEmbedding: vi.fn().mockResolvedValue(null),
  };
});

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_compact_related_store";

type McpTextResult = { content: Array<{ type?: string; text: string }> };

type TestServer = NeotomaServer & {
  authenticatedUserId?: string | null;
  store: (args: Record<string, unknown>) => Promise<McpTextResult>;
};

const textOf = (result: McpTextResult): string => result.content.find((c) => c.text)?.text ?? "{}";
const parse = (result: McpTextResult): Record<string, any> => JSON.parse(textOf(result));

async function cleanupType(): Promise<void> {
  const { data: entities } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", TYPE)
    .eq("user_id", USER_ID);
  const entityIds = (entities ?? []).map((e: { id: string }) => e.id);
  if (entityIds.length > 0) {
    const { data: observations } = await db
      .from("observations")
      .select("source_id")
      .in("entity_id", entityIds);
    const sourceIds = Array.from(
      new Set(
        (observations ?? [])
          .map((r: { source_id?: string | null }) => r.source_id)
          .filter((v: unknown): v is string => typeof v === "string")
      )
    );
    await db.from("relationship_snapshots").delete().in("source_entity_id", entityIds);
    await db.from("relationship_snapshots").delete().in("target_entity_id", entityIds);
    await db.from("timeline_events").delete().in("entity_id", entityIds);
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("raw_fragments").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);
    if (sourceIds.length > 0) await db.from("sources").delete().in("id", sourceIds);
  }
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
}

describe("store response: compact related_entities by default", () => {
  let server: TestServer;
  let httpServer: ReturnType<typeof createServer>;
  let apiBase: string;

  async function storeTarget(notesLength: number) {
    const name = `target-${randomUUID()}`;
    const stored = parse(
      await server.store({
        user_id: USER_ID,
        idempotency_key: `target-${randomUUID()}`,
        entities: [{ entity_type: TYPE, name, notes: "x".repeat(notesLength) }],
      })
    );
    const id = stored.entities[0].entity_id as string;
    const { data: row } = await db.from("entities").select("canonical_name").eq("id", id).single();
    return { name, id, canonicalName: row.canonical_name as string };
  }

  function linkedStoreArgs(targetId: string, key: string, extra: Record<string, unknown> = {}) {
    return {
      user_id: USER_ID,
      idempotency_key: key,
      entities: [{ entity_type: TYPE, name: `source-${randomUUID()}`, notes: "small" }],
      relationships: [
        { relationship_type: "PART_OF", source_index: 0, target_entity_id: targetId },
      ],
      ...extra,
    };
  }

  beforeAll(async () => {
    await cleanupType();
    server = new NeotomaServer() as TestServer;
    server.authenticatedUserId = USER_ID;

    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: true },
          notes: { type: "string", required: false, preserveCase: true },
        },
        canonical_name_fields: ["name"],
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          notes: { strategy: "last_write" },
        },
      },
      user_id: USER_ID,
      user_specific: true,
      activate: true,
      force: true,
    });

    httpServer = createServer(app);
    await new Promise<void>((resolveListen, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolveListen());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected TCP listen address");
    apiBase = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupType();
  });

  it("returns {id, entity_type, canonical_name} for each related entity, with no snapshot", async () => {
    const target = await storeTarget(1_000);

    const response = parse(await server.store(linkedStoreArgs(target.id, `k-${randomUUID()}`)));

    expect(response.related_entities).toHaveLength(1);
    expect(response.related_entities[0]).toEqual({
      id: target.id,
      entity_type: TYPE,
      canonical_name: target.canonicalName,
    });
    expect(Object.keys(response.related_entities[0]).sort()).toEqual([
      "canonical_name",
      "entity_type",
      "id",
    ]);
    expect(response.related_relationships.length).toBeGreaterThan(0);
  });

  it("keeps the response bounded however large the related entity's snapshot is", async () => {
    const small = await storeTarget(1_000);
    const large = await storeTarget(300_000);

    const smallText = textOf(await server.store(linkedStoreArgs(small.id, `k-${randomUUID()}`)));
    const largeText = textOf(await server.store(linkedStoreArgs(large.id, `k-${randomUUID()}`)));

    // The related entity's snapshot alone is >300,000 characters. The default
    // response must not grow with it.
    expect(largeText.length).toBeLessThan(20_000);
    expect(Math.abs(largeText.length - smallText.length)).toBeLessThan(2_000);
  });

  it("include_related_snapshots: true restores the full row and snapshot", async () => {
    const target = await storeTarget(50_000);

    const text = textOf(
      await server.store(
        linkedStoreArgs(target.id, `k-${randomUUID()}`, { include_related_snapshots: true })
      )
    );
    const response = JSON.parse(text);

    expect(text.length).toBeGreaterThan(50_000);
    const related = response.related_entities[0];
    expect(related.id).toBe(target.id);
    expect(related.snapshot.snapshot.notes).toHaveLength(50_000);
    expect(related.user_id).toBeDefined();
  });

  it("the flag changes only the response, not what is written", async () => {
    const target = await storeTarget(1_000);
    const compact = parse(await server.store(linkedStoreArgs(target.id, `k-${randomUUID()}`)));
    const full = parse(
      await server.store(
        linkedStoreArgs(target.id, `k-${randomUUID()}`, { include_related_snapshots: true })
      )
    );

    expect(compact.entities).toHaveLength(1);
    expect(full.entities).toHaveLength(1);
    expect(compact.related_entities.map((e: { id: string }) => e.id)).toEqual(
      full.related_entities.map((e: { id: string }) => e.id)
    );
    expect(compact.related_entities[0].canonical_name).toBe(
      full.related_entities[0].canonical_name
    );
  });

  it("an idempotent replay follows the same default and opt-in", async () => {
    const target = await storeTarget(20_000);
    const key = `replay-${randomUUID()}`;
    const args = linkedStoreArgs(target.id, key);
    await server.store(args);

    const compactReplay = parse(await server.store(args));
    expect(compactReplay.related_entities[0]).toEqual({
      id: target.id,
      entity_type: TYPE,
      canonical_name: target.canonicalName,
    });

    const fullReplay = parse(await server.store({ ...args, include_related_snapshots: true }));
    expect(fullReplay.related_entities[0].snapshot.snapshot.notes).toHaveLength(20_000);
  });

  it("is declared on the store tool input schema", () => {
    const store = buildToolDefinitions().find((tool) => tool.name === "store");
    const property = (store?.inputSchema as any).properties.include_related_snapshots;
    expect(property.type).toBe("boolean");
    expect(property.description).toMatch(/related_entities/);
  });

  it("is accepted by POST /store, whose response carries no related_entities", async () => {
    const res = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `http-${randomUUID()}`,
        include_related_snapshots: true,
        entities: [{ entity_type: TYPE, name: `http-${randomUUID()}`, notes: "x" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.related_entities).toBeUndefined();
  });
});
