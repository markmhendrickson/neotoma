/**
 * neotoma#2100: authenticated POST /mcp with an unknown/expired mcp-session-id
 * recovers in place — mint + synthetic initialize + original tools/call —
 * returning a new mcp-session-id so the client continues without a restart.
 *
 * Boot pattern matches tests/integration/mcp_session_404_reconnect.test.ts.
 */

import { createServer, request, type OutgoingHttpHeaders } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modernPost } from "../helpers/mcp_http_modern.js";

const ENV_KEYS = [
  "NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD",
  "NEOTOMA_BEARER_TOKEN",
  "NEOTOMA_DATA_DIR",
  "NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_HEADER",
  "NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_TITLE_PREFIX",
  "NEOTOMA_ENCRYPTION_ENABLED",
  "NEOTOMA_ENV",
  "NEOTOMA_HOST_URL",
  "NEOTOMA_HTTP_PORT",
  "NEOTOMA_KEY_FILE_PATH",
  "NEOTOMA_MNEMONIC",
  "NEOTOMA_MNEMONIC_PASSPHRASE",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreEnv(): void {
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

type JsonRpcBody = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: {
    content?: Array<{ type: string; text: string }>;
    protocolVersion?: string;
  };
  error?: { code?: number; message?: string };
};

async function readJsonRpc(response: Response): Promise<JsonRpcBody> {
  const text = await response.text();
  if (!text.trim()) return {};
  if (!text.startsWith("event:")) {
    return JSON.parse(text) as JsonRpcBody;
  }
  const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return {};
  return JSON.parse(dataLine.slice("data:".length).trim()) as JsonRpcBody;
}

function toolsCallBody(id: number, name: string, args: Record<string, unknown> = {}) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

const TRACE_HEADER = "x-fixture-lookup-trace";
const TRACE_TITLE_PREFIX = "fixture-lookup:";
const TEST_BEARER = "synthetic-identifier-timing-bearer";
const IDENTIFIER_TOOL = "retrieve_entity_by_identifier";
const TRACE_EVENT = "mcp_identifier_lookup_timing";

function lookupArgs(suffix: string) {
  return { entity_type: "event", by: "title", identifier: TRACE_TITLE_PREFIX + suffix.repeat(64) };
}

function rpcHeaders(sessionId: string, bearer?: string): OutgoingHttpHeaders {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-session-id": sessionId,
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
  };
}

function postRpc(
  baseUrl: string,
  headers: OutgoingHttpHeaders,
  body: string,
  holdBody?: Promise<void>,
  onHeaders?: () => void
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      `${baseUrl}/mcp`,
      { method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) } },
      (incoming) => {
        onHeaders?.();
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.once("error", reject);
        incoming.once("end", () => {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (value !== undefined) responseHeaders.set(name, String(value));
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: incoming.statusCode,
              headers: responseHeaders,
            })
          );
        });
      }
    );
    outgoing.once("error", reject);
    outgoing.setTimeout(5_000, () => outgoing.destroy(new Error("Fixture request timed out")));
    if (holdBody) {
      outgoing.write(body.slice(0, 1));
      void holdBody.then(() => outgoing.end(body.slice(1)), reject);
    } else {
      outgoing.end(body);
    }
  });
}

function fixtureGate() {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

type TimingRecord = {
  event: string;
  trace_id: string;
  dispatch_ms: number;
  completion_ms: number;
  headers_ms: number;
  finish_ms: number;
  outcome: string;
};

function timingRecords(calls: unknown[][]): TimingRecord[] {
  return calls
    .map(([line]) => line)
    .filter(
      (line): line is string =>
        typeof line === "string" && line.startsWith(`{"event":"${TRACE_EVENT}"`)
    )
    .map((line) => JSON.parse(line) as TimingRecord);
}

describe("POST /mcp recover-in-place for stale sessions (#2100)", () => {
  afterEach(() => {
    vi.resetModules();
    restoreEnv();
  });

  async function bootApp(opts?: { bearerToken?: string; lookupTiming?: boolean }): Promise<{
    baseUrl: string;
    httpServer: ReturnType<typeof createServer>;
    tmpRoot: string;
  }> {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mcp-recover-in-place-"));
    process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
    process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
    process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
    process.env.NEOTOMA_ENV = "development";
    process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
    process.env.NEOTOMA_HTTP_PORT = "0";
    delete process.env.NEOTOMA_KEY_FILE_PATH;
    delete process.env.NEOTOMA_MNEMONIC;
    delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;
    if (opts?.lookupTiming) {
      process.env.NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_HEADER = TRACE_HEADER;
      process.env.NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_TITLE_PREFIX = TRACE_TITLE_PREFIX;
    } else {
      delete process.env.NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_HEADER;
      delete process.env.NEOTOMA_DEBUG_MCP_LOOKUP_TRACE_TITLE_PREFIX;
    }
    if (opts?.bearerToken) {
      process.env.NEOTOMA_BEARER_TOKEN = opts.bearerToken;
    } else {
      delete process.env.NEOTOMA_BEARER_TOKEN;
    }

    vi.resetModules();
    const { app } = await import("../../src/actions.js");

    const httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }
    return { baseUrl: `http://127.0.0.1:${address.port}`, httpServer, tmpRoot };
  }

  async function teardownApp(ctx: {
    httpServer: ReturnType<typeof createServer>;
    tmpRoot: string;
  }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      ctx.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
    rmSync(ctx.tmpRoot, { recursive: true, force: true });
  }

  it("recovers an authenticated tools/call with a stale session id (effect)", async () => {
    const ctx = await bootApp();
    try {
      const staleSessionId = randomUUID();
      const requestId = 42;
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": staleSessionId,
        },
        body: toolsCallBody(requestId, "get_entity_type_counts", {}),
      });

      expect(res.status).not.toBe(404);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);

      const newSessionId = res.headers.get("mcp-session-id");
      expect(newSessionId).toBeTruthy();
      expect(newSessionId).not.toBe(staleSessionId);

      const body = await readJsonRpc(res);
      expect(body.id).toBe(requestId);
      expect(body.error).toBeUndefined();
      expect(body.result).toBeDefined();
      // Must be the tool result, not an initialize result.
      expect(body.result?.protocolVersion).toBeUndefined();
      const text = body.result?.content?.find((item) => item.type === "text")?.text;
      expect(typeof text).toBe("string");
      const payload = JSON.parse(text!) as {
        entities_by_type?: Record<string, number>;
        total_entities?: number;
        count_source?: string;
      };
      expect(payload).toHaveProperty("entities_by_type");
      expect(typeof payload.total_entities).toBe("number");

      const followUp = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": newSessionId!,
        },
        body: toolsCallBody(43, "get_entity_type_counts", {}),
      });
      expect(followUp.status).not.toBe(404);
      expect(followUp.status).toBeGreaterThanOrEqual(200);
      expect(followUp.status).toBeLessThan(300);
      const followBody = await readJsonRpc(followUp);
      expect(followBody.id).toBe(43);
      expect(followBody.error).toBeUndefined();
      expect(followBody.result?.content?.length).toBeGreaterThan(0);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("keeps auth fail-closed: wrong Bearer + stale session → 401, no new session", async () => {
    const ctx = await bootApp({ bearerToken: "shared-secret-token" });
    try {
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-token-value",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": randomUUID(),
        },
        body: toolsCallBody(7, "get_entity_type_counts", {}),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("mcp-session-id")).toBeNull();
      const body = await readJsonRpc(res);
      expect(body.error?.code).toBe(-32001);
      const message = (body.error?.message ?? "").toLowerCase();
      expect(message).not.toMatch(/mcp session is unknown/);
      expect(message).toMatch(/invalid or expired bearer token|unauthorized|authentication/i);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("does not recover GET/DELETE unknown sessions; restart-first copy without sticky", async () => {
    const ctx = await bootApp();
    try {
      const stale = randomUUID();
      for (const method of ["GET", "DELETE"] as const) {
        const res = await fetch(`${ctx.baseUrl}/mcp`, {
          method,
          headers: {
            Accept: "application/json, text/event-stream",
            "mcp-session-id": stale,
          },
        });
        expect(res.status).toBe(404);
        const body = await readJsonRpc(res);
        expect(body.error?.code).toBe(-32001);
        const message = body.error?.message ?? "";
        expect(message.toLowerCase()).toContain("mcp session is unknown");
        expect(message.toLowerCase()).toMatch(/restart|stale|re-?initializ/);
        expect(message).not.toMatch(/sticky|replica/i);
      }

      const noHeader = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: toolsCallBody(9, "get_entity_type_counts", {}),
      });
      expect(noHeader.status).toBe(400);
      const noHeaderBody = await readJsonRpc(noHeader);
      expect(noHeaderBody.error?.code).toBe(-32000);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("concurrent stale-id tools/calls mint distinct new session ids", async () => {
    const ctx = await bootApp();
    try {
      const stale = randomUUID();
      const [a, b] = await Promise.all([
        fetch(`${ctx.baseUrl}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "mcp-session-id": stale,
          },
          body: toolsCallBody(100, "get_entity_type_counts", {}),
        }),
        fetch(`${ctx.baseUrl}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "mcp-session-id": stale,
          },
          body: toolsCallBody(101, "get_entity_type_counts", {}),
        }),
      ]);

      expect(a.status).not.toBe(404);
      expect(b.status).not.toBe(404);
      const idA = a.headers.get("mcp-session-id");
      const idB = b.headers.get("mcp-session-id");
      expect(idA).toBeTruthy();
      expect(idB).toBeTruthy();
      expect(idA).not.toBe(stale);
      expect(idB).not.toBe(stale);
      expect(idA).not.toBe(idB);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("joins first receipt, real dispatch and SSE response for two concurrent scoped lookups", async () => {
    const ctx = await bootApp({ bearerToken: TEST_BEARER, lookupTiming: true });
    const { logger } = await import("../../src/utils/logger.js");
    const { db } = await import("../../src/db.js");
    const lookupHandler =
      await import("../../src/shared/action_handlers/entity_identifier_handler.js");
    const info = vi.spyOn(logger, "info");
    const entered = fixtureGate();
    const release = fixtureGate();
    const receipt = fixtureGate();
    const responseHeaders = fixtureGate();
    const delayedArgs = lookupArgs("a");
    const otherArgs = lookupArgs("b");
    const slowId = `ent_${"a".repeat(24)}`;
    const fastId = `ent_${"b".repeat(24)}`;
    const slowRef = "1".repeat(32);
    const fastRef = "2".repeat(32);
    const originalLookup = lookupHandler.retrieveEntityByIdentifierWithFallback;
    const lookup = vi
      .spyOn(lookupHandler, "retrieveEntityByIdentifierWithFallback")
      .mockImplementation(async (params) => {
        if (params.identifier === delayedArgs.identifier) {
          entered.open();
          await release.wait;
        }
        return originalLookup(params);
      });

    try {
      const recovered = await postRpc(
        ctx.baseUrl,
        rpcHeaders(randomUUID(), TEST_BEARER),
        toolsCallBody(100, "get_authenticated_user")
      );
      expect(recovered.status).toBe(200);
      const identity = await readJsonRpc(recovered);
      const { user_id: userId } = JSON.parse(identity.result!.content![0].text);
      expect(typeof userId).toBe("string");
      const { error } = await db.from("entities").insert([
        {
          id: slowId,
          user_id: userId,
          entity_type: "event",
          canonical_name: delayedArgs.identifier,
        },
        {
          id: fastId,
          user_id: userId,
          entity_type: "event",
          canonical_name: otherArgs.identifier,
        },
      ]);
      expect(error).toBeNull();
      const { error: snapshotError } = await db.from("entity_snapshots").insert(
        [
          [slowId, delayedArgs.identifier],
          [fastId, otherArgs.identifier],
        ].map(([id, title]) => ({
          entity_id: id,
          user_id: userId,
          entity_type: "event",
          schema_version: "1.0",
          snapshot: { title },
          observation_count: 1,
        }))
      );
      expect(snapshotError).toBeNull();
      const session = recovered.headers.get("mcp-session-id")!;
      expect(session).toBeTruthy();
      const headers = rpcHeaders(session, TEST_BEARER);

      ctx.httpServer.prependOnceListener("request", receipt.open);
      const slow = postRpc(
        ctx.baseUrl,
        { ...headers, [TRACE_HEADER]: slowRef },
        toolsCallBody(101, IDENTIFIER_TOOL, delayedArgs),
        receipt.wait.then(() => delay(65)),
        responseHeaders.open
      );
      await Promise.race([
        entered.wait,
        slow.then(() => {
          throw new Error("The real lookup did not reach the delayed handler");
        }),
      ]);
      const fast = await postRpc(
        ctx.baseUrl,
        { ...headers, [TRACE_HEADER]: fastRef },
        toolsCallBody(102, IDENTIFIER_TOOL, otherArgs)
      );
      const fastBody = await readJsonRpc(fast);
      expect(fast.status).toBe(200);
      expect(fastBody.id).toBe(102);
      expect(JSON.parse(fastBody.result!.content![0].text).entities).toEqual([
        expect.objectContaining({ id: fastId, snapshot: { title: otherArgs.identifier } }),
      ]);
      expect(fast.headers.has(TRACE_HEADER)).toBe(false);

      // The real SSE response can send headers before the underlying read ends.
      await Promise.race([
        responseHeaders.wait,
        delay(1_000).then(() => {
          throw new Error("SSE headers did not arrive while the real lookup was pending");
        }),
      ]);
      await delay(65);
      release.open();
      const slowResponse = await slow;
      expect(slowResponse.status).toBe(200);
      expect(slowResponse.headers.has(TRACE_HEADER)).toBe(false);
      const slowBody = await readJsonRpc(slowResponse);
      expect(slowBody.id).toBe(101);
      expect(JSON.parse(slowBody.result!.content![0].text).entities).toEqual([
        expect.objectContaining({ id: slowId, snapshot: { title: delayedArgs.identifier } }),
      ]);
      expect(lookup).toHaveBeenCalledTimes(2);

      const records = timingRecords(info.mock.calls);
      expect(records.map(({ trace_id }) => trace_id)).toEqual([fastRef, slowRef]);
      const [fastTiming, slowTiming] = records;
      expect(slowTiming).toEqual({
        event: TRACE_EVENT,
        trace_id: slowRef,
        dispatch_ms: expect.any(Number),
        completion_ms: expect.any(Number),
        headers_ms: expect.any(Number),
        finish_ms: expect.any(Number),
        outcome: "returned",
      });
      expect(slowTiming.dispatch_ms).toBeGreaterThanOrEqual(50);
      expect(slowTiming.completion_ms - slowTiming.dispatch_ms).toBeGreaterThanOrEqual(50);
      expect(slowTiming.completion_ms - slowTiming.headers_ms).toBeGreaterThanOrEqual(50);
      expect(slowTiming.finish_ms).toBeGreaterThanOrEqual(slowTiming.completion_ms);
      expect(fastTiming.finish_ms - fastTiming.dispatch_ms).toBeLessThan(
        slowTiming.completion_ms - slowTiming.dispatch_ms
      );

      const staleSession = randomUUID();
      const recoveryRef = "4".repeat(32);
      const recovery = await postRpc(
        ctx.baseUrl,
        { ...rpcHeaders(staleSession, TEST_BEARER), [TRACE_HEADER]: recoveryRef },
        toolsCallBody(103, IDENTIFIER_TOOL, otherArgs)
      );
      expect(recovery.status).toBe(200);
      expect(recovery.headers.get("mcp-session-id")).not.toBe(staleSession);
      expect((await readJsonRpc(recovery)).result).toEqual(fastBody.result);
      expect(timingRecords(info.mock.calls).map(({ trace_id }) => trace_id)).toEqual([
        fastRef,
        slowRef,
        recoveryRef,
      ]);
    } finally {
      release.open();
      lookup.mockRestore();
      info.mockRestore();
      await teardownApp(ctx);
    }
  });

  it("ignores disabled or untrusted lookup references and preserves successful and denied replies", async () => {
    const ref = "3".repeat(32);
    const body = toolsCallBody(110, IDENTIFIER_TOOL, lookupArgs("c"));
    for (const lookupTiming of [false, true]) {
      const ctx = await bootApp({ bearerToken: TEST_BEARER, lookupTiming });
      const { logger } = await import("../../src/utils/logger.js");
      const info = vi.spyOn(logger, "info");
      try {
        const accepted = await postRpc(ctx.baseUrl, rpcHeaders(randomUUID(), TEST_BEARER), body);
        expect(accepted.status).toBe(200);
        const baseline = await readJsonRpc(accepted);
        expect(baseline.result).toBeDefined();
        const session = accepted.headers.get("mcp-session-id")!;
        const headers = rpcHeaders(session, TEST_BEARER);

        if (!lookupTiming) {
          const disabled = await postRpc(ctx.baseUrl, { ...headers, [TRACE_HEADER]: ref }, body);
          expect(await readJsonRpc(disabled)).toEqual(baseline);
          expect(timingRecords(info.mock.calls)).toEqual([]);
          continue;
        }

        for (const value of ["short", "A".repeat(32), [ref, ref]]) {
          const invalid = await postRpc(ctx.baseUrl, { ...headers, [TRACE_HEADER]: value }, body);
          expect(invalid.status).toBe(200);
          expect(await readJsonRpc(invalid)).toEqual(baseline);
        }
        const noBearer = await postRpc(
          ctx.baseUrl,
          { ...rpcHeaders(session), [TRACE_HEADER]: ref, "x-connection-id": "dev-local" },
          body
        );
        expect(noBearer.status).toBe(200);
        expect(await readJsonRpc(noBearer)).toEqual(baseline);

        const denied = await postRpc(
          ctx.baseUrl,
          { ...rpcHeaders(session, "synthetic-invalid-token"), [TRACE_HEADER]: ref },
          body
        );
        expect(denied.status).toBe(401);
        expect((await readJsonRpc(denied)).error?.code).toBe(-32001);

        const tracedHeaders = { ...headers, [TRACE_HEADER]: ref };
        const modernCall = {
          id: 110,
          method: "tools/call",
          params: { name: IDENTIFIER_TOOL, arguments: lookupArgs("c") },
        };
        const modernHeaders = { authorization: `Bearer ${TEST_BEARER}` };
        const modernBaseline = await modernPost(ctx.baseUrl, modernCall, {
          headers: modernHeaders,
        });
        const modern = await modernPost(ctx.baseUrl, modernCall, {
          headers: { ...modernHeaders, [TRACE_HEADER]: ref },
        });
        expect(modern.status).toBe(200);
        expect(modern.body).toEqual(modernBaseline.body);

        for (const [name, args] of [
          ["get_authenticated_user", {}],
          [IDENTIFIER_TOOL, { ...lookupArgs("c"), identifier: "different-scope" }],
        ] as const) {
          const unscoped = toolsCallBody(111, name, args);
          const normal = await postRpc(ctx.baseUrl, headers, unscoped);
          const withRef = await postRpc(ctx.baseUrl, tracedHeaders, unscoped);
          expect(await readJsonRpc(withRef)).toEqual(await readJsonRpc(normal));
        }
        const malformed = await postRpc(
          ctx.baseUrl,
          tracedHeaders,
          toolsCallBody(112, IDENTIFIER_TOOL, { ...lookupArgs("c"), identifier: 123 })
        );
        expect((await readJsonRpc(malformed)).error).toBeDefined();
        expect(timingRecords(info.mock.calls)).toEqual([]);

        info.mockImplementation((...args) => {
          if (timingRecords([args]).length > 0) throw new Error("Synthetic log sink failure");
        });
        const logFailure = await postRpc(ctx.baseUrl, tracedHeaders, body);
        expect(logFailure.status).toBe(200);
        expect(await readJsonRpc(logFailure)).toEqual(baseline);
        expect(timingRecords(info.mock.calls)).toHaveLength(1);
      } finally {
        info.mockRestore();
        await teardownApp(ctx);
      }
    }
  });
});
