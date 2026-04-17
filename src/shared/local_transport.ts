import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, open } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import createClient from "openapi-fetch";
import type { paths } from "./openapi_types.js";

type LocalTransportClient = ReturnType<typeof createClient<paths>>;

let localClientPromise: Promise<LocalTransportClient> | null = null;
let localApiChild: ChildProcess | null = null;
let localTransportKillHandler: (() => void) | null = null;

function resolveProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return __dirname.includes("/dist/") || __dirname.endsWith("/dist/shared")
    ? join(__dirname, "..", "..")
    : join(__dirname, "..", "..");
}

function portFromBaseUrl(baseUrl?: string): number | null {
  if (!baseUrl) return null;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.port) return Number(parsed.port);
    return parsed.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

/** Reads preferred_env from ~/.config/neotoma/config.json. Returns null on any error. */
function readPreferredEnvFromCliConfig(): "production" | "development" | null {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
    if (!homeDir) return null;
    const configPath = join(homeDir, ".config", "neotoma", "config.json");
    if (!existsSync(configPath)) return null;
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as {
      preferred_env?: string;
    };
    const value = parsed.preferred_env?.trim();
    if (value === "prod" || value === "production") return "production";
    if (value === "dev" || value === "development") return "development";
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves the environment for the local transport child process, in priority order:
 *   1. NEOTOMA_ENV ("production" | "development") — set by bootstrap (`neotoma dev`/`prod`)
 *   2. NEOTOMA_SESSION_ENV ("prod" | "dev") — set by `--env` flag in runCli
 *   3. NEOTOMA_CLI_PREFERRED_ENV ("prod" | "dev") — inherited from parent session
 *   4. preferred_env in ~/.config/neotoma/config.json — sticky across invocations
 *   5. Port inference from baseUrl (3180 → production, else development) — last resort
 *
 * Exported for unit tests. Do NOT call port inference first — that is the bug this
 * function exists to prevent (silent dev/prod DB file split based on whichever API
 * happens to be running).
 */
export function resolveLocalTransportEnv(baseUrl?: string): "production" | "development" {
  const explicitEnv = process.env.NEOTOMA_ENV;
  if (explicitEnv === "production" || explicitEnv === "development") return explicitEnv;

  const sessionEnv = process.env.NEOTOMA_SESSION_ENV;
  if (sessionEnv === "prod") return "production";
  if (sessionEnv === "dev") return "development";

  const preferredEnv = process.env.NEOTOMA_CLI_PREFERRED_ENV;
  if (preferredEnv === "prod") return "production";
  if (preferredEnv === "dev") return "development";

  const configPreferred = readPreferredEnvFromCliConfig();
  if (configPreferred) return configPreferred;

  const port = portFromBaseUrl(baseUrl);
  if (port === 3180) return "production";
  return "development";
}

/**
 * Checks whether the resolved env and baseUrl port disagree (e.g., env="development"
 * but baseUrl points to :3180). Emits a warning to stderr so silent mismatches between
 * the running API's DB file and the local transport's DB file are surfaced.
 */
function warnOnEnvBaseUrlMismatch(
  resolvedEnv: "production" | "development",
  baseUrl?: string,
): void {
  const port = portFromBaseUrl(baseUrl);
  if (port == null) return;
  const portSuggestsProd = port === 3180;
  const portSuggestsDev = port === 3080;
  if (!portSuggestsProd && !portSuggestsDev) return;
  const envIsProd = resolvedEnv === "production";
  const mismatch = (portSuggestsProd && !envIsProd) || (portSuggestsDev && envIsProd);
  if (!mismatch) return;
  const apiDb = portSuggestsProd ? "neotoma.prod.db (production)" : "neotoma.db (development)";
  const localDb = envIsProd ? "neotoma.prod.db (production)" : "neotoma.db (development)";
  const fix = portSuggestsProd ? "--env prod (or `neotoma prod`)" : "--env dev (or `neotoma dev`)";
  process.stderr.write(
    `Warning: local transport env mismatch. Running API at :${port} serves ${apiDb}, ` +
      `but local transport will spawn with ${localDb}. Reads and writes may target different ` +
      `SQLite files. Use ${fix} to align, or set NEOTOMA_ENV explicitly.\n`,
  );
}

export async function getLocalTransportClient(options: {
  token?: string;
  baseUrl?: string;
}): Promise<LocalTransportClient> {
  if (!localClientPromise) {
    localClientPromise = (async () => {
      const env = resolveLocalTransportEnv(options.baseUrl);
      warnOnEnvBaseUrlMismatch(env, options.baseUrl);
      const projectRoot = resolveProjectRoot();
      const actionsPath = join(projectRoot, "dist", "actions.js");
      await access(actionsPath);

      const port = await new Promise<number>((resolve, reject) => {
        const probe = http.createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => {
          const addr = probe.address();
          if (!addr || typeof addr === "string") {
            probe.close();
            reject(new Error("Failed to allocate local transport port"));
            return;
          }
          const chosen = addr.port;
          probe.close((err) => (err ? reject(err) : resolve(chosen)));
        });
      });

      // Same session log path as CLI: one log per env so CLI and MCP append to the same file
      const sessionLogDir = join(projectRoot, "data", "logs");
      const sessionLogBasename = env === "production" ? "session.prod.log" : "session.log";
      const sessionLogPath = join(sessionLogDir, sessionLogBasename);
      await mkdir(sessionLogDir, { recursive: true });
      const logFd = await open(sessionLogPath, "a");
      const logStream = logFd.createWriteStream();
      const header =
        "\n--- neotoma session (started by MCP) " +
        env +
        " (" +
        new Date().toISOString() +
        ") ---\n";
      logStream.write(header);

      localApiChild = spawn(process.execPath, [actionsPath], {
        cwd: projectRoot,
        env: {
          ...process.env,
          NEOTOMA_ENV: env,
          HTTP_PORT: String(port),
          NEOTOMA_HTTP_PORT: String(port),
        },
        stdio: ["ignore", logStream, logStream],
      });
      localApiChild.once("exit", () => {
        logStream.end();
      });

      const killChild = () => {
        if (localApiChild && !localApiChild.killed) localApiChild.kill("SIGTERM");
      };
      localTransportKillHandler = killChild;
      process.once("exit", killChild);
      process.once("SIGINT", killChild);
      process.once("SIGTERM", killChild);

      let healthy = false;
      const started = Date.now();
      while (Date.now() - started < 20000) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(1500),
          });
          if (res.ok) {
            healthy = true;
            break;
          }
        } catch {
          // Retry until timeout.
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!healthy) {
        throw new Error("Local transport API failed to start");
      }

      const headers: Record<string, string> = {};
      if (options.token) headers.Authorization = `Bearer ${options.token}`;

      return createClient<paths>({
        baseUrl: `http://127.0.0.1:${port}`,
        headers,
      });
    })();
  }

  return localClientPromise;
}

export async function shutdownLocalTransport(): Promise<void> {
  if (localTransportKillHandler) {
    process.removeListener("exit", localTransportKillHandler);
    process.removeListener("SIGINT", localTransportKillHandler);
    process.removeListener("SIGTERM", localTransportKillHandler);
    localTransportKillHandler = null;
  }

  const child = localApiChild;
  localApiChild = null;
  localClientPromise = null;
  if (!child || child.exitCode != null || child.killed) return;

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!child.killed && child.exitCode == null) child.kill("SIGKILL");
      finish();
    }, 2000);
    timeoutId.unref?.();
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      child.removeListener("exit", onExit);
      resolve();
    };
    const onExit = () => finish();
    child.once("exit", onExit);
  });
}
