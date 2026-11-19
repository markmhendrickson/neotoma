import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { accessLogClientIp } from "../../src/actions.js";
import {
  ACCESS_LOG_SERVICE,
  jsonAccessLog,
  resolveAccessLogFormat,
  setRequestAuthMethod,
} from "../../src/services/access_log.js";

type Server = ReturnType<express.Express["listen"]>;
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});

/** Start an app with the access log in front of a stand-in auth middleware. */
async function startApp(trustForwarded: boolean) {
  const lines: string[] = [];
  const app = express();
  app.use(
    jsonAccessLog({
      clientIp: (req) => accessLogClientIp(req, trustForwarded),
      write: (line) => lines.push(line),
    })
  );
  app.use((req, _res, next) => {
    if (req.headers.authorization === "Bearer tok-SYNTHETIC-abcdef123456") {
      setRequestAuthMethod(req, "bearer_env");
      (req as express.Request & { authenticatedUserId?: string }).authenticatedUserId = "user-0001";
      (req as express.Request & { aauthAdmission?: unknown }).aauthAdmission = {
        admitted: true,
        agent_label: "synthetic-agent",
      };
    }
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/entities", (_req, res) => res.json({ items: [] }));
  app.post("/store", (_req, res) => res.status(201).json({ ok: true }));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const waitForLine = async (): Promise<Record<string, unknown>> => {
    for (let i = 0; i < 50 && lines.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.endsWith("\n")).toBe(true);
    return JSON.parse(lines[0]!) as Record<string, unknown>;
  };
  return { base, lines, waitForLine };
}

function expectFieldTypes(line: Record<string, unknown>) {
  expect(Object.keys(line).sort()).toEqual(
    [
      "agent",
      "auth_method",
      "bytes",
      "client_ip",
      "duration_ms",
      "health",
      "method",
      "path",
      "query_keys",
      "request_id",
      "service",
      "status",
      "ts",
      "user_agent",
      "user_id",
    ].sort()
  );
  expect(new Date(line.ts as string).toISOString()).toBe(line.ts);
  expect(typeof line.request_id).toBe("string");
  expect(typeof line.method).toBe("string");
  expect(typeof line.path).toBe("string");
  expect(Array.isArray(line.query_keys)).toBe(true);
  expect(typeof line.status).toBe("number");
  expect(typeof line.duration_ms).toBe("number");
  expect(line.bytes === null || typeof line.bytes === "number").toBe(true);
  expect(typeof line.auth_method).toBe("string");
  expect(line.service).toBe(ACCESS_LOG_SERVICE);
  expect(typeof line.health).toBe("boolean");
}

describe("jsonAccessLog", () => {
  it("logs an authenticated request with user, auth method and agent", async () => {
    const { base, waitForLine } = await startApp(false);
    const res = await fetch(`${base}/entities?limit=5`, {
      headers: { authorization: "Bearer tok-SYNTHETIC-abcdef123456", "user-agent": "ua-test" },
    });
    const line = await waitForLine();
    expectFieldTypes(line);
    expect(line).toMatchObject({
      method: "GET",
      path: "/entities",
      query_keys: ["limit"],
      status: 200,
      user_id: "user-0001",
      auth_method: "bearer_env",
      agent: "synthetic-agent",
      user_agent: "ua-test",
      health: false,
    });
    expect(res.headers.get("x-request-id")).toBe(line.request_id);
  });

  it("logs an unauthenticated request with null user and auth_method none", async () => {
    const { base, waitForLine } = await startApp(false);
    await fetch(`${base}/store`, { method: "POST" });
    const line = await waitForLine();
    expectFieldTypes(line);
    expect(line).toMatchObject({
      method: "POST",
      path: "/store",
      status: 201,
      user_id: null,
      auth_method: "none",
      agent: null,
      health: false,
    });
  });

  it("logs the health path with health: true", async () => {
    const { base, waitForLine } = await startApp(false);
    await fetch(`${base}/health`);
    const line = await waitForLine();
    expectFieldTypes(line);
    expect(line).toMatchObject({ path: "/health", status: 200, health: true });
  });

  it("reuses a well-formed incoming request id and replaces a malformed one", async () => {
    const app = await startApp(false);
    const res = await fetch(`${app.base}/health`, {
      headers: { "x-request-id": "req-synthetic-0001" },
    });
    expect(res.headers.get("x-request-id")).toBe("req-synthetic-0001");
    expect((await app.waitForLine()).request_id).toBe("req-synthetic-0001");

    const other = await startApp(false);
    const res2 = await fetch(`${other.base}/health`, { headers: { "x-request-id": "bad id!" } });
    expect(res2.headers.get("x-request-id")).not.toBe("bad id!");
  });

  it("never writes tokens, cookies, header values or query values", async () => {
    const { base, lines, waitForLine } = await startApp(true);
    await fetch(`${base}/entities?api_key=sk-SYNTHETIC-QUERYSECRET-999&q=private-term`, {
      headers: {
        authorization: "Bearer tok-SYNTHETIC-abcdef123456",
        cookie: "session=COOKIE-SYNTHETIC-VALUE-777",
        "x-api-key": "HEADER-SYNTHETIC-KEY-555",
      },
    });
    const line = await waitForLine();
    const raw = lines.join("");
    for (const secret of [
      "tok-SYNTHETIC-abcdef123456",
      "COOKIE-SYNTHETIC-VALUE-777",
      "sk-SYNTHETIC-QUERYSECRET-999",
      "private-term",
      "HEADER-SYNTHETIC-KEY-555",
      "Bearer",
    ]) {
      expect(raw).not.toContain(secret);
    }
    expect(line.query_keys).toEqual(["api_key", "q"]);
  });

  it("truncates the user agent to 120 characters", async () => {
    const { base, waitForLine } = await startApp(false);
    await fetch(`${base}/health`, { headers: { "user-agent": "a".repeat(300) } });
    expect(((await waitForLine()).user_agent as string).length).toBe(120);
  });

  it("honours forwarded-for only when bound beyond loopback", async () => {
    const headers = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
    const loopback = await startApp(false);
    await fetch(`${loopback.base}/health`, { headers });
    expect((await loopback.waitForLine()).client_ip).toMatch(/127\.0\.0\.1/);

    const exposed = await startApp(true);
    await fetch(`${exposed.base}/health`, { headers });
    expect((await exposed.waitForLine()).client_ip).toBe("203.0.113.7");

    const platform = await startApp(true);
    await fetch(`${platform.base}/health`, {
      headers: { ...headers, "fly-client-ip": "198.51.100.9" },
    });
    expect((await platform.waitForLine()).client_ip).toBe("198.51.100.9");
  });
});

describe("resolveAccessLogFormat", () => {
  it("accepts the three explicit values regardless of bind host", () => {
    for (const host of ["127.0.0.1", "0.0.0.0"]) {
      expect(resolveAccessLogFormat("json", host)).toBe("json");
      expect(resolveAccessLogFormat("dev", host)).toBe("dev");
      expect(resolveAccessLogFormat("off", host)).toBe("off");
      expect(resolveAccessLogFormat(" JSON ", host)).toBe("json");
    }
  });

  it("defaults by bind host when unset or unrecognised", () => {
    expect(resolveAccessLogFormat(undefined, "127.0.0.1")).toBe("dev");
    expect(resolveAccessLogFormat("", "localhost")).toBe("dev");
    expect(resolveAccessLogFormat(undefined, "::1")).toBe("dev");
    expect(resolveAccessLogFormat(undefined, "0.0.0.0")).toBe("json");
    expect(resolveAccessLogFormat("verbose", "0.0.0.0")).toBe("json");
  });
});

describe("auth middleware records the auth method for the access log", () => {
  it("every [Auth] log line in src/actions.ts is preceded by setRequestAuthMethod", () => {
    const lines = readFileSync(join(__dirname, "../../src/actions.ts"), "utf8").split("\n");
    const sites = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /`\[Auth\] \$\{req\.method\} \$\{req\.path\} auth_method=/.test(line));
    expect(sites.length).toBeGreaterThan(10);
    for (const { i } of sites) {
      const window = lines.slice(Math.max(0, i - 3), i).join("\n");
      expect(window, `line ${i + 1}`).toContain("setRequestAuthMethod(req,");
    }
  });
});
