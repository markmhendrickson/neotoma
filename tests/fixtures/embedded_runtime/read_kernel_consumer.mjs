import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const before = { ...process.env };
const directory = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(directory + "/manifest.json", "utf8"));
await assert.rejects(
  () => import("../../../dist/server.js?positive-control"),
  /READ_KERNEL_FORBIDDEN_IMPORT/
);
assert.equal(fs.readFileSync(process.env.KERNEL_IMPORT_JOURNAL, "utf8"), "blocked\n");
fs.writeFileSync(process.env.KERNEL_IMPORT_JOURNAL, "");
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
for (const fixture of manifest.fixtures) {
  const database = new AsyncSqliteDatabase(fixture.path, { existing: true, readOnly: true });
  const context = new EmbeddedRuntimeContext({
    database,
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
    kernel: createInternalReadKernel({ runtime: context, userId: manifest.userId }),
  });
}
assert.equal(resources[0].fixture.id, resources[1].fixture.id);
await Promise.all(
  resources.map(async ({ fixture, kernel }) => {
    const result = await kernel.listObservations({ entity_id: fixture.id });
    assert.equal(result.total, 2);
    assert.deepEqual(
      result.observations.map((row) => row.fields.status),
      [fixture.label + "-corrected", fixture.label]
    );
    await assert.rejects(
      () => kernel.execute("retrieve_entity_snapshot", { entity_id: fixture.id }),
      (error) => error.toErrorEnvelope().error_code === "FEATURE_UNAVAILABLE"
    );
    await assert.rejects(
      () => kernel.execute("npm_check_update", {}),
      (error) => error.toErrorEnvelope().error_code === "NETWORK_DISABLED"
    );
  })
);
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
