/** Actual compiled program, using only owned native SQLite fixtures and scrubbed children. */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  existsSync,
  chmodSync,
  linkSync,
  statSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import { withExistingLifecycleDatabase } from "../../src/repositories/db/connection.js";
import { migrateEntityLifecycleAuthority } from "../../src/services/entity_lifecycle_storage.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { inspectLifecycleDatabase } from "../../src/maintenance/entity_lifecycle_inventory.js";
import { lifecycleMaterialization } from "../../src/maintenance/entity_lifecycle_migration.js";
import {
  sha256,
  type Artifact,
  type ExecutorManifest,
} from "../../src/maintenance/entity_lifecycle_manifest.js";

const root = resolve(import.meta.dirname, "../..");
const program = join(root, "dist/maintenance/entity_lifecycle_migration.js");
const sourceHash = "67118622342c8e6906e6e027e7221fbbc9b8b931afce8818263052ab1774bca4";
const owner = "owned_executor_" + randomUUID();
const type = "owned_executor_fixture";
function walks(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walks(join(dir, entry.name)) : [join(dir, entry.name)]
  );
}
function artifact(path: string): Artifact {
  return { path, sha256: sha256(readFileSync(path)) };
}
function json(path: string, value: unknown): Artifact {
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return artifact(path);
}
function git(...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
async function inventory(path: string) {
  const db = new AsyncSqliteDatabase(path, { existing: true, readOnly: true });
  try {
    return await db.transaction(inspectLifecycleDatabase);
  } finally {
    await db.close();
  }
}
async function mutate(path: string, action: (db: AsyncSqliteDatabase) => Promise<void>) {
  const db = new AsyncSqliteDatabase(path, { existing: true, readOnly: false });
  try {
    await action(db);
  } finally {
    await db.close();
  }
}
let population: string,
  source: string,
  oracle: string,
  expected: unknown,
  expectedSchema: unknown,
  sourceBytes: Buffer,
  compiledFiles: Artifact[];
let fixture: string, manifest: ExecutorManifest, output: string, manifestPath: string;
beforeAll(async () => {
  expect(existsSync(program), "required server build must precede compiled tests").toBe(true);
  population = realpathSync(mkdtempSync(join(tmpdir(), "owned-executor-population-")));
  source = join(population, "source.sqlite");
  oracle = join(population, "oracle.sqlite");
  const db = new AsyncSqliteDatabase(source);
  await ensureSchema(db);
  await db
    .prepare(
      "INSERT INTO schema_registry(id,entity_type,schema_version,schema_definition,reducer_config,active,user_id,scope) VALUES(?,?,'1.0',?,?,1,?,'user')"
    )
    .run(
      "schema_owned",
      type,
      JSON.stringify({ fields: { title: { type: "string" }, _deleted: { type: "boolean" } } }),
      JSON.stringify({ merge_policies: { title: { strategy: "last_write" } } }),
      owner
    );
  await db.transaction(async (tx) => {
    for (let i = 0; i < 251; i++) {
      const id = "ent_owned_" + String(i).padStart(4, "0");
      await tx
        .prepare("INSERT INTO entities(id,entity_type,canonical_name,user_id) VALUES(?,?,?,?)")
        .run(id, type, "Owned " + i, owner);
      await tx
        .prepare(
          "INSERT INTO observations(id,entity_id,entity_type,schema_version,observed_at,created_at,source_priority,fields,user_id) VALUES(?,?,?,'1.0','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z',10,?,?)"
        )
        .run(
          "fact_" + i,
          id,
          type,
          JSON.stringify({
            title: "Fact " + i,
            ...(i === 250 ? { occurred_at: "2020-01-01T00:00:00Z" } : {}),
          }),
          owner
        );
    }
    for (const id of ["ent_hidden", "ent_empty", "ent_merged"])
      await tx
        .prepare(
          "INSERT INTO entities(id,entity_type,canonical_name,user_id,merged_to_entity_id) VALUES(?,?,?,?,?)"
        )
        .run(id, type, id, owner, id === "ent_merged" ? "ent_owned_0000" : null);
    await tx
      .prepare(
        "INSERT INTO observations(id,entity_id,entity_type,schema_version,observed_at,created_at,source_priority,fields,user_id) VALUES('hidden_marker','ent_hidden',?,'1.0','2020-01-02T00:00:00Z','2020-01-02T00:00:00Z',2000,'{\"_deleted\":true}',?)"
      )
      .run(type, owner);
    await tx.exec(
      "UPDATE observations SET identity_rule=CAST(X'00FF80' AS TEXT) WHERE id='fact_250'"
    );
    // Extra native table makes complete typed preservation meaningful, beyond application projections.
    await tx.exec(
      "CREATE TABLE owned_binary(id TEXT PRIMARY KEY,value BLOB,large INTEGER);INSERT INTO owned_binary VALUES('bytes',X'0080FF',9223372036854775807)"
    );
  });
  await withExistingLifecycleDatabase(db, async () => {
    for (let i = 0; i < 251; i++)
      await recomputeSnapshot("ent_owned_" + String(i).padStart(4, "0"), owner, true);
  });
  await db.close();
  sourceBytes = readFileSync(source);
  copyFileSync(source, oracle);
  const o = new AsyncSqliteDatabase(oracle, { existing: true, readOnly: false });
  await withExistingLifecycleDatabase(o, () =>
    migrateEntityLifecycleAuthority(o, async (_tx, targets) => {
      for (const entity of targets) await recomputeSnapshot(entity.id, entity.user_id, true);
    })
  );
  expected = await lifecycleMaterialization(o);
  expectedSchema = (await inspectLifecycleDatabase(o)).schema;
  expect(
    (await o.prepare("SELECT COUNT(*) AS n FROM entity_lifecycle_legacy_membership").get()) as {
      n: number;
    }
  ).toEqual({ n: 252 });
  expect(
    (await o.prepare("SELECT COUNT(*) AS n FROM entity_snapshots").get()) as { n: number }
  ).toEqual({ n: 251 });
  await o.close();
  compiledFiles = [
    ...walks(join(root, "dist")).filter((path) => /\.(js|json)$/.test(path)),
    join(root, "package.json"),
    join(root, "package-lock.json"),
  ].map(artifact);
}, 120000);
afterAll(() => rmSync(population, { recursive: true, force: true }));
beforeEach(async () => {
  fixture = realpathSync(mkdtempSync(join(tmpdir(), "owned-executor-command-")));
  for (const dir of ["copy", "raw", "logs", "evidence", "home"])
    mkdirSync(join(fixture, dir), { mode: 0o700 });
  const database = join(fixture, "copy", "owned.sqlite");
  copyFileSync(source, database);
  const evidence = join(fixture, "evidence");
  const proof = (
    name: string,
    value: unknown = { source: "owned synthetic integrity reference; unavailable action verifier" }
  ) => json(join(evidence, name + ".json"), value);
  const before = await inventory(database);
  const raw = join(fixture, "raw", "owned.bin");
  writeFileSync(raw, Buffer.from([0, 128, 255]));
  manifest = {
    version: "entity_lifecycle_executor_v1",
    candidate: {
      root,
      commit: git("rev-parse", "HEAD"),
      tree: git("rev-parse", "HEAD^{tree}"),
      source_sha256: sourceHash,
      files: compiledFiles,
      runtime: artifact(process.execPath),
      proofs: Array.from({ length: 7 }, (_, i) => proof("candidate-" + i)),
    },
    target: {
      deployment_id: "synthetic",
      deployment_version: "1",
      environment: "development",
      application: "owned",
      machine: "owned",
      volume: "owned",
      backend: "sqlite",
      database,
      data: join(fixture, "copy"),
      raw: join(fixture, "raw"),
      logs: join(fixture, "logs"),
      encryption_mode: "plaintext_sqlite",
      isolation: {
        kind: "owned_synthetic",
        source_database: source,
        source_sha256: sha256(sourceBytes),
      },
    },
    expected_before: { inventory: proof("before", before), source_files: [artifact(raw)] },
    backup: { manifest: proof("backup"), restore: proof("restore"), custody: proof("custody") },
    maintenance: {
      method: "unsupported_owned_fixture",
      inventory: proof("writers"),
      exclusion: proof("exclusion"),
      valid_from: "2020-01-01T00:00:00Z",
      valid_until: "2020-01-02T00:00:00Z",
      resume: proof("resume"),
    },
    action_binding: {
      admission_id: "unsupported",
      admission_version: "1",
      artifact: proof("action"),
    },
    expected_after: {
      state: "committed",
      inventory: null,
      schema: proof("schema", expectedSchema),
      materialized: proof("materialized", expected),
      preserved_tables: before.tables
        .filter(
          (table) =>
            !["entities", "observations", "entity_snapshots", "timeline_events"].includes(
              table.name
            ) && !table.name.startsWith("entity_lifecycle_")
        )
        .map((table) => table.name),
      baselines: 253,
      members: 252,
    },
    evidence: { directory: evidence },
  };
  output = join(evidence, "outcome.json");
  manifestPath = join(evidence, "manifest.json");
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));
function invoke(mode: "preview" | "verify" | "apply", env: Record<string, string> = {}) {
  json(manifestPath, manifest);
  const t = manifest.target;
  return spawnSync(
    process.execPath,
    [program, "--manifest", manifestPath, "--mode", mode, "--output", output],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
      env: {
        PATH: process.env.PATH,
        HOME: join(fixture, "home"),
        NODE_OPTIONS: process.env.NODE_OPTIONS || "",
        NEOTOMA_PROJECT_ROOT: root,
        NEOTOMA_ENV: t.environment,
        NEOTOMA_DATA_DIR: t.data,
        NEOTOMA_SQLITE_PATH: t.database,
        NEOTOMA_DB_BACKEND: "sqlite",
        NEOTOMA_DB_URL: "",
        NEOTOMA_RAW_STORAGE_DIR: t.raw,
        NEOTOMA_LOGS_DIR: t.logs,
        NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "1",
        NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
        ...env,
      },
    }
  );
}
function refused(result: ReturnType<typeof invoke>, category?: string) {
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  if (category) expect(result.stderr).toContain(category);
  expect(result.stdout + result.stderr).not.toContain(fixture);
  expect(result.stdout + result.stderr).not.toContain("private_canary");
}
async function refreshBefore() {
  manifest.expected_before.inventory = json(
    join(manifest.evidence.directory, "before.json"),
    await inventory(manifest.target.database)
  );
}
describe("compiled strict lifecycle executor", () => {
  it("preview executes full native capture/materialization on a copy, then readonly replay verification", async () => {
    const before = readFileSync(manifest.target.database),
      result = invoke("preview");
    expect(result.status, result.stderr).toBe(0);
    const outcome = JSON.parse(readFileSync(output, "utf8"));
    expect(outcome.status).toBe("isolated_preview_verified");
    expect(outcome.authority_verified).toBe(false);
    expect(outcome.action_methods).toEqual([]);
    expect(outcome.state).toEqual({ state: "committed", baselines: 253, members: 252 });
    expect(readFileSync(manifest.target.database)).not.toEqual(before);
    expect(readFileSync(source)).toEqual(sourceBytes);
    const db = new AsyncSqliteDatabase(manifest.target.database, {
      existing: true,
      readOnly: true,
    });
    try {
      expect(
        (await db
          .prepare("SELECT fields,user_id FROM observations WHERE id='fact_250'")
          .get()) as Record<string, unknown>
      ).toEqual({
        fields: '{"title":"Fact 250","occurred_at":"2020-01-01T00:00:00Z"}',
        user_id: owner,
      });
      expect(
        await db
          .prepare(
            "SELECT entity_id FROM entity_snapshots WHERE entity_id IN('ent_hidden','ent_empty','ent_merged')"
          )
          .all()
      ).toEqual([]);
      expect(
        await db
          .prepare("SELECT hex(value) AS bytes,CAST(large AS TEXT) AS large FROM owned_binary")
          .get()
      ).toEqual({ bytes: "0080FF", large: "9223372036854775807" });
    } finally {
      await db.close();
    }
    const committed = readFileSync(manifest.target.database);
    await refreshBefore();
    output = join(manifest.evidence.directory, "verify.json");
    expect(invoke("verify").status).toBe(0);
    expect(readFileSync(manifest.target.database)).toEqual(committed);
    output = join(manifest.evidence.directory, "replay.json");
    expect(invoke("preview").status).toBe(0);
    expect(readFileSync(manifest.target.database)).toEqual(committed);
  }, 120000);
  it("read-only pre-cutover verifies complete materialization without installing", async () => {
    manifest.expected_after.state = "pre_cutover";
    manifest.expected_after.baselines = 0;
    manifest.expected_after.members = 0;
    manifest.expected_after.schema = null;
    const db = new AsyncSqliteDatabase(manifest.target.database, {
      existing: true,
      readOnly: true,
    });
    try {
      manifest.expected_after.materialized = json(
        join(manifest.evidence.directory, "pre-materialized.json"),
        await lifecycleMaterialization(db)
      );
    } finally {
      await db.close();
    }
    const before = readFileSync(manifest.target.database);
    const result = invoke("verify");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8")).status).toBe("pre_cutover_verified");
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
  it("EMPTY apply refuses even incomplete references before DB and output access", () => {
    manifest.target.database = join(fixture, "absent.sqlite");
    manifest.candidate.files = [];
    refused(invoke("apply"), "action_method_unavailable");
    expect(existsSync(output)).toBe(false);
    expect(existsSync(manifest.target.database)).toBe(false);
  });
  it("rejects source aliases and actual hardlinks before records or mutation", () => {
    rmSync(manifest.target.database);
    linkSync(source, manifest.target.database);
    const result = invoke("preview");
    expect(readFileSync(source)).toEqual(sourceBytes);
    refused(result, "source_alias");
    expect(existsSync(output + ".attempt.jsonl")).toBe(false);
  });
  it("rejects environment defaults and inherited model credentials before records", () => {
    for (const env of [
      { NEOTOMA_DB_BACKEND: "libsql" },
      { NEOTOMA_SQLITE_PATH: "" },
      { OPENAI_API_KEY: "private_canary" },
    ]) {
      refused(invoke("preview", env), "environment_mismatch");
      expect(existsSync(output + ".attempt.jsonl")).toBe(false);
    }
  });
  it("rejects stale/tampered proof contents and unclosed nested manifests", () => {
    writeFileSync(manifest.backup.restore.path, '{"tampered":"private_canary"}');
    const before = readFileSync(manifest.target.database);
    const result = invoke("preview");
    expect(readFileSync(manifest.target.database)).toEqual(before);
    refused(result, "evidence_invalid");
    expect(existsSync(output + ".attempt.jsonl")).toBe(false);
  });
  it("a full materialization mismatch rolls installation and derived writes back", async () => {
    const before = readFileSync(manifest.target.database);
    manifest.expected_after.materialized = json(
      join(manifest.evidence.directory, "wrong-materialized.json"),
      []
    );
    const result = invoke("preview");
    expect(readFileSync(manifest.target.database)).toEqual(before);
    refused(result, "materialization_invalid");
    expect(existsSync(output)).toBe(false);
    expect(readFileSync(output + ".attempt.jsonl", "utf8")).toContain('"phase":"failed"');
  });
  it("missing declared ordinary schema rolls installation back rather than empty materialization", async () => {
    await mutate(manifest.target.database, async (db) => {
      await db.prepare("DELETE FROM schema_registry").run();
    });
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    refused(invoke("preview"), "schema_unavailable");
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
  it("existing output is never overwritten and repeated invocation never repeats effects", () => {
    writeFileSync(output, "owned previous attempt", { mode: 0o600 });
    const before = readFileSync(manifest.target.database);
    refused(invoke("preview"), "recording_unavailable");
    expect(readFileSync(output, "utf8")).toBe("owned previous attempt");
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
  it("partial lifecycle metadata is refused by readonly verify without repairs", async () => {
    await mutate(manifest.target.database, async (db) => {
      await db.exec("ALTER TABLE observations ADD COLUMN entity_lifecycle_kind TEXT");
    });
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    refused(invoke("verify"));
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
  it("private output files and attempt records remain protected and existing attempt blocks repeats", async () => {
    const result = invoke("preview");
    expect(result.status, result.stderr).toBe(0);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(statSync(output + ".attempt.jsonl").mode & 0o777).toBe(0o600);
    rmSync(output);
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    refused(invoke("preview"), "recording_unavailable");
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
  it("current valid later facts survive replay without rewriting frozen capture or originals", async () => {
    expect(invoke("preview").status).toBe(0);
    await mutate(manifest.target.database, async (db) => {
      await db
        .prepare(
          "INSERT INTO observations(id,entity_id,entity_type,schema_version,observed_at,created_at,source_priority,fields,user_id) VALUES('later_fact','ent_owned_0000',?,'1.0','2021-01-01T00:00:00Z','2021-01-01T00:00:00Z',10,'{\"title\":\"Later fact\"}',?)"
        )
        .run(type, owner);
      await withExistingLifecycleDatabase(db, () =>
        recomputeSnapshot("ent_owned_0000", owner, true)
      );
      manifest.expected_after.materialized = json(
        join(manifest.evidence.directory, "later-materialized.json"),
        await lifecycleMaterialization(db)
      );
    });
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    output = join(manifest.evidence.directory, "later-replay.json");
    const result = invoke("preview");
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(manifest.target.database)).toEqual(before);
    const db = new AsyncSqliteDatabase(manifest.target.database, {
      existing: true,
      readOnly: true,
    });
    try {
      expect(
        await db.prepare("SELECT COUNT(*) AS n FROM entity_lifecycle_legacy_membership").get()
      ).toEqual({ n: 252 });
      expect(
        await db.prepare("SELECT fields FROM observations WHERE id='later_fact'").get()
      ).toEqual({ fields: '{"title":"Later fact"}' });
    } finally {
      await db.close();
    }
  });
  it("readonly verify refuses current materialized drift without repairing it", async () => {
    expect(invoke("preview").status).toBe(0);
    await mutate(manifest.target.database, async (db) => {
      await db
        .prepare("UPDATE entity_snapshots SET snapshot='{}' WHERE entity_id='ent_owned_0250'")
        .run();
    });
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    output = join(manifest.evidence.directory, "drift.json");
    refused(invoke("verify"), "materialization_invalid");
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
  it("strict snapshot persistence failure rolls schema, baseline and partial derived effects back", async () => {
    await mutate(manifest.target.database, async (db) => {
      await db.exec(
        "CREATE TRIGGER owned_snapshot_failure BEFORE INSERT ON entity_snapshots WHEN NEW.entity_id='ent_owned_0250' BEGIN SELECT RAISE(ABORT,'owned synthetic persistence failure'); END"
      );
    });
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    refused(invoke("preview"));
    expect(readFileSync(manifest.target.database)).toEqual(before);
    expect(existsSync(output)).toBe(false);
  });
  it("strict canonical persistence failure rolls all partial migration effects back", async () => {
    await mutate(manifest.target.database, async (db) => {
      await db
        .prepare(
          "UPDATE entities SET canonical_name='Earlier owned name',aliases=NULL WHERE id='ent_owned_0250'"
        )
        .run();
      await db.exec(
        "CREATE TRIGGER owned_name_failure BEFORE UPDATE ON entities WHEN NEW.id='ent_owned_0250' BEGIN SELECT RAISE(ABORT,'owned synthetic name failure'); END"
      );
    });
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    refused(invoke("preview"));
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
  it("wrong-owner ordinary observation refuses rather than merging foreign facts", async () => {
    await mutate(manifest.target.database, async (db) => {
      await db.prepare("UPDATE observations SET user_id='foreign_owner' WHERE id='fact_250'").run();
    });
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    refused(invoke("preview"));
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
  it("raw source changes and candidate pins refuse before any attempt or effects", () => {
    writeFileSync(manifest.expected_before.source_files[0].path, "owned tamper");
    refused(invoke("preview"), "evidence_invalid");
    expect(existsSync(output + ".attempt.jsonl")).toBe(false);
  });
  it("protects evidence root, closed descriptor and complete target absence", () => {
    chmodSync(manifest.evidence.directory, 0o755);
    refused(invoke("preview"), "recording_unavailable");
    chmodSync(manifest.evidence.directory, 0o700);
    (manifest.target as unknown as Record<string, unknown>).unknown = true;
    refused(invoke("preview"), "manifest_invalid");
    delete (manifest.target as unknown as Record<string, unknown>).unknown;
    manifest.target.database = join(fixture, "missing.sqlite");
    refused(invoke("preview"));
    expect(existsSync(manifest.target.database)).toBe(false);
    expect(existsSync(output + ".attempt.jsonl")).toBe(false);
  });
  it("strict timeline persistence failure rolls all native partial effects back", async () => {
    await mutate(manifest.target.database, async (db) => {
      await db.exec(
        "CREATE TRIGGER owned_timeline_failure BEFORE INSERT ON timeline_events BEGIN SELECT RAISE(ABORT,'owned synthetic timeline failure'); END"
      );
    });
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    const result = invoke("preview");
    expect(readFileSync(manifest.target.database)).toEqual(before);
    refused(result);
  });
  it("stale snapshots and names are repaired only on the isolated preview copy", async () => {
    await mutate(manifest.target.database, async (db) => {
      await db
        .prepare("UPDATE entity_snapshots SET snapshot='{}' WHERE entity_id='ent_owned_0250'")
        .run();
      await db
        .prepare(
          "UPDATE entities SET canonical_name='Stale owned name',aliases=NULL WHERE id='ent_owned_0250'"
        )
        .run();
    });
    await refreshBefore();
    // Exact expected name/aliases comes from the declared, real canonical derivation outcome.
    const after = JSON.parse(readFileSync(manifest.expected_after.materialized!.path, "utf8"));
    const entity = after
      .find((table: { table: string }) => table.table === "entities")
      .rows.find((row: { id: string }) => row.id === "ent_owned_0250");
    entity.aliases = JSON.stringify(["Stale owned name"]);
    manifest.expected_after.materialized = json(
      join(manifest.evidence.directory, "repaired-materialized.json"),
      after
    );
    const result = invoke("preview");
    const db = new AsyncSqliteDatabase(manifest.target.database, {
      existing: true,
      readOnly: true,
    });
    try {
      expect(
        await db
          .prepare("SELECT canonical_name,aliases FROM entities WHERE id='ent_owned_0250'")
          .get()
      ).toEqual({ canonical_name: "Fact 250", aliases: '["Stale owned name"]' });
      const row = (await db
        .prepare(
          "SELECT snapshot,provenance FROM entity_snapshots WHERE entity_id='ent_owned_0250'"
        )
        .get()) as { snapshot: string; provenance: string };
      expect(JSON.parse(row.snapshot).title).toBe("Fact 250");
      expect(JSON.parse(row.provenance).title).toBe("fact_250");
      expect(
        await db
          .prepare(
            "SELECT hex(CAST(identity_rule AS BLOB)) AS bytes FROM observations WHERE id='fact_250'"
          )
          .get()
      ).toEqual({ bytes: "00FF80" });
    } finally {
      await db.close();
    }
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(source)).toEqual(sourceBytes);
  });
  it("loss of final output after copy commit records uncertainty and never repeats migration", async () => {
    const hook = join(fixture, "owned-output-failure.cjs");
    writeFileSync(
      hook,
      `const fs=require('node:fs');const open=fs.openSync;fs.openSync=function(path,...args){if(path===process.env.OWNED_FAIL_OUTPUT)throw new Error('private_canary');return open.call(this,path,...args)};`
    );
    const result = invoke("preview", {
      NODE_OPTIONS: [process.env.NODE_OPTIONS || "", "--require " + hook].join(" "),
      OWNED_FAIL_OUTPUT: output,
    });
    refused(result);
    const journal = readFileSync(output + ".attempt.jsonl", "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(journal.map((row) => row.phase)).toEqual(["prepared", "outcome", "failed"]);
    expect(journal[2].outcome).toBe("outcome_unknown_requires_readonly_verification");
    expect(existsSync(output)).toBe(false);
    const db = new AsyncSqliteDatabase(manifest.target.database, {
      existing: true,
      readOnly: true,
    });
    try {
      expect(await db.prepare("SELECT COUNT(*) AS n FROM entity_lifecycle_cutovers").get()).toEqual(
        { n: 1 }
      );
    } finally {
      await db.close();
    }
    await refreshBefore();
    const before = readFileSync(manifest.target.database);
    refused(invoke("preview"), "recording_unavailable");
    expect(readFileSync(manifest.target.database)).toEqual(before);
  });
});
