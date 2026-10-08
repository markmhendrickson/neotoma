/**
 * The live `tools/list` response, served by the real Express app over HTTP,
 * carries every tool's title, annotations and effect class. The contract tests
 * check the definitions and the server card; this checks what a host actually
 * receives on the wire.
 *
 * Uses the stateless (2026-07-28) MCP request shape so no session handshake is
 * needed, and boots the app with no auth configured, the same pattern as
 * tests/integration/mcp_session_404_reconnect.test.ts.
 */

import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";

const MODERN_VERSION = "2026-07-28";

const ENV_KEYS = [
  "NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD",
  "NEOTOMA_BEARER_TOKEN",
  "NEOTOMA_DATA_DIR",
  "NEOTOMA_ENCRYPTION_ENABLED",
  "NEOTOMA_ENV",
  "NEOTOMA_HOST_URL",
  "NEOTOMA_HTTP_PORT",
  "NEOTOMA_KEY_FILE_PATH",
  "NEOTOMA_MNEMONIC",
  "NEOTOMA_MNEMONIC_PASSPHRASE",
] as const;

type ListedTool = {
  name: string;
  title?: string;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

function parseJsonRpc(contentType: string | null, text: string): Record<string, unknown> {
  if (contentType?.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .at(-1);
    return JSON.parse(data ?? "{}") as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

describe("live MCP tools/list metadata", () => {
  const originalEnv = new Map<string, string | undefined>(
    ENV_KEYS.map((key) => [key, process.env[key]])
  );
  let tmpRoot = "";
  let httpServer: ReturnType<typeof createServer> | null = null;
  let tools: ListedTool[] = [];

  beforeAll(async () => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-tools-list-metadata-"));
    process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
    process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
    process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
    process.env.NEOTOMA_ENV = "development";
    process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
    process.env.NEOTOMA_HTTP_PORT = "0";
    delete process.env.NEOTOMA_BEARER_TOKEN;
    delete process.env.NEOTOMA_KEY_FILE_PATH;
    delete process.env.NEOTOMA_MNEMONIC;
    delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;

    vi.resetModules();
    const { app } = await import("../../src/actions.js");
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer!.listen(0, "127.0.0.1", () => resolve());
      httpServer!.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const res = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MODERN_VERSION,
        "Mcp-Method": "tools/list",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": MODERN_VERSION,
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": {
              name: "neotoma-tools-list-metadata",
              version: "0.0.0",
            },
          },
        },
      }),
    });
    const text = await res.text();
    expect(res.status, text.slice(0, 500)).toBe(200);
    const body = parseJsonRpc(res.headers.get("content-type"), text);
    tools = ((body.result as { tools?: ListedTool[] } | undefined)?.tools ?? []) as ListedTool[];
  }, 60_000);

  afterAll(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
    for (const [key, value] of originalEnv.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  function listed(name: string): ListedTool {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`tools/list did not include ${name}`);
    return tool;
  }

  it("lists every registered tool with a title mirrored into annotations", () => {
    expect(tools.map((tool) => tool.name).sort()).toEqual([...NEOTOMA_TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.annotations?.title, tool.name).toBe(tool.title);
      expect(tool._meta?.["neotoma/effect_class"], tool.name).toMatch(/^(read|write|external)$/);
    }
  });

  it("carries the annotations a host uses for its permission screen", () => {
    expect(listed("retrieve_entities")).toMatchObject({
      title: "Search entities",
      annotations: { readOnlyHint: true, openWorldHint: false },
    });
    expect(listed("retrieve_entities").annotations).not.toHaveProperty("destructiveHint");
    expect(listed("delete_entity").annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(listed("publish_rendered_page").annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
    expect(listed("submit_entity").annotations).toMatchObject({
      destructiveHint: true,
      openWorldHint: true,
    });
  });
});
