/**
 * neotoma#2070 — stdio does not answer `server/discover`.
 *
 * Under MCP 2026-07-28, `server/discover` is the backward-compatibility probe
 * on stdio: a modern client that gets Method-not-found (-32601) treats the
 * server as pre-2026-07-28 and falls back to `initialize`. Stdio
 * authenticates in `initialize`, so it must present as a 2025-11-25 server.
 * Answering the probe would tell a dual-era client to skip `initialize`.
 *
 * `server/discover` is registered only on stateless-path instances. This pins
 * that for stdio, so an SDK upgrade or a constructor change cannot flip it
 * silently. The server is driven over a real `StdioServerTransport` on
 * in-memory streams, the transport `run()` connects.
 */

import { PassThrough } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { NeotomaServer } from "../../src/server.js";

type JsonRpcReply = {
  id?: number | string | null;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
};

class StdioHarness {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  private buffer = "";
  private readonly waiters = new Map<number, (reply: JsonRpcReply) => void>();

  constructor() {
    this.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      let newline = this.buffer.indexOf("\n");
      while (newline !== -1) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (line) {
          const reply = JSON.parse(line) as JsonRpcReply;
          if (typeof reply.id === "number") this.waiters.get(reply.id)?.(reply);
        }
        newline = this.buffer.indexOf("\n");
      }
    });
  }

  request(id: number, method: string, params: Record<string, unknown> = {}): Promise<JsonRpcReply> {
    const reply = new Promise<JsonRpcReply>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no reply to ${method} within 5s`)), 5000);
      this.waiters.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
    this.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return reply;
  }
}

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
};

describe("stdio server/discover (#2070)", () => {
  let transport: StdioServerTransport | null = null;

  afterEach(async () => {
    await transport?.close();
    transport = null;
  });

  it("answers server/discover with -32601 so a modern client falls back to initialize", async () => {
    const harness = new StdioHarness();
    const server = new NeotomaServer();
    transport = new StdioServerTransport(harness.stdin, harness.stdout);
    await (
      server as unknown as { mcpServer: { server: { connect: (t: unknown) => Promise<void> } } }
    ).mcpServer.server.connect(transport);

    // The probe a dual-era client sends before anything else.
    const probe = await harness.request(1, "server/discover", { _meta: MODERN_META });
    expect(probe.result).toBeUndefined();
    expect(probe.error?.code).toBe(-32601);

    // Instrument check: the same transport does answer the fallback.
    const init = await harness.request(2, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "neotoma-2070-stdio-probe", version: "0.0.0" },
    });
    expect(init.error).toBeUndefined();
    expect(init.result?.protocolVersion).toBe("2025-11-25");

    // Still not answered once the legacy session is initialized.
    const again = await harness.request(3, "server/discover", { _meta: MODERN_META });
    expect(again.error?.code).toBe(-32601);
  });
});
