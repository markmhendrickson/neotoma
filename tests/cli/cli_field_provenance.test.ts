/** Natural built generic CLI effects; valid data is written through public commands. */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../src/config.js";

const execFileAsync = promisify(execFile);
const FOREIGN = "00000000-0000-4000-8000-000000000099";
const SECRET = "UNRELATED-SYNTHETIC-SECRET";
const RECEIPT = "INTERNAL-SYNTHETIC-RECEIPT";
type Json = Record<string, any>;

describe.each(["offline", "api"] as const)("generic CLI field provenance, %s", (mode) => {
  const entityType = `cli_provenance_${randomUUID().replaceAll("-", "")}`;
  const entities = new Set<string>();
  const sourceIds = new Set<string>();
  let home: string;
  let env: NodeJS.ProcessEnv;
  let base: string;
  let sql: any;

  async function cli(...args: string[]): Promise<Json> {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        resolve("dist/cli/index.js"),
        "--env",
        "dev",
        "--json",
        ...(mode === "offline" ? ["--offline"] : ["--api-only", "--base-url", base]),
        ...args,
      ],
      { env, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 }
    );
    return JSON.parse(stdout);
  }
  const provenance = (id: string, field = "tags") =>
    cli(
      "request",
      "--operation",
      "getFieldProvenance",
      "--body",
      JSON.stringify({ entity_id: id, field })
    );
  async function failure(id: string, field: string, code: string, hint: string): Promise<string> {
    let caught: { code?: unknown; stdout?: string; stderr?: string } | undefined;
    try {
      await provenance(id, field);
    } catch (error) {
      caught = error as typeof caught;
    }
    expect(caught?.code).toBe(1);
    expect(caught!.stdout).toBe("");
    // Generic request errors use stderr; warnings may precede the JSON line.
    const json = caught!
      .stderr!.trim()
      .split("\n")
      .reverse()
      .find((line) => line.startsWith('{"error":'));
    expect(json, caught!.stderr).toBeDefined();
    const output = JSON.parse(json!);
    expect(typeof output.error).toBe("string");
    expect(output.error).toContain(code);
    expect(output.error).toContain(hint);
    expect(output.error).toContain(id);
    expect(output.error).toContain(field);
    expect(output.error).not.toContain(SECRET);
    expect(output.observations).toBeUndefined();
    expect(output.sources).toBeUndefined();
    return output.error;
  }
  async function store(fields: Json, target?: string, kind = "import") {
    const key = randomUUID();
    const file = join(home, `synthetic-${key}.json`);
    await writeFile(
      file,
      JSON.stringify({
        entities: [
          { entity_type: entityType, ...fields, ...(target ? { target_id: target } : {}) },
        ],
      })
    );
    const result = await cli(
      "store",
      "--file",
      file,
      "--observation-source",
      kind,
      "--idempotency-key",
      key,
      "--data-origin",
      JSON.stringify({ kind: "file", locator: "synthetic.csv" })
    );
    const id = result.entities?.[0]?.entity_id;
    expect(id).toMatch(/^ent_/);
    if (target) expect(id).toBe(target);
    entities.add(id);
    return { id, key };
  }
  function raw(id: string): Json[] {
    const rows = sql.prepare("SELECT * FROM observations WHERE entity_id=?").all(id);
    for (const row of rows) if (row.source_id) sourceIds.add(row.source_id);
    return rows.map((row: Json) => ({
      ...row,
      fields: JSON.parse(row.fields),
      provenance: row.provenance ? JSON.parse(row.provenance) : {},
    }));
  }
  async function merged() {
    const first = await store({
      name: `Synthetic chain ${randomUUID()}`,
      tags: ["alpha"],
      secret: SECRET,
      revision: 0,
    });
    await store({ tags: ["beta"], secret: SECRET, revision: 1 }, first.id, "sensor");
    const rows = raw(first.id).sort(
      (a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at) || a.id.localeCompare(b.id)
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.source_id)).size).toBe(2);
    expect(rows.every((row) => row.fields.secret === SECRET)).toBe(true);
    return { id: first.id, rows };
  }

  beforeAll(async () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(process.env.NEOTOMA_SESSION_DEV_PORT).toMatch(/^\d+$/);
    base = `http://127.0.0.1:${process.env.NEOTOMA_SESSION_DEV_PORT}`;
    home = await mkdtemp(join(tmpdir(), "cli-provenance-"));
    env = {
      HOME: home,
      USERPROFILE: home,
      NODE_ENV: "test",
      NEOTOMA_ENV: "development",
      OPENAI_API_KEY: "",
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
    ]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    env.NEOTOMA_DATA_DIR = mode === "offline" ? join(home, "data") : config.dataDir;
    env.NEOTOMA_SQLITE_PATH =
      mode === "offline" ? join(home, "data/neotoma.db") : config.sqlitePath;
    env.NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR = "1";
    expect(resolve(env.NEOTOMA_SQLITE_PATH!).startsWith(resolve(env.NEOTOMA_DATA_DIR!) + "/")).toBe(
      true
    );
    await cli(
      "schemas",
      "register",
      entityType,
      "--fields",
      JSON.stringify({
        name: { type: "string" },
        tags: { type: "array", reducer_config: { strategy: "merge_array" } },
        secret: { type: "string", preserveCase: true },
        revision: { type: "number" },
      }),
      "--activate"
    );
    const { default: Database } = await import("better-sqlite3");
    sql = new Database(env.NEOTOMA_SQLITE_PATH!);
  });
  afterAll(async () => {
    if (sql) {
      // Only synthetic IDs created above; SQL is used for fault injection and
      // cleanup, never as a substitute for valid guarded writes or CLI reads.
      for (const id of entities) {
        raw(id);
        for (const table of ["timeline_events", "observations", "entity_snapshots"])
          sql.prepare(`DELETE FROM ${table} WHERE entity_id=?`).run(id);
        sql.prepare("DELETE FROM entities WHERE id=?").run(id);
      }
      for (const id of sourceIds) sql.prepare("DELETE FROM sources WHERE id=?").run(id);
      sql.prepare("DELETE FROM schema_registry WHERE entity_type=?").run(entityType);
      sql.close();
    }
    if (home) await rm(home, { recursive: true, force: true });
  });

  it("returns complete merged evidence, deterministic aliases and safe field/source projections", async () => {
    const { id, rows } = await merged();
    sql.prepare("UPDATE observations SET provenance=? WHERE id=?").run(
      JSON.stringify({
        ...rows[0].provenance,
        store_operation_receipt: { secret: RECEIPT },
        arbitrary_payload: RECEIPT,
      }),
      rows[0].id
    );
    const result = await provenance(id);
    expect(result.value).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(result.observation_ids).toEqual(rows.map((row) => row.id));
    expect(result.observations).toHaveLength(2);
    expect(result.sources.map((row: Json) => row.id)).toEqual(
      rows.map((row) => row.source_id).sort()
    );
    // Real ordinary-store metadata can be null; never invent the request key.
    expect(result.observations.map((row: Json) => row.idempotency_key)).toEqual(
      rows.map((row) => row.idempotency_key)
    );
    expect(result.observations.map((row: Json) => row.observation_source).sort()).toEqual([
      "import",
      "sensor",
    ]);
    for (const row of result.observations) {
      const stored = rows.find((item) => item.id === row.id)!;
      expect(row.fields).toEqual({ tags: stored.fields.tags });
      expect(row.observed_at).toBe(stored.observed_at);
      expect(row.created_at).toBe(stored.created_at);
      expect(row.data_origin).toEqual({ kind: "file", locator: "synthetic.csv" });
    }
    expect(result.source_observation).toEqual(result.observations[0]);
    expect(result.source).toEqual(result.sources.find((row: Json) => row.id === rows[0].source_id));
    expect(result.observed_at).toBe(rows[0].observed_at);
    const serial = JSON.stringify(result);
    for (const value of [
      SECRET,
      RECEIPT,
      "file_urls",
      "storage_url",
      "filesystem_absolute_path",
      "original_filename",
    ])
      expect(serial).not.toContain(value);
    for (const source of result.sources) {
      expect(Object.keys(source).sort()).toEqual([
        "content_hash",
        "created_at",
        "file_size",
        "id",
        "mime_type",
      ]);
      const stored = sql.prepare("SELECT * FROM sources WHERE id=?").get(source.id);
      expect(stored.original_filename).toMatch(/^synthetic-/);
      expect(serial).not.toContain(stored.original_filename);
      if (stored.storage_url) expect(serial).not.toContain(stored.storage_url);
    }
  });

  it("keeps actual correction metadata and legal null sources", async () => {
    const { id } = await store({ name: `Synthetic correction ${randomUUID()}`, tags: ["old"] });
    const key = randomUUID();
    const correction = await cli(
      "corrections",
      "create",
      id,
      "--field-name",
      "tags",
      "--corrected-value",
      '["new"]',
      "--idempotency-key",
      key
    );
    const result = await provenance(id);
    expect(result.value).toEqual(["new"]);
    expect(result.observation_ids).toEqual([correction.observation_id]);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      id: correction.observation_id,
      source_id: null,
      observation_source: "correction",
      idempotency_key: key,
      fields: { tags: ["new"] },
    });
    expect(result.sources).toEqual([]);
    expect(result.source).toBeNull();
    expect(result.source_observation).toEqual(result.observations[0]);
    expect(raw(id).find((row) => row.id === correction.observation_id)).toMatchObject({
      source_id: null,
      observation_source: "correction",
      idempotency_key: key,
    });
  });

  it("preserves not-found codes/hints without exposing foreign or hidden fields", async () => {
    const { id } = await store({ name: `Synthetic scope ${randomUUID()}`, tags: [SECRET] });
    expect((await provenance(id)).value).toEqual([SECRET]);
    const hint = "Read the entity snapshot and select a field with recorded provenance.";
    await failure(id, "missing", "RESOURCE_NOT_FOUND", hint);
    const absent = `ent_absent_${randomUUID().replaceAll("-", "")}`;
    const missing = await failure(absent, "tags", "RESOURCE_NOT_FOUND", hint);
    sql.prepare("UPDATE entity_snapshots SET user_id=? WHERE entity_id=?").run(FOREIGN, id);
    const foreign = await failure(id, "tags", "RESOURCE_NOT_FOUND", hint);
    expect(foreign).toBe(missing.replace(absent, id));
    const row = raw(id)[0];
    sql
      .prepare("UPDATE entity_snapshots SET user_id=?, snapshot=? WHERE entity_id=?")
      .run(row.user_id, JSON.stringify({ name: "only visible field" }), id);
    await failure(id, "tags", "RESOURCE_NOT_FOUND", hint);
  });

  it.each(["missing", "foreign"])("refuses a %s non-representative observation", async (kind) => {
    const { id, rows } = await merged();
    expect((await provenance(id)).observations).toHaveLength(2);
    if (kind === "foreign")
      sql.prepare("UPDATE observations SET user_id=? WHERE id=?").run(FOREIGN, rows[1].id);
    else sql.prepare("DELETE FROM observations WHERE id=?").run(rows[1].id);
    const output = await failure(
      id,
      "tags",
      "PROVENANCE_INTEGRITY_ERROR",
      "Repair the referenced provenance before retrying; no partial chain is returned."
    );
    expect(output).toContain(rows[1].id);
  });

  it.each(["missing", "foreign"])(
    "refuses a %s source on a non-representative contributor",
    async (kind) => {
      const { id, rows } = await merged();
      expect((await provenance(id)).sources).toHaveLength(2);
      if (kind === "foreign")
        sql.prepare("UPDATE sources SET user_id=? WHERE id=?").run(FOREIGN, rows[1].source_id);
      else sql.prepare("DELETE FROM sources WHERE id=?").run(rows[1].source_id);
      const output = await failure(
        id,
        "tags",
        "PROVENANCE_INTEGRITY_ERROR",
        "Repair the referenced provenance before retrying; no partial chain is returned."
      );
      expect(output).toContain(rows[1].source_id);
    }
  );
});
