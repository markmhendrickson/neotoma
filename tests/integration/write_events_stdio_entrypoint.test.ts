/**
 * Effect test: a client connected over stdio leaves a write-event record
 * (docs/subsystems/write_events.md).
 *
 * Spawns the real MCP stdio entrypoint (`dist/index.js`, built by pretest) as
 * a child process against a throwaway data directory, drives it with the MCP
 * SDK's stdio client, and then reads the child's SQLite file directly. No
 * listener is registered by the test: the only thing that can persist the
 * event is the entrypoint's own wiring, so removing `installSubscriptionBridge()`
 * from `src/index.ts` turns this red (the durable log stays empty).
 */

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRYPOINT = path.join(REPO_ROOT, "dist", "index.js");
const TURN = `stdio-${Date.now()}:t1`;

/** Child environment: inherit PATH etc., but pin every storage location to the tmp dir. */
function childEnv(dataDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v !== "string") continue;
    // Never let the child resolve a real data dir, DB URL, or credential.
    if (
      /^NEOTOMA_(DATA_DIR|SQLITE_PATH|DB_URL|DB_AUTH_TOKEN|BEARER_TOKEN|MNEMONIC|KEY_FILE_PATH)/.test(
        k
      )
    ) {
      continue;
    }
    out[k] = v;
  }
  return {
    ...out,
    NEOTOMA_DATA_DIR: dataDir,
    NEOTOMA_SQLITE_PATH: path.join(dataDir, "neotoma.db"),
    NEOTOMA_ENV: "development",
    NEOTOMA_ENCRYPTION_ENABLED: "false",
    NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
  };
}

describe("write events from the MCP stdio entrypoint", () => {
  let dataDir: string;
  let client: Client;

  beforeAll(async () => {
    if (!existsSync(ENTRYPOINT)) {
      throw new Error(`${ENTRYPOINT} missing: run npm run build:server first`);
    }
    dataDir = mkdtempSync(path.join(tmpdir(), "neotoma-stdio-write-events-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [ENTRYPOINT],
      cwd: REPO_ROOT,
      env: childEnv(dataDir),
      stderr: "ignore",
    });
    client = new Client({ name: "write-events-stdio-probe", version: "0.0.0" });
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("a store over stdio persists a created write event carrying the _meta turn", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "store",
          arguments: {
            entities: [{ entity_type: "note", title: `stdio write ${TURN}` }],
            idempotency_key: `stdio-${TURN}`,
          },
          _meta: { "io.neotoma/turn_key": TURN },
        },
      },
      CallToolResultSchema
    );
    const text = (result.content as Array<{ type: string; text?: string }>).find(
      (c) => c.type === "text"
    )?.text;
    const entityId = (JSON.parse(text ?? "{}") as { entities?: Array<{ entity_id: string }> })
      .entities?.[0]?.entity_id;
    expect(entityId, text).toBeTruthy();

    // Persistence runs off the event bus in the child; poll its database.
    const dbPath = path.join(dataDir, "neotoma.db");
    let payloads: string[] = [];
    for (let i = 0; i < 100; i++) {
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        payloads = (
          db
            .prepare("SELECT payload FROM substrate_events WHERE entity_id = ?")
            .all(entityId) as Array<{ payload: string }>
        ).map((r) => r.payload);
      } finally {
        db.close();
      }
      if (payloads.some((p) => p.includes('"entity.created"'))) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const created = payloads
      .map((p) => JSON.parse(p) as Record<string, any>)
      .find((e) => e.event_type === "entity.created");
    expect(created, `durable rows for ${entityId}: ${payloads.length}`).toBeDefined();
    expect(created!.write_context.operation).toBe("created");
    expect(created!.write_context.turn_key).toBe(TURN);
    expect(created!.write_context.turn_source).toBe("mcp_meta");
  }, 60_000);
});
