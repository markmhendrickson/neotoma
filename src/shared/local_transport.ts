import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, open } from "node:fs/promises";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import createClient from "openapi-fetch";
import type { paths } from "./openapi_types.js";

type LocalTransportClient = ReturnType<typeof createClient<paths>>;

let localClientPromise: Promise<LocalTransportClient> | null = null;
let localApiChild: ChildProcess | null = null;

function resolveProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return __dirname.includes("/dist/") || __dirname.endsWith("/dist/shared")
    ? join(__dirname, "..", "..")
    : join(__dirname, "..", "..");
}

function inferEnvFromBaseUrl(baseUrl?: string): "production" | "development" {
  if (!baseUrl) return "development";
  try {
    const parsed = new URL(baseUrl);
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    return port === 8180 ? "production" : "development";
  } catch {
    return "development";
  }
}

export async function getLocalTransportClient(options: {
  token?: string;
  baseUrl?: string;
}): Promise<LocalTransportClient> {
  if (!localClientPromise) {
    localClientPromise = (async () => {
      const env = inferEnvFromBaseUrl(options.baseUrl);
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
