/**
 * MCP prompts over the wire: the server declares the `prompts` capability in
 * `initialize` and answers `prompts/list` and `prompts/get` without needing an
 * authenticated identity (prompts are static text, like tool definitions).
 *
 * Driven over a real `StdioServerTransport` on in-memory streams, the same
 * transport `run()` connects.
 */

import { PassThrough } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { NeotomaServer } from "../../src/server.js";

type JsonRpcReply = {
  id?: number | string | null;
  result?: Record<string, any>;
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

describe("MCP prompts protocol", () => {
  let transport: StdioServerTransport | null = null;

  afterEach(async () => {
    await transport?.close();
    transport = null;
  });

  async function connect(): Promise<StdioHarness> {
    const harness = new StdioHarness();
    const server = new NeotomaServer();
    transport = new StdioServerTransport(harness.stdin, harness.stdout);
    await (
      server as unknown as { mcpServer: { server: { connect: (t: unknown) => Promise<void> } } }
    ).mcpServer.server.connect(transport);
    const init = await harness.request(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "neotoma-prompts-probe", version: "0.0.0" },
    });
    expect(init.error).toBeUndefined();
    expect(init.result?.capabilities?.prompts).toBeDefined();
    return harness;
  }

  it("answers prompts/list with titled prompts whose arguments are all optional", async () => {
    const harness = await connect();
    const list = await harness.request(2, "prompts/list");
    expect(list.error).toBeUndefined();
    const prompts = list.result?.prompts as Array<Record<string, any>>;
    expect(prompts.map((p) => p.name)).toEqual([
      "set-up-neotoma",
      "what-do-you-remember-about",
      "remember-this",
      "what-changed-recently",
      "check-neotoma",
    ]);
    for (const p of prompts) {
      expect(typeof p.title).toBe("string");
      expect(typeof p.description).toBe("string");
      for (const a of p.arguments ?? []) expect(a.required).toBe(false);
    }
  });

  it("answers prompts/get with and without arguments", async () => {
    const harness = await connect();

    const bare = await harness.request(3, "prompts/get", { name: "check-neotoma" });
    expect(bare.error).toBeUndefined();
    expect(bare.result?.messages?.[0]?.role).toBe("user");
    expect(bare.result?.messages?.[0]?.content?.text).toContain("Check my Neotoma connection");

    const withArg = await harness.request(4, "prompts/get", {
      name: "what-do-you-remember-about",
      arguments: { topic: "the garden project" },
    });
    expect(withArg.error).toBeUndefined();
    expect(withArg.result?.messages?.[0]?.content?.text).toContain("the garden project");
  });

  it("rejects an unknown prompt name with invalid params", async () => {
    const harness = await connect();
    const unknown = await harness.request(5, "prompts/get", { name: "no-such-prompt" });
    expect(unknown.result).toBeUndefined();
    expect(unknown.error?.code).toBe(-32602);
  });
});
