/** Internal offline executor. Supported live action methods deliberately remain EMPTY. */
import { readFileSync, statSync, lstatSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  LifecycleExecutorRefused,
  refuse,
  validateManifest,
  existingPath,
  sha256,
  stable,
  artifactBytes,
  artifactJson,
  protectedDirectory,
  type ExecutorManifest,
} from "./entity_lifecycle_manifest.js";
import { ExecutorRecords } from "./entity_lifecycle_records.js";
import type { DbConnection, DbDatabase } from "../repositories/db/driver.js";
import {
  inspectLifecycleDatabase,
  inspectLifecycleTable,
  type LifecycleDatabaseInventory,
} from "./entity_lifecycle_inventory.js";
export { LifecycleExecutorRefused } from "./entity_lifecycle_manifest.js";
const SOURCE_SHA = "67118622342c8e6906e6e027e7221fbbc9b8b931afce8818263052ab1774bca4";
const TOP_LEVEL = [
  "version",
  "candidate",
  "target",
  "expected_before",
  "backup",
  "maintenance",
  "action_binding",
  "expected_after",
  "evidence",
].sort();
export function parseLifecycleExecutorArguments(args: readonly string[]): {
  manifest: string;
  mode: "preview" | "verify" | "apply";
  output: string;
} {
  const fields: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (
      !["--manifest", "--mode", "--output"].includes(key) ||
      key in fields ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      refuse("arguments_invalid");
    fields[key] = args[i + 1];
  }
  if (
    Object.keys(fields).length !== 3 ||
    !["preview", "verify", "apply"].includes(fields["--mode"])
  )
    refuse("arguments_invalid");
  return {
    manifest: fields["--manifest"],
    mode: fields["--mode"] as "preview" | "verify" | "apply",
    output: fields["--output"],
  };
}
function files(directory: string): string[] {
  existingPath(directory, true);
  const found: string[] = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) refuse("target_invalid");
    if (stat.isDirectory()) found.push(...files(path));
    else if (stat.isFile()) found.push(path);
    else refuse("target_invalid");
  }
  return found;
}
function candidate(manifest: ExecutorManifest): void {
  const c = manifest.candidate;
  existingPath(c.root, true);
  if (c.source_sha256 !== SOURCE_SHA) refuse("candidate_invalid");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", c.root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  if (git("rev-parse", "HEAD") !== c.commit || git("rev-parse", "HEAD^{tree}") !== c.tree)
    refuse("candidate_invalid");
  try {
    execFileSync(
      "git",
      [
        "-C",
        c.root,
        "diff",
        "--exit-code",
        "HEAD",
        "--",
        "src",
        "package.json",
        "package-lock.json",
      ],
      { stdio: "ignore" }
    );
  } catch {
    refuse("candidate_invalid");
  }
  const tracked = new Set(git("ls-files", "-z", "src").split("\0").filter(Boolean));
  if (files(join(c.root, "src")).some((path) => !tracked.has(relative(c.root, path))))
    refuse("candidate_invalid");
  const required = [
    ...files(join(c.root, "dist")).filter((p) => /\.(js|json)$/.test(p)),
    join(c.root, "package-lock.json"),
    join(c.root, "package.json"),
  ];
  if (
    c.files.length !== new Set(c.files.map((item) => item.path)).size ||
    required.some((path) => !c.files.some((item) => item.path === path))
  )
    refuse("candidate_invalid");
  for (const item of c.files) artifactBytes(item, c.root);
  const program = fileURLToPath(import.meta.url);
  if (!c.files.some((item) => item.path === program)) refuse("candidate_invalid");
  if (c.runtime.path !== process.execPath) refuse("candidate_invalid");
  artifactBytes(c.runtime);
  if (c.proofs.length !== 7 || new Set(c.proofs.map((item) => item.path)).size !== 7)
    refuse("evidence_invalid");
  for (const proof of c.proofs) artifactJson(proof, manifest.evidence.directory);
}
function target(manifest: ExecutorManifest, mode: string): void {
  const t = manifest.target;
  if (
    process.env.NEOTOMA_PROJECT_ROOT &&
    process.env.NEOTOMA_PROJECT_ROOT !== manifest.candidate.root
  )
    refuse("environment_mismatch");
  process.env.NEOTOMA_PROJECT_ROOT = manifest.candidate.root;
  if (
    [".env", ".env.production", ".env.development"].some((name) =>
      existsSync(join(manifest.candidate.root, name))
    ) ||
    process.env.NEOTOMA_INSPECTOR_LIVE_BUILD === "1"
  )
    refuse("environment_mismatch");
  const evidence = manifest.evidence.directory;
  for (const protectedRoot of [
    t.data,
    t.raw,
    t.logs,
    manifest.candidate.root,
    resolve(t.isolation.source_database, ".."),
  ]) {
    const part = relative(protectedRoot, evidence);
    if (part === "" || (!part.startsWith("..") && !part.startsWith("/")))
      refuse("recording_unavailable");
  }
  for (const dir of [t.data, t.raw, t.logs]) existingPath(dir, true);
  existingPath(t.database);
  existingPath(t.isolation.source_database);
  const expected: Record<string, string> = {
    NEOTOMA_ENV: t.environment,
    NEOTOMA_DATA_DIR: t.data,
    NEOTOMA_SQLITE_PATH: t.database,
    NEOTOMA_DB_BACKEND: t.backend,
    NEOTOMA_DB_URL: "",
    NEOTOMA_RAW_STORAGE_DIR: t.raw,
    NEOTOMA_LOGS_DIR: t.logs,
  };
  for (const [key, value] of Object.entries(expected))
    if (process.env[key] !== value) refuse("environment_mismatch");
  if (
    process.env.NEOTOMA_DB_AUTH_TOKEN ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.NEOTOMA_MCP_ENABLE_LOGGING === "1"
  )
    refuse("environment_mismatch");
  for (const path of [t.database, t.isolation.source_database]) {
    if (!readFileSync(path).subarray(0, 16).equals(Buffer.from("SQLite format 3\0")))
      refuse("target_invalid");
    if (existsSync(path + "-wal") || existsSync(path + "-shm") || existsSync(path + "-journal"))
      refuse("source_copy_unverified");
  }
  const source = statSync(t.isolation.source_database),
    copy = statSync(t.database);
  if (
    mode === "preview" &&
    (t.database === t.isolation.source_database ||
      (source.dev === copy.dev && source.ino === copy.ino))
  )
    refuse("source_alias");
  if (sha256(readFileSync(t.isolation.source_database)) !== t.isolation.source_sha256)
    refuse("source_copy_unverified");
}
function referencedArtifacts(manifest: ExecutorManifest): void {
  const root = manifest.evidence.directory;
  for (const item of Object.values(manifest.backup)) artifactJson(item, root);
  for (const item of [
    manifest.maintenance.inventory,
    manifest.maintenance.exclusion,
    manifest.maintenance.resume,
    manifest.action_binding.artifact,
  ])
    artifactJson(item, root);
}
function sourceFiles(manifest: ExecutorManifest): string {
  const actual = files(manifest.target.raw);
  const declared = manifest.expected_before.source_files;
  if (
    actual.length !== declared.length ||
    actual.some((path) => !declared.some((item) => item.path === path))
  )
    refuse("source_files_invalid");
  return sha256(
    stable(
      declared
        .map((item) => ({ path: item.path, sha256: sha256(artifactBytes(item)) }))
        .sort((a, b) => (a.path < b.path ? -1 : 1))
    )
  );
}
async function originalRows(
  tx: DbConnection,
  columns: readonly string[],
  ids?: readonly string[]
): Promise<string> {
  return stable(
    await inspectLifecycleTable(tx, "observations", columns, ids ? new Set(ids) : undefined)
  );
}
function allowedSchemaDelta(
  before: LifecycleDatabaseInventory,
  after: LifecycleDatabaseInventory
): void {
  const allowed = new Set([
    "entity_lifecycle_cutovers",
    "entity_lifecycle_legacy_membership",
    "sqlite_autoindex_entity_lifecycle_cutovers_1",
    "sqlite_autoindex_entity_lifecycle_legacy_membership_1",
    "idx_entity_lifecycle_membership_target",
    "idx_entity_lifecycle_sequence",
    "entity_lifecycle_tuple_insert",
    "entity_lifecycle_tuple_immutable",
    "entity_lifecycle_cutover_immutable_update",
    "entity_lifecycle_cutover_immutable_delete",
    "entity_lifecycle_membership_immutable_update",
    "entity_lifecycle_membership_immutable_delete",
  ]);
  for (const original of before.schema) {
    const current = after.schema.find(
      (row) => row.type === original.type && row.name === original.name
    );
    if (!current) refuse("schema_delta_invalid");
    if (original.name !== "observations" && stable(current) !== stable(original))
      refuse("schema_delta_invalid");
  }
  for (const current of after.schema)
    if (
      !before.schema.some((row) => row.type === current.type && row.name === current.name) &&
      !allowed.has(current.name)
    )
      refuse("schema_delta_invalid");
  const old = before.tables.find((row) => row.name === "observations");
  const now = after.tables.find((row) => row.name === "observations");
  if (!old || !now || stable(now.columns.slice(0, old.columns.length)) !== stable(old.columns))
    refuse("schema_delta_invalid");
  const extra = now.columns.slice(old.columns.length);
  const expected = [
    ["entity_lifecycle_kind", "TEXT"],
    ["entity_lifecycle_sequence", "INTEGER"],
    ["entity_lifecycle_target_id", "TEXT"],
  ];
  if (
    extra.length &&
    (extra.length !== 3 ||
      extra.some(
        (row, index) =>
          row.name !== expected[index][0] ||
          row.type !== expected[index][1] ||
          row.notnull !== 0 ||
          row.dflt_value !== null ||
          row.pk !== 0
      ))
  )
    refuse("schema_delta_invalid");
}
/** Every materialized column is compared; only source-defined wall-clock bookkeeping is validated as a timestamp. */
export async function lifecycleMaterialization(tx: DbConnection): Promise<unknown> {
  const result: unknown[] = [];
  for (const [name, key, clock] of [
    ["entities", "id", "updated_at"],
    ["entity_snapshots", "entity_id", null],
    ["timeline_events", "id", "created_at"],
  ] as const) {
    const rows = (await tx
      .prepare(`SELECT * FROM ${name} ORDER BY ${key} COLLATE BINARY`)
      .all()) as Record<string, unknown>[];
    for (const row of rows) {
      if (clock && row[clock] !== null && row[clock] !== undefined) {
        if (typeof row[clock] !== "string" || !Number.isFinite(Date.parse(row[clock] as string)))
          refuse("materialization_invalid");
      }
      if (clock) delete row[clock];
    }
    result.push({ table: name, rows });
  }
  return result;
}
async function nativeMaterialization(database: DbDatabase): Promise<void> {
  const { schemaRegistry } = await import("../services/schema_registry.js");
  const { resolveOwnedObservations } = await import("../services/attachment_resolution.js");
  const { observationReducer } = await import("../reducers/observation_reducer.js");
  const { getSnapshot } = await import("../services/snapshot_computation.js");
  let last = "";
  for (;;) {
    const entities = (await database
      .prepare("SELECT * FROM entities WHERE id>? ORDER BY id LIMIT 250")
      .all(last)) as Record<string, unknown>[];
    if (!entities.length) break;
    for (const entity of entities) {
      last = entity.id as string;
      if (typeof entity.user_id !== "string" || typeof entity.entity_type !== "string")
        refuse("materialization_invalid");
      if (entity.merged_to_entity_id) continue;
      const schema = await schemaRegistry.loadActiveSchema(entity.entity_type, entity.user_id);
      if (!schema) refuse("schema_unavailable");
      const observations = await resolveOwnedObservations(last, entity.user_id);
      if (observations === null) refuse("materialization_invalid");
      const expected = observations.length
        ? await observationReducer.computeSnapshot(last, observations, schema)
        : null;
      const { db } = await import("../db.js");
      const { data: physical, error } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", last)
        .maybeSingle();
      if (error) refuse("materialization_invalid");
      if (expected) {
        if (!physical) refuse("materialization_invalid");
        for (const [key, value] of Object.entries(expected))
          if (stable(physical[key]) !== stable(value)) refuse("materialization_invalid");
      } else if (physical) refuse("materialization_invalid");
      const facade = await getSnapshot(last, entity.user_id);
      if (Boolean(facade) !== Boolean(expected)) refuse("materialization_invalid");
    }
  }
}
export async function runLifecycleExecutor(
  args: readonly string[]
): Promise<Record<string, unknown>> {
  const parsed = parseLifecycleExecutorArguments(args);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(parsed.manifest, "utf8"));
  } catch {
    refuse("manifest_invalid");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    stable(Object.keys(value).sort()) !== stable(TOP_LEVEL) ||
    (value as Record<string, unknown>).version !== "entity_lifecycle_executor_v1"
  )
    refuse("manifest_invalid");
  // Empty action-method set: no driver/config/service import or output open precedes apply refusal.
  if (parsed.mode === "apply") refuse("action_method_unavailable");
  const manifest = validateManifest(value);
  protectedDirectory(manifest.evidence.directory);
  candidate(manifest);
  target(manifest, parsed.mode);
  referencedArtifacts(manifest);
  const root = manifest.evidence.directory;
  const beforeExpected = artifactJson(manifest.expected_before.inventory, root);
  const rawDigest = sourceFiles(manifest);
  const originalSource = readFileSync(manifest.target.isolation.source_database);
  // Existing logger suppression, in this dedicated process only. No server/action entry point imported.
  process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";
  const { AsyncSqliteDatabase } = await import("../repositories/sqlite/sqlite_driver.js");
  const { withExistingLifecycleDatabase } = await import("../repositories/db/connection.js");
  const { migrateEntityLifecycleAuthority, verifyEntityLifecycleStorage } =
    await import("../services/entity_lifecycle_storage.js");
  const { config } = await import("../config.js");
  const configured = {
    environment: config.environment,
    projectRoot: config.projectRoot,
    dataDir: config.dataDir,
    sqlitePath: config.sqlitePath,
    dbBackend: config.dbBackend,
    dbUrl: config.dbUrl,
    rawStorageDir: config.rawStorageDir,
    logsDir: config.logsDir,
  };
  const declared = {
    environment: manifest.target.environment,
    projectRoot: manifest.candidate.root,
    dataDir: manifest.target.data,
    sqlitePath: manifest.target.database,
    dbBackend: manifest.target.backend,
    dbUrl: "",
    rawStorageDir: manifest.target.raw,
    logsDir: manifest.target.logs,
  };
  if (stable(configured) !== stable(declared) || config.dbAuthToken || config.openaiApiKey)
    refuse("environment_mismatch");
  const inspection = new AsyncSqliteDatabase(manifest.target.database, {
    existing: true,
    readOnly: true,
  });
  let before: LifecycleDatabaseInventory;
  try {
    before = await inspection.transaction((tx) => inspectLifecycleDatabase(tx));
  } finally {
    await inspection.close();
  }
  if (stable(before) !== stable(beforeExpected)) refuse("before_mismatch");
  const records = new ExecutorRecords(parsed.output, root, {
    mode: parsed.mode,
    manifest_sha256: sha256(stable(manifest)),
    candidate: manifest.candidate.commit,
    target_sha256: sha256(stable(manifest.target)),
    before: before.sha256,
    source_sha256: sha256(originalSource),
    action_methods: [],
  });
  let database: DbDatabase | undefined;
  let copyCommitObserved = false;
  try {
    // The isolated copy was inspected before opening; rebind path/header/candidate immediately.
    candidate(manifest);
    target(manifest, parsed.mode);
    sourceFiles(manifest);
    database = new AsyncSqliteDatabase(manifest.target.database, {
      existing: true,
      readOnly: parsed.mode === "verify",
    });
    const originalColumns = before.tables
      .find((table) => table.name === "observations")
      ?.columns.map((column) => column.name as string);
    if (!originalColumns || !originalColumns.includes("id")) refuse("before_mismatch");
    const originalIds = (await database
      .prepare("SELECT hex(CAST(id AS BLOB)) AS id FROM observations ORDER BY id")
      .all()) as { id: string }[];
    const originalDigest = await originalRows(database, originalColumns);
    const entityColumns = before.tables
      .find((table) => table.name === "entities")
      ?.columns.map((column) => column.name as string)
      .filter((name) => !["canonical_name", "aliases", "updated_at"].includes(name));
    if (!entityColumns?.length) refuse("before_mismatch");
    const entityIdentity = await inspectLifecycleTable(database, "entities", entityColumns);
    const mutable = new Set(["entities", "observations", "entity_snapshots", "timeline_events"]);
    const requiredPreserved = before.tables
      .filter((table) => !mutable.has(table.name) && !table.name.startsWith("entity_lifecycle_"))
      .map((table) => table.name)
      .sort();
    if (stable([...manifest.expected_after.preserved_tables].sort()) !== stable(requiredPreserved))
      refuse("preservation_invalid");
    const check = async (tx: DbConnection) => {
      const state = await verifyEntityLifecycleStorage(tx);
      if (
        state.state !== manifest.expected_after.state ||
        state.baselines !== manifest.expected_after.baselines ||
        state.members !== manifest.expected_after.members
      )
        refuse("lifecycle_mismatch");
      const inventory = await inspectLifecycleDatabase(tx);
      allowedSchemaDelta(before, inventory);
      if (
        manifest.expected_after.inventory &&
        stable(inventory) !== stable(artifactJson(manifest.expected_after.inventory, root))
      )
        refuse("after_mismatch");
      if (
        manifest.expected_after.schema &&
        stable(inventory.schema) !== stable(artifactJson(manifest.expected_after.schema, root))
      )
        refuse("schema_delta_invalid");
      if (
        (await originalRows(
          tx,
          originalColumns,
          originalIds.map((row) => row.id)
        )) !== originalDigest
      )
        refuse("original_rows_changed");
      if (
        stable(await inspectLifecycleTable(tx, "entities", entityColumns)) !==
        stable(entityIdentity)
      )
        refuse("entity_identity_changed");
      for (const table of requiredPreserved) {
        const original = before.tables.find((row) => row.name === table);
        const after = inventory.tables.find((row) => row.name === table);
        if (stable(after) !== stable(original)) refuse("preservation_invalid");
      }
      if (!manifest.expected_after.materialized) refuse("materialization_unavailable");
      if (
        stable(await lifecycleMaterialization(tx)) !==
        stable(artifactJson(manifest.expected_after.materialized, root))
      )
        refuse("materialization_invalid");
      await nativeMaterialization(database!);
      return { inventory, state };
    };
    let after:
      | {
          inventory: LifecycleDatabaseInventory;
          state: { state: "pre_cutover" | "committed"; baselines: number; members: number };
        }
      | undefined;
    await withExistingLifecycleDatabase(database, async () => {
      if (parsed.mode === "preview") {
        if (manifest.expected_after.state !== "committed" || !manifest.expected_after.schema)
          refuse("after_mismatch");
        const { recomputeSnapshot } = await import("../services/snapshot_computation.js");
        await migrateEntityLifecycleAuthority(
          database!,
          async (_tx, targets) => {
            for (const entity of targets) {
              const { schemaRegistry } = await import("../services/schema_registry.js");
              if (!(await schemaRegistry.loadActiveSchema(entity.entity_type, entity.user_id)))
                refuse("schema_unavailable");
              await recomputeSnapshot(entity.id, entity.user_id, true);
            }
          },
          {
            before: async (tx) => {
              if (stable(await inspectLifecycleDatabase(tx)) !== stable(before))
                refuse("before_mismatch");
            },
            after: async (tx) => {
              after = await check(tx);
            },
          }
        );
      } else {
        after = await database!.transaction(check);
      }
    });
    if (!after) refuse("verification_failed");
    copyCommitObserved = parsed.mode === "preview";
    await database.close();
    database = undefined;
    if (
      !readFileSync(manifest.target.isolation.source_database).equals(originalSource) ||
      sourceFiles(manifest) !== rawDigest
    )
      refuse("original_source_changed");
    candidate(manifest);
    referencedArtifacts(manifest);
    const outcome = {
      version: "entity_lifecycle_execution_v1",
      reference: records.reference,
      mode: parsed.mode,
      status:
        parsed.mode === "preview"
          ? "isolated_preview_verified"
          : after.state.state === "pre_cutover"
            ? "pre_cutover_verified"
            : "already_committed_verified",
      observation_scope: "changing_state_observation_not_maintained_adoption",
      authority_verified: false,
      backup_custody_verifier: "unsupported",
      maintenance_action_verifier: "unsupported",
      action_methods: [],
      candidate: manifest.candidate.commit,
      before,
      after: after.inventory,
      state: after.state,
      source_preserved: true,
      raw_files_preserved: true,
    };
    records.finish(outcome);
    return outcome;
  } catch (error) {
    try {
      records.append({
        phase: "failed",
        category: error instanceof LifecycleExecutorRefused ? error.category : "execution_failed",
        adoption_ready: false,
        outcome: copyCommitObserved
          ? "outcome_unknown_requires_readonly_verification"
          : "verification_failed",
      });
    } catch {
      /* No diagnostic failure converts refusal to success. */
    }
    throw error;
  } finally {
    if (database) await database.close();
    records.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.on("error", () => {
    process.exitCode = 1;
  });
  process.stderr.on("error", () => {
    process.exitCode = 1;
  });
  runLifecycleExecutor(process.argv.slice(2))
    .then((outcome) => {
      try {
        process.stdout.write(
          JSON.stringify({
            status: outcome.status,
            reference: outcome.reference,
            authority_verified: false,
          }) + "\n"
        );
      } catch {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      process.exitCode = 1;
      try {
        process.stderr.write(
          JSON.stringify({
            category:
              error instanceof LifecycleExecutorRefused ? error.category : "executor_failed",
            reference: randomUUID(),
          }) + "\n"
        );
      } catch {
        /* Fail closed even if diagnostic transport fails. */
      }
    });
}
