/**
 * `neotoma corrections create` on an array field replaces the array (#2341).
 *
 * The CLI parses `--corrected-value` as JSON, so a JSON array arrives as an
 * array. A later correction must set the field to exactly that array, and `[]`
 * must clear it. The CLI runs against an isolated server started from this
 * checkout (never a shared instance), and the stored snapshot is read back
 * from that server, because a correction that reports success has not
 * necessarily changed the snapshot.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";

const execFileAsync = promisify(execFile);
const type = "cli_array_correction_2341";
const wide = Array.from({ length: 34 }, (_, i) => `member_${String(i).padStart(2, "0")}`);
const narrow = wide.slice(0, 10);

let server: IsolatedServer;

async function post(path: string, body: unknown) {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  return response.json();
}

const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 5));

async function correct(entityId: string, value: unknown, idempotencyKey?: string) {
  // Corrections order by observed_at (millisecond precision); wait out the
  // millisecond so "the later call" is the later correction.
  await nextMillisecond();
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "dist/cli/index.js",
      "--no-log-file",
      "--json",
      "--base-url",
      server.baseUrl,
      "corrections",
      "create",
      "--entity-id",
      entityId,
      "--entity-type",
      type,
      "--field-name",
      "members",
      "--corrected-value",
      JSON.stringify(value),
      ...(idempotencyKey ? ["--idempotency-key", idempotencyKey] : []),
    ],
    {
      env: {
        ...process.env,
        NEOTOMA_BEARER_TOKEN: server.token,
        NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
      },
    }
  );
  return JSON.parse(stdout);
}

async function members(entityId: string): Promise<unknown[]> {
  const response = await fetch(`${server.baseUrl}/entities/${entityId}`, {
    headers: { authorization: `Bearer ${server.token}` },
  });
  expect(response.ok).toBe(true);
  const entity = await response.json();
  return (entity.snapshot ?? entity).members as unknown[];
}

async function seed(label: string, initial: string[]): Promise<string> {
  const stored = await post("/store", {
    idempotency_key: `cli-array-seed-${label}`,
    entities: [{ entity_type: type, label, members: initial }],
  });
  return stored.entities[0].entity_id as string;
}

beforeAll(async () => {
  server = await startIsolatedNeotomaServer();
  await post("/register_schema", {
    entity_type: type,
    schema_version: "1.0",
    activate: true,
    schema_definition: {
      fields: {
        label: { type: "string", required: true },
        members: { type: "array", required: false },
      },
      canonical_name_fields: ["label"],
    },
    reducer_config: {
      merge_policies: {
        label: { strategy: "last_write" },
        members: { strategy: "merge_array" },
      },
    },
  });
});

afterAll(async () => {
  await server?.stop();
});

describe("CLI corrections create on a merge_array field (#2341)", () => {
  it("a 10-member correction after a 34-member correction reads back as exactly 10", async () => {
    const entityId = await seed("shrink", wide);
    await correct(entityId, wide);
    expect(await members(entityId)).toHaveLength(34);

    await correct(entityId, narrow);

    const after = await members(entityId);
    expect(after).toHaveLength(10);
    expect([...after].sort()).toEqual([...narrow].sort());
  });

  it("an empty array clears the field", async () => {
    const entityId = await seed("clear", ["seed"]);
    await correct(entityId, ["a", "b"]);
    await correct(entityId, []);
    expect(await members(entityId)).toEqual([]);
  });

  it("an explicit idempotency key lets a caller restore an earlier list", async () => {
    // The default key is derived from entity, field and value, so repeating an
    // earlier value replays that earlier correction; a fresh key writes a new one.
    const entityId = await seed("restore", ["seed"]);
    await correct(entityId, ["a", "b"], "restore-1");
    await correct(entityId, ["c"], "restore-2");
    await correct(entityId, ["a", "b"], "restore-3");
    expect([...(await members(entityId))].sort()).toEqual(["a", "b"]);
  });
});
