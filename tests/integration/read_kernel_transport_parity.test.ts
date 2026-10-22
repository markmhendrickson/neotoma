import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "../../src/repositories/db/connection.js";
import { db } from "../../src/db.js";
import { config } from "../../src/config.js";
import { EmbeddedRuntimeContext } from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";
import { createInternalReadKernel } from "../../src/core/read_kernel.js";
import {
  PARITY_USER_ID,
  makeMcpServer,
  startOfflineServer,
  stopServer,
  callHttp,
} from "../helpers/transport_parity_matrix.js";

// Only optional embedding acquisition is substituted; storage, guards and reads are real.
vi.mock("../../src/embeddings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings.js")>();
  return { ...original, generateEmbedding: vi.fn().mockResolvedValue(null) };
});

const run = randomUUID();
const mcp = makeMcpServer();
let offline: Awaited<ReturnType<typeof startOfflineServer>>;
let context: EmbeddedRuntimeContext;
let kernel: ReturnType<typeof createInternalReadKernel>;
let id: string;
const sources: string[] = [];
async function call(name: string, args: unknown) {
  const raw = await mcp.executeToolForCli(name, args, PARITY_USER_ID);
  return JSON.parse(raw.content[0].text);
}
beforeAll(async () => {
  offline = await startOfflineServer();
  const first = await call("store", {
    entities: [{ entity_type: "task", title: `History kernel ${run}`, status: "pending" }],
    idempotency_key: `history-kernel-store-${run}`,
  });
  id = first.entities[0].entity_id;
  sources.push(first.source_id);
  await new Promise((resolve) => setTimeout(resolve, 2));
  const correction = await callHttp(offline.base, "/correct", {
    entity_id: id,
    entity_type: "task",
    field: "status",
    value: "done",
    idempotency_key: `history-kernel-correct-${run}`,
  });
  expect(correction.status).toBe(200);
  context = new EmbeddedRuntimeContext({
    database: await getDb(),
    configuration: createEmbeddedRuntimeConfiguration({
      dataDirectory: config.dataDir,
      packageRoot: config.projectRoot,
    }),
    legacyIdentityPolicy: { tenantScopedEntityIds: false },
    attributionPolicy: { anonymous_writes: "allow" },
    adapters: {},
  });
  kernel = createInternalReadKernel({ userId: PARITY_USER_ID, runtime: context });
});
afterAll(async () => {
  await kernel?.dispose();
  await context?.dispose();
  if (offline) await stopServer(offline.server);
  if (id) {
    await db.from("observations").delete().eq("entity_id", id).eq("user_id", PARITY_USER_ID);
    await db.from("entity_snapshots").delete().eq("entity_id", id).eq("user_id", PARITY_USER_ID);
    await db.from("entities").delete().eq("id", id).eq("user_id", PARITY_USER_ID);
  }
  for (const source of sources)
    await db.from("sources").delete().eq("id", source).eq("user_id", PARITY_USER_ID);
});
describe("shared legacy observation history query", () => {
  it("matches actual guarded MCP, HTTP and neutral kernel results while preserving wire shapes", async () => {
    const request = { entity_id: id };
    const native = await kernel.listObservations(request);
    const tool = await call("list_observations", request);
    const http = await callHttp(offline.base, "/list_observations", request);
    expect(native.observations.map((row) => row.fields.status)).toEqual(["done", "pending"]);
    expect(native.total).toBe(2);
    expect(tool).toEqual(native);
    expect(http.status).toBe(200);
    expect(http.json).toEqual({ observations: native.observations });
    for (const request of [
      { entity_id: id, offset: 1, limit: 1 },
      { entity_id: id, created_since: native.observations[0].observed_at },
      { entity_id: id, updated_since: native.observations[0].observed_at },
    ]) {
      const page = await kernel.execute("list_observations", request);
      expect(await call("list_observations", request)).toEqual(page);
      expect((await callHttp(offline.base, "/list_observations", request)).json).toEqual({
        observations: page.observations,
      });
    }
  });
  it("maps a shared query failure in each adapter without leaking driver details", async () => {
    const database = await getDb();
    const original = database.prepare.bind(database);
    const spy = vi.spyOn(database, "prepare").mockImplementation((sql) => {
      if (sql.includes("FROM observations") && sql.startsWith("SELECT"))
        throw new Error("synthetic private query detail");
      return original(sql);
    });
    try {
      await expect(kernel.listObservations({ entity_id: id })).rejects.toMatchObject({
        name: "OperationError",
        statusCode: 500,
      });
      await expect(call("list_observations", { entity_id: id })).rejects.toMatchObject({
        data: { error_code: "DB_QUERY_FAILED" },
      });
      const http = await callHttp(offline.base, "/list_observations", { entity_id: id });
      expect(http.status).toBe(500);
      expect(http.json.error_code).toBe("DB_QUERY_FAILED");
      expect(JSON.stringify(http.json)).not.toContain("private query detail");
    } finally {
      spy.mockRestore();
    }
  });
});
