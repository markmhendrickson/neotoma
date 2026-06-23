import { describe, expect, it } from "vitest";

import {
  backoffMs,
  createLoopState,
  dispatchCore,
  isRecoverableMcpSessionLostError,
  withTimeout,
  type DispatchDeps,
  type ProxyConfig,
} from "./mcp_stdio_proxy.js";

const baseConfig: ProxyConfig = {
  downstreamUrl: "http://downstream.test/mcp",
  clientName: "test-proxy",
  clientVersion: "1.0.0",
  sessionPreflight: false,
  failClosed: false,
  extraHeaders: {},
  aauthEnabled: false,
  autostart: false,
};

function jsonResponse(obj: unknown, opts: { status?: number; sessionId?: string } = {}): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.sessionId) headers["mcp-session-id"] = opts.sessionId;
  return new Response(JSON.stringify(obj), { status: opts.status ?? 200, headers });
}

/** Mirrors the `503 … session is unknown on this API instance` body from src/actions.ts. */
function sessionLostResponse(): Response {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32001,
        message: "Service Unavailable: MCP session is unknown on this API instance.",
      },
    },
    { status: 503 }
  );
}

type SendStep = (headers: Record<string, string>, body: string) => Response | Promise<Response>;

function makeDeps(
  send: DispatchDeps["send"],
  opts: { maxAttempts?: number; timeoutMs?: number } = {}
): { deps: DispatchDeps; emitted: unknown[] } {
  const emitted: unknown[] = [];
  return {
    emitted,
    deps: {
      send,
      emit: (payload) => emitted.push(payload),
      sleep: () => Promise.resolve(), // no real backoff delay in tests
      timeoutMs: opts.timeoutMs ?? 50,
      maxAttempts: opts.maxAttempts ?? 4,
    },
  };
}

/** Consume a fixed script of responses, one per downstream call. */
function scriptedSend(steps: SendStep[]): DispatchDeps["send"] {
  let i = 0;
  return async (headers, body) => {
    const step = steps[i++];
    if (!step) throw new Error(`unexpected extra downstream call #${i}`);
    return step(headers, body);
  };
}

function methodOf(body: string): string {
  return (JSON.parse(body) as { method?: string }).method ?? "";
}

describe("isRecoverableMcpSessionLostError", () => {
  it("matches the 503 session-unknown body", () => {
    expect(
      isRecoverableMcpSessionLostError(503, "MCP session is unknown on this API instance")
    ).toBe(true);
    expect(
      isRecoverableMcpSessionLostError(
        503,
        "service unavailable: session is unknown on this api instance"
      )
    ).toBe(true);
  });
  it("ignores non-503 statuses and unrelated bodies", () => {
    expect(isRecoverableMcpSessionLostError(500, "session is unknown on this api instance")).toBe(
      false
    );
    expect(isRecoverableMcpSessionLostError(503, "rate limited")).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows exponentially and caps at 2s", () => {
    expect(backoffMs(1)).toBe(300);
    expect(backoffMs(2)).toBe(600);
    expect(backoffMs(3)).toBe(1200);
    expect(backoffMs(4)).toBe(2000);
    expect(backoffMs(10)).toBe(2000);
  });
});

describe("withTimeout", () => {
  it("resolves a fast promise", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });
  it("rejects when the promise hangs past the deadline", async () => {
    await expect(withTimeout(new Promise<never>(() => {}), 10)).rejects.toThrow(/timeout/);
  });
  it("passes through when disabled (ms <= 0)", async () => {
    await expect(withTimeout(Promise.resolve(42), 0)).resolves.toBe(42);
  });
});

describe("dispatchCore", () => {
  it("forwards a successful initialize and captures the session id", async () => {
    const loop = createLoopState();
    const { deps, emitted } = makeDeps(
      scriptedSend([() => jsonResponse({ jsonrpc: "2.0", id: 1, result: {} }, { sessionId: "S1" })])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(loop.session.sessionId).toBe("S1");
    expect(loop.lastInitializeBody).toContain("initialize");
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
  });

  it("recovers from a lost session: re-initializes and retries, emitting only the final result", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "S1";
    loop.lastInitializeBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { clientInfo: { name: "test-proxy", version: "1.0.0" } },
    });

    const calls: string[] = [];
    const send: DispatchDeps["send"] = async (_headers, body) => {
      const method = methodOf(body);
      calls.push(method);
      if (method === "initialize") return jsonResponse({ result: {} }, { sessionId: "S2" });
      // first tool/call sees a dead session, second (after reinit) succeeds
      return calls.filter((m) => m === "tools/call").length === 1
        ? sessionLostResponse()
        : jsonResponse({ jsonrpc: "2.0", id: 7, result: { ok: true } });
    };

    const { deps, emitted } = makeDeps(send);
    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {},
    });

    expect(calls).toEqual(["tools/call", "initialize", "tools/call"]);
    expect(loop.session.sessionId).toBe("S2");
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 7, result: { ok: true } }]); // no error leaked to client
  });

  it("recovers from a transport error/timeout window (restart) by re-handshaking", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "S1";
    loop.lastInitializeBody = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" });

    const { deps, emitted } = makeDeps(
      scriptedSend([
        () => {
          throw new Error("fetch failed");
        }, // attempt 1: connection refused mid-restart
        () => jsonResponse({ result: {} }, { sessionId: "S2" }), // reinit
        () => jsonResponse({ jsonrpc: "2.0", id: 9, result: { ok: 1 } }), // retry succeeds
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {},
    });

    expect(loop.session.sessionId).toBe("S2");
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 9, result: { ok: 1 } }]);
  });

  it("emits a JSON-RPC error (never hangs) when recovery is exhausted", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "S1";
    loop.lastInitializeBody = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" });

    // reinit always succeeds, but every tool/call keeps hitting a dead session
    const send: DispatchDeps["send"] = async (_headers, body) =>
      methodOf(body) === "initialize"
        ? jsonResponse({ result: {} }, { sessionId: "S2" })
        : sessionLostResponse();

    const { deps, emitted } = makeDeps(send, { maxAttempts: 3 });
    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {},
    });

    expect(emitted).toHaveLength(1);
    const err = emitted[0] as { id: number; error: { code: number; message: string } };
    expect(err.id).toBe(11);
    expect(err.error.message).toMatch(/recovery exhausted after 3 attempts/);
  });

  it("does not retry a failed initialize (the client owns the handshake)", async () => {
    const loop = createLoopState();
    let calls = 0;
    const { deps, emitted } = makeDeps(
      scriptedSend([
        () => {
          calls++;
          return sessionLostResponse();
        },
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(calls).toBe(1); // no retry/replay for initialize itself
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { error?: unknown }).error).toBeDefined();
  });
});
