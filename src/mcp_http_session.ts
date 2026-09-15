/**
 * MCP Streamable HTTP session mint + recover-in-place helpers (neotoma#2100).
 *
 * Transport sessions live only in process memory. After a restart an
 * authenticated POST that still carries a stale `mcp-session-id` should mint a
 * fresh transport, complete a server-side initialize handshake, and serve the
 * original JSON-RPC call — returning a new session id rather than a terminal
 * 404.
 */

import { randomUUID } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { Request } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { NeotomaServer } from "./server.js";
import { logger } from "./utils/logger.js";

/** Shared copy for remaining unknown-session 404s (GET/DELETE, handshake fail). */
export const MCP_UNKNOWN_SESSION_MESSAGE =
  "Not Found: MCP session is unknown or expired on this API instance. The server may have restarted or the client is holding a stale session id. Re-initialize by sending a new InitializeRequest without a session id.";

export type McpHttpSessionMaps = {
  transports: Map<string, StreamableHTTPServerTransport>;
  servers: Map<string, NeotomaServer>;
};

export type MintedMcpHttpSession = {
  transport: StreamableHTTPServerTransport;
  serverInstance: NeotomaServer;
};

export type AppOriginResolution = {
  origin?: string;
  source?: "configured" | "request";
};

/**
 * Mint a new in-memory Streamable HTTP transport + NeotomaServer, register it
 * in the session maps on initialize, and connect via `runHTTP`. Shared by the
 * client-driven initialize path and recover-in-place.
 */
export async function mintMcpHttpSession(
  req: Request,
  maps: McpHttpSessionMaps,
  resolveAppOrigin: (req: Request) => AppOriginResolution
): Promise<MintedMcpHttpSession> {
  const serverInstance = new NeotomaServer();
  const connectionIdFromReq = (req.headers["x-connection-id"] ||
    req.headers["X-Connection-Id"]) as string | undefined;
  if (connectionIdFromReq) {
    serverInstance.setSessionConnectionId(connectionIdFromReq);
  }
  const appOrigin = resolveAppOrigin(req);
  serverInstance.setSessionAppOrigin(appOrigin.origin ?? null, appOrigin.source ?? null);

  // Callback closes over `transport` and runs after construction completes.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      maps.transports.set(sid, transport);
      maps.servers.set(sid, serverInstance);
      logger.info(`[MCP HTTP] Session initialized: ${sid}, server instance stored`);
    },
  });

  transport.onclose = () => {
    if (transport?.sessionId) {
      maps.transports.delete(transport.sessionId);
      maps.servers.delete(transport.sessionId);
      logger.error(`[MCP HTTP] Session closed: ${transport.sessionId}`);
    }
  };

  await serverInstance.runHTTP(transport);
  return { transport, serverInstance };
}

type SinkResult = {
  statusCode: number;
  bodyText: string;
};

/**
 * Drive `transport.handleRequest` against a sink ServerResponse so recover can
 * complete initialize + notifications/initialized without a second HTTP hop.
 */
async function handleTransportOnSink(
  transport: StreamableHTTPServerTransport,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<SinkResult> {
  return new Promise<SinkResult>((resolve, reject) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = "POST";
    req.url = "/mcp";
    const headerPairs: Record<string, string> = {
      host: "127.0.0.1",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...Object.fromEntries(
        Object.entries(extraHeaders).map(([key, value]) => [key.toLowerCase(), value])
      ),
    };
    req.headers = headerPairs;
    // hono's getRequestListener builds the Web Request from rawHeaders; without
    // these the Accept check fails with 406 and recover never initializes.
    req.rawHeaders = Object.entries(headerPairs).flatMap(([key, value]) => {
      const name = key
        .split("-")
        .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join("-");
      return [name, value];
    });

    const chunks: Buffer[] = [];
    const res = new ServerResponse(req);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve({
        statusCode: res.statusCode || 0,
        bodyText: Buffer.concat(chunks).toString("utf8"),
      });
    };
    res.on("finish", finish);

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
      if (chunk && typeof chunk !== "function") {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }
      return origWrite(chunk as never, encoding as never, cb as never);
    }) as typeof res.write;
    res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
      if (chunk && typeof chunk !== "function") {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }
      const out = origEnd(chunk as never, encoding as never, cb as never);
      setImmediate(finish);
      return out;
    }) as typeof res.end;

    transport.handleRequest(req, res, body).then(() => setTimeout(finish, 50)).catch(reject);
  });
}

/**
 * Complete the MCP lifecycle handshake on a freshly minted transport so a
 * subsequent tools/call (or other non-init method) is accepted.
 *
 * Returns false when initialize does not succeed cleanly — caller should fall
 * through to the shared unknown-session 404 rather than 500.
 */
export async function completeSyntheticMcpHandshake(
  transport: StreamableHTTPServerTransport
): Promise<boolean> {
  const initBody = {
    jsonrpc: "2.0" as const,
    id: "neotoma-session-recovery-init",
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "neotoma-session-recovery", version: "0.0.0" },
    },
  };

  const initResult = await handleTransportOnSink(transport, initBody);
  if (initResult.statusCode < 200 || initResult.statusCode >= 300 || !transport.sessionId) {
    logger.warn(
      `[MCP HTTP] Recover handshake initialize failed status=${initResult.statusCode} body=${initResult.bodyText.slice(0, 200)}`
    );
    return false;
  }

  const sessionId = transport.sessionId;
  const notifyResult = await handleTransportOnSink(
    transport,
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    { "mcp-session-id": sessionId }
  );
  // 202 Accepted is the SDK success for notifications; tolerate 2xx broadly.
  if (notifyResult.statusCode < 200 || notifyResult.statusCode >= 300) {
    logger.warn(
      `[MCP HTTP] Recover handshake notifications/initialized failed status=${notifyResult.statusCode}`
    );
    return false;
  }

  return true;
}

/** Rewrite the inbound session header so the SDK accepts the recovered call. */
export function adoptRecoveredSessionId(req: Request, newSessionId: string): void {
  req.headers["mcp-session-id"] = newSessionId;
  // Express parses into `headers`, but @hono/node-server builds the Web Request
  // from `rawHeaders` when present — leave those stale and validateSession rejects.
  const incoming = req as Request & { rawHeaders?: string[] };
  if (Array.isArray(incoming.rawHeaders)) {
    const raw = incoming.rawHeaders;
    let replaced = false;
    for (let i = 0; i < raw.length - 1; i += 2) {
      if (String(raw[i]).toLowerCase() === "mcp-session-id") {
        raw[i + 1] = newSessionId;
        replaced = true;
      }
    }
    if (!replaced) {
      raw.push("mcp-session-id", newSessionId);
    }
  }
}

export function unknownSessionJsonRpcBody(rpcId: string | number | null): {
  jsonrpc: "2.0";
  error: { code: number; message: string };
  id: string | number | null;
} {
  return {
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: MCP_UNKNOWN_SESSION_MESSAGE,
    },
    id: rpcId,
  };
}
