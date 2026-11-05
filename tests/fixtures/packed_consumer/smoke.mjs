/** Copied into and executed from a clean installed production consumer. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const consumer = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
assert.equal(process.env.NODE_PATH, "");
for (let dir = path.dirname(consumer); ; dir = path.dirname(dir)) {
  assert.ok(
    !fs.existsSync(path.join(dir, "node_modules")),
    "Ancestor node_modules could mask missing consumer dependencies"
  );
  if (path.dirname(dir) === dir) break;
}
// Representative relocated packages with no legitimate production transitive
// requirement. Resolve, rather than inspect only the manifest or lock flags.
for (const name of [
  "react",
  "react-dom",
  "@hookform/resolvers",
  "@radix-ui/react-dialog",
  "lucide-react",
]) {
  assert.throws(
    () => require.resolve(name),
    { code: "MODULE_NOT_FOUND" },
    `${name} must be absent from the production consumer`
  );
}
const { createOperations } = await import("neotoma/core");
assert.equal(typeof createOperations, "function");
assert.equal(typeof (await import("neotoma/server")).NeotomaServer, "function");
assert.ok(Object.keys(await import("neotoma/aauth")).length > 0);
const packageRoot = new URL("../../", import.meta.resolve("neotoma/core"));
assert.equal(
  fs.realpathSync(fileURLToPath(packageRoot)),
  fs.realpathSync(path.join(consumer, "node_modules/neotoma"))
);
// Resolve every declared public entry without starting the root MCP process.
const manifest = JSON.parse(fs.readFileSync(new URL("package.json", packageRoot)));
for (const entry of Object.keys(manifest.exports)) {
  const resolved = import.meta.resolve(entry === "." ? "neotoma" : "neotoma" + entry.slice(1));
  assert.ok(fs.existsSync(fileURLToPath(resolved)), `Public export file must ship: ${entry}`);
}
const { resolveOpenApiPath } = await import(new URL("dist/shared/openapi_file.js", packageRoot));
assert.equal(
  fs.realpathSync(resolveOpenApiPath()),
  fs.realpathSync(new URL("openapi.yaml", packageRoot))
);

const ops = createOperations({ userId: "00000000-0000-4000-8000-000000000001" });
const stored = await ops.store({
  entities: [{ entity_type: "task", title: "Synthetic package fixture", status: "pending" }],
  idempotency_key: "packed-consumer-store-001",
});
const id = stored.entities?.[0]?.entity_id;
assert.equal(typeof id, "string");
assert.equal(
  (await ops.retrieveEntitySnapshot({ entity_id: id, format: "json" })).snapshot.status,
  "pending"
);
const correction = await ops.correct({
  entity_id: id,
  entity_type: "task",
  field: "status",
  value: "done",
  idempotency_key: "packed-consumer-correct-001",
});
const snapshot = await ops.retrieveEntitySnapshot({ entity_id: id, format: "json" });
assert.equal(snapshot.snapshot.status, "done");
assert.equal(snapshot.provenance.status, correction.observation_id);
const history = await ops.listObservations({ entity_id: id, limit: 20 });
assert.equal(history.observations.length, 2);
assert.ok(
  history.observations.some(
    (row) => row.id === correction.observation_id && row.fields.status === "done"
  )
);
await ops.dispose();

const { app } = await import(new URL("dist/actions.js", packageRoot));
const server = createServer(app);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
let assets;
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + "/", { headers: { Accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /<html/);
  assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+\.(?:js|css))"/g)].map((match) =>
    match[1].slice(1)
  );
  assert.ok(
    assets.some((asset) => asset.endsWith(".js")) && assets.some((asset) => asset.endsWith(".css")),
    "Inspector HTML must reference JS and CSS"
  );
  for (const asset of assets) {
    const response = await fetch(base + "/" + asset);
    assert.equal(response.status, 200, `Inspector asset must be served: ${asset}`);
    assert.match(
      response.headers.get("content-type"),
      asset.endsWith(".css") ? /text\/css/ : /javascript/,
      `Inspector asset content type: ${asset}`
    );
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      fs.readFileSync(new URL("dist/inspector/" + asset, packageRoot)),
      `Inspector asset bytes: ${asset}`
    );
  }
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}
fs.writeFileSync(
  process.env.PACKED_CONSUMER_RESULT,
  JSON.stringify({ history_rows: history.observations.length, served_assets: assets })
);
// The legacy facade does not provide an ownership/disposal contract. This
// bounded artifact check intentionally exits after assertions, not naturally.
process.exit(0);
