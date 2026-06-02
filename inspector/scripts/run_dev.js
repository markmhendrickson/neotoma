/* eslint-env node */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inspectorRoot = path.resolve(__dirname, "..");
const neotomaRoot = path.resolve(inspectorRoot, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function parseArgs(argv) {
  const viteArgs = [];
  let env = "dev";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--env") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --env. Use dev or prod.");
      }
      env = next;
      i += 1;
      continue;
    }

    if (arg.startsWith("--env=")) {
      env = arg.slice("--env=".length);
      continue;
    }

    viteArgs.push(arg);
  }

  if (env === "development") {
    env = "dev";
  } else if (env === "production") {
    env = "prod";
  }

  if (env !== "dev" && env !== "prod") {
    throw new Error(`Unsupported environment "${env}". Use dev or prod.`);
  }

  return { env, viteArgs };
}

function getApiUrl(env) {
  return env === "prod" ? "http://localhost:3180" : "http://localhost:3080";
}

function getApiPort(env) {
  return env === "prod" ? "3180" : "3080";
}

function spawnManagedProcess(command, args, options) {
  return spawn(command, args, {
    stdio: "inherit",
    detached: process.platform !== "win32",
    ...options,
  });
}

function terminateChild(child, signal = "SIGTERM") {
  if (!child || child.killed) {
    return;
  }

  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through to direct kill below.
    }
  }

  try {
    child.kill(signal);
  } catch {
    // Child already exited.
  }
}

const { env, viteArgs } = parseArgs(process.argv.slice(2));
const apiUrl = getApiUrl(env);
const apiPort = getApiPort(env);
const sharedEnv = {
  ...process.env,
  VITE_NEOTOMA_ENV: env,
  VITE_NEOTOMA_API_URL: apiUrl,
  HTTP_PORT: apiPort,
  NEOTOMA_HTTP_PORT: apiPort,
};

console.log(`[inspector] Starting Neotoma API for ${env} at ${apiUrl}`);

const apiProcess = spawnManagedProcess(
  npmCommand,
  ["--prefix", neotomaRoot, "run", "cli:dev", "--", "--env", env, "api", "start"],
  {
    cwd: neotomaRoot,
    env: sharedEnv,
  }
);

const viteProcess = spawnManagedProcess(
  npmCommand,
  ["run", "dev:vite", "--", ...viteArgs],
  {
    cwd: inspectorRoot,
    env: sharedEnv,
  }
);

let shuttingDown = false;
let pendingExitCode = 0;
let forcedShutdownTimer = null;
const runningChildren = new Set([apiProcess, viteProcess]);

function shutdown(exitCode = 0) {
  pendingExitCode = exitCode;

  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  terminateChild(apiProcess);
  terminateChild(viteProcess);

  forcedShutdownTimer = setTimeout(() => {
    terminateChild(apiProcess, "SIGKILL");
    terminateChild(viteProcess, "SIGKILL");
  }, 5_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown(0));
}

apiProcess.on("exit", (code) => {
  runningChildren.delete(apiProcess);

  if (shuttingDown) {
    if (runningChildren.size === 0) {
      if (forcedShutdownTimer) {
        clearTimeout(forcedShutdownTimer);
      }
      process.exit(pendingExitCode);
    }
    return;
  }
  console.error(`[inspector] Neotoma API process exited with code ${code ?? 0}`);
  shutdown(code ?? 0);
});

viteProcess.on("exit", (code) => {
  runningChildren.delete(viteProcess);

  if (shuttingDown) {
    if (runningChildren.size === 0) {
      if (forcedShutdownTimer) {
        clearTimeout(forcedShutdownTimer);
      }
      process.exit(pendingExitCode);
    }
    return;
  }
  console.error(`[inspector] Vite process exited with code ${code ?? 0}`);
  shutdown(code ?? 0);
});
