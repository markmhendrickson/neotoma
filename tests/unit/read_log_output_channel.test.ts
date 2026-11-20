import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installHttpReadLogWriter, setReadLogWriter } from "../../src/services/read_log.js";
import { NeotomaServer } from "../../src/server.js";

// Runs in its own file so the read log module is in its default state: no
// writer installed, as in the stdio MCP process and in-process callers. Only
// the last test installs the HTTP server's writer.

const mixedResult = {
  entities: [
    { entity_id: "ent_task_0001", entity_type: "task" },
    { entity_id: "ent_task_0002", entity_type: "task" },
    { entity_id: "ent_issue_0001", entity_type: "issue" },
  ],
};
const okResult = async () => ({
  content: [{ type: "text", text: JSON.stringify(mixedResult) }],
});

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stdoutChunks: string[];
const readLines = () => stdoutChunks.filter((c) => c.includes('"event":"read"'));

beforeEach(() => {
  stdoutChunks = [];
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as never);
});
afterEach(() => {
  stdoutSpy.mockRestore();
});

function makeServer(): NeotomaServer {
  const server = new NeotomaServer();
  (server as any).authenticatedUserId = "user-0001";
  (server as any).executeTool = okResult;
  return server;
}

function toolsCall(server: NeotomaServer) {
  const handler = (server as any).mcpServer.server._requestHandlers.get("tools/call");
  return handler(
    { method: "tools/call", params: { name: "retrieve_entities", arguments: {} } },
    {
      signal: new AbortController().signal,
      requestId: 1,
      sendNotification: async () => {},
      sendRequest: async () => ({}),
    }
  );
}

describe("read log output channel", () => {
  it("writes nothing to stdout for a stdio-transport read call", async () => {
    await toolsCall(makeServer());
    expect(readLines()).toHaveLength(0);
  });

  it("writes nothing to stdout for an in-process read call", async () => {
    await makeServer().executeToolForCli("retrieve_entities", {}, "user-0003");
    expect(readLines()).toHaveLength(0);
  });

  it("writes the line to stdout once the HTTP server installs the writer", async () => {
    const previous = setReadLogWriter(null);
    try {
      installHttpReadLogWriter();
      await toolsCall(makeServer());
      expect(readLines()).toHaveLength(1);
      expect(JSON.parse(readLines()[0]!)).toMatchObject({ surface: "mcp", count: 3 });
    } finally {
      setReadLogWriter(previous);
    }
  });
});
