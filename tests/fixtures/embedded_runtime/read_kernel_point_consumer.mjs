import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const before = { ...process.env };
const directory = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(directory + "/manifest.json", "utf8"));
for (const forbidden of [
  "../../../dist/server.js?positive-control",
  "../../../dist/actions.js?positive-control",
  "../../../dist/embeddings.js?positive-control",
  "../../../dist/services/entity_semantic_search.js?positive-control",
  "../../../dist/services/entity_snapshot_embedding.js?positive-control",
  "../../../dist/services/canonical_markdown.js?positive-control",
  "../../../dist/repositories/db/connection.js?positive-control",
  "../../../dist/repositories/sqlite/sqlite_client.js?positive-control",
  "openai",
  "@modelcontextprotocol/sdk/types.js",
]) {
  await assert.rejects(() => import(forbidden), /READ_KERNEL_FORBIDDEN_IMPORT/);
  assert.equal(fs.readFileSync(process.env.KERNEL_IMPORT_JOURNAL, "utf8"), "blocked\n");
  fs.writeFileSync(process.env.KERNEL_IMPORT_JOURNAL, "");
}
assert.throws(
  () => fetch("https://example.invalid/kernel-positive-control"),
  /external network denied/
);
assert.equal(fs.readFileSync(process.env.SCHEMA_GATE_NETWORK_JOURNAL, "utf8"), "denied\n");
fs.writeFileSync(process.env.SCHEMA_GATE_NETWORK_JOURNAL, "");
let forbidden = 0;
const deny = () => {
  forbidden++;
  throw new Error("READ_KERNEL_FORBIDDEN_EFFECT");
};
net.Server.prototype.listen = deny;
childProcess.spawn = deny;
globalThis.setInterval = deny;
for (const probe of [
  () => new net.Server().listen(0),
  () => childProcess.spawn("unused"),
  () => setInterval(() => {}, 1),
])
  assert.throws(probe, /READ_KERNEL_FORBIDDEN_EFFECT/);
assert.equal(forbidden, 3);
forbidden = 0;
let hostReads = 0;
const originalRead = fs.readFileSync;
fs.readFileSync = function (path, ...args) {
  if (String(path).endsWith("/.env")) {
    hostReads++;
    throw new Error("READ_KERNEL_HOST_CONFIG");
  }
  return originalRead(path, ...args);
};
syncBuiltinESMExports();
assert.throws(() => fs.readFileSync(process.cwd() + "/.env"), /READ_KERNEL_HOST_CONFIG/);
assert.equal(hostReads, 1);
hostReads = 0;
const { EmbeddedRuntimeContext } = await import("../../../dist/core/runtime_context.js");
const { createEmbeddedRuntimeConfiguration } =
  await import("../../../dist/core/runtime_configuration.js");
const { AsyncSqliteDatabase } = await import("../../../dist/repositories/sqlite/sqlite_driver.js");
const { createInternalReadKernel } = await import("../../../dist/core/read_kernel.js");
const packageRoot = new URL("../../../", import.meta.url).pathname;
const resources = [];
let writes = 0;
const mutates =
  /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK)\b/i;
function readOnlyDatabase(database) {
  return new Proxy(database, {
    get(target, key) {
      if (key === "prepare" || key === "exec")
        return (sql, ...args) => {
          if (mutates.test(sql)) {
            writes++;
            throw new Error("READ_KERNEL_WRITE_ATTEMPT");
          }
          return target[key](sql, ...args);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
for (const fixture of manifest.fixtures) {
  const database = new AsyncSqliteDatabase(fixture.path, { existing: true, readOnly: true });
  const guarded = readOnlyDatabase(database);
  assert.throws(
    () => guarded.prepare("UPDATE entities SET canonical_name='synthetic'"),
    /READ_KERNEL_WRITE_ATTEMPT/
  );
  assert.equal(writes, 1);
  writes = 0;
  const context = new EmbeddedRuntimeContext({
    database: guarded,
    configuration: createEmbeddedRuntimeConfiguration({
      dataDirectory: directory + "/" + fixture.label,
      packageRoot,
    }),
    legacyIdentityPolicy: { tenantScopedEntityIds: false },
    attributionPolicy: { anonymous_writes: "allow" },
    adapters: { label: fixture.label },
  });
  resources.push({
    fixture,
    database,
    context,
    kernel: createInternalReadKernel({ runtime: context, userId: fixture.userId }),
  });
}
assert.equal(resources[0].fixture.id, resources[1].fixture.id);
let loggingReads = 0;
const ambientEnvironment = process.env;
process.env = new Proxy(ambientEnvironment, {
  get(target, key) {
    if (key === "NEOTOMA_ACTIONS_DISABLE_AUTOSTART" || key === "NEOTOMA_MCP_ENABLE_LOGGING") {
      loggingReads++;
      throw new Error("PRIVATE_AMBIENT_LOGGING_READ");
    }
    return Reflect.get(target, key);
  },
});
assert.throws(() => process.env.NEOTOMA_MCP_ENABLE_LOGGING, /PRIVATE_AMBIENT_LOGGING_READ/);
assert.equal(loggingReads, 1);
loggingReads = 0;
try {
  await Promise.all(
    resources.map(async ({ fixture, kernel }) => {
      const current = await kernel.execute("retrieve_entity_snapshot", {
        entity_id: fixture.id,
        format: "json",
      });
      assert.equal(current.entity_id, fixture.id);
      assert.equal(current.snapshot.status, fixture.label + "-corrected");
      const result = await kernel.retrieveEntities({ entity_type: "kernel_note" });
      assert.equal(result.total, 1);
      assert.equal(result.entities.length, 1);
      assert.equal(result.entities[0].entity_id, fixture.id);
      assert.equal(result.entities[0].snapshot.status, fixture.label + "-corrected");
      assert.equal(result.read_contract.mode.actual, "structured");
      for (const selector of [
        { sort_by: "snapshot." },
        { snapshot_filters: { "private.rejected": { op: "eq", value: "PRIVATE-REJECTED-VALUE" } } },
      ])
        await assert.rejects(
          () => kernel.execute("retrieve_entities", { entity_type: "kernel_note", ...selector }),
          (error) => {
            const envelope = error.toErrorEnvelope();
            assert.equal(error.statusCode, 400);
            assert.equal(envelope.error_code, "INVALID_QUERY_FIELD");
            assert.equal(envelope.message, "Invalid query field name.");
            assert.match(envelope.details.hint, /bare identifiers/);
            assert.doesNotMatch(
              JSON.stringify(envelope),
              /private\.rejected|PRIVATE-REJECTED-VALUE/
            );
            return true;
          }
        );
      const light = await kernel.execute("retrieve_entities", {
        entity_type: "kernel_note",
        include_snapshots: false,
      });
      assert.deepEqual(light.entities[0].snapshot, { status: fixture.label + "-corrected" });
      await assert.rejects(
        () => kernel.execute("retrieve_entities", {}),
        (error) => error.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
      );
      for (const input of [
        { entity_type: "kernel_note", search: "x" },
        { entity_type: "kernel_note", valid_at: "2026-01-01T00:00:00Z" },
      ])
        await assert.rejects(
          () => kernel.execute("retrieve_entities", input),
          (error) => error.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
        );
      await assert.rejects(
        () => kernel.execute("retrieve_entity_by_identifier", {}),
        (error) => error.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
      );
      await assert.rejects(
        () =>
          kernel.execute("retrieve_entity_snapshot", { entity_id: fixture.id, at: "2000-01-01" }),
        (error) => error.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
      );
    })
  );
  assert.equal(loggingReads, 0);
  assert.equal(writes, 0);
} finally {
  process.env = ambientEnvironment;
}

for (const { kernel, context, database } of resources) {
  await kernel.dispose();
  await kernel.dispose();
  await context.dispose();
  await database.prepare("SELECT 1").get();
  await database.close();
}
assert.deepEqual({ ...process.env }, before);
assert.equal(hostReads, 0);
assert.equal(forbidden, 0);
assert.equal(fs.readFileSync(process.env.KERNEL_IMPORT_JOURNAL, "utf8"), "");
assert.equal(fs.readFileSync(process.env.SCHEMA_GATE_NETWORK_JOURNAL, "utf8"), "");
console.log("READ_KERNEL_READY");
