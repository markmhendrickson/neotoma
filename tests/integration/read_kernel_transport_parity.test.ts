import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
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
      // Natural built generic CLI must preserve the shared DB error as well.
      const env: NodeJS.ProcessEnv = {
        HOME: process.env.HOME,
        USERPROFILE: process.env.HOME,
        NODE_ENV: "test",
        NEOTOMA_ENV: "development",
        OPENAI_API_KEY: "",
        NEOTOMA_DATA_DIR: config.dataDir,
        NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
      };
      for (const key of [
        "PATH",
        "TMPDIR",
        "NODE_OPTIONS",
        "SCHEMA_GATE_NETWORK_JOURNAL",
        "SCHEMA_GATE_IPC_ROOT",
      ])
        if (process.env[key] !== undefined) env[key] = process.env[key];
      let failure: { code?: unknown; stdout?: string; stderr?: string } | undefined;
      try {
        await promisify(execFile)(
          process.execPath,
          [
            resolve("dist/cli/index.js"),
            "--env",
            "dev",
            "--json",
            "--no-log-file",
            "--api-only",
            "--base-url",
            offline.base,
            "request",
            "--operation",
            "listObservationsForEntity",
            "--body",
            JSON.stringify({ entity_id: id }),
          ],
          { env, timeout: 20000 }
        );
      } catch (error) {
        failure = error as typeof failure;
      }
      expect(failure?.code).toBe(1);
      expect(failure!.stdout).toBe("");
      const line = failure!
        .stderr!.trim()
        .split("\n")
        .reverse()
        .find((line) => line.startsWith('{"error":'));
      expect(line, failure!.stderr).toBeDefined();
      expect(JSON.parse(line!).error).toContain("DB_QUERY_FAILED");
      expect(JSON.parse(line!).error).not.toContain("private query detail");
    } finally {
      spy.mockRestore();
    }
  });
});
