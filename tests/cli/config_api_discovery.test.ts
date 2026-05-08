import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  discoverApiInstances,
  detectRunningApiPorts,
  resolveBaseUrl,
  type Config,
} from "../../src/cli/config.js";

type HttpBehavior = Record<number, boolean>;

function mockHttpHealth(behavior: HttpBehavior): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(http, "get").mockImplementation((input: string | URL, options: any, callback: any) => {
    const raw = typeof input === "string" ? input : input.toString();
    const parsed = new URL(raw);
    const port = Number(parsed.port);
    const ok = behavior[port] === true;

    const req = new EventEmitter() as EventEmitter & { destroy: () => void };
    req.destroy = () => {};
    process.nextTick(() => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number; resume: () => void };
      res.statusCode = ok ? 200 : 500;
      res.resume = () => {};
      callback(res);
      if (ok) {
        res.emit("data", JSON.stringify({ ok: true }));
      } else {
        res.emit("data", JSON.stringify({ ok: false }));
      }
      res.emit("end");
    });
    return req as any;
  });
}

describe("CLI API discovery", () => {
  beforeEach(() => {
    delete process.env.NEOTOMA_SESSION_DEV_PORT;
    delete process.env.NEOTOMA_SESSION_PROD_PORT;
    delete process.env.NEOTOMA_SESSION_API_PORT;
    delete process.env.NEOTOMA_SESSION_ENV;
    delete process.env.NEOTOMA_API_PORTS;
    delete process.env.NEOTOMA_MCP_USE_LOCAL_PORT_FILE;
    delete process.env.NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE;
    delete process.env.NEOTOMA_PROJECT_ROOT;
  });

  afterEach(() => {
    delete process.env.NEOTOMA_SESSION_DEV_PORT;
    delete process.env.NEOTOMA_SESSION_PROD_PORT;
    delete process.env.NEOTOMA_SESSION_API_PORT;
    delete process.env.NEOTOMA_SESSION_ENV;
    delete process.env.NEOTOMA_API_PORTS;
    delete process.env.NEOTOMA_MCP_USE_LOCAL_PORT_FILE;
    delete process.env.NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE;
    delete process.env.NEOTOMA_PROJECT_ROOT;
    vi.restoreAllMocks();
  });

  it("discovers instances with deterministic ordering across sources", async () => {
    process.env.NEOTOMA_SESSION_DEV_PORT = "9001";
    process.env.NEOTOMA_SESSION_API_PORT = "9002";
    process.env.NEOTOMA_API_PORTS = "9004";

    mockHttpHealth({
      3080: true,
      3180: true,
      9001: true,
      9002: true,
      9003: true,
      9004: true,
      9005: true,
    });

    const config: Config = {
      extra_api_ports: [9003],
      known_api_ports: [9005],
    };

    const instances = await discoverApiInstances({ config });
    expect(instances.map((instance) => instance.port)).toEqual([3080, 3180, 9001, 9002, 9003, 9004, 9005]);
    expect(instances.find((instance) => instance.port === 3080)?.envHint).toBe("dev");
    expect(instances.find((instance) => instance.port === 3180)?.envHint).toBe("prod");
    expect(instances.find((instance) => instance.port === 9002)?.source).toBe("session");
  });

  it("resolveBaseUrl prioritizes selected session API port", async () => {
    process.env.NEOTOMA_SESSION_API_PORT = "9234";
    const resolved = await resolveBaseUrl(undefined, {});
    expect(resolved).toBe("http://localhost:9234");
  });

  it("resolveBaseUrl honors preferred prod env before auto-detected dev API", async () => {
    mockHttpHealth({ 3080: true, 3180: false });
    const resolved = await resolveBaseUrl(undefined, { preferred_env: "prod" });
    expect(resolved).toBe("http://localhost:3180");
  });

  it("resolveBaseUrl honors preferred dev env before auto-detected prod API", async () => {
    mockHttpHealth({ 3080: false, 3180: true });
    const resolved = await resolveBaseUrl(undefined, { preferred_env: "dev" });
    expect(resolved).toBe("http://localhost:3080");
  });

  it("resolveBaseUrl session port wins over NEOTOMA_MCP_USE_LOCAL_PORT_FILE", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-portfile-"));
    try {
      process.env.NEOTOMA_MCP_USE_LOCAL_PORT_FILE = "1";
      process.env.NEOTOMA_PROJECT_ROOT = tmp;
      process.env.NEOTOMA_SESSION_API_PORT = "9234";
      const server = http.createServer((_req, res) => {
        res.writeHead(200);
        res.end();
      });
      await new Promise<void>((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => resolve());
        server.once("error", reject);
      });
      const addr = server.address();
      const dynamicPort =
        typeof addr === "object" && addr && "port" in addr ? (addr as { port: number }).port : 0;
      expect(dynamicPort).toBeGreaterThan(0);
      const portFile = path.join(tmp, ".dev-serve", "local_http_port");
      await fs.mkdir(path.dirname(portFile), { recursive: true });
      await fs.writeFile(portFile, `${dynamicPort}\n`, "utf-8");
      const resolved = await resolveBaseUrl(undefined, { project_root: tmp });
      expect(resolved).toBe("http://localhost:9234");
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("resolveBaseUrl uses .dev-serve/local_http_port_prod when profile is prod", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-portfile-prod-"));
    try {
      process.env.NEOTOMA_MCP_USE_LOCAL_PORT_FILE = "true";
      process.env.NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE = "prod";
      process.env.NEOTOMA_PROJECT_ROOT = tmp;
      const server = http.createServer((_req, res) => {
        res.writeHead(200);
        res.end();
      });
      await new Promise<void>((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => resolve());
        server.once("error", reject);
      });
      const addr = server.address();
      const dynamicPort =
        typeof addr === "object" && addr && "port" in addr ? (addr as { port: number }).port : 0;
      expect(dynamicPort).toBeGreaterThan(0);
      const portFile = path.join(tmp, ".dev-serve", "local_http_port_prod");
      await fs.mkdir(path.dirname(portFile), { recursive: true });
      await fs.writeFile(portFile, `${dynamicPort}\n`, "utf-8");
      mockHttpHealth({});
      const resolved = await resolveBaseUrl(undefined, { project_root: tmp });
      expect(resolved).toBe(`http://localhost:${dynamicPort}`);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("resolveBaseUrl uses .dev-serve/local_http_port when NEOTOMA_MCP_USE_LOCAL_PORT_FILE=1", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-portfile-"));
    try {
      process.env.NEOTOMA_MCP_USE_LOCAL_PORT_FILE = "true";
      process.env.NEOTOMA_PROJECT_ROOT = tmp;
      const server = http.createServer((_req, res) => {
        res.writeHead(200);
        res.end();
      });
      await new Promise<void>((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => resolve());
        server.once("error", reject);
      });
      const addr = server.address();
      const dynamicPort =
        typeof addr === "object" && addr && "port" in addr ? (addr as { port: number }).port : 0;
      expect(dynamicPort).toBeGreaterThan(0);
      const portFile = path.join(tmp, ".dev-serve", "local_http_port");
      await fs.mkdir(path.dirname(portFile), { recursive: true });
      await fs.writeFile(portFile, `${dynamicPort}\n`, "utf-8");
      mockHttpHealth({});
      const resolved = await resolveBaseUrl(undefined, { project_root: tmp });
      expect(resolved).toBe(`http://localhost:${dynamicPort}`);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("detectRunningApiPorts returns healthy discovered ports", async () => {
    process.env.NEOTOMA_API_PORTS = "9090";
    mockHttpHealth({
      3080: false,
      3180: false,
      9090: true,
    });
    const ports = await detectRunningApiPorts();
    expect(ports).toEqual([9090]);
  });
});
