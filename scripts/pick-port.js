#!/usr/bin/env node
/**
 * Find an unused port starting from the preferred port. Never kills processes.
 *
 * Usage:
 *   node scripts/pick-port.js <preferred_port>
 *     Output: port number to stdout (preferred if free, else next available).
 *   node scripts/pick-port.js <preferred_port> -- <command...>
 *     Picks port, sets HTTP_PORT in env, then runs the command (cross-platform).
 *
 *   node scripts/pick-port.js --print-resources 3080 5195 -- <command...>
 *     After picking ports, prints a resource block (URLs and env) to stderr,
 *     then runs the command so logs appear below the block.
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import { networkInterfaces, platform } from "os";
import path from "path";

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

function firstLanIPv4() {
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      const v4 = net.family === "IPv4" || net.family === 4;
      if (v4 && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

const DEV_RESOURCES_FILE = path.resolve(process.cwd(), ".dev-serve", "dev-resources.txt");

/** @param {string[]} names @param {number[]} ports */
function buildResourceBlock(names, ports) {
  const lan = firstLanIPv4();
  const width = 72;
  const rule = "─".repeat(width);
  const lines = [
    "",
    rule,
    " Dev resources (picked ports; child process logs follow this block)",
    rule,
  ];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const p = ports[i];
    let primary = `  ${name}=${p}`;
    if (name === "HTTP_PORT" || name === "VITE_PORT" || name === "MCP_HTTP_PORT") {
      primary += `    http://localhost:${p}`;
      if (lan) {
        primary += `    http://${lan}:${p}`;
      }
    }
    lines.push(primary);
  }
  const cmdHint =
    ports.length >= 3
      ? "server (API) · app (Vite) · build (tsc --watch --preserveWatchOutput)"
      : "child processes";
  lines.push(rule);
  lines.push(` ${cmdHint}`);
  lines.push(" Reprint: npm run info:dev-resources");
  lines.push(rule);
  lines.push("");
  return lines.join("\n");
}

function setTerminalTitle(names, ports) {
  const lookup = Object.fromEntries(names.map((name, i) => [name, ports[i]]));
  const parts = [
    lookup.HTTP_PORT ? `API ${lookup.HTTP_PORT}` : null,
    lookup.VITE_PORT ? `UI ${lookup.VITE_PORT}` : null,
    lookup.WS_PORT ? `WS ${lookup.WS_PORT}` : null,
    lookup.MCP_HTTP_PORT ? `MCP ${lookup.MCP_HTTP_PORT}` : null,
  ].filter(Boolean);
  if (parts.length > 0) {
    process.stderr.write(`\u001b]0;Neotoma dev: ${parts.join(" · ")}\u0007`);
  }
}

function printResourceBlock(names, ports) {
  const block = buildResourceBlock(names, ports);
  fs.mkdirSync(path.dirname(DEV_RESOURCES_FILE), { recursive: true });
  fs.writeFileSync(DEV_RESOURCES_FILE, `${block}\n`, "utf-8");
  setTerminalTitle(names, ports);
  console.error(block);
}

function main() {
  let argv = process.argv.slice(2);
  const dashIdx = argv.indexOf("--");
  let preferredList = dashIdx >= 0 ? argv.slice(0, dashIdx) : argv;
  let runArgs = dashIdx >= 0 ? argv.slice(dashIdx + 1) : [];

  let printResources = false;
  preferredList = preferredList.filter((token) => {
    if (token === "--print-resources") {
      printResources = true;
      return false;
    }
    return true;
  });

  let varNames = DEFAULT_VAR_NAMES;
  const varsIdx = preferredList.indexOf("--vars");
  if (varsIdx >= 0 && preferredList[varsIdx + 1]) {
    varNames = preferredList[varsIdx + 1].split(",").map((s) => s.trim());
    preferredList = preferredList.slice(0, varsIdx).concat(preferredList.slice(varsIdx + 2));
  }

  if (preferredList.length === 0 || preferredList[0] === "") {
    console.error(
      "Usage: node scripts/pick-port.js [--print-resources] <port> [port ...] [--vars A,B] [-- <command...>]",
    );
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
    if (printResources) {
      printResourceBlock(names, ports);
    }
    // Quote args that contain spaces so the shell does not re-split them (preserves
    // e.g. "bash scripts/run-neotoma-api-node-watch.sh" and "tsc --watch" as two commands for concurrently).
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
