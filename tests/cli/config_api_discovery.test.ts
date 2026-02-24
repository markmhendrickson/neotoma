import { EventEmitter } from "node:events";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    delete process.env.NEOTOMA_SESSION_DEV_PORT;
    delete process.env.NEOTOMA_SESSION_PROD_PORT;
    delete process.env.NEOTOMA_SESSION_API_PORT;
    delete process.env.NEOTOMA_API_PORTS;
    vi.restoreAllMocks();
  });

  it("discovers instances with deterministic ordering across sources", async () => {
    process.env.NEOTOMA_SESSION_DEV_PORT = "9001";
    process.env.NEOTOMA_SESSION_API_PORT = "9002";
    process.env.NEOTOMA_API_PORTS = "9004";

    mockHttpHealth({
      8080: true,
      8180: true,
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
    expect(instances.map((instance) => instance.port)).toEqual([8080, 8180, 9001, 9002, 9003, 9004, 9005]);
    expect(instances.find((instance) => instance.port === 8080)?.envHint).toBe("dev");
    expect(instances.find((instance) => instance.port === 8180)?.envHint).toBe("prod");
    expect(instances.find((instance) => instance.port === 9002)?.source).toBe("session");
  });

  it("resolveBaseUrl prioritizes selected session API port", async () => {
    process.env.NEOTOMA_SESSION_API_PORT = "9234";
    const resolved = await resolveBaseUrl(undefined, {});
    expect(resolved).toBe("http://127.0.0.1:9234");
  });

  it("detectRunningApiPorts returns healthy discovered ports", async () => {
    process.env.NEOTOMA_API_PORTS = "9090";
    mockHttpHealth({
      8080: false,
      8180: false,
      9090: true,
    });
    const ports = await detectRunningApiPorts();
    expect(ports).toEqual([9090]);
  });
});
