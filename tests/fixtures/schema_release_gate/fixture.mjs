import assert from "node:assert/strict";
import net from "node:net";
import fs from "node:fs";

const [root, mode] = process.argv.slice(2);
if (mode === "network_control") {
  const server = net.createServer((socket) => socket.end("owned"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const text = await new Promise((resolve, reject) => {
      const socket = net.connect(server.address().port, "127.0.0.1");
      let result = "";
      socket.on("data", (data) => (result += data.toString()));
      socket.on("end", () => resolve(result));
      socket.on("error", reject);
    });
    assert.equal(text, "owned");
    assert.throws(() => net.connect(443, "external.invalid"), /external network denied/);
    assert.equal(fs.readFileSync(process.env.SCHEMA_GATE_NETWORK_JOURNAL, "utf8"), "denied\n");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("SCHEMA_GATE_RESULT=" + JSON.stringify({ network_control: true }));
  process.exit(0);
}

const { config } = await import(root + "/dist/config.js");
// Assert the actual native path before any connection can open.
assert.equal(config.sqlitePath, process.env.NEOTOMA_SQLITE_PATH);
assert.equal(config.dbBackend, "sqlite");
assert.equal(config.projectRoot, root);
const { getDb } = await import(root + "/dist/repositories/db/connection.js");
const { schemaRegistry } = await import(root + "/dist/services/schema_registry.js");
const { ENTITY_SCHEMAS } = await import(root + "/dist/services/schema_definitions.js");
const { BUILT_IN_RELATIONSHIP_TYPES } = await import(
  root + "/dist/services/relationship_types/seed_registry.js"
);
const database = await getDb();
try {
  if (mode === "custom_entity") {
    await schemaRegistry.register({ ...ENTITY_SCHEMAS.contact, activate: false });
    await schemaRegistry.register({
      entity_type: "contact",
      schema_version: "9.9-owned",
      schema_definition: {
        fields: { owned_key: { type: "string", required: false } },
        canonical_name_fields: ["owned_key"],
      },
      reducer_config: { merge_policies: {} },
      metadata: { description: "owned synthetic customization" },
      activate: true,
    });
  }
  if (mode === "custom_relationship") {
    const { relationshipTypeRegistry } = await import(
      root + "/dist/services/relationship_types/registry.js"
    );
    await relationshipTypeRegistry.register({
      relationship_type: "REFERS_TO",
      scope: "global",
      registry_version: "9.9-owned",
      description: "owned vocabulary customization",
      metadata: { owned: "retained" },
    });
  }
  if (mode === "entity_failure") {
    // Retain a custom row even while another genuinely absent type fails.
    await schemaRegistry.register({
      entity_type: "contact",
      schema_version: "9.9-owned",
      schema_definition: {
        fields: { owned_key: { type: "string", required: false } },
        canonical_name_fields: ["owned_key"],
      },
      reducer_config: { merge_policies: {} },
      activate: true,
    });
    await database.exec(
      "CREATE TRIGGER owned_failure BEFORE INSERT ON schema_registry " +
        "WHEN NEW.entity_type='company' BEGIN SELECT RAISE(ABORT,'owned_schema_failure'); END;"
    );
  }
  if (mode === "relationship_failure") {
    await database.exec(
      "CREATE TRIGGER owned_failure BEFORE INSERT ON relationship_type_registry " +
        "WHEN NEW.relationship_type='REFERS_TO' " +
        "BEGIN SELECT RAISE(ABORT,'owned_relationship_failure'); END;"
    );
  }
  const business = {};
  for (const table of [
    "entities",
    "observations",
    "sources",
    "relationship_snapshots",
    "entity_snapshots",
  ]) {
    business[table] = (await database.prepare("SELECT COUNT(*) AS n FROM " + table).get()).n;
  }
  const schemas = await database
    .prepare("SELECT * FROM schema_registry ORDER BY entity_type,id")
    .all();
  const vocabulary = await database
    .prepare("SELECT * FROM relationship_type_registry ORDER BY relationship_type,id")
    .all();
  const active = await schemaRegistry.loadGlobalSchema("contact");
  console.log(
    "SCHEMA_GATE_RESULT=" +
      JSON.stringify({
        business,
        schemas,
        vocabulary,
        active,
        expected_types: Object.values(ENTITY_SCHEMAS)
          .map((schema) => schema.entity_type)
          .sort(),
        expected_relationships: BUILT_IN_RELATIONSHIP_TYPES.map(
          (row) => row.relationship_type
        ).sort(),
      })
  );
} finally {
  await database.close();
}
