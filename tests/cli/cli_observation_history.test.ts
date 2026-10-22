/** Natural generic listObservationsForEntity effects, not observations/query. */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../src/config.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { startOfflineServer, stopServer } from "../helpers/transport_parity_matrix.js";

const exec = promisify(execFile);
const FOREIGN = "00000000-0000-4000-8000-000000000099";
type Row = Record<string, any>;

describe.each(["offline", "api"] as const)("built generic history CLI, %s", (mode) => {
  const entityType = `cli_history_${randomUUID().replaceAll("-", "")}`;
  let home: string;
  let api: Awaited<ReturnType<typeof startOfflineServer>> | undefined;
  let env: NodeJS.ProcessEnv;
  let database: AsyncSqliteDatabase;
  let entityId: string;
  let rows: Row[];
  async function request(operation: string, body: unknown): Promise<Row> {
    const result = await exec(
      process.execPath,
      [
        resolve("dist/cli/index.js"),
        "--env",
        "dev",
        "--json",
        "--no-log-file",
        ...(mode === "offline" ? ["--offline"] : ["--api-only", "--base-url", api!.base]),
        "request",
        "--operation",
        operation,
        "--body",
        JSON.stringify(body),
      ],
      { env, timeout: 20000, maxBuffer: 2 * 1024 * 1024 }
    );
    return JSON.parse(result.stdout);
  }
  const history = (body = {}) =>
    request("listObservationsForEntity", { entity_id: entityId, ...body });
  beforeAll(async () => {
    expect(process.env.NODE_ENV).toBe("test");
    if (mode === "api") api = await startOfflineServer();
    home = await mkdtemp(join(tmpdir(), "cli-history-"));
    env = {
      HOME: home,
      USERPROFILE: home,
      NODE_ENV: "test",
      NEOTOMA_ENV: "development",
      OPENAI_API_KEY: "",
      NEOTOMA_FORCE_MODE: "refuse",
    };
    for (const key of [
      "PATH",
      "TMPDIR",
      "LANG",
      "NODE_OPTIONS",
      "SCHEMA_GATE_NETWORK_JOURNAL",
      "SCHEMA_GATE_IPC_ROOT",
      "ICON_GENERATION_ENABLED",
      "TUNNEL_AUTO_DISCOVER",
    ])
      if (process.env[key] !== undefined) env[key] = process.env[key];
    env.NEOTOMA_DATA_DIR = mode === "offline" ? join(home, "data") : config.dataDir;
    env.NEOTOMA_SQLITE_PATH =
      mode === "offline" ? join(home, "data/neotoma.db") : config.sqlitePath;
    env.NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR = "1";
    await request("registerSchema", {
      entity_type: entityType,
      schema_version: "1.0",
      activate: true,
      schema_definition: {
        fields: { title: { type: "string" }, value: { type: "number" } },
        canonical_name_fields: ["title"],
      },
      reducer_config: {
        merge_policies: { title: { strategy: "last_write" }, value: { strategy: "last_write" } },
      },
    });
    const stored = await request("store", {
      entities: [{ entity_type: entityType, title: "Synthetic history", value: 1 }],
      idempotency_key: randomUUID(),
    });
    entityId = stored.entities[0].entity_id;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await request("correct", {
      entity_id: entityId,
      entity_type: entityType,
      field: "value",
      value: 2,
      idempotency_key: randomUUID(),
    });
    database = new AsyncSqliteDatabase(env.NEOTOMA_SQLITE_PATH!, {
      existing: true,
      readOnly: false,
    });
    rows = (await database
      .prepare("SELECT * FROM observations WHERE entity_id=? ORDER BY observed_at DESC")
      .all(entityId)) as Row[];
    expect(rows).toHaveLength(2);
  });
  afterAll(async () => {
    if (database) {
      for (const table of ["timeline_events", "observations", "entity_snapshots"])
        await database.prepare(`DELETE FROM ${table} WHERE entity_id=?`).run(entityId);
      await database.prepare("DELETE FROM entities WHERE id=?").run(entityId);
      for (const source of new Set(rows?.map((row) => row.source_id).filter(Boolean)))
        await database.prepare("DELETE FROM sources WHERE id=?").run(source);
      await database.prepare("DELETE FROM schema_registry WHERE entity_type=?").run(entityType);
      await database.close();
    }
    if (api) await stopServer(api.server);
    if (home) await rm(home, { recursive: true, force: true });
  });
  it("returns guarded store/correct history and preserves paging/cutoffs with the HTTP wire shape", async () => {
    const all = await history();
    expect(Object.keys(all).filter((key) => key !== "_neotoma")).toEqual(["observations"]);
    expect(all.total).toBeUndefined();
    expect(all.observations.map((row: Row) => row.fields.value)).toEqual([2, 1]);
    expect(all.observations.map((row: Row) => row.id)).toEqual(rows.map((row) => row.id));
    const page = await history({ limit: 1, offset: 1 });
    expect(page.observations.map((row: Row) => row.fields.value)).toEqual([1]);
    for (const cutoff of ["created_since", "updated_since"])
      expect(
        (await history({ [cutoff]: rows[0].observed_at })).observations.map((row: Row) => row.id)
      ).toEqual([rows[0].id]);
  });
  it("scopes actual rows to the authenticated owner and ignores a body user override", async () => {
    expect((await history({ user_id: FOREIGN })).observations).toHaveLength(2);
    await database
      .prepare("UPDATE observations SET user_id=? WHERE entity_id=?")
      .run(FOREIGN, entityId);
    try {
      expect((await history()).observations).toEqual([]);
      expect((await history({ entity_id: "ent_missing_history_fixture" })).observations).toEqual(
        []
      );
    } finally {
      await database
        .prepare("UPDATE observations SET user_id=? WHERE entity_id=?")
        .run(rows[0].user_id, entityId);
    }
  });
  it("rejects malformed requests with a meaningful natural CLI error and no success payload", async () => {
    let failure: { code?: unknown; stdout?: string; stderr?: string } | undefined;
    try {
      await history({ limit: 0 });
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
    expect(JSON.parse(line!).error).toContain("VALIDATION_INVALID_FORMAT");
    expect(JSON.parse(line!).error).toContain("Invalid request payload");
    expect(
      await database
        .prepare("SELECT count(*) AS count FROM observations WHERE entity_id=?")
        .get(entityId)
    ).toEqual({ count: 2 });
  });
});
