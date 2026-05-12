#!/usr/bin/env node
/**
 * Restarts the Neotoma HTTP API dev stack when watched paths change, using chokidar
 * with polling. Used when NEOTOMA_API_WATCH_FORCE_POLL=1 (LaunchAgent dev server),
 * because Node's native `--watch` relies on fs.watch/FSEvents and often misses saves
 * under some LaunchAgent sessions — same failure mode as tsc without TSC_WATCHFILE
 * polling (see docs/developer/launchd_dev_servers.md).
 */

import chokidar from "chokidar";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const entryArg = process.argv[2] || "src/actions.ts";
const entryAbs = path.isAbsolute(entryArg) ? entryArg : path.join(REPO_ROOT, entryArg);
const runDevTaskJs = path.join(__dirname, "run-dev-task.js");

const pollRaw = process.env.NEOTOMA_API_WATCH_POLL_INTERVAL_MS;
const pollMs = Math.min(10_000, Math.max(200, pollRaw ? Number(pollRaw) : 750));
if (Number.isNaN(pollMs)) {
  console.error("[api-watch-poll] invalid NEOTOMA_API_WATCH_POLL_INTERVAL_MS");
  process.exit(1);
}

function buildWatchPaths() {
  const paths = [path.join(REPO_ROOT, "src")];
  const openApi = path.join(REPO_ROOT, "openapi.yaml");
  if (fs.existsSync(openApi)) {
    paths.push(openApi);
  }
  const mcpDir = path.join(REPO_ROOT, "docs", "developer", "mcp");
  if (fs.existsSync(mcpDir)) {
    paths.push(mcpDir);
  }
  return paths;
}

let child = null;
let restartTimer = null;
let stopping = false;
let intentionalRestart = false;
/** Serializes kill+spawn so overlapping saves still produce one stable restart chain. */
let restartChain = Promise.resolve();

// Spawn the dev API as a process-group leader (detached:true) so that on restart
// we can SIGTERM the entire group (run-dev-task.js + with_branch_ports.js + the
// `node --import tsx src/actions.ts` server). Without this, killing only the
// immediate child orphans grandchildren under PPID=1 and they keep holding
// their bound port forever (see docs/developer/launchd_dev_servers.md).
function spawnApi() {
  const args = [runDevTaskJs, "node", "--import", "tsx", entryAbs];
  const c = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
    detached: true,
  });
  c.on("exit", (code, signal) => {
    if (stopping) {
      process.exit(typeof code === "number" ? code : 0);
      return;
    }
    if (intentionalRestart) {
      return;
    }
    if (signal === "SIGTERM" || signal === "SIGINT") {
      process.exit(typeof code === "number" ? code : 0);
      return;
    }
    process.exit(typeof code === "number" ? code : 1);
  });
  return c;
}

function killProcessGroup(pid, signal) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch (err) {
    if (err && err.code !== "ESRCH") {
      try {
        process.kill(pid, signal);
      } catch (innerErr) {
        if (innerErr && innerErr.code !== "ESRCH") {
          throw innerErr;
        }
      }
    }
  }
}

async function hardRestart(reason) {
  if (stopping || !child) {
    return;
  }
  intentionalRestart = true;
  try {
    if (process.env.NEOTOMA_DEBUG_WATCH_POLL === "1") {
      process.stderr.write(`[api-watch-poll] restart (${reason})\n`);
    }
    const prev = child;
    const prevPid = prev.pid;
    prev.removeAllListeners("exit");
    killProcessGroup(prevPid, "SIGTERM");
    await Promise.race([
      once(prev, "exit"),
      new Promise((r) => {
        setTimeout(r, 8000).unref();
      }),
    ]);
    killProcessGroup(prevPid, "SIGKILL");
    if (stopping) {
      return;
    }
    child = spawnApi();
  } finally {
    intentionalRestart = false;
  }
}

function scheduleRestart(reason) {
  if (stopping) {
    return;
  }
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartChain = restartChain
      .then(() => hardRestart(reason))
      .catch((err) => {
        console.error("[api-watch-poll] restart failed:", err);
        process.exit(1);
      });
  }, 280);
}

async function main() {
  child = spawnApi();

  const watcher = chokidar.watch(buildWatchPaths(), {
    ignoreInitial: true,
    usePolling: true,
    interval: pollMs,
    binaryInterval: pollMs + 400,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on("all", (ev, p) => {
    if (stopping) {
      return;
    }
    scheduleRestart(`${ev} ${p}`);
  });

  const shutdown = (signal) => {
    stopping = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
    }
    void watcher.close();
    if (child && !child.killed) {
      killProcessGroup(child.pid, signal);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main();
