import { describe, expect, it } from "vitest";

import {
  backoffMs,
  classifyInitializeFailure,
  createLoopState,
  dispatchCore,
  isJsonRpcResponse,
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

/**
 * The unknown-session 404 body emitted by `src/actions.ts`, copied verbatim —
 * including the `-32001` code the neotoma#2312 predicate keys on.
 */
const SERVER_404_SESSION_LOST_BODY = {
  jsonrpc: "2.0",
  id: null,
  error: {
    code: -32001,
    message:
      "Not Found: MCP session is unknown or expired on this API instance. The client should re-initialize by sending a new InitializeRequest without a session ID. If you run multiple replicas, enable sticky sessions for POST /mcp (or route /mcp to a single instance).",
  },
};

/** A genuine routing 404 — no `-32001`, so it must surface as an error and never retry. */
function routingNotFoundResponse(): Response {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32601, message: "Not Found: no such route" },
    },
    { status: 404 }
  );
}

/** Mirrors the current `404 … session is unknown on this API instance` body from src/actions.ts. */
function sessionLostResponse(): Response {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32001,
        message: "Not Found: MCP session is unknown or expired on this API instance.",
      },
    },
    { status: 404 }
  );
}

/** Mirrors the legacy (pre-neotoma#1923) `503 … session is unknown on this API instance` body. */
function legacySessionLostResponse(): Response {
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
  it("matches the 404 session-unknown body (current)", () => {
    expect(
      isRecoverableMcpSessionLostError(404, "MCP session is unknown on this API instance")
    ).toBe(true);
    expect(
      isRecoverableMcpSessionLostError(404, "not found: session is unknown on this api instance")
    ).toBe(true);
  });
  it("matches the 503 session-unknown body (legacy, pre-neotoma#1923)", () => {
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
  it("ignores non-404/503 statuses and unrelated bodies", () => {
    expect(isRecoverableMcpSessionLostError(500, "session is unknown on this api instance")).toBe(
      false
    );
    expect(isRecoverableMcpSessionLostError(400, "session is unknown on this api instance")).toBe(
      false
    );
    expect(isRecoverableMcpSessionLostError(404, "rate limited")).toBe(false);
    expect(isRecoverableMcpSessionLostError(503, "rate limited")).toBe(false);
  });

  // neotoma#2312: the predicate is keyed on the JSON-RPC error code, not the
  // status or the prose alone.
  it("matches the real server 404 body verbatim, including error.code -32001", () => {
    expect(
      isRecoverableMcpSessionLostError(404, JSON.stringify(SERVER_404_SESSION_LOST_BODY))
    ).toBe(true);
  });

  it("does NOT match a genuine routing 404 that carries no -32001", () => {
    // A missing route / misconfigured downstream URL must surface, never retry.
    expect(
      isRecoverableMcpSessionLostError(
        404,
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32601, message: "Not Found: no such route" },
        })
      )
    ).toBe(false);
    expect(isRecoverableMcpSessionLostError(404, "<html><body>404 Not Found</body></html>")).toBe(
      false
    );
  });

  it("does NOT treat an auth 401 carrying -32001 as session loss", () => {
    // src/actions.ts returns -32001 on four separate auth failures. Replaying
    // initialize cannot fix a credential problem, so these must not recover.
    for (const message of [
      "Invalid or expired Bearer token. Remove Authorization from mcp.json and click Connect to re-authenticate.",
      "Unauthorized: Authentication required",
    ]) {
      expect(
        isRecoverableMcpSessionLostError(
          401,
          JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message } })
        )
      ).toBe(false);
    }
  });

  it("does NOT match an unrelated -32001 on 404/503 whose message is not session loss", () => {
    expect(
      isRecoverableMcpSessionLostError(
        503,
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Service Unavailable: upstream database is down" },
        })
      )
    ).toBe(false);
  });

  /**
   * The case that distinguishes the body-keyed predicate from a message-only
   * one: an envelope whose prose says the session is unknown but whose JSON-RPC
   * code is something else. Keying on `-32001` makes the code authoritative
   * whenever one is present, so borrowed or proxied copy cannot spoof recovery.
   */
  it("does NOT recover on a session-unknown message carrying a non--32001 code", () => {
    expect(
      isRecoverableMcpSessionLostError(
        404,
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32601,
            message: "Not Found: MCP session is unknown or expired on this API instance.",
          },
        })
      )
    ).toBe(false);
  });

  it("still recovers when the body is not parseable JSON-RPC but says the session is unknown", () => {
    // A server that wraps or strips the envelope must not regress recovery.
    expect(
      isRecoverableMcpSessionLostError(404, "Not Found: MCP session is unknown or expired")
    ).toBe(true);
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

  it("recovers from a lost session on a legacy (pre-neotoma#1923) 503 response, same as 404", async () => {
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
      return calls.filter((m) => m === "tools/call").length === 1
        ? legacySessionLostResponse()
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
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 7, result: { ok: true } }]);
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

  // neotoma#2312 — the incident shape: a single-machine restart drops the
  // in-memory session, and the very next tool call gets the verbatim 404 body.
  it("recovers from the verbatim server 404 session-loss body after a restart", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "S1";
    loop.lastInitializeBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { clientInfo: { name: "test-proxy", version: "1.0.0" } },
    });

    const calls: string[] = [];
    const sentSessionHeaders: (string | undefined)[] = [];
    const send: DispatchDeps["send"] = async (headers, body) => {
      const method = methodOf(body);
      calls.push(method);
      sentSessionHeaders.push(headers["mcp-session-id"]);
      if (method === "initialize") return jsonResponse({ result: {} }, { sessionId: "S2" });
      return calls.filter((m) => m === "tools/call").length === 1
        ? jsonResponse(SERVER_404_SESSION_LOST_BODY, { status: 404 })
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
    // The replayed initialize must not carry the dead session id.
    expect(sentSessionHeaders[0]).toBe("S1");
    expect(sentSessionHeaders[1]).toBeUndefined();
    expect(loop.session.sessionId).toBe("S2");
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 7, result: { ok: true } }]);
  });

  it("does NOT retry a genuine routing 404 — it surfaces as an error", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "S1";
    loop.lastInitializeBody = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" });

    let calls = 0;
    const { deps, emitted } = makeDeps(
      scriptedSend([
        () => {
          calls++;
          return routingNotFoundResponse();
        },
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: {},
    });

    expect(calls).toBe(1); // no replay, no retry
    expect(loop.session.sessionId).toBe("S1"); // session left intact
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { error?: unknown }).error).toBeDefined();
  });

  /**
   * A 404 on the handshake is NOT session loss — there is no session yet — so it
   * is classified `other_terminal` and surfaces without retry. This replaces the
   * former "does not retry initialize even on a 404 carrying -32001" test: the
   * assertion (one call, an error surfaced) is unchanged; only the reason is.
   */
  it("does not retry a handshake 404, which cannot be session loss (no session exists yet)", async () => {
    const loop = createLoopState();
    let calls = 0;
    const { deps, emitted } = makeDeps(
      scriptedSend([
        () => {
          calls++;
          return jsonResponse(SERVER_404_SESSION_LOST_BODY, { status: 404 });
        },
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(calls).toBe(1);
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { error?: unknown }).error).toBeDefined();
  });

  it("does not retry a handshake rejected as a client error (400)", async () => {
    const loop = createLoopState();
    let calls = 0;
    const { deps, emitted } = makeDeps(
      scriptedSend([
        () => {
          calls++;
          return jsonResponse({ error: { code: -32600, message: "Bad Request" } }, { status: 400 });
        },
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(calls).toBe(1); // a malformed handshake is not fixed by replaying it
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { error?: unknown }).error).toBeDefined();
  });
});

/**
 * Regression coverage for neotoma#2321 — a failed `initialize` was permanent.
 *
 * Session-loss recovery (#2312/#2320) never applied to the handshake: there is
 * no session to recover and no cached handshake to replay. So a session whose
 * `initialize` failed while the backend was unhealthy stayed dark for the life
 * of the client, long after the backend was fixed and verified serving.
 *
 * These cover the three behaviours that fix has to get right together: retry
 * what a replay can fix, never retry a credential rejection, and stay bounded.
 */
describe("dispatchCore initialize handshake retry (neotoma#2321)", () => {
  /** The 401 + `-32001` body `src/actions.ts` returns on an invalid/expired bearer. */
  function authRejectedResponse(): Response {
    return jsonResponse(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message:
            "Invalid or expired Bearer token. Remove Authorization from mcp.json and click Connect to re-authenticate.",
        },
      },
      { status: 401 }
    );
  }

  it("retries a handshake that fails twice then succeeds, and the session establishes", async () => {
    const loop = createLoopState();
    let calls = 0;
    const { deps, emitted } = makeDeps(async () => {
      calls++;
      if (calls === 1) throw new Error("fetch failed", { cause: new Error("ECONNREFUSED") });
      if (calls === 2) return jsonResponse({ error: { code: -32603 } }, { status: 500 });
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: { ok: true } }, { sessionId: "S1" });
    });

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(calls).toBe(3);
    // The effect that matters: the session is usable, not merely that a retry ran.
    expect(loop.session.sessionId).toBe("S1");
    // The client sees only the successful handshake — no error leaked mid-retry.
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 1, result: { ok: true } }]);
  });

  it("retries a handshake whose crash surfaces as -32603 through an HTTP 200", async () => {
    // neotoma#2316's "DB request aborted by caller": when the substrate crashes
    // after response headers are sent, the status can no longer be restated, so
    // the internal error rides out on an otherwise-successful response. Forwarded
    // blindly, that is a handshake failure delivered as a handshake success.
    const loop = createLoopState();
    let calls = 0;
    const { deps, emitted } = makeDeps(async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32603, message: "DB request aborted by caller" },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: { ok: true } }, { sessionId: "S9" });
    });

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(calls).toBe(2);
    expect(loop.session.sessionId).toBe("S9");
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 1, result: { ok: true } }]);
  });

  it("never retries a handshake rejected for authentication, and says so distinguishably", async () => {
    const loop = createLoopState();
    let calls = 0;
    const { deps, emitted } = makeDeps(async () => {
      calls++;
      return authRejectedResponse();
    });

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    // Load-bearing: retrying would hammer a server correctly refusing a
    // credential, burn the budget, and mask the real cause from the operator.
    expect(calls).toBe(1);
    expect(emitted).toHaveLength(1);
    const err = (emitted[0] as { error: { message: string } }).error;
    expect(err.message).toContain("handshake_auth_rejected");
    // Distinguishable from the unreachable/server-error classes.
    expect(err.message).not.toContain("handshake_unreachable");
  });

  it("does not read the shared -32001 code as auth when the status is not 401", async () => {
    // -32001 is returned on four auth paths AND on session loss. Keying auth on
    // the code alone would misclassify; the 401 status is the discriminator.
    expect(
      classifyInitializeFailure({
        status: 500,
        bodyText: JSON.stringify({ error: { code: -32001, message: "whatever" } }),
      })
    ).toBe("retryable_server");
  });

  it("bounds retries: an unreachable backend stops at maxAttempts and reports it as unreachable", async () => {
    const loop = createLoopState();
    let calls = 0;
    const { deps, emitted } = makeDeps(
      async () => {
        calls++;
        throw new Error("fetch failed", { cause: new Error("ECONNREFUSED") });
      },
      { maxAttempts: 3 }
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(calls).toBe(3); // bounded, not infinite
    expect(emitted).toHaveLength(1);
    const err = (emitted[0] as { error: { message: string } }).error;
    // A client that exhausted retries must be able to tell "the server is
    // unreachable" from "this tool does not exist".
    expect(err.message).toContain("handshake_unreachable");
    expect(err.message).toContain("NOT a missing tool");
  });

  it("stops retrying when the wall-clock budget would be exceeded, before the client's own timeout", async () => {
    // Attempt count alone is not a sufficient bound: the proxy emits nothing
    // until it resolves, so the client sits blocked on its own initialize
    // timeout for the whole window. Overrunning it turns a recoverable
    // handshake into a client-side abort.
    const loop = createLoopState();
    let calls = 0;
    let clock = 0;
    const { emitted, deps } = makeDeps(
      async () => {
        calls++;
        clock += 20_000; // each attempt burns 20s
        throw new Error("fetch failed", { cause: new Error("ETIMEDOUT") });
      },
      { maxAttempts: 8 }
    );

    await dispatchCore({ ...deps, now: () => clock, handshakeBudgetMs: 45_000 }, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    // Budget, not maxAttempts, is what stopped it.
    expect(calls).toBeLessThan(8);
    expect(calls).toBe(3);
    expect((emitted[0] as { error: { message: string } }).error.message).toContain(
      "handshake_unreachable"
    );
  });

  it("still forwards an SSE initialize response, which the classifier now buffers", async () => {
    // The handshake body has to be read to classify it, which consumes the
    // stream, so the SSE frames are re-parsed out of the buffered text rather
    // than streamed. A successful SSE handshake must still reach the client
    // intact, and the neotoma#2272 correlation guard must still apply.
    const loop = createLoopState();
    const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } })}\n\n`;
    const { deps, emitted } = makeDeps(
      scriptedSend([
        () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream", "mcp-session-id": "S3" },
          }),
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(loop.session.sessionId).toBe("S3");
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 1, result: { ok: true } }]);
  });

  it("drops a mis-correlated initialize response rather than delivering it (neotoma#2272)", async () => {
    const loop = createLoopState();
    const { deps, emitted } = makeDeps(
      scriptedSend([() => jsonResponse({ jsonrpc: "2.0", id: 999, result: { notYours: true } })])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(emitted).toHaveLength(1);
    const err = (emitted[0] as { error?: { message: string } }).error;
    expect(err).toBeDefined();
    expect(err!.message).toContain("did not correlate");
  });

  it("leaves session-loss recovery for established sessions unchanged", async () => {
    // Non-regression on #2312/#2320: the handshake path must not have altered
    // how an established-then-lost session recovers.
    const loop = createLoopState();
    loop.session.sessionId = "S1";
    loop.lastInitializeBody = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" });

    const calls: string[] = [];
    const send: DispatchDeps["send"] = async (_headers, body) => {
      const method = methodOf(body);
      calls.push(method);
      if (method === "initialize") return jsonResponse({ result: {} }, { sessionId: "S2" });
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
    expect(emitted).toEqual([{ jsonrpc: "2.0", id: 7, result: { ok: true } }]);
  });
});

describe("classifyInitializeFailure (neotoma#2321)", () => {
  it("classifies a connection failure as retryable transport", () => {
    expect(classifyInitializeFailure({ networkError: true })).toBe("retryable_transport");
    expect(classifyInitializeFailure({})).toBe("retryable_transport");
  });

  it("classifies 5xx and -32603 as retryable server errors", () => {
    expect(classifyInitializeFailure({ status: 500 })).toBe("retryable_server");
    expect(classifyInitializeFailure({ status: 502 })).toBe("retryable_server");
    expect(
      classifyInitializeFailure({
        status: 200,
        bodyText: JSON.stringify({ error: { code: -32603, message: "DB request aborted" } }),
      })
    ).toBe("retryable_server");
  });

  it("classifies every 401 auth path as auth_rejected regardless of body", () => {
    for (const msg of [
      "Invalid or expired Bearer token.",
      "Encryption is enabled. Use MCP token from your private key",
      "Unauthorized: Authentication required",
      "Connection invalid or expired.",
    ]) {
      expect(
        classifyInitializeFailure({
          status: 401,
          bodyText: JSON.stringify({ error: { code: -32001, message: msg } }),
        })
      ).toBe("auth_rejected");
    }
  });

  it("never lets a retryable signal override an auth rejection", () => {
    // A 401 body that also happens to carry -32603 must still fail closed.
    expect(
      classifyInitializeFailure({
        status: 401,
        bodyText: JSON.stringify({ error: { code: -32603 } }),
      })
    ).toBe("auth_rejected");
  });

  it("classifies non-auth 4xx as terminal, not retryable", () => {
    expect(classifyInitializeFailure({ status: 400 })).toBe("other_terminal");
    expect(classifyInitializeFailure({ status: 404 })).toBe("other_terminal");
    expect(classifyInitializeFailure({ status: 403 })).toBe("other_terminal");
  });
});

/**
 * Regression coverage for neotoma#2272 — a `store` call receiving another
 * caller's response payload.
 *
 * The proxy forwarded whatever JSON-RPC envelope came back from downstream
 * without ever checking that its `id` matched the request's. A response
 * belonging to a different in-flight call therefore reached the client as the
 * answer to this one — and an agent that stores the returned `entity_id` would
 * attach subsequent work to the wrong parent.
 */
describe("dispatchCore response/request correlation (neotoma#2272)", () => {
  it("never emits a response whose JSON-RPC id differs from the request's", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "sess-1";
    loop.lastInitializeBody = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" });

    // Downstream returns a well-formed JSON-RPC response that belongs to a
    // DIFFERENT in-flight request (id 41) than the one being dispatched (42) —
    // exactly the mis-routed payload observed in #2272.
    const { deps, emitted } = makeDeps(
      scriptedSend([
        () =>
          jsonResponse({
            jsonrpc: "2.0",
            id: 41,
            result: {
              content: [{ type: "text", text: '{"entity_id":"ent_other_callers_write"}' }],
            },
          }),
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "store", arguments: { entities: [{ entity_type: "project" }] } },
    });

    expect(emitted).toHaveLength(1);
    const payload = emitted[0] as { id?: unknown; error?: { message?: string } };

    // A response for id 41 must never be delivered as the answer to id 42, and
    // the caller must never see the other write's entity id.
    expect(payload.id).toBe(42);
    expect(JSON.stringify(payload)).not.toContain("ent_other_callers_write");
    expect(payload.error).toBeDefined();
  });

  it("passes through a correctly correlated response untouched", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "sess-1";

    const { deps, emitted } = makeDeps(
      scriptedSend([
        () =>
          jsonResponse({
            jsonrpc: "2.0",
            id: 42,
            result: { content: [{ type: "text", text: '{"entity_id":"ent_mine"}' }] },
          }),
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "store", arguments: {} },
    });

    expect(emitted).toHaveLength(1);
    expect(JSON.stringify(emitted[0])).toContain("ent_mine");
  });

  it("forwards server-initiated messages that carry no id (notifications/requests)", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "sess-1";

    // A notification has no id of its own and must not be judged against the
    // request's id — dropping these would break server-initiated traffic.
    const { deps, emitted } = makeDeps(
      scriptedSend([
        () => jsonResponse({ jsonrpc: "2.0", method: "notifications/message", params: {} }),
      ])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "store", arguments: {} },
    });

    // The notification is forwarded verbatim — it carries no id and is not a
    // response, so it is never judged against the request's id.
    expect((emitted[0] as { method?: string }).method).toBe("notifications/message");

    // It is also not an answer to the pending call, so the request is still
    // owed a response rather than left hanging.
    const answer = emitted.find((m) => isJsonRpcResponse(m)) as { id?: unknown } | undefined;
    expect(answer?.id).toBe(7);
  });

  it("forwards a batched response array only when every id matches", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "sess-1";

    const { deps, emitted } = makeDeps(
      scriptedSend([() => jsonResponse([{ jsonrpc: "2.0", id: 99, result: { ok: true } }])])
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "store", arguments: {} },
    });

    expect(emitted).toHaveLength(1);
    const payload = emitted[0] as { id?: unknown; error?: unknown };
    expect(payload.id).toBe(5);
    expect(payload.error).toBeDefined();
  });

  it("does not emit a late response from a request it already abandoned to a timeout", async () => {
    const loop = createLoopState();
    loop.session.sessionId = "sess-1";
    loop.lastInitializeBody = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" });

    let releaseSlowCall: (r: Response) => void = () => {};
    let callCount = 0;

    const { deps, emitted } = makeDeps(
      async () => {
        callCount += 1;
        if (callCount === 1) {
          // First attempt hangs past the deadline, then completes AFTER the
          // proxy has given up and retried.
          return await new Promise<Response>((resolve) => {
            releaseSlowCall = resolve;
          });
        }
        return jsonResponse({
          jsonrpc: "2.0",
          id: 42,
          result: { content: [{ type: "text", text: '{"entity_id":"ent_retry"}' }] },
        });
      },
      { timeoutMs: 10, maxAttempts: 2 }
    );

    await dispatchCore(deps, loop, baseConfig, {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "store", arguments: { entities: [{ entity_type: "project" }] } },
    });

    // The abandoned first attempt now settles. Its body must not reach stdout.
    releaseSlowCall(
      jsonResponse({
        jsonrpc: "2.0",
        id: 42,
        result: { content: [{ type: "text", text: '{"entity_id":"ent_first_attempt"}' }] },
      })
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(emitted).toHaveLength(1);
    expect(JSON.stringify(emitted[0])).not.toContain("ent_first_attempt");
  });
});
