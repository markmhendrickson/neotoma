import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

const [root, mode] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(resolve(root, "packages/client/package.json"), "utf8"));
const { NeotomaClient, snapshotOnUpdate } = await import(
  pathToFileURL(resolve(root, "packages/client", manifest.exports["."].import)).href
);
const { createOperations } = await import("neotoma/core");
const { app } = await import(resolve(root, "dist/actions.js"));
const server = createServer(app);
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const userId = "00000000-0000-0000-0000-000000000000";
// Explicit trusted loopback admission; this is not a production-auth topology test.
const client = new NeotomaClient(
  mode === "local"
    ? { transport: "local", userId, operations: createOperations({ userId }) }
    : { transport: "http", baseUrl, headers: { Authorization: "" } }
);
const entityType = `sdk_correction_${randomUUID().replaceAll("-", "")}`;
const snapshot = async (id) => {
  const result = await client.retrieveEntitySnapshot({ entity_id: id });
  // The existing local reader defaults to Markdown; HTTP returns an object.
  return typeof result === "string"
    ? {
        status: result.match(/^status: (.*)$/m)?.[1],
        count: Number(result.match(/^observation_count: (\d+)$/m)?.[1]),
      }
    : { status: result.snapshot.status, count: result.observation_count };
};
try {
  await client.executeTool("register_schema", {
    entity_type: entityType,
    schema_version: "1.0",
    schema_definition: {
      canonical_name_fields: ["name"],
      fields: { name: { type: "string" }, status: { type: "string" }, note: { type: "string" } },
    },
    reducer_config: { merge_policies: {} },
    activate: true,
  });
  const stored = await client.store({
    entities: [{ entity_type: entityType, name: `Synthetic ${randomUUID()}`, status: "old" }],
    idempotency_key: randomUUID(),
  });
  const id = stored.entities[0].entity_id;
  assert.deepEqual(await snapshot(id), { status: "old", count: 1 });
  const input = {
    entity_id: id,
    entity_type: entityType,
    field: "status",
    value: "canonical",
    idempotency_key: randomUUID(),
  };
  const corrected = await client.correct(input);
  assert.equal(corrected.value, "canonical");
  assert.match(corrected.observation_id, /^[a-f0-9-]+$/);
  assert.deepEqual(await snapshot(id), { status: "canonical", count: 2 });
  const replay = await client.correct(input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.observation_id, corrected.observation_id);
  await assert.rejects(() => client.correct({ ...input, value: "changed retry" }));
  await assert.rejects(() => client.correct({ ...input, idempotency_key: undefined }));
  await assert.rejects(() => client.correct({ entity_id: id, corrections: { status: "legacy" } }));
  assert.deepEqual(await snapshot(id), { status: "canonical", count: 2 });

  const helperInput = {
    entityId: id,
    entityType,
    idempotencyKey: randomUUID(),
    corrections: { status: "requested" },
    expectedVersion: corrected.entity_version,
    overwrite: false,
    review: (previous) => {
      assert.match(JSON.stringify(previous), /canonical/);
      return { status: "reviewed" };
    },
  };
  const updated = await snapshotOnUpdate(client, helperInput);
  assert.equal(updated.applied, true);
  assert.equal(updated.correctionResult.value, "reviewed");
  assert.deepEqual(await snapshot(id), { status: "reviewed", count: 3 });
  const helperReplay = await snapshotOnUpdate(client, {
    ...helperInput,
    review: () => ({ status: "reviewed" }),
  });
  assert.equal(helperReplay.correctionResult.replayed, true);
  assert.equal(
    helperReplay.correctionResult.observation_id,
    updated.correctionResult.observation_id
  );
  // A later read does not erase an explicitly supplied stale CAS token.
  await assert.rejects(() =>
    snapshotOnUpdate(client, {
      ...helperInput,
      idempotencyKey: randomUUID(),
      review: () => ({ status: "stale" }),
    })
  );
  assert.deepEqual(await snapshot(id), { status: "reviewed", count: 3 });
  const overwritten = await snapshotOnUpdate(client, {
    ...helperInput,
    idempotencyKey: randomUUID(),
    overwrite: true,
    review: () => ({ status: "explicit overwrite" }),
  });
  assert.equal(overwritten.applied, true);
  assert.deepEqual(await snapshot(id), { status: "explicit overwrite", count: 4 });
  const skip = await snapshotOnUpdate(client, {
    ...helperInput,
    corrections: {},
    review: () => false,
  });
  assert.equal(skip.applied, false);
  for (const changes of [{}, { status: "partial", note: "partial" }]) {
    await assert.rejects(
      () => snapshotOnUpdate(client, { ...helperInput, corrections: changes, review: undefined }),
      (error) =>
        error.body?.error_code === "ERR_CLIENT_CORRECTION_INPUT" &&
        error.body.details.hint.includes("exactly one")
    );
  }
  await assert.rejects(
    () =>
      snapshotOnUpdate(client, {
        ...helperInput,
        review: () => ({ status: "partial", note: "partial" }),
      }),
    (error) => error.body?.error_code === "ERR_CLIENT_CORRECTION_INPUT"
  );
  for (const invalid of [
    { idempotencyKey: "" },
    { entityType: "" },
    { idempotencyKey: 42 },
    { idempotencyKey: null },
    { entityType: 42 },
    { entityType: null },
  ]) {
    await assert.rejects(
      () => snapshotOnUpdate(client, { ...helperInput, ...invalid, review: undefined }),
      (error) => error.body?.error_code === "ERR_CLIENT_CORRECTION_INPUT"
    );
  }
  assert.deepEqual(await snapshot(id), { status: "explicit overwrite", count: 4 });

  // Existing natural CLI uses the same explicit test principal in both modes.
  for (const [index, cliMode] of ["offline", "api"].entries()) {
    const cliOutput = await exec(
      process.execPath,
      [
        resolve(root, "dist/cli/index.js"),
        "--env",
        "dev",
        "--json",
        ...(cliMode === "offline" ? ["--offline"] : ["--api-only", "--base-url", baseUrl]),
        "request",
        "--operation",
        "correct",
        "--body",
        JSON.stringify({
          ...input,
          value: `cli ${cliMode}`,
          idempotency_key: randomUUID(),
        }),
      ],
      { env: process.env, encoding: "utf8", timeout: 20_000 }
    );
    const cli = JSON.parse(cliOutput.stdout);
    assert.equal(cli.value, `cli ${cliMode}`);
    assert.deepEqual(await snapshot(id), { status: `cli ${cliMode}`, count: 5 + index });
  }
  console.log(
    "SDK_CORRECTION_RESULT=" + JSON.stringify({ mode, complete: true, observationCount: 6 })
  );
} finally {
  await client.dispose();
  server.close();
}
// Legacy runtime can retain timers. This is effect coverage, not natural disposal evidence.
process.exit(0);
