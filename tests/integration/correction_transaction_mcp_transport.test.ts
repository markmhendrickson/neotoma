/**
 * Compare-only participants through the actual Streamable HTTP MCP transport.
 * The service and NeotomaServer.executeTool tests do not exercise /mcp request
 * parsing, tool input validation, or request-scoped authentication.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  toolResultJson,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const OWNER = "aaaaaaaa-2395-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-2395-4bbb-8bbb-bbbbbbbbbbbb";
const KIND = "compare_only_transport_test";

vi.mock("../../src/services/mcp_oauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/mcp_oauth.js")>();
  return {
    ...actual,
    getAccessTokenForConnection: vi.fn(async (connectionId: string) => {
      const userId =
        connectionId === "conn-2395-owner"
          ? OWNER
          : connectionId === "conn-2395-other"
            ? OTHER
            : undefined;
      if (!userId) throw new Error("Connection not found");
      return { accessToken: `test-access-${connectionId}`, userId };
    }),
  };
});

describe("compare-only correction through POST /mcp tools/call", () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;
  let db: typeof import("../../src/db.js").db;
  let recomputeSnapshot: typeof import("../../src/services/snapshot_computation.js").recomputeSnapshot;
  let getEntityWithProvenance: typeof import("../../src/services/entity_queries.js").getEntityWithProvenance;
  let getDb: typeof import("../../src/repositories/db/connection.js").getDb;
  let previousHttpHost: string | undefined;

  beforeEach(async () => {
    previousHttpHost = process.env.NEOTOMA_HTTP_HOST;
    process.env.NEOTOMA_HTTP_HOST = "127.0.0.1";
    env = prepareMcpTestEnv("neotoma-2395-mcp-transport-");
    app = await bootMcpApp();
    ({ db } = await import("../../src/db.js"));
    ({ recomputeSnapshot } = await import("../../src/services/snapshot_computation.js"));
    ({ getEntityWithProvenance } = await import("../../src/services/entity_queries.js"));
    ({ getDb } = await import("../../src/repositories/db/connection.js"));
    for (const owner of [OWNER, OTHER]) {
      const registered = await db.from("schema_registry").insert({
        id: `schema-2395-${owner}`,
        entity_type: KIND,
        schema_version: "1.0",
        active: true,
        scope: "user",
        user_id: owner,
        created_at: "2026-01-01T00:00:00.000Z",
        schema_definition: {
          fields: {
            title: { type: "string" },
            status: { type: "string" },
            remaining: { type: "number" },
          },
          canonical_name_fields: ["title"],
        },
        reducer_config: {
          merge_policies: {
            title: { strategy: "highest_priority", tie_breaker: "observed_at" },
            status: { strategy: "highest_priority", tie_breaker: "observed_at" },
            remaining: { strategy: "highest_priority", tie_breaker: "observed_at" },
          },
        },
      });
      expect(registered.error).toBeNull();
    }
  });

  afterEach(async () => {
    await app.close();
    vi.resetModules();
    env.restore();
    if (previousHttpHost === undefined) delete process.env.NEOTOMA_HTTP_HOST;
    else process.env.NEOTOMA_HTTP_HOST = previousHttpHost;
  });

  async function seed(id: string, owner: string, fields: Record<string, unknown>) {
    expect(
      (
        await db
          .from("entities")
          .insert({ id, entity_type: KIND, canonical_name: id, user_id: owner })
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("observations").insert({
          id: `seed-${id}`,
          entity_id: id,
          entity_type: KIND,
          user_id: owner,
          fields,
          schema_version: "1.0",
          source_priority: 10,
          observed_at: "2026-01-01T00:00:00.000Z",
        })
      ).error
    ).toBeNull();
    await recomputeSnapshot(id, owner);
  }

  async function count(id: string) {
    const rows = await db.from("observations").select("id").eq("entity_id", id);
    expect(rows.error).toBeNull();
    return rows.data?.length ?? 0;
  }

  async function call(input: Record<string, unknown>, connectionId: string, id: number) {
    return modernPost(
      app.baseUrl,
      {
        id,
        method: "tools/call",
        params: { name: "correct_transaction", arguments: input },
      },
      { connectionId }
    );
  }

  function input(writer: string, guard: string, key: string) {
    return {
      idempotency_key: key,
      entities: [
        {
          entity_id: writer,
          entity_type: KIND,
          expected_observation_count: 1,
          expected_snapshot: { status: "ready" },
          changes: [{ field: "status", value: "approved" }],
        },
        {
          entity_id: guard,
          entity_type: KIND,
          expected_observation_count: 1,
          expected_snapshot: { remaining: 1 },
          changes: [],
        },
      ],
    };
  }

  function isRefusal(reply: Awaited<ReturnType<typeof call>>) {
    return reply.status >= 400 || Boolean(reply.body?.error || reply.body?.result?.isError);
  }

  it("writes only the writer, replays without growth, and rejects a stale guard", async () => {
    await seed("ent_2395_writer", OWNER, { title: "Writer", status: "ready" });
    await seed("ent_2395_guard", OWNER, { title: "Guard", remaining: 1 });
    const first = input("ent_2395_writer", "ent_2395_guard", "mcp-2395-apply");
    const applied = await call(first, "conn-2395-owner", 1);
    expect(applied.status, applied.text).toBe(200);
    expect(applied.body?.result?.isError, applied.text).not.toBe(true);
    expect(toolResultJson(applied.body).status).toBe("applied");
    expect(await count("ent_2395_writer")).toBe(2);
    expect(await count("ent_2395_guard")).toBe(1);

    const replay = await call(first, "conn-2395-owner", 2);
    expect(toolResultJson(replay.body).status).toBe("replayed");
    expect(await count("ent_2395_writer")).toBe(2);
    expect(await count("ent_2395_guard")).toBe(1);

    await seed("ent_2395_stale_writer", OWNER, { title: "Stale writer", status: "ready" });
    const stale = input("ent_2395_stale_writer", "ent_2395_guard", "mcp-2395-stale");
    expect(
      (
        await db.from("observations").insert({
          id: "advance-2395-guard",
          entity_id: "ent_2395_guard",
          entity_type: KIND,
          user_id: OWNER,
          fields: { remaining: 0 },
          schema_version: "1.0",
          source_priority: 20,
          observed_at: "2026-01-02T00:00:00.000Z",
        })
      ).error
    ).toBeNull();
    await recomputeSnapshot("ent_2395_guard", OWNER);
    const denied = await call(stale, "conn-2395-owner", 3);
    expect(isRefusal(denied), denied.text).toBe(true);
    expect(await count("ent_2395_stale_writer")).toBe(1);
    expect(
      (await getEntityWithProvenance("ent_2395_stale_writer", false, OWNER))?.snapshot
    ).toMatchObject({ status: "ready" });
  });

  it("cannot use a foreign guard to authorize an authenticated writer", async () => {
    await seed("ent_2395_other_writer", OTHER, { title: "Other writer", status: "ready" });
    await seed("ent_2395_owner_guard", OWNER, { title: "Owner guard", remaining: 1 });
    const denied = await call(
      input("ent_2395_other_writer", "ent_2395_owner_guard", "mcp-2395-foreign"),
      "conn-2395-other",
      4
    );
    expect(isRefusal(denied), denied.text).toBe(true);
    expect(denied.text).toContain("authenticated graph");
    expect(await count("ent_2395_other_writer")).toBe(1);
    expect(await count("ent_2395_owner_guard")).toBe(1);
    expect(
      (await getEntityWithProvenance("ent_2395_other_writer", false, OTHER))?.snapshot
    ).toMatchObject({ status: "ready" });

    await seed("ent_2395_other_guard", OTHER, { title: "Other guard", remaining: 1 });
    const allowed = await call(
      input("ent_2395_other_writer", "ent_2395_other_guard", "mcp-2395-other-allowed"),
      "conn-2395-other",
      5
    );
    expect(allowed.status, allowed.text).toBe(200);
    expect(toolResultJson(allowed.body).status).toBe("applied");
    expect(await count("ent_2395_other_writer")).toBe(2);
    expect(await count("ent_2395_other_guard")).toBe(1);
  });

  it("rolls back an earlier writer when a later MCP writer fails, then replays without growth", async () => {
    await seed("ent_2395_first_writer", OWNER, { title: "First", status: "ready" });
    await seed("ent_2395_guard_rollback", OWNER, { title: "Guard", remaining: 1 });
    await seed("ent_2395_later_writer", OWNER, { title: "Later", status: "ready" });
    const original = input(
      "ent_2395_first_writer",
      "ent_2395_guard_rollback",
      "mcp-2395-later-failure"
    );
    original.entities.push({
      entity_id: "ent_2395_later_writer",
      entity_type: KIND,
      expected_observation_count: 1,
      expected_snapshot: { status: "ready" },
      changes: [{ field: "status", value: "approved" }],
    });
    const connection = await getDb();
    await connection.exec(
      "CREATE TRIGGER fail_2395_later BEFORE INSERT ON observations WHEN NEW.entity_id = 'ent_2395_later_writer' BEGIN SELECT RAISE(ABORT, 'injected later writer failure'); END"
    );
    try {
      const denied = await call(original, "conn-2395-owner", 6);
      expect(isRefusal(denied), denied.text).toBe(true);
      for (const id of [
        "ent_2395_first_writer",
        "ent_2395_guard_rollback",
        "ent_2395_later_writer",
      ])
        expect(await count(id)).toBe(1);
      expect(
        (await getEntityWithProvenance("ent_2395_first_writer", false, OWNER))?.snapshot
      ).toMatchObject({ status: "ready" });
    } finally {
      await connection.exec("DROP TRIGGER IF EXISTS fail_2395_later");
    }
    const applied = await call(original, "conn-2395-owner", 7);
    expect(toolResultJson(applied.body).status).toBe("applied");
    expect(await count("ent_2395_first_writer")).toBe(2);
    expect(await count("ent_2395_guard_rollback")).toBe(1);
    expect(await count("ent_2395_later_writer")).toBe(2);
    const replay = await call(original, "conn-2395-owner", 8);
    expect(toolResultJson(replay.body).status).toBe("replayed");
    expect(await count("ent_2395_first_writer")).toBe(2);
    expect(await count("ent_2395_later_writer")).toBe(2);
    const changed = structuredClone(original);
    changed.entities[2].changes[0].value = "changed";
    const changedReply = await call(changed, "conn-2395-owner", 9);
    expect(isRefusal(changedReply), changedReply.text).toBe(true);
    expect(changedReply.text).toMatch(/idempotency/i);
    expect(await count("ent_2395_first_writer")).toBe(2);
    expect(await count("ent_2395_later_writer")).toBe(2);
  });
});
