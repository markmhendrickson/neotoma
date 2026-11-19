/**
 * End-to-end check that a stored standing rule reaches the natural MCP
 * `initialize` response of a real server (#2187).
 *
 * Starts an isolated Neotoma server (child process, temporary data dir,
 * harness bearer token) through the eval harness, stores a synthetic
 * `standing_rule` under the authenticated user over HTTP, then sends a plain
 * MCP `initialize` over the streamable HTTP transport and reads the
 * `instructions` a client would show the model. The rule BODY must be there,
 * near the start, ahead of the base instructions block.
 *
 * No mocks: this is the path a real client takes.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";

const RULE_TITLE = "Synthetic isolated-server rule";
const RULE_TEXT = "Synthetic rule body: label every example record as synthetic before storing it.";

/** Bytes from the start of `instructions` within which the rule body must begin. */
const NEAR_START_BYTES = 4096;

type JsonRpcInit = {
  result?: { instructions?: string; serverInfo?: { _neotoma?: { standing_rules?: unknown[] } } };
  error?: { message?: string };
};

/** Read a JSON-RPC response from either a JSON body or an SSE stream. */
async function readRpc(res: Response): Promise<JsonRpcInit> {
  const text = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter((l) => l.length > 0);
    return JSON.parse(data[data.length - 1]) as JsonRpcInit;
  }
  return JSON.parse(text) as JsonRpcInit;
}

describe("isolated server: standing rule body in the natural MCP initialize response", () => {
  let server: IsolatedServer;

  beforeAll(async () => {
    server = await startIsolatedNeotomaServer({ useTsx: false });

    const store = await fetch(`${server.baseUrl}/store`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
      body: JSON.stringify({
        idempotency_key: "standing-rules-isolated-server-initialize-seed",
        entities: [
          {
            entity_type: "standing_rule",
            title: RULE_TITLE,
            rule_text: RULE_TEXT,
            enabled: true,
            priority: 100,
          },
        ],
      }),
    });
    expect(store.status, `store failed: ${await store.clone().text()}`).toBe(200);
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  it("delivers the rule body near the start of instructions", async () => {
    const res = await fetch(server.mcpUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${server.token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "standing-rules-isolated-server-test", version: "0.0.0" },
        },
      }),
    });
    const rpc = await readRpc(res);
    expect(rpc.error, `initialize failed: ${rpc.error?.message}`).toBeUndefined();

    const instructions = rpc.result?.instructions ?? "";
    expect(instructions.length, "initialize returned no instructions").toBeGreaterThan(0);

    const at = instructions.indexOf(RULE_TEXT);
    expect(at, "standing rule body is not in the instructions prose").toBeGreaterThanOrEqual(0);
    expect(
      Buffer.byteLength(instructions.slice(0, at), "utf8"),
      "rule body sits too far from the start, where clients truncate"
    ).toBeLessThan(NEAR_START_BYTES);
    expect(instructions.startsWith("[STANDING RULES]")).toBe(true);
  });
});
