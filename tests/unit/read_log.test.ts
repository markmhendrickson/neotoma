import type { AddressInfo } from "node:net";

import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AgentCapabilityError } from "../../src/services/agent_capabilities.js";
import { jsonAccessLog, setRequestAuthMethod } from "../../src/services/access_log.js";
import {
  READ_LOG_ENTITY_ID_CAP,
  buildReadLogRecord,
  READ_TOOL_NAMES,
  collectReturnedEntities,
  matchRestReadRoute,
  readLogEnabled,
  readRoutePattern,
  recordReadLogResult,
  restReadLog,
  restReadLogPlainBody,
  setReadLogWriter,
  walkReturnedEntities,
} from "../../src/services/read_log.js";
import { encryptResponseMiddleware } from "../../src/middleware/encrypt_response.js";
import { generateX25519KeyPair } from "../../src/crypto/keys.js";
import { OPENAPI_OPERATION_MAPPINGS } from "../../src/shared/contract_mappings.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import { NeotomaServer } from "../../src/server.js";

type Server = ReturnType<express.Express["listen"]>;
const servers: Server[] = [];

// Synthetic content that must never appear in a read line.
const SECRET_TITLE = "SYNTHETIC-CONTENT-title-9f3a";
const SECRET_NOTE = "SYNTHETIC-CONTENT-note-77c1";
const SECRET_SEARCH = "SYNTHETIC-SEARCH-term-41aa";

const mixedResult = {
  entities: [
    {
      entity_id: "ent_task_0001",
      entity_type: "task",
      canonical_name: SECRET_TITLE,
      snapshot: { title: SECRET_TITLE, notes: SECRET_NOTE, owner_id: "ent_ref_inside_snapshot" },
    },
    { entity_id: "ent_task_0002", entity_type: "task", snapshot: { title: SECRET_TITLE } },
    { entity_id: "ent_issue_0001", entity_type: "issue", snapshot: { body: SECRET_NOTE } },
  ],
  total: 3,
};

function manyTasks(n: number) {
  return {
    entities: Array.from({ length: n }, (_, i) => ({
      entity_id: `ent_task_${String(i).padStart(4, "0")}`,
      entity_type: "task",
      snapshot: { title: SECRET_TITLE },
    })),
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});

function expectNoContent(line: string) {
  expect(line).not.toContain(SECRET_TITLE);
  expect(line).not.toContain(SECRET_NOTE);
  expect(line).not.toContain(SECRET_SEARCH);
  expect(line).not.toContain("ent_ref_inside_snapshot");
  expect(line).not.toContain("snapshot");
}

/** Access log, then the read log, then a stand-in auth middleware, as in src/actions.ts. */
async function startApp() {
  const lines: string[] = [];
  const app = express();
  app.use(express.json());
  app.use(
    jsonAccessLog({ addresses: () => ({ client_ip: null, peer_ip: null }), write: () => {} })
  );
  app.use(restReadLog({ write: (line) => lines.push(line) }));
  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (auth === "Bearer tok-SYNTHETIC-signed") {
      setRequestAuthMethod(req, "aauth");
      (req as express.Request & { authenticatedUserId?: string }).authenticatedUserId = "user-0001";
      (req as express.Request & { aauthAdmission?: unknown }).aauthAdmission = {
        admitted: true,
        agent_label: "synthetic-agent",
      };
    } else if (auth === "Bearer tok-SYNTHETIC-plain") {
      setRequestAuthMethod(req, "bearer_env");
      (req as express.Request & { authenticatedUserId?: string }).authenticatedUserId = "user-0002";
    } else {
      res.status(401).json({ error_code: "AUTH_REQUIRED", message: "Authentication required" });
      return;
    }
    next();
  });
  app.post("/entities/query", (req, res) => {
    const limit = (req.body as { limit?: number }).limit;
    res.json(limit === 60 ? manyTasks(60) : mixedResult);
  });
  app.post("/store", (_req, res) => res.status(201).json({ ok: true }));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const waitForLines = async (n = 1) => {
    for (let i = 0; i < 50 && lines.length < n; i++) await new Promise((r) => setTimeout(r, 10));
    return lines;
  };
  return { base, lines, waitForLines };
}

describe("read log record", () => {
  it("is on unless NEOTOMA_ACCESS_LOG is off", () => {
    expect(readLogEnabled(undefined)).toBe(true);
    expect(readLogEnabled("json")).toBe(true);
    expect(readLogEnabled("dev")).toBe(true);
    expect(readLogEnabled(" OFF ")).toBe(false);
  });

  it("does not count ids referenced from inside an entity", () => {
    const entities = collectReturnedEntities(mixedResult);
    expect(entities.map((e) => e.id)).toEqual(["ent_task_0001", "ent_task_0002", "ent_issue_0001"]);
  });

  it("caps entity_ids at 50 and marks truncation", () => {
    const record = buildReadLogRecord({
      surface: "rest",
      operation: "queryEntities",
      requestId: "req-1",
      userId: "user-0001",
      agent: null,
      authMethod: "bearer_env",
      status: "ok",
      result: manyTasks(60),
    });
    expect(record.count).toBe(60);
    expect(record.entity_ids).toHaveLength(READ_LOG_ENTITY_ID_CAP);
    expect(record.truncated).toBe(true);
    expect(record.entity_types).toEqual({ task: 60 });
  });
});

describe("REST read log", () => {
  it("writes exactly one line for a mixed-type read from a signed agent, with no content", async () => {
    const { base, waitForLines } = await startApp();
    const res = await fetch(`${base}/entities/query`, {
      method: "POST",
      headers: { authorization: "Bearer tok-SYNTHETIC-signed", "content-type": "application/json" },
      body: JSON.stringify({ search: SECRET_SEARCH }),
    });
    expect(res.status).toBe(200);
    const lines = await waitForLines();
    await new Promise((r) => setTimeout(r, 30));
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!);
    expect(record).toMatchObject({
      event: "read",
      request_id: res.headers.get("x-request-id"),
      user_id: "user-0001",
      surface: "rest",
      operation: "queryEntities",
      agent: "synthetic-agent",
      auth_method: "aauth",
      status: "ok",
      http_status: 200,
      entity_types: { task: 2, issue: 1 },
      count: 3,
      entity_ids: ["ent_task_0001", "ent_task_0002", "ent_issue_0001"],
      truncated: false,
      query_length: SECRET_SEARCH.length,
    });
    expect(typeof record.ts).toBe("string");
    expectNoContent(lines[0]!);
  });

  it("reports a plain bearer caller with agent null and applies the 50-id cap", async () => {
    const { base, waitForLines } = await startApp();
    await fetch(`${base}/entities/query`, {
      method: "POST",
      headers: { authorization: "Bearer tok-SYNTHETIC-plain", "content-type": "application/json" },
      body: JSON.stringify({ limit: 60 }),
    });
    const record = JSON.parse((await waitForLines())[0]!);
    expect(record.agent).toBeNull();
    expect(record.auth_method).toBe("bearer_env");
    expect(record.count).toBe(60);
    expect(record.entity_ids).toHaveLength(50);
    expect(record.truncated).toBe(true);
    expect(record.query_length).toBeNull();
  });

  it("writes a line for a refused read with count 0", async () => {
    const { base, waitForLines } = await startApp();
    const res = await fetch(`${base}/entities/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
    const record = JSON.parse((await waitForLines())[0]!);
    expect(record).toMatchObject({
      status: "refused",
      http_status: 401,
      count: 0,
      entity_types: {},
      entity_ids: [],
      user_id: null,
      agent: null,
      auth_method: "none",
    });
  });

  it("logs a read whose path differs only in letter case or a trailing slash", async () => {
    const { base, waitForLines } = await startApp();
    for (const path of ["/ENTITIES/Query", "/entities/query/"]) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          authorization: "Bearer tok-SYNTHETIC-plain",
          "content-type": "application/json",
        },
        body: "{}",
      });
      expect(res.status).toBe(200);
    }
    const lines = await waitForLines(2);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(JSON.parse(line)).toMatchObject({ operation: "queryEntities", count: 3 });
    }
  });

  it("logs GET /agents/{key}/records with the types of the activity rows it returned", async () => {
    const lines: string[] = [];
    const app = express();
    app.use(restReadLog({ write: (line) => lines.push(line) }));
    app.get("/agents/:key/records", (_req, res) =>
      res.json({
        items: [
          {
            record_type: "observation",
            id: "obs_0001",
            title: SECRET_TITLE,
            entity_id: "ent_task_0001",
            entity_type: "task",
          },
          {
            record_type: "observation",
            id: "obs_0002",
            title: SECRET_TITLE,
            entity_id: "ent_issue_0001",
            entity_type: "issue",
          },
        ],
      })
    );
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    await fetch(`http://127.0.0.1:${port}/agents/thumb%3Asynthetic/records`);
    for (let i = 0; i < 50 && lines.length < 1; i++) await new Promise((r) => setTimeout(r, 10));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      operation: "getAgentRecords",
      entity_types: { task: 1, issue: 1 },
      count: 2,
    });
    expectNoContent(lines[0]!);
  });

  it("writes nothing for a non-read route", async () => {
    const { base, lines } = await startApp();
    await fetch(`${base}/store`, {
      method: "POST",
      headers: { authorization: "Bearer tok-SYNTHETIC-plain", "content-type": "application/json" },
      body: "{}",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(lines).toHaveLength(0);
  });
});

describe("MCP read log", () => {
  let lines: string[];
  let previous: ((line: string) => void) | null;
  const savedEnv = process.env.NEOTOMA_ACCESS_LOG;

  beforeEach(() => {
    lines = [];
    previous = setReadLogWriter((line) => lines.push(line));
  });
  afterEach(() => {
    setReadLogWriter(previous);
    if (savedEnv === undefined) delete process.env.NEOTOMA_ACCESS_LOG;
    else process.env.NEOTOMA_ACCESS_LOG = savedEnv;
  });

  function makeServer(
    executeTool: (
      name: string,
      args: unknown,
      original: (name: string, args: unknown) => Promise<unknown>
    ) => Promise<unknown>
  ) {
    const server = new NeotomaServer();
    const s = server as any;
    s.authenticatedUserId = "user-0001";
    const original = s.executeTool.bind(server);
    s.executeTool = (name: string, args: unknown) => executeTool(name, args, original);
    const handler = s.mcpServer.server._requestHandlers.get("tools/call");
    const call = (name: string, args: unknown, admission: unknown) =>
      runWithRequestContext(
        {
          agentIdentity: null,
          aauthAdmission: admission as never,
          requestId: "req-synthetic-0001",
          authMethod: "aauth",
        },
        () =>
          handler(
            { method: "tools/call", params: { name, arguments: args } },
            {
              signal: new AbortController().signal,
              requestId: 1,
              sendNotification: async () => {},
              sendRequest: async () => ({}),
            }
          )
      );
    return call;
  }

  const okResult = async () => ({
    content: [{ type: "text", text: JSON.stringify(mixedResult) }],
  });

  it("writes exactly one line for a mixed-type read from a signed agent, with no content", async () => {
    const call = makeServer(okResult);
    await call(
      "retrieve_entities",
      { search: SECRET_SEARCH },
      { admitted: true, agent_label: "synthetic-agent" }
    );
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!);
    expect(record).toMatchObject({
      event: "read",
      request_id: "req-synthetic-0001",
      user_id: "user-0001",
      surface: "mcp",
      operation: "retrieve_entities",
      agent: "synthetic-agent",
      auth_method: "aauth",
      status: "ok",
      http_status: null,
      entity_types: { task: 2, issue: 1 },
      count: 3,
      entity_ids: ["ent_task_0001", "ent_task_0002", "ent_issue_0001"],
      truncated: false,
      query_length: SECRET_SEARCH.length,
    });
    expectNoContent(lines[0]!);
  });

  it("reports agent null for a caller with no admitted agent", async () => {
    const call = makeServer(okResult);
    await call("retrieve_entity_snapshot", { entity_id: "ent_task_0001" }, null);
    const record = JSON.parse(lines[0]!);
    expect(record.agent).toBeNull();
    expect(record.surface).toBe("mcp");
  });

  it("writes a refused line with count 0 when the read is refused", async () => {
    const call = makeServer(async () => {
      throw new AgentCapabilityError({
        op: "retrieve" as never,
        entityType: "task",
        agentLabel: "synthetic-agent",
        hint: "synthetic",
      });
    });
    await expect(
      call("retrieve_entities", {}, { admitted: true, agent_label: "synthetic-agent" })
    ).rejects.toBeDefined();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      status: "refused",
      count: 0,
      entity_types: {},
      entity_ids: [],
    });
  });

  it("writes nothing for a non-read tool or when NEOTOMA_ACCESS_LOG is off", async () => {
    const call = makeServer(async () => ({ content: [{ type: "text", text: "{}" }] }));
    await call("list_entity_types", {}, null);
    process.env.NEOTOMA_ACCESS_LOG = "off";
    await call("retrieve_entities", {}, null);
    expect(lines).toHaveLength(0);
  });

  function readResource(server: NeotomaServer, uri: string, admission: unknown = null) {
    const handler = (server as any).mcpServer.server._requestHandlers.get("resources/read");
    return runWithRequestContext(
      {
        agentIdentity: null,
        aauthAdmission: admission as never,
        requestId: "req-synthetic-0002",
        authMethod: "aauth",
      },
      () =>
        handler(
          { method: "resources/read", params: { uri } },
          {
            signal: new AbortController().signal,
            requestId: 2,
            sendNotification: async () => {},
            sendRequest: async () => ({}),
          }
        )
    );
  }

  it("writes one line for an entity resources/read, with types and count and no content", async () => {
    const server = new NeotomaServer();
    (server as any).authenticatedUserId = "user-0001";
    (server as any).handleEntityCollectionAll = async () => mixedResult;
    const res = await readResource(server, "neotoma://entities", {
      admitted: true,
      agent_label: "synthetic-agent",
    });
    expect(JSON.parse(res.contents[0].text)).toEqual(mixedResult);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      request_id: "req-synthetic-0002",
      user_id: "user-0001",
      surface: "mcp",
      operation: "resources/read:entity_collection_all",
      agent: "synthetic-agent",
      status: "ok",
      entity_types: { task: 2, issue: 1 },
      count: 3,
      entity_ids: ["ent_task_0001", "ent_task_0002", "ent_issue_0001"],
    });
    expectNoContent(lines[0]!);
  });

  it("writes an error line for a failed entity resources/read", async () => {
    const server = new NeotomaServer();
    (server as any).handleIndividualEntity = async () => {
      throw new Error("synthetic failure");
    };
    await expect(readResource(server, "neotoma://entity/ent_task_0001")).rejects.toBeDefined();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      operation: "resources/read:entity",
      status: "error",
      count: 0,
    });
  });

  it("writes nothing for an excluded resource kind", async () => {
    const server = new NeotomaServer();
    (server as any).handleEntityTypes = async () => ({ entity_types: [] });
    await readResource(server, "neotoma://entity_types");
    expect(lines).toHaveLength(0);
  });

  it("writes no read line through executeToolForCli", async () => {
    const server = new NeotomaServer();
    (server as any).executeTool = okResult;
    await server.executeToolForCli("retrieve_entities", {}, "user-0003");
    expect(lines).toHaveLength(0);
  });
});

describe("read log for the submission and issue status helpers", () => {
  let lines: string[];
  let previous: ((line: string) => void) | null;

  beforeEach(() => {
    lines = [];
    previous = setReadLogWriter((line) => lines.push(line));
  });
  afterEach(() => {
    setReadLogWriter(previous);
  });

  const snapshotPayload = {
    entity_id: "ent_issue_0001",
    entity_type: "issue",
    snapshot: { title: SECRET_TITLE, body: SECRET_NOTE, owner_id: "ent_ref_inside_snapshot" },
  };
  const issueStatusPayload = {
    issue_entity_id: "ent_issue_0002",
    issue_number: 7,
    title: SECRET_TITLE,
    status: "open",
    labels: [],
    github_url: "https://example.invalid/issues/7",
    author: "synthetic-author",
    created_at: "2026-01-02T03:04:05.000Z",
    closed_at: null,
    messages: [
      { author: "synthetic-author", body: SECRET_NOTE, created_at: "2026-01-02T03:04:05.000Z" },
    ],
    synced: false,
  };
  const asText = (payload: unknown) => ({
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });

  function mcpCall(
    executeTool: (
      name: string,
      args: unknown,
      original: (name: string, args: unknown) => Promise<unknown>
    ) => Promise<unknown>
  ) {
    const server = new NeotomaServer();
    const s = server as any;
    s.authenticatedUserId = "user-0001";
    const original = s.executeTool.bind(server);
    s.executeTool = (name: string, args: unknown) => executeTool(name, args, original);
    const handler = s.mcpServer.server._requestHandlers.get("tools/call");
    return (name: string, args: unknown) =>
      runWithRequestContext(
        {
          agentIdentity: null,
          aauthAdmission: null,
          requestId: "req-synthetic-0002",
          authMethod: "bearer_env",
        },
        () =>
          handler(
            { method: "tools/call", params: { name, arguments: args } },
            {
              signal: new AbortController().signal,
              requestId: 1,
              sendNotification: async () => {},
              sendRequest: async () => ({}),
            }
          )
      );
  }

  it("MCP get_entity_submission_status writes one line for the snapshot it returns", async () => {
    const nested: string[] = [];
    // The real handler runs; only the nested snapshot read is stubbed.
    const call = mcpCall(async (name, args, original) => {
      if (name === "retrieve_entity_snapshot") {
        nested.push(name);
        return asText(snapshotPayload);
      }
      return original(name, args);
    });
    await call("get_entity_submission_status", { entity_id: "ent_issue_0001" });
    expect(nested).toEqual(["retrieve_entity_snapshot"]);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      surface: "mcp",
      operation: "get_entity_submission_status",
      status: "ok",
      entity_types: { issue: 1 },
      count: 1,
      entity_ids: ["ent_issue_0001"],
    });
    expectNoContent(lines[0]!);
  });

  it("MCP list_entity_submissions writes one line with the types and count of the page", async () => {
    const call = mcpCall(async (name, args, original) => {
      if (name === "retrieve_entities") return asText(mixedResult);
      return original(name, args);
    });
    await call("list_entity_submissions", { entity_type: "task", limit: 10 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      surface: "mcp",
      operation: "list_entity_submissions",
      status: "ok",
      entity_types: { task: 2, issue: 1 },
      count: 3,
    });
    expectNoContent(lines[0]!);
  });

  it("MCP get_issue_status writes one line naming the issue, without its messages", async () => {
    const call = mcpCall(async (name, args, original) =>
      name === "get_issue_status" ? asText(issueStatusPayload) : original(name, args)
    );
    await call("get_issue_status", { issue_number: 7 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      surface: "mcp",
      operation: "get_issue_status",
      status: "ok",
      entity_types: { issue: 1 },
      count: 1,
      entity_ids: ["ent_issue_0002"],
    });
    expectNoContent(lines[0]!);
  });

  async function startHelperApp() {
    const restLines: string[] = [];
    const app = express();
    app.use(express.json());
    app.use(restReadLog({ write: (line) => restLines.push(line) }));
    app.get("/submit/:entity_type/:entity_id", (_req, res) => res.json(snapshotPayload));
    app.post("/issues/status", (_req, res) => res.json(issueStatusPayload));
    app.post("/api/issues/status", (_req, res) => res.json(issueStatusPayload));
    // The entity renderings reply with text, as in src/actions.ts, and name
    // the returned entity through recordReadLogResult.
    app.get("/entities/:id/markdown", (req, res) => {
      recordReadLogResult(res, { entity_id: req.params.id, entity_type: "task" });
      res.type("text/markdown").send(`# ${SECRET_TITLE}\n\n${SECRET_NOTE}\n`);
    });
    app.get("/entities/:id/html", (req, res) => {
      recordReadLogResult(res, { entity_id: req.params.id, entity_type: "rendered_page" });
      res.type("text/html").send(`<h1>${SECRET_TITLE}</h1>`);
    });
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const waitForLines = async () => {
      for (let i = 0; i < 50 && restLines.length < 1; i++)
        await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 30));
      return restLines;
    };
    return { base, waitForLines };
  }

  it("REST GET /submit/{entity_type}/{entity_id} writes one line for the snapshot it returns", async () => {
    const { base, waitForLines } = await startHelperApp();
    const res = await fetch(`${base}/submit/issue/ent_issue_0001`);
    expect(res.status).toBe(200);
    const restLines = await waitForLines();
    expect(restLines).toHaveLength(1);
    expect(JSON.parse(restLines[0]!)).toMatchObject({
      surface: "rest",
      operation: "getEntitySubmissionStatus",
      status: "ok",
      http_status: 200,
      entity_types: { issue: 1 },
      count: 1,
      entity_ids: ["ent_issue_0001"],
    });
    expectNoContent(restLines[0]!);
  });

  it("REST POST /issues/status writes one line naming the issue", async () => {
    const { base, waitForLines } = await startHelperApp();
    await fetch(`${base}/issues/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issue_number: 7 }),
    });
    const restLines = await waitForLines();
    expect(restLines).toHaveLength(1);
    expect(JSON.parse(restLines[0]!)).toMatchObject({
      operation: "issuesGetStatus",
      entity_types: { issue: 1 },
      entity_ids: ["ent_issue_0002"],
    });
    expectNoContent(restLines[0]!);
  });
  it("REST POST /api/issues/status (the alias) writes one line naming the issue", async () => {
    const { base, waitForLines } = await startHelperApp();
    await fetch(`${base}/api/issues/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issue_number: 7 }),
    });
    const restLines = await waitForLines();
    expect(restLines).toHaveLength(1);
    expect(JSON.parse(restLines[0]!)).toMatchObject({
      surface: "rest",
      operation: "issuesGetStatus",
      status: "ok",
      entity_types: { issue: 1 },
      count: 1,
      entity_ids: ["ent_issue_0002"],
    });
    expectNoContent(restLines[0]!);
  });

  it("REST GET /entities/{id}/markdown writes one line naming the rendered entity", async () => {
    const { base, waitForLines } = await startHelperApp();
    const res = await fetch(`${base}/entities/ent_task_0001/markdown`);
    expect(await res.text()).toContain(SECRET_TITLE);
    const restLines = await waitForLines();
    expect(restLines).toHaveLength(1);
    expect(JSON.parse(restLines[0]!)).toMatchObject({
      surface: "rest",
      operation: "getEntityMarkdown",
      status: "ok",
      http_status: 200,
      entity_types: { task: 1 },
      count: 1,
      entity_ids: ["ent_task_0001"],
      truncated: false,
    });
    expectNoContent(restLines[0]!);
  });

  it("REST GET /entities/{id}/html writes one line naming the rendered entity", async () => {
    const { base, waitForLines } = await startHelperApp();
    const res = await fetch(`${base}/entities/ent_page_0001/html`);
    expect(await res.text()).toContain(SECRET_TITLE);
    const restLines = await waitForLines();
    expect(restLines).toHaveLength(1);
    expect(JSON.parse(restLines[0]!)).toMatchObject({
      surface: "rest",
      operation: "getEntityHtml",
      status: "ok",
      entity_types: { rendered_page: 1 },
      count: 1,
      entity_ids: ["ent_page_0001"],
    });
    expectNoContent(restLines[0]!);
  });
});

describe("result walker limits", () => {
  function relationshipRow(i: number) {
    return {
      id: `rel_${i}`,
      relationship_type: "REFERS_TO",
      source_entity_id: "ent_root_0001",
      target_entity_id: `ent_target_${i % 2}`,
      snapshot: { note: SECRET_NOTE },
      computed_at: "2026-01-01T00:00:00.000Z",
      observation_count: 1,
      provenance: { a: 1, b: 2, c: 3 },
      last_observation_at: "2026-01-01T00:00:00.000Z",
    };
  }

  it("records the related entities of a 2,000-relationship neighbourhood", () => {
    // Shape and key order of retrieveGraphNeighborhood in src/server.ts:
    // relationships are set on the result before related_entities.
    const neighbourhood = {
      node_id: "ent_root_0001",
      node_type: "entity",
      entity: { id: "ent_root_0001", entity_type: "task", canonical_name: SECRET_TITLE },
      relationships: Array.from({ length: 2000 }, (_, i) => relationshipRow(i)),
      related_entities: [
        { id: "ent_target_0", entity_type: "contact" },
        { id: "ent_target_1", entity_type: "issue" },
      ],
    };
    const ids = collectReturnedEntities(neighbourhood).map((e) => e.id);
    expect(ids).toEqual(["ent_root_0001", "ent_target_0", "ent_target_1"]);
  });

  it("marks the line truncated when the walk reaches its node cap", () => {
    expect(walkReturnedEntities(manyTasks(5), { maxNodes: 3 }).incomplete).toBe(true);
    expect(walkReturnedEntities(manyTasks(5)).incomplete).toBe(false);
    const record = buildReadLogRecord({
      surface: "rest",
      operation: "queryEntities",
      requestId: null,
      userId: null,
      agent: null,
      authMethod: "none",
      status: "ok",
      // Nested past the depth cap: the walk cannot see the entity at the bottom.
      result: { a: { b: { c: { d: { e: { f: { g: { h: { i: [manyTasks(1)] } } } } } } } } },
    });
    expect(record.count).toBe(0);
    expect(record.truncated).toBe(true);
  });

  it("adds no id for an entity-shaped object stored inside a snapshot, metadata or fields", () => {
    const stored = { entity_id: "ent_stored_0001", entity_type: "task" };
    const result = {
      items: [
        { id: "row_1", snapshot: { nested: stored } },
        { id: "row_2", metadata: { copy: stored } },
        { id: "row_3", fields: { copy: [stored] } },
      ],
    };
    expect(collectReturnedEntities(result)).toEqual([]);
  });

  it("counts only ids in the ent_ form", () => {
    expect(
      collectReturnedEntities([
        { entity_id: "row_7", entity_type: "task" },
        { entity_id: "ent_task_0007", entity_type: "task" },
      ]).map((e) => e.id)
    ).toEqual(["ent_task_0007"]);
  });
});

describe("read routes derived from the contract mappings", () => {
  const readMappings = OPENAPI_OPERATION_MAPPINGS.filter((m) => m.readLog === true);

  function concretePath(path: string): string {
    return path.replace(/\{[^}]+\}/g, "ent_synthetic_0001");
  }

  it("logs every read-marked operation with an MCP tool on both surfaces", () => {
    const withTool = readMappings.filter((m) => m.mcpTool);
    expect(withTool.length).toBeGreaterThan(0);
    for (const m of withTool) {
      expect(READ_TOOL_NAMES.has(m.mcpTool!), m.mcpTool).toBe(true);
      expect(matchRestReadRoute(m.method, concretePath(m.path)), m.operationId).toBe(m.operationId);
    }
  });

  it("matches every read-marked REST operation to itself", () => {
    for (const m of readMappings) {
      expect(matchRestReadRoute(m.method, concretePath(m.path)), m.operationId).toBe(m.operationId);
    }
  });

  it("covers duplicates and recent changes on both surfaces", () => {
    expect(READ_TOOL_NAMES.has("list_potential_duplicates")).toBe(true);
    expect(READ_TOOL_NAMES.has("list_recent_changes")).toBe(true);
    expect(matchRestReadRoute("GET", "/entities/duplicates")).toBe("listPotentialDuplicates");
    expect(matchRestReadRoute("GET", "/record_activity")).toBe("getRecordActivity");
  });

  it("matches letter-case and trailing-slash variants", () => {
    expect(matchRestReadRoute("post", "/Entities/QUERY")).toBe("queryEntities");
    expect(matchRestReadRoute("POST", "/entities/query/")).toBe("queryEntities");
    expect(matchRestReadRoute("GET", "/ENTITIES/ent_synthetic_0001/")).toBe("getEntityById");
    expect(matchRestReadRoute("GET", "/Record_Activity/")).toBe("getRecordActivity");
    expect(readRoutePattern("/entities/{id}").test("/entities/a/b")).toBe(false);
  });

  it("leaves the documented non-entity reads out", () => {
    expect(matchRestReadRoute("GET", "/sources")).toBeNull();
    expect(matchRestReadRoute("GET", "/sources/src_1")).toBeNull();
    expect(matchRestReadRoute("GET", "/sources/src_1/content")).toBeNull();
    expect(matchRestReadRoute("GET", "/interpretations")).toBeNull();
    expect(matchRestReadRoute("GET", "/recent_conversations")).toBeNull();
    expect(matchRestReadRoute("GET", "/turns")).toBeNull();
    expect(READ_TOOL_NAMES.has("list_interpretations")).toBe(false);
  });
});

describe("REST read log with response encryption", () => {
  // Same order as src/actions.ts: read log, auth (sets the client key),
  // encryption, then the plain-body capture installed below encryption.
  async function startEncryptedApp() {
    const lines: string[] = [];
    const { publicKey } = await generateX25519KeyPair();
    const app = express();
    app.use(express.json());
    app.use(restReadLog({ write: (line) => lines.push(line) }));
    app.use((req, _res, next) => {
      (req as express.Request & { publicKey?: Uint8Array }).publicKey = publicKey;
      (req as express.Request & { authenticatedUserId?: string }).authenticatedUserId = "user-0001";
      next();
    });
    app.use(encryptResponseMiddleware);
    app.use(restReadLogPlainBody());
    app.post("/entities/query", (_req, res) => res.json(mixedResult));
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { base, lines };
  }

  it("logs the types and count of an encrypted response from its plain body", async () => {
    const { base, lines } = await startEncryptedApp();
    const res = await fetch(`${base}/entities/query`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-encrypt-response": "true" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const sent = (await res.json()) as Record<string, unknown>;
    // The client receives the envelope, not the entities.
    expect(typeof sent.encryptedPayload).toBe("string");
    for (let i = 0; i < 50 && lines.length < 1; i++) await new Promise((r) => setTimeout(r, 10));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      operation: "queryEntities",
      status: "ok",
      entity_types: { task: 2, issue: 1 },
      count: 3,
      entity_ids: ["ent_task_0001", "ent_task_0002", "ent_issue_0001"],
    });
    expectNoContent(lines[0]!);
  });

  it("is a no-op on routes that are not reads", async () => {
    const app = express();
    app.use(restReadLogPlainBody());
    app.get("/health", (_req, res) => res.json({ ok: true }));
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    servers.push(server);
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/health`);
    expect(await res.json()).toEqual({ ok: true });
  });
});
