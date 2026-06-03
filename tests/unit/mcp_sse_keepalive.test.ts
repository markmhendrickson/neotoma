import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachMcpSseKeepalive,
  parseMcpSseKeepaliveMs,
  MCP_SSE_KEEPALIVE_DEFAULT_MS,
} from "../../src/actions.js";

/**
 * Minimal Express-shaped response stub backed by an EventEmitter so we can
 * exercise the real heartbeat lifecycle in attachMcpSseKeepalive without
 * standing up an HTTP server. Captures res.write payloads and header state so
 * tests assert observable runtime behavior (frames written, header injected),
 * per docs/architecture/change_guardrails_rules.md (HTTP runtime-config knobs
 * must assert runtime behavior, not source strings).
 */
class FakeSocket extends EventEmitter {
  public keepAlive: { enable: boolean; initialDelay: number } | null = null;
  setKeepAlive(enable: boolean, initialDelay?: number): this {
    this.keepAlive = { enable, initialDelay: initialDelay ?? 0 };
    return this;
  }
}

class FakeRes extends EventEmitter {
  public headers: Record<string, string> = {};
  public writes: string[] = [];
  public headersSent = false;
  public writableEnded = false;
  public destroyed = false;
  public socket = new FakeSocket();
  public writeHeadCalls = 0;

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }
  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }
  // Mirrors the @hono/node-server adapter: writeHead is invoked once with the
  // status built from the SDK's Web Response. The real adapter passes a fresh
  // header record; here we only need to observe that the patch ran.
  writeHead(_status?: number): this {
    this.writeHeadCalls += 1;
    this.headersSent = true;
    return this;
  }
  write(chunk: string): boolean {
    this.writes.push(chunk);
    return true;
  }
}

class FakeReq extends EventEmitter {
  public method: string;
  public socket = new FakeSocket();
  constructor(method = "GET") {
    super();
    this.method = method;
  }
}

function makeReqRes(method = "GET"): { req: FakeReq; res: FakeRes } {
  return { req: new FakeReq(method), res: new FakeRes() };
}

describe("attachMcpSseKeepalive (issue #1483)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes periodic SSE comment heartbeat frames once the event-stream is established", () => {
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000 });

    // Before headers are sent, no frame should be written.
    vi.advanceTimersByTime(3000);
    expect(res.writes).toHaveLength(0);

    // SDK opens the SSE stream: set content-type and flush headers.
    res.setHeader("Content-Type", "text/event-stream");
    res.writeHead(200);

    vi.advanceTimersByTime(1000);
    expect(res.writes).toEqual([": hb\n\n"]);

    vi.advanceTimersByTime(2000);
    expect(res.writes).toEqual([": hb\n\n", ": hb\n\n", ": hb\n\n"]);
  });

  it("injects X-Accel-Buffering: no on the event-stream response via writeHead patch", () => {
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000 });

    res.setHeader("Content-Type", "text/event-stream");
    expect(res.getHeader("x-accel-buffering")).toBeUndefined();

    res.writeHead(200);
    expect(res.getHeader("x-accel-buffering")).toBe("no");
  });

  it("does NOT inject X-Accel-Buffering on non-SSE (JSON) responses", () => {
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000 });

    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    expect(res.getHeader("x-accel-buffering")).toBeUndefined();
  });

  it("never writes a heartbeat into a non-SSE (JSON-RPC POST) body and stops the timer", () => {
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000 });

    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);

    vi.advanceTimersByTime(5000);
    expect(res.writes).toHaveLength(0);
  });

  it("enables TCP keepalive on the socket", () => {
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 30000 });

    expect(res.socket.keepAlive?.enable).toBe(true);
    // Capped at 60s to keep probe interval below typical proxy idle windows.
    expect(res.socket.keepAlive?.initialDelay).toBe(30000);
  });

  it("stops the heartbeat and restores writeHead when the stream closes", () => {
    const { req, res } = makeReqRes("GET");
    const originalWriteHead = res.writeHead;
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000 });
    expect(res.writeHead).not.toBe(originalWriteHead);

    res.setHeader("Content-Type", "text/event-stream");
    res.writeHead(200);
    vi.advanceTimersByTime(1000);
    expect(res.writes).toHaveLength(1);

    res.emit("close");
    expect(res.writeHead).toBe(originalWriteHead);

    vi.advanceTimersByTime(5000);
    expect(res.writes).toHaveLength(1); // no further frames after close
  });

  it("stops the heartbeat when the response has already ended", () => {
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000 });

    res.setHeader("Content-Type", "text/event-stream");
    res.writeHead(200);
    res.writableEnded = true;

    vi.advanceTimersByTime(5000);
    expect(res.writes).toHaveLength(0);
  });

  it("disables the heartbeat when keepaliveMs <= 0 but still enables a bounded TCP keepalive", () => {
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 0 });

    res.setHeader("Content-Type", "text/event-stream");
    res.writeHead(200);
    vi.advanceTimersByTime(60000);
    expect(res.writes).toHaveLength(0);
    expect(res.socket.keepAlive?.enable).toBe(true);
    // Even with the heartbeat disabled, the TCP probe delay is floored to 15s
    // (not 0 / "OS default") so the socket survives proxy idle windows.
    expect(res.socket.keepAlive?.initialDelay).toBe(15000);
  });

  it("floors a tiny positive keepaliveMs to the 15s TCP keepalive minimum", () => {
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000 });
    // App-level heartbeat still uses 1000ms, but the TCP probe delay is floored.
    expect(res.socket.keepAlive?.initialDelay).toBe(15000);
  });

  it("warns once if the SSE stream ticks repeatedly without X-Accel-Buffering landing", () => {
    const warn = vi.fn();
    const { req, res } = makeReqRes("GET");
    // Simulate an adapter that snapshotted the original writeHead: bypass the
    // patch by setting the content-type and headersSent directly without the
    // X-Accel-Buffering header ever being injected.
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000, logger: { warn } });
    res.setHeader("Content-Type", "text/event-stream");
    res.headersSent = true; // headers "sent" without writeHead patch running

    vi.advanceTimersByTime(5000); // 5 ticks -> warn threshold
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/X-Accel-Buffering/);

    vi.advanceTimersByTime(5000); // still only warned once
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does NOT warn when X-Accel-Buffering is present", () => {
    const warn = vi.fn();
    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs: 1000, logger: { warn } });
    res.setHeader("Content-Type", "text/event-stream");
    res.writeHead(200); // patch injects X-Accel-Buffering

    vi.advanceTimersByTime(10000);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("parseMcpSseKeepaliveMs (issue #1483 review BLOCKING fix)", () => {
  it("falls back to the default for unset / empty / non-numeric values", () => {
    expect(parseMcpSseKeepaliveMs(undefined)).toBe(MCP_SSE_KEEPALIVE_DEFAULT_MS);
    expect(parseMcpSseKeepaliveMs("")).toBe(MCP_SSE_KEEPALIVE_DEFAULT_MS);
    expect(parseMcpSseKeepaliveMs("   ")).toBe(MCP_SSE_KEEPALIVE_DEFAULT_MS);
    expect(parseMcpSseKeepaliveMs("abc")).toBe(MCP_SSE_KEEPALIVE_DEFAULT_MS);
  });

  it("passes a literal 0 through as the disable sentinel (NOT coerced to default)", () => {
    // This is the BLOCKING regression: `parseInt("0",10) || 25000` returned
    // 25000. The disable knob must yield 0.
    expect(parseMcpSseKeepaliveMs("0")).toBe(0);
  });

  it("passes negative values through (also disable, via the <= 0 guard)", () => {
    expect(parseMcpSseKeepaliveMs("-1")).toBe(-1);
    expect(parseMcpSseKeepaliveMs("-1000")).toBe(-1000);
  });

  it("returns the parsed value for valid positive integers", () => {
    expect(parseMcpSseKeepaliveMs("5000")).toBe(5000);
    expect(parseMcpSseKeepaliveMs("25000")).toBe(25000);
    expect(parseMcpSseKeepaliveMs(" 5000 ")).toBe(5000);
  });
});

describe("attachMcpSseKeepalive env-driven disable (issue #1483 review)", () => {
  const ORIG = process.env.NEOTOMA_MCP_SSE_KEEPALIVE_MS;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    if (ORIG === undefined) delete process.env.NEOTOMA_MCP_SSE_KEEPALIVE_MS;
    else process.env.NEOTOMA_MCP_SSE_KEEPALIVE_MS = ORIG;
  });

  // The module-level MCP_SSE_KEEPALIVE_MS is bound at import time, so this test
  // exercises the env-path end-to-end by passing the parsed env value the same
  // way the module computes it — proving 0 from the env reaches the disable
  // guard rather than being coerced to the default.
  it("writes no heartbeat when the env value parses to 0", () => {
    process.env.NEOTOMA_MCP_SSE_KEEPALIVE_MS = "0";
    const keepaliveMs = parseMcpSseKeepaliveMs(process.env.NEOTOMA_MCP_SSE_KEEPALIVE_MS);
    expect(keepaliveMs).toBe(0);

    const { req, res } = makeReqRes("GET");
    attachMcpSseKeepalive(req as never, res as never, { keepaliveMs });
    res.setHeader("Content-Type", "text/event-stream");
    res.writeHead(200);
    vi.advanceTimersByTime(60000);
    expect(res.writes).toHaveLength(0);
  });
});
