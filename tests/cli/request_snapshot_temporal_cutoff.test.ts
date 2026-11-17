/**
 * CLI coverage for the `retrieve_entity_snapshot` historical cutoff.
 *
 * `neotoma request --operation getEntitySnapshot --body '<json>'` is the CLI
 * route to the same operation as the MCP tool and `POST /get_entity_snapshot`
 * (the MCP and HTTP routes are driven in
 * tests/integration/temporal_natural_surface_acceptance.test.ts). `at` filters
 * `observed_at`, which `store` stamps with the server clock at write time, so
 * a fact written late about an earlier `measured_at` is absent at an `at`
 * before the write and present at a write-time checkpoint after it.
 * `measured_at` is an ordinary domain field. Synthetic data only; the CLI is
 * pinned to the suite's own isolated local server.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";
import { execFileLocal } from "../helpers/cli_local_target.js";

type Json = Record<string, unknown>;

const type = `cli_cutoff_reading_${Date.now().toString(36)}`;
let server: IsolatedServer;

async function cli(operation: string, body: Json): Promise<Json> {
  const result = await execFileLocal(
    process.execPath,
    [
      "dist/cli/index.js",
      "--no-log-file",
      "--json",
      "--base-url",
      server.baseUrl,
      "request",
      "--operation",
      operation,
      "--body",
      JSON.stringify(body),
    ],
    {
      timeout: 20_000,
      env: {
        ...process.env,
        NEOTOMA_BEARER_TOKEN: server.token,
        NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
      },
    }
  );
  return JSON.parse(result.stdout) as Json;
}

async function checkpoint(): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 15));
  const t = new Date().toISOString();
  await new Promise((resolve) => setTimeout(resolve, 15));
  return t;
}

const value = (snap: Json): unknown => (snap.snapshot as Json | undefined)?.value;

beforeAll(async () => {
  server = await startIsolatedNeotomaServer({ useTsx: false });
  const registered = await fetch(`${server.baseUrl}/register_schema`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: JSON.stringify({
      entity_type: type,
      schema_version: "1.0",
      activate: true,
      schema_definition: {
        fields: {
          reading_id: { type: "string", required: true },
          measured_at: { type: "string" },
          value: { type: "number" },
        },
        canonical_name_fields: ["reading_id"],
      },
      reducer_config: {
        merge_policies: {
          reading_id: { strategy: "last_write" },
          measured_at: { strategy: "last_write" },
          value: { strategy: "last_write" },
        },
      },
    }),
  });
  expect(registered.status).toBe(200);
}, 60_000);

afterAll(async () => {
  await server?.stop();
});

describe("CLI `request --operation getEntitySnapshot` cutoff semantics", () => {
  it(
    "excludes a late-written fact at an `at` before the write and returns it at the write-time checkpoint",
    async () => {
      const first = await cli("store", {
        idempotency_key: "cli-cutoff-first",
        entities: [
          { entity_type: type, reading_id: "r-001", measured_at: "2026-10-10", value: 120 },
        ],
      });
      expect(first.entities).toBeDefined();
      const beforeLateWrite = await checkpoint();

      // Late arrival: measured earlier (2026-10-01) than the first reading, written afterwards.
      const late = await cli("store", {
        idempotency_key: "cli-cutoff-late",
        entities: [
          { entity_type: type, reading_id: "r-002", measured_at: "2026-10-01", value: 110 },
        ],
      });
      const lateId = (late.entities as Json[])[0]!.entity_id as string;
      const afterLateWrite = await checkpoint();

      const excluded = await cli("getEntitySnapshot", {
        entity_id: lateId,
        at: beforeLateWrite,
      });
      expect(excluded.observation_count).toBe(0);
      expect(value(excluded)).toBeUndefined();

      const reconstructed = await cli("getEntitySnapshot", {
        entity_id: lateId,
        at: afterLateWrite,
      });
      expect(value(reconstructed)).toBe(110);
      // measured_at is an ordinary field, returned verbatim and not a cutoff axis.
      expect((reconstructed.snapshot as Json).measured_at).toBe("2026-10-01");
    },
    60_000
  );
});
