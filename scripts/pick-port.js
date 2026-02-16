#!/usr/bin/env node
/**
 * Find an unused port starting from the preferred port. Never kills processes.
 *
 * Usage:
 *   node scripts/pick-port.js <preferred_port>
 *     Output: port number to stdout (preferred if free, else next available).
 *   node scripts/pick-port.js <preferred_port> -- <command...>
 *     Picks port, sets HTTP_PORT in env, then runs the command (cross-platform).
 */

import { execSync, spawnSync } from "child_process";
import { platform } from "os";

function isPortInUse(port) {
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
    return true; // treat invalid as in-use so we don't return it
  }
  try {
    if (platform() === "win32") {
      execSync(`netstat -ano | findstr :${portNum}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      return true; // netstat found something
    } else {
      execSync(`lsof -ti :${portNum}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      return true; // lsof found something
    }
  } catch {
    return false; // no process on port
  }
}

function pickPort(preferred, reserved = new Set()) {
  const start = Number(preferred);
  if (!Number.isFinite(start) || start < 1 || start > 65535) {
    throw new Error(`Invalid port number: ${preferred}`);
  }
  for (let p = start; p <= 65535; p++) {
    if (reserved.has(p)) continue;
    if (!isPortInUse(p)) return p;
  }
  throw new Error(`No free port in range ${start}-65535`);
}

const DEFAULT_VAR_NAMES = ["HTTP_PORT", "VITE_PORT", "WS_PORT", "MCP_HTTP_PORT"];

function main() {
  let argv = process.argv.slice(2);
  const dashIdx = argv.indexOf("--");
  let preferredList = dashIdx >= 0 ? argv.slice(0, dashIdx) : argv;
  let runArgs = dashIdx >= 0 ? argv.slice(dashIdx + 1) : [];

  let varNames = DEFAULT_VAR_NAMES;
  const varsIdx = preferredList.indexOf("--vars");
  if (varsIdx >= 0 && preferredList[varsIdx + 1]) {
    varNames = preferredList[varsIdx + 1].split(",").map((s) => s.trim());
    preferredList = preferredList.slice(0, varsIdx).concat(preferredList.slice(varsIdx + 2));
  }

  if (preferredList.length === 0 || preferredList[0] === "") {
    console.error("Usage: node scripts/pick-port.js <port> [port ...] [--vars A,B] [-- <command...>]");
    process.exit(1);
  }

  try {
    const reserved = new Set();
    const ports = preferredList.map((pref) => {
      const p = pickPort(pref, reserved);
      reserved.add(p);
      return p;
    });

    if (runArgs.length === 0) {
      console.log(ports.length === 1 ? String(ports[0]) : ports.join("\n"));
      process.exit(0);
      return;
    }

    const env = { ...process.env };
    const names = varNames.slice(0, ports.length);
    names.forEach((name, i) => {
      env[name] = String(ports[i]);
    });
    // Quote args that contain spaces so the shell does not re-split them (preserves
    // e.g. "tsx watch src/actions.ts" and "tsc --watch" as two commands for concurrently).
    const quote = (arg) => {
      const s = String(arg);
      if (s.includes(" ") || s.includes("'") || s.includes('"')) {
        return "'" + s.replace(/'/g, "'\"'\"'") + "'";
      }
      return s;
    };
    const cmd = runArgs.map(quote).join(" ");
    const result = spawnSync(cmd, { env, stdio: "inherit", shell: true });
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error("[pick-port]", error.message);
    process.exit(1);
  }
}

main();
