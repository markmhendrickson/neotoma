import { mkdirSync, writeFileSync } from "node:fs";
import { EmbeddedRuntimeContext } from "../../../dist/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../../dist/core/runtime_configuration.js";
import { initializeFreshEmbeddedDatabase } from "../../../dist/core/runtime_database.js";
import { AsyncSqliteDatabase } from "../../../dist/repositories/sqlite/sqlite_driver.js";
import { createOperations } from "../../../dist/core/operations.js";
const directory = process.argv[2];
const packageRoot = new URL("../../../", import.meta.url).pathname;
const userId = "00000000-0000-4000-8000-000000000001";
const fixtures = [];
for (const label of ["a", "b"]) {
  const dataDirectory = directory + "/" + label;
  mkdirSync(dataDirectory, { recursive: true });
  const path = dataDirectory + "/store.db";
  const database = new AsyncSqliteDatabase(path);
  const context = new EmbeddedRuntimeContext({
    database,
    configuration: createEmbeddedRuntimeConfiguration({ dataDirectory, packageRoot }),
    legacyIdentityPolicy: { tenantScopedEntityIds: false },
    attributionPolicy: { anonymous_writes: "allow" },
    adapters: {},
  });
  const ops = createOperations({ userId });
  await initializeFreshEmbeddedDatabase(context);
  await context.run(() =>
    ops.executeTool("register_schema", {
      entity_type: "kernel_note",
      schema_version: label === "a" ? "1.0" : "2.0",
      activate: true,
      user_specific: true,
      schema_definition: {
        fields: { title: { type: "string" }, status: { type: "string" } },
        canonical_name_fields: ["title"],
      },
      reducer_config: {
        merge_policies: { title: { strategy: "last_write" }, status: { strategy: "last_write" } },
      },
    })
  );
  const stored = await context.run(() =>
    ops.store({
      entities: [{ entity_type: "kernel_note", title: "Same fixture", status: label }],
      idempotency_key: "same-key",
    })
  );
  const id = stored.entities[0].entity_id;
  await new Promise((resolve) => setTimeout(resolve, 2));
  await context.run(() =>
    ops.correct({
      entity_id: id,
      entity_type: "kernel_note",
      field: "status",
      value: label + "-corrected",
      idempotency_key: "same-correction",
    })
  );
  await ops.dispose();
  await context.dispose();
  await database.close();
  fixtures.push({ label, path, id });
}
writeFileSync(directory + "/manifest.json", JSON.stringify({ userId, fixtures }));
console.log("READ_FIXTURE_READY");
