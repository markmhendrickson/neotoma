import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import net from "node:net";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

const packageRoot = new URL("../../../", import.meta.url).pathname;
const directory = process.argv[2];
const before = { ...process.env };
let forbiddenAttempts = 0;
const deny = () => {
  forbiddenAttempts++;
  throw new Error("EMBEDDED_FORBIDDEN_EFFECT");
};
const originalListen = net.Server.prototype.listen;
const originalSpawn = childProcess.spawn;
const originalInterval = globalThis.setInterval;
net.Server.prototype.listen = deny;
childProcess.spawn = deny;
globalThis.setInterval = deny;
syncBuiltinESMExports();
// Known-positive controls establish that each observation instrument is bound.
for (const probe of [
  () => new net.Server().listen(0),
  () => childProcess.spawn("unused"),
  () => setInterval(() => {}, 1),
]) {
  assert.throws(probe, /EMBEDDED_FORBIDDEN_EFFECT/);
}
assert.equal(forbiddenAttempts, 3);
forbiddenAttempts = 0;
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.map(String).join(" "));

const { EmbeddedRuntimeContext, getEmbeddedRuntimeContext } =
  await import("../../../dist/core/runtime_context.js");
const { createEmbeddedRuntimeConfiguration } =
  await import("../../../dist/core/runtime_configuration.js");
const { AsyncSqliteDatabase } = await import("../../../dist/repositories/sqlite/sqlite_driver.js");
const { createOperations } = await import("../../../dist/core/operations.js");
const user = "00000000-0000-4000-8000-000000000001";
function make(label) {
  const dataDirectory = directory + "/" + label;
  mkdirSync(dataDirectory, { recursive: true });
  return new EmbeddedRuntimeContext({
    legacyIdentityPolicy: { tenantScopedEntityIds: false },
    attributionPolicy: { anonymous_writes: "allow" },
    database: new AsyncSqliteDatabase(dataDirectory + "/store.db"),
    configuration: createEmbeddedRuntimeConfiguration({ dataDirectory, packageRoot }),
    adapters: { label },
  });
}
const a = make("a"),
  b = make("b");
const opsA = createOperations({ userId: user }),
  opsB = createOperations({ userId: user }),
  legacy = createOperations({ userId: user });
function schema(version, label) {
  return {
    entity_type: "runtime_note",
    schema_version: version,
    activate: true,
    user_specific: true,
    schema_definition: {
      fields: {
        title: { type: "string" },
        status: { type: "string" },
        ["only_" + label]: { type: "string" },
      },
      canonical_name_fields: ["title"],
    },
    reducer_config: {
      merge_policies: {
        title: { strategy: "last_write" },
        status: { strategy: "last_write" },
        ["only_" + label]: { strategy: "last_write" },
      },
    },
  };
}
for (const [context, operations, version, label] of [
  [a, opsA, "1.0", "a"],
  [b, opsB, "2.0", "b"],
]) {
  await context.run(async () => {
    const { ensureSchema } = await import("../../../dist/repositories/sqlite/sqlite_client.js");
    // Isolated test admission only; no runtime/factory auto-DDL is authorized.
    await ensureSchema(context.database);
    assert.equal(
      (await operations.executeTool("register_schema", schema(version, label))).success,
      true
    );
    const { installSubscriptionBridge } =
      await import("../../../dist/services/subscriptions/install_subscription_bridge.js");
    installSubscriptionBridge();
  });
}
// Refused features must leave all write-bearing tables unchanged.
await a.run(async () => {
  const tables = [
    "sources",
    "entities",
    "observations",
    "entity_snapshots",
    "raw_fragments",
    "schema_registry",
    "relationship_observations",
  ];
  const counts = async () =>
    Promise.all(
      tables.map(
        async (table) =>
          (await a.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).count
      )
    );
  const initial = await counts();
  for (const invoke of [
    () => opsA.executeTool("unrecognized_future_operation", {}),
    () =>
      opsA.store({
        entities: [{ entity_type: "runtime_note", title: "Must not land" }],
        file_content: "bytes",
        idempotency_key: "refused-mixed",
      }),
    () => opsA.executeTool("store", { intake: { mode: "overflow" } }),
  ])
    await assert.rejects(invoke, (error) => error.data?.error_code === "FEATURE_UNAVAILABLE");
  await assert.rejects(
    () => opsA.executeTool("npm_check_update", {}),
    (error) => error.data?.error_code === "NETWORK_DISABLED"
  );
  assert.deepEqual(await counts(), initial);
});
await a.run(async () => {
  const stored = await opsA.store({
    entities: [{ entity_type: "runtime_note", title: "Explicit before legacy", status: "initial" }],
    idempotency_key: "explicit-before-legacy",
  });
  const id = stored.entities[0].entity_id;
  await opsA.correct({
    entity_id: id,
    entity_type: "runtime_note",
    field: "status",
    value: "corrected",
    idempotency_key: "explicit-before-legacy-correction",
  });
  assert.equal(
    (await opsA.retrieveEntitySnapshot({ entity_id: id, format: "json" })).snapshot.status,
    "corrected"
  );
});
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(warnings, []);
assert.deepEqual({ ...process.env }, before);
assert.equal(forbiddenAttempts, 0);
if (process.argv[3] === "explicit-only") {
  await Promise.all([opsA.dispose(), opsB.dispose(), a.dispose(), b.dispose()]);
  await a.database.close();
  await b.database.close();
} else {
  // Legacy initialization is permitted only after the explicit-only assertions.
  assert.equal(
    (await legacy.executeTool("register_schema", schema("3.0", "legacy"))).success,
    true
  );
  function input(label) {
    return {
      entities: [
        {
          entity_type: "runtime_note",
          title: "Identical record",
          status: label,
          ["only_" + label]: label,
        },
      ],
      idempotency_key: "identical-key",
    };
  }
  const [storedA, storedB, storedLegacy] = await Promise.all([
    a.run(() => opsA.store(input("a"))),
    b.run(() => opsB.store(input("b"))),
    legacy.store(input("legacy")),
  ]);
  const id = storedA.entities[0].entity_id;
  assert.equal(storedB.entities[0].entity_id, id);
  assert.equal(storedLegacy.entities[0].entity_id, id);
  const correct = (operations, label) =>
    operations.correct({
      entity_id: id,
      entity_type: "runtime_note",
      field: "status",
      value: "corrected-" + label,
      idempotency_key: "same-correction",
    });
  await Promise.all([
    a.run(() => correct(opsA, "a")),
    b.run(() => correct(opsB, "b")),
    correct(legacy, "legacy"),
  ]);
  const { schemaRegistry } = await import("../../../dist/services/schema_registry.js");
  async function verify(operations, label, version) {
    const snapshot = await operations.retrieveEntitySnapshot({ entity_id: id, format: "json" });
    assert.equal(snapshot.snapshot.status, "corrected-" + label);
    assert.equal(snapshot.snapshot["only_" + label], label);
    for (const other of ["a", "b", "legacy"])
      if (other !== label) assert.equal(snapshot.snapshot["only_" + other], undefined);
    assert.equal(
      (await operations.listObservations({ entity_id: id, limit: 20 })).observations.length,
      2
    );
    assert.equal(
      (await schemaRegistry.loadActiveSchema("runtime_note", user)).schema_version,
      version
    );
    if (label !== "legacy") assert.equal(getEmbeddedRuntimeContext().adapters.label, label);
  }
  await Promise.all([
    a.run(() => verify(opsA, "a", "1.0")),
    b.run(() => verify(opsB, "b", "2.0")),
    verify(legacy, "legacy", "3.0"),
  ]);
  // Same payload/key replay does not add an observation or cross to another store.
  await Promise.all([a.run(() => opsA.store(input("a"))), b.run(() => opsB.store(input("b")))]);
  await a.run(() => verify(opsA, "a", "1.0"));
  await b.run(() => verify(opsB, "b", "2.0"));
  await Promise.all([opsA.dispose(), opsB.dispose(), legacy.dispose(), a.dispose(), b.dispose()]);
  // Caller-owned handles remain usable after disposal, then the caller closes them.
  await a.database.prepare("SELECT 1").get();
  await b.database.prepare("SELECT 1").get();
  await a.database.close();
  await b.database.close();
}
net.Server.prototype.listen = originalListen;
childProcess.spawn = originalSpawn;
globalThis.setInterval = originalInterval;
syncBuiltinESMExports();
console.warn = originalWarn;
assert.equal(forbiddenAttempts, 0);
console.log("GUARDED_DUAL_STORE_OK");
