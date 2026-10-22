/**
 * CLI leg of the data_origin cross-surface contract (#2242).
 *
 * `neotoma store --data-origin '<json>'` (and a `data_origin` key in a `--file`
 * envelope) must persist the same `provenance.data_origin` shape the REST and
 * MCP surfaces persist (tests/integration/store_data_origin.test.ts), with an
 * entity's own `data_origin` overriding the request default. Asserts the
 * persisted effect by reading the observation rows back, not the CLI output.
 */

import { describe, expect, it, afterAll } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { db } from "../../src/db.js";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const ENTITY_TYPE = "store_data_origin_probe";

const SHEET_ORIGIN = {
  kind: "file",
  locator: "Atencion al cliente.xlsx",
  part: "sheet=Tickets;row=97",
  system: "local_fs",
  producer: "tools/derive_all.py@4a5409c",
  retrieved_at: "2026-08-27T09:00:00Z",
  notes: "identity columns aliased; other columns verbatim",
};
// Written in the schema's canonical key order (kind, locator, part, system,
// url, producer, retrieved_at, notes): every surface persists that order
// regardless of the caller's, so the byte comparison below is meaningful.
const EMAIL_ORIGIN = {
  kind: "email",
  locator: "msg-18c2f0a9d1",
  system: "gmail",
  url: "https://mail.google.com/mail/u/0/#all/18c2f0a9d1",
};

const createdEntityIds: string[] = [];

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function originOf(entityId: string): Promise<unknown> {
  const { data } = await db
    .from("observations")
    .select("provenance, fields")
    .eq("entity_id", entityId)
    .eq("user_id", TEST_USER_ID);
  expect(data?.length).toBe(1);
  const row = data![0] as { provenance: unknown; fields: unknown };
  const provenance =
    typeof row.provenance === "string" ? JSON.parse(row.provenance) : (row.provenance ?? {});
  const fields = typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields;
  expect((fields as Record<string, unknown>).data_origin).toBeUndefined();
  return (provenance as Record<string, unknown>).data_origin;
}

function entityIdsFrom(output: string): string[] {
  const parsed = JSON.parse(output) as Record<string, any>;
  const list = (parsed.structured?.entities ?? parsed.entities ?? []) as Array<{
    entity_id: string;
  }>;
  const ids = list.map((e) => e.entity_id);
  createdEntityIds.push(...ids);
  return ids;
}

describe("CLI store --data-origin (#2242)", () => {
  afterAll(async () => {
    if (createdEntityIds.length === 0) return;
    await db.from("observations").delete().in("entity_id", createdEntityIds);
    await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
    await db.from("entities").delete().in("id", createdEntityIds);
  });

  it("--data-origin applies to every entity; an entity's own data_origin overrides it", async () => {
    const marker = randomUUID();
    const entities = [
      { entity_type: ENTITY_TYPE, title: `cli default ${marker}`, content: "row" },
      {
        entity_type: ENTITY_TYPE,
        title: `cli override ${marker}`,
        content: "mail",
        data_origin: EMAIL_ORIGIN,
      },
    ];
    const { stdout } = await execAsync(
      `${CLI_PATH} store --entities ${shellQuote(JSON.stringify(entities))} ` +
        `--data-origin ${shellQuote(JSON.stringify(SHEET_ORIGIN))} ` +
        `--idempotency-key cli-origin-${marker} --user-id "${TEST_USER_ID}" --json`
    );
    const [defaultId, overrideId] = entityIdsFrom(stdout);
    // Byte-identical to the shape REST and MCP persist for the same input.
    expect(JSON.stringify(await originOf(defaultId!))).toBe(JSON.stringify(SHEET_ORIGIN));
    expect(JSON.stringify(await originOf(overrideId!))).toBe(JSON.stringify(EMAIL_ORIGIN));
  });

  it("reads data_origin from a --file envelope", async () => {
    const marker = randomUUID();
    const dir = await mkdtemp(path.join(tmpdir(), "neotoma-cli-origin-"));
    const file = path.join(dir, "envelope.json");
    await writeFile(
      file,
      JSON.stringify({
        idempotency_key: `cli-origin-file-${marker}`,
        data_origin: SHEET_ORIGIN,
        entities: [{ entity_type: ENTITY_TYPE, title: `cli file ${marker}`, content: "row" }],
      })
    );
    const { stdout } = await execAsync(
      `${CLI_PATH} store --file "${file}" --user-id "${TEST_USER_ID}" --json`
    );
    const [entityId] = entityIdsFrom(stdout);
    expect(await originOf(entityId!)).toEqual(SHEET_ORIGIN);
  });

  it("omitting --data-origin writes no origin", async () => {
    const marker = randomUUID();
    const entities = [{ entity_type: ENTITY_TYPE, title: `cli none ${marker}`, content: "x" }];
    const { stdout } = await execAsync(
      `${CLI_PATH} store --entities ${shellQuote(JSON.stringify(entities))} ` +
        `--idempotency-key cli-origin-none-${marker} --user-id "${TEST_USER_ID}" --json`
    );
    const [entityId] = entityIdsFrom(stdout);
    expect(await originOf(entityId!)).toBeUndefined();
  });

  it("rejects a non-object --data-origin before sending anything", async () => {
    const entities = [{ entity_type: ENTITY_TYPE, title: `cli bad ${randomUUID()}` }];
    await expect(
      execAsync(
        `${CLI_PATH} store --entities ${shellQuote(JSON.stringify(entities))} ` +
          `--data-origin not-json --user-id "${TEST_USER_ID}" --json`
      )
    ).rejects.toThrow(/--data-origin/);
  });
});
