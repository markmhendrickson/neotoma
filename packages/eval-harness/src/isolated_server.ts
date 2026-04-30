/**
 * Isolated Neotoma server fixture for Tier 2 eval scenarios.
 *
 * Each scenario gets a fresh child Node process running the full Neotoma
 * HTTP server, bound to a random port and a tmp `NEOTOMA_DATA_DIR`. We
 * cannot start multiple Neotoma servers in the same process because the
 * underlying express app is a singleton in `src/actions.ts`; child
 * processes give us hard isolation at the cost of a few hundred ms of
 * startup.
 *
 * Returned handle includes a stop() helper that gracefully terminates
 * the child and removes the tmp data dir.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

export interface ServerFaultConfig {
  target: string;
  fail_first_n: number;
  status_code?: number;
}

export interface IsolatedServerOptions {
  /** Optional explicit port; default = OS-chosen via the server's port probe. */
  port?: number;
  /** Optional explicit data dir; default = mkdtemp under os.tmpdir. */
  dataDir?: string;
  /** Whether to enable hook-style instruction profiles (compact mode). Default true. */
  hooksEnabled?: boolean;
  /** Extra env vars layered onto the child. */
  env?: Record<string, string>;
  /** Hard cap on startup; throws if the server does not become healthy in time. */
  startupTimeoutMs?: number;
  /** Capture child stderr for debugging. Default true. */
  captureStderr?: boolean;
  /** Use ts via tsx if running from source (default), else `node dist/index.js`. */
  useTsx?: boolean;
  /** Fault injection config for error-recovery scenarios. */
  faults?: ServerFaultConfig;
}

export interface IsolatedServer {
  readonly baseUrl: string;
  readonly mcpUrl: string;
  readonly port: number;
  readonly token: string;
  readonly dataDir: string;
  readonly stderrTail: () => string;
  /** Best-effort fetch of /stats; returns null when the server is not ready. */
  readonly fetchInstructionProfileCounters: () => Promise<Record<string, unknown> | null>;
  stop(): Promise<void>;
}

function randomToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
  abortSignal: { aborted: boolean }
): Promise<void> {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    if (abortSignal.aborted) throw new Error(`server aborted before ready (${lastError})`);
    try {
      const res = await fetch(`${baseUrl}/health`, {
        method: "GET",
      });
      if (res.ok) return;
      lastError = `status ${res.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`isolated Neotoma server did not become healthy within ${timeoutMs}ms (last error: ${lastError})`);
}

async function startFaultProxy(
  upstreamUrl: string,
  faults: ServerFaultConfig
): Promise<{ proxyUrl: string; server: HttpServer }> {
  let failCount = 0;
  const statusCode = faults.status_code ?? 500;

  return new Promise((resolveProxy, reject) => {
    const server = createHttpServer(async (req, res) => {
      const urlPath = req.url ?? "/";
      const shouldFault =
        failCount < faults.fail_first_n &&
        (urlPath.includes(faults.target) || urlPath.includes("/store") || urlPath.includes("/mcp"));

      if (shouldFault && faults.target === "store_structured") {
        const body = await readRequestBody(req);
        const isStore =
          urlPath.includes("/store") ||
          (urlPath.includes("/mcp") && body.includes("store_structured"));
        if (isStore) {
          failCount++;
          res.writeHead(statusCode, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: `Injected fault ${failCount}/${faults.fail_first_n}` }));
          return;
        }
      }

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers[k] = v;
        else if (Array.isArray(v)) headers[k] = v.join(", ");
      }
      delete headers.host;

      try {
        const body = await readRequestBody(req);
        const upstream = await fetch(`${upstreamUrl}${urlPath}`, {
          method: req.method ?? "GET",
          headers,
          body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : body,
        });
        res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);
      } catch (err) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`proxy error: ${(err as Error).message}`);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("fault proxy failed to bind"));
        return;
      }
      resolveProxy({
        proxyUrl: `http://127.0.0.1:${addr.port}`,
        server,
      });
    });
  });
}

function readRequestBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolve(""));
  });
}

export async function startIsolatedNeotomaServer(
  options: IsolatedServerOptions = {}
): Promise<IsolatedServer> {
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), "neotoma-eval-"));
  const portFile = join(dataDir, "port");
  // Pre-generate the bearer token and register it via NEOTOMA_BEARER_TOKEN so
  // the server's auth middleware accepts requests authorized with it (mapped
  // to the local dev user).
  const token = randomToken();
  // Force the server to write its bound port so we can read it back regardless
  // of any base port collision.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEOTOMA_DATA_DIR: dataDir,
    NODE_ENV: "test",
    NEOTOMA_HTTP_PORT: options.port != null ? String(options.port) : "0",
    HTTP_PORT: options.port != null ? String(options.port) : "0",
    NEOTOMA_SESSION_PORT_FILE: portFile,
    NEOTOMA_LOG_LEVEL: process.env.NEOTOMA_LOG_LEVEL ?? "warn",
    NEOTOMA_HOOKS_ENABLED: options.hooksEnabled === false ? "0" : "1",
    NEOTOMA_BEARER_TOKEN: token,
    ...(options.env ?? {}),
  };

  const useTsx = options.useTsx !== false;
  const cmd = useTsx ? "npx" : "node";
  const args = useTsx
    ? ["tsx", join(REPO_ROOT, "src/actions.ts")]
    : [join(REPO_ROOT, "dist/actions.js")];

  const captureStderr = options.captureStderr !== false;
  const stderrLines: string[] = [];
  const child: ChildProcess = spawn(cmd, args, {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", captureStderr ? "pipe" : "ignore"],
  });
  if (captureStderr && child.stderr) {
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      const lines = String(chunk).split("\n");
      for (const ln of lines) {
        stderrLines.push(ln);
        if (stderrLines.length > 500) stderrLines.shift();
      }
    });
  }
  if (child.stdout) {
    // Drain stdout so the child does not block on full pipe buffers.
    child.stdout.resume();
  }

  const aborted = { aborted: false };
  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit) => {
      child.once("exit", (code, signal) => {
        aborted.aborted = true;
        resolveExit({ code, signal });
      });
    }
  );

  // Poll the port file until the server writes it.
  const portFileTimeoutMs = options.startupTimeoutMs ?? 30_000;
  const portFileStart = Date.now();
  let port: number | null = null;
  while (Date.now() - portFileStart < portFileTimeoutMs) {
    if (aborted.aborted) {
      const exit = await exitPromise;
      throw new Error(
        `isolated Neotoma server exited prematurely (code=${exit.code} signal=${exit.signal}); stderr tail:\n${stderrLines.slice(-20).join("\n")}`
      );
    }
    try {
      const raw = readFileSync(portFile, "utf-8").trim();
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        port = parsed;
        break;
      }
    } catch {
      // not yet written
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (port == null) {
    child.kill("SIGKILL");
    throw new Error(
      `isolated Neotoma server did not write its port file within ${portFileTimeoutMs}ms; stderr tail:\n${stderrLines.slice(-20).join("\n")}`
    );
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, 15_000, aborted);

  // Persist the token next to the data dir so external scripts (e.g. an MCP
  // proxy) can pick it up if needed.
  try {
    writeFileSync(join(dataDir, "token"), token, "utf-8");
  } catch {
    // non-fatal
  }

  let effectiveBaseUrl = baseUrl;
  let faultProxy: HttpServer | null = null;
  if (options.faults) {
    const faultResult = await startFaultProxy(baseUrl, options.faults);
    effectiveBaseUrl = faultResult.proxyUrl;
    faultProxy = faultResult.server;
  }

  const handle: IsolatedServer = {
    baseUrl: effectiveBaseUrl,
    mcpUrl: `${effectiveBaseUrl}/mcp`,
    port: faultProxy ? parseInt(new URL(effectiveBaseUrl).port, 10) : port,
    token,
    dataDir,
    stderrTail: () => stderrLines.slice(-50).join("\n"),
    async fetchInstructionProfileCounters(): Promise<Record<string, unknown> | null> {
      try {
        const res = await fetch(`${baseUrl}/stats`, { method: "GET" });
        if (!res.ok) return null;
        const json = (await res.json()) as Record<string, unknown>;
        // The /stats payload includes server-side counters; downstream
        // assertions just need a JSON snapshot to query.
        return json;
      } catch {
        return null;
      }
    },
    async stop(): Promise<void> {
      if (faultProxy) {
        await new Promise<void>((r) => faultProxy!.close(() => r()));
      }
      if (!child.killed && child.exitCode == null) {
        child.kill("SIGTERM");
        const timer = setTimeout(() => {
          if (!child.killed && child.exitCode == null) child.kill("SIGKILL");
        }, 3_000);
        await exitPromise.catch(() => undefined);
        clearTimeout(timer);
      }
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
  return handle;
}
