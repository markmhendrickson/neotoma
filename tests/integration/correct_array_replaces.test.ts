/**
 * `correct()` on a `merge_array` field replaces the array, so a later
 * correction can remove members an earlier one added (#2341).
 *
 * Every correction is written at the same priority, so before the fix the
 * reducer unioned them: a correction could add array members but never remove
 * one. The reported case: a field holding a 34-member list, corrected to a
 * 10-member list, read back as the union of both.
 *
 * Each case runs the real write path (store, then correct over MCP and over
 * HTTP `POST /correct`) and reads the stored snapshot back, because a
 * correction that reports success has not necessarily changed the snapshot.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
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
const TYPE = "test_array_correction_2341";

type McpTextResult = { content: Array<{ type?: string; text: string }> };

type TestServer = NeotomaServer & {
  authenticatedUserId?: string | null;
  store: (args: Record<string, unknown>) => Promise<McpTextResult>;
  correct: (args: Record<string, unknown>) => Promise<McpTextResult>;
};

function parse(result: McpTextResult): Record<string, any> {
  return JSON.parse(result.content.find((c) => c.text)?.text ?? "{}");
}

const wide = Array.from({ length: 34 }, (_, i) => `member_${String(i).padStart(2, "0")}`);
const narrow = wide.slice(0, 10);

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
    await db.from("timeline_events").delete().in("entity_id", entityIds);
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("raw_fragments").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);
    if (sourceIds.length > 0) await db.from("sources").delete().in("id", sourceIds);
  }
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
}

describe("correct() replaces a merge_array field (#2341)", () => {
  let server: TestServer;
  let httpServer: ReturnType<typeof createServer>;
  let apiBase: string;

  async function storeEntity(label: string, members: string[]): Promise<string> {
    const stored = parse(
      await server.store({
        user_id: USER_ID,
        idempotency_key: `seed-2341-${label}-${randomUUID()}`,
        commit: true,
        entities: [{ entity_type: TYPE, label, members }],
      })
    );
    const entityId = stored.entities?.[0]?.entity_id;
    expect(typeof entityId).toBe("string");
    return entityId as string;
  }

  // Corrections are ordered by observed_at (millisecond precision), then
  // created_at, then id. Two corrections landing in the same millisecond are
  // ordered by id, which is deterministic but not "the later call", so each
  // helper waits out the millisecond to test the ordering a caller expects.
  const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 5));

  async function mcpCorrect(entityId: string, value: unknown) {
    await nextMillisecond();
    const out = parse(
      await server.correct({
        user_id: USER_ID,
        entity_id: entityId,
        entity_type: TYPE,
        field: "members",
        value,
        idempotency_key: `correct-2341-${randomUUID()}`,
      })
    );
    expect(typeof out.observation_id).toBe("string");
    return out;
  }

  async function httpCorrect(entityId: string, value: unknown) {
    await nextMillisecond();
    const res = await fetch(`${apiBase}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        entity_type: TYPE,
        field: "members",
        value,
        idempotency_key: `correct-http-2341-${randomUUID()}`,
      }),
    });
    expect(res.status).toBe(200);
  }

  async function members(entityId: string): Promise<unknown[]> {
    const { data: snap } = await db
      .from("entity_snapshots")
      .select("snapshot")
      .eq("entity_id", entityId)
      .single();
    const snapshot =
      typeof snap?.snapshot === "string" ? JSON.parse(snap.snapshot) : snap?.snapshot;
    return snapshot?.members as unknown[];
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
          label: { type: "string", required: true },
          members: { type: "array", required: false },
        },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write" },
          members: { strategy: "merge_array" },
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

  it("MCP: a 10-member correction after a 34-member correction reads back as exactly 10", async () => {
    const entityId = await storeEntity(`mcp-${randomUUID()}`, wide);
    await mcpCorrect(entityId, wide);
    expect(await members(entityId)).toHaveLength(34);

    await mcpCorrect(entityId, narrow);

    const after = await members(entityId);
    expect(after).toHaveLength(10);
    expect([...after].sort()).toEqual([...narrow].sort());
  });

  it("MCP: an empty correction clears the field and a later correction sets it again", async () => {
    const entityId = await storeEntity(`mcp-clear-${randomUUID()}`, ["seed"]);
    await mcpCorrect(entityId, ["a", "b"]);
    await mcpCorrect(entityId, []);
    expect(await members(entityId)).toEqual([]);

    await mcpCorrect(entityId, ["c"]);
    expect(await members(entityId)).toEqual(["c"]);
  });

  it("HTTP /correct: the same replacement holds on the REST surface", async () => {
    const entityId = await storeEntity(`http-${randomUUID()}`, wide);
    await httpCorrect(entityId, wide);
    expect(await members(entityId)).toHaveLength(34);

    await httpCorrect(entityId, narrow);

    const after = await members(entityId);
    expect(after).toHaveLength(10);
    expect([...after].sort()).toEqual([...narrow].sort());
  });

  it("an ordinary store after the correction does not bring removed members back", async () => {
    const label = `store-after-${randomUUID()}`;
    const entityId = await storeEntity(label, wide);
    await mcpCorrect(entityId, narrow);
    // Same entity, same default priority as the first store.
    const again = await storeEntity(label, wide);
    expect(again).toBe(entityId);

    const after = await members(entityId);
    expect([...after].sort()).toEqual([...narrow].sort());
  });

  it("ordinary stores of the same entity still union (the control)", async () => {
    const label = `control-${randomUUID()}`;
    const entityId = await storeEntity(label, ["alpha"]);
    await storeEntity(label, ["beta"]);
    expect([...(await members(entityId))].sort()).toEqual(["alpha", "beta"]);
  });
});
