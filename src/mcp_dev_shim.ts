import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

type JsonRpcId = string | number | null;

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

const JSONRPC_VERSION = "2.0";
const TOOL_LIST_CHANGED_METHOD = "notifications/tools/list_changed";
const RECONNECT_REQUIRED_CODE = -32070;

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
  return `{${entries.join(",")}}`;
}

export function computeToolInterfaceHash(tools: unknown): string {
  return createHash("sha256").update(stableJson(tools)).digest("hex");
}

export function extractToolListHash(message: JsonRpcMessage): string | null {
  if (!message || typeof message !== "object" || !("result" in message)) return null;
  const result = message.result as { tools?: unknown } | null | undefined;
  if (!result || !("tools" in result)) return null;
  return computeToolInterfaceHash(result.tools);
}

export function toolListChangedNotification(): JsonRpcMessage {
  return {
    jsonrpc: JSONRPC_VERSION,
    method: TOOL_LIST_CHANGED_METHOD,
  };
}

export function reconnectRequiredError(id: JsonRpcId, reason: string): JsonRpcMessage {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code: RECONNECT_REQUIRED_CODE,
      message: `MCP tool interface changed; reconnect or reinitialize this MCP server. ${reason}`,
    },
  };
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function parseArgsFromEnv(name: string): string[] | null {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item));
  } catch {
    // Fall through to shell-like split for simple env overrides.
  }
  return raw.split(" ").filter(Boolean);
}

function defaultWorkerCommand(root: string): { command: string; args: string[] } {
  const distEntrypoint = path.join(root, "dist", "index.js");
  if (existsSync(distEntrypoint)) {
    return { command: process.execPath, args: [distEntrypoint] };
  }
  return { command: "npx", args: ["tsx", "src/index.ts"] };
}

function resolveWorkerCommand(root: string): { command: string; args: string[] } {
  const defaults = defaultWorkerCommand(root);
  return {
    command: process.env.NEOTOMA_MCP_DEV_WORKER_CMD || process.env.MCP_DEV_WORKER_CMD || defaults.command,
    args:
      parseArgsFromEnv("NEOTOMA_MCP_DEV_WORKER_ARGS") ??
      parseArgsFromEnv("MCP_DEV_WORKER_ARGS") ??
      defaults.args,
  };
}

function watchedPaths(root: string): string[] {
  const raw = process.env.NEOTOMA_MCP_DEV_WATCH_PATHS;
  if (raw) {
    return raw
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => (path.isAbsolute(entry) ? entry : path.join(root, entry)));
  }

  return [
    path.join(root, "src"),
    path.join(root, "openapi.yaml"),
    path.join(root, "docs", "developer", "mcp", "tool_descriptions.yaml"),
  ];
}

function writeJson(message: JsonRpcMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function log(message: string): void {
  process.stderr.write(`[neotoma-mcp-dev-shim] ${message}\n`);
}

class McpDevShim {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private workerReady = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private readonly queue: JsonRpcMessage[] = [];
  private readonly suppressedIds = new Set<JsonRpcId>();
  private readonly watchers: FSWatcher[] = [];
  private lastInitializeRequest: JsonRpcMessage | null = null;
  private lastInitializedNotification: JsonRpcMessage | null = null;
  private lastToolHash: string | null = null;
  private interfaceChanged = false;
  private syntheticRequestSeq = 0;
  private readonly pendingClientMethods = new Map<JsonRpcId, string>();

  constructor(
    private readonly root: string,
    private readonly workerCommand: { command: string; args: string[] },
  ) {}

  start(): void {
    this.spawnWorker();
    this.startWatching();
    this.startInput();
  }

  private spawnWorker(): void {
    this.workerReady = false;
    const env = { ...process.env, NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "1" };
    const child = spawn(this.workerCommand.command, this.workerCommand.args, {
      cwd: this.root,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.worker = child;

    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.stdout.on("data", (chunk) => this.handleWorkerOutput(chunk.toString()));
    child.on("exit", (code, signal) => {
      if (this.worker === child) {
        this.worker = null;
        this.workerReady = false;
      }
      log(`worker exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    });

    if (this.lastInitializeRequest) {
      this.reinitializeWorker();
    } else {
      this.workerReady = true;
      this.flushQueue();
    }
  }

  private startInput(): void {
    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        this.handleClientMessage(JSON.parse(line) as JsonRpcMessage);
      } catch (error) {
        log(`failed to parse client message: ${(error as Error).message}`);
      }
    });
  }

  private startWatching(): void {
    for (const watchPath of watchedPaths(this.root)) {
      if (!existsSync(watchPath)) continue;
      try {
        const watcher = watch(
          watchPath,
          { recursive: true },
          () => this.scheduleRestart(`change under ${path.relative(this.root, watchPath)}`),
        );
        this.watchers.push(watcher);
      } catch (error) {
        log(`watch unavailable for ${watchPath}: ${(error as Error).message}`);
      }
    }
  }

  private scheduleRestart(reason: string): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.restartWorker(reason), 150);
  }

  private restartWorker(reason: string): void {
    log(`restarting worker after ${reason}`);
    const oldWorker = this.worker;
    this.worker = null;
    this.workerReady = false;
    oldWorker?.kill("SIGTERM");
    setTimeout(() => {
      if (oldWorker && !oldWorker.killed) oldWorker.kill("SIGKILL");
    }, 1_000);
    this.spawnWorker();
  }

  private handleClientMessage(message: JsonRpcMessage): void {
    if (message.method === "initialize") {
      this.lastInitializeRequest = message;
      this.interfaceChanged = false;
    } else if (message.method === "notifications/initialized") {
      this.lastInitializedNotification = message;
    } else if (this.interfaceChanged && message.method === "tools/call") {
      writeJson(reconnectRequiredError(message.id ?? null, "The shim detected a changed tools/list surface after worker reload."));
      return;
    }

    this.forwardOrQueue(message);
  }

  private reinitializeWorker(): void {
    if (!this.lastInitializeRequest) {
      this.workerReady = true;
      this.flushQueue();
      return;
    }

    const replay = { ...this.lastInitializeRequest, id: this.nextSyntheticId() };
    this.suppressedIds.add(replay.id ?? null);
    this.forwardToWorker(replay);
  }

  private requestToolListForHash(): void {
    const id = this.nextSyntheticId();
    this.suppressedIds.add(id);
    this.forwardToWorker({ jsonrpc: JSONRPC_VERSION, id, method: "tools/list", params: {} });
  }

  private nextSyntheticId(): string {
    this.syntheticRequestSeq += 1;
    return `neotoma-dev-shim:${this.syntheticRequestSeq}`;
  }

  private forwardOrQueue(message: JsonRpcMessage): void {
    if ("id" in message && message.id !== undefined && message.method) {
      this.pendingClientMethods.set(message.id, message.method);
    }
    if (!this.worker || !this.workerReady) {
      this.queue.push(message);
      return;
    }
    this.forwardToWorker(message);
  }

  private forwardToWorker(message: JsonRpcMessage): void {
    if (!this.worker || !this.worker.stdin.writable) {
      this.queue.push(message);
      return;
    }
    this.worker.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private flushQueue(): void {
    while (this.worker && this.workerReady && this.queue.length > 0) {
      this.forwardToWorker(this.queue.shift()!);
    }
  }

  private workerBuffer = "";

  private handleWorkerOutput(chunk: string): void {
    this.workerBuffer += chunk;
    const lines = this.workerBuffer.split("\n");
    this.workerBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.handleWorkerMessage(JSON.parse(line) as JsonRpcMessage);
      } catch (error) {
        log(`non-JSON worker stdout ignored: ${(error as Error).message}`);
      }
    }
  }

  private handleWorkerMessage(message: JsonRpcMessage): void {
    const id = "id" in message ? (message.id ?? null) : null;
    const isSuppressed = this.suppressedIds.delete(id);
    const clientMethod = this.pendingClientMethods.get(id);
    this.pendingClientMethods.delete(id);
    const newHash = extractToolListHash(message);
    if (newHash) this.handleToolHash(newHash, isSuppressed);
    if (!isSuppressed && clientMethod === "tools/list") this.interfaceChanged = false;

    if (isSuppressed) {
      if (!this.workerReady) {
        if (this.lastInitializedNotification) this.forwardToWorker(this.lastInitializedNotification);
        this.workerReady = true;
        this.requestToolListForHash();
        return;
      }
      this.flushQueue();
      return;
    }

    writeJson(message);
  }

  private handleToolHash(newHash: string, isSuppressed: boolean): void {
    if (!this.lastToolHash) {
      this.lastToolHash = newHash;
      return;
    }
    if (this.lastToolHash === newHash) return;

    this.lastToolHash = newHash;
    this.interfaceChanged = true;
    writeJson(toolListChangedNotification());
    log(
      "tool interface changed; sent notifications/tools/list_changed. Reconnect or reinitialize if the MCP client does not refresh tools.",
    );
    if (!isSuppressed) this.interfaceChanged = false;
  }

  close(): void {
    for (const watcher of this.watchers) watcher.close();
    this.worker?.kill("SIGTERM");
  }
}

export function runMcpDevShim(): void {
  const root = repoRoot();
  const shim = new McpDevShim(root, resolveWorkerCommand(root));
  const cleanup = () => {
    shim.close();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  shim.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpDevShim();
}
