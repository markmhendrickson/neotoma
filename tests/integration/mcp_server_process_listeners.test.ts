/**
 * neotoma#2070 — a `NeotomaServer` instance must not register process-level
 * listeners.
 *
 * The 2026-07-28 stateless path constructs one `NeotomaServer` per request,
 * and several HTTP routes construct one per call. A `process.on(...)` closure
 * registered by the constructor keeps its instance, and everything the
 * instance resolved (user id, OAuth access token), reachable for the life of
 * the process: memory grows with ordinary traffic.
 *
 * The registration used to be skipped under NODE_ENV=test, which is how every
 * test in this suite runs, so no test could see it. These tests force a
 * non-test NODE_ENV for the duration of each case.
 *
 * Signal handlers are registered once per process, by the stdio entrypoint
 * only (`installStdioSignalHandlers`, called from `run()`).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NeotomaServer, installStdioSignalHandlers } from "../../src/server.js";

const SIGNALS = ["SIGINT", "SIGPIPE", "SIGTERM"] as const;
type Signal = (typeof SIGNALS)[number];

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
};

function listenerCounts(): Record<Signal, number> {
  return Object.fromEntries(SIGNALS.map((s) => [s, process.listenerCount(s)])) as Record<
    Signal,
    number
  >;
}

describe("NeotomaServer process-level listeners (#2070)", () => {
  let originalNodeEnv: string | undefined;
  let baseline: Map<Signal, Set<(...args: unknown[]) => void>>;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    baseline = new Map(
      SIGNALS.map((s) => [s, new Set(process.listeners(s) as Array<(...args: unknown[]) => void>)])
    );
    // The registration under test was gated on NODE_ENV !== "test".
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    // Remove anything a case added, so a SIGINT handler that calls
    // process.exit never outlives the case (this is what makes the red run
    // safe to execute).
    for (const s of SIGNALS) {
      for (const listener of process.listeners(s)) {
        if (!baseline.get(s)?.has(listener as (...args: unknown[]) => void)) {
          process.removeListener(s, listener as (...args: unknown[]) => void);
        }
      }
    }
  });

  it("constructing many servers under a non-test NODE_ENV adds no process listeners", () => {
    const before = listenerCounts();
    for (let i = 0; i < 200; i += 1) {
      new NeotomaServer();
    }
    expect(listenerCounts()).toEqual(before);
  });

  it("serving many stateless requests under a non-test NODE_ENV adds no process listeners", async () => {
    const before = listenerCounts();
    for (let i = 0; i < 50; i += 1) {
      const server = new NeotomaServer();
      server.primeStatelessRequest({
        connectionId: "test-connection-bypass",
        aauthContext: null,
        clientInfo: { name: "neotoma-2070-listener-probe", version: "0.0.0" },
      });
      const shaped = await server.handleStatelessRequest(
        { jsonrpc: "2.0", id: i + 1, method: "tools/list", params: { _meta: MODERN_META } },
        { headers: {} }
      );
      // Instrument check: the request was actually served, not refused early.
      expect(shaped?.status).toBe(200);
    }
    expect(listenerCounts()).toEqual(before);
  });

  it("stdio signal handlers are installed once per process, however often they are requested", () => {
    const before = listenerCounts();
    const close = async () => undefined;
    const first = installStdioSignalHandlers(close);
    const second = installStdioSignalHandlers(close);
    const third = installStdioSignalHandlers(close);
    expect([first, second, third]).toEqual([true, false, false]);
    const after = listenerCounts();
    expect(after.SIGINT).toBe(before.SIGINT + 1);
    expect(after.SIGPIPE).toBe(before.SIGPIPE + 1);
    expect(after.SIGTERM).toBe(before.SIGTERM);
  });
});
