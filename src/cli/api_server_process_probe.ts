/**
 * Enumerate Neotoma API server processes on candidate ports with bounded probes.
 */

import type { ExecSyncOptions } from "node:child_process";

import { CANDIDATE_API_PORTS } from "./config.js";
import {
  classifyProcessProbeError,
  execProcessProbeSync,
  mergeProcessProbeStatus,
  resolveProcessProbeTimeoutMs,
  type ProcessProbeStatus,
  type ProcessProbeWarning,
} from "./process_probe.js";

export type NeotomaApiProcessRow = {
  pid: number;
  port: number;
  command: string;
  label: string;
};

export type ListNeotomaServerProcessesResult = {
  processes: NeotomaApiProcessRow[];
  probe_status: ProcessProbeStatus;
  warnings?: ProcessProbeWarning[];
};

export type ProcessProbeExecSync = (command: string, options?: ExecSyncOptions) => string | Buffer;

function labelForPort(p: number): string {
  return p === 3180 ? "prod" : p === 3080 ? "dev" : String(p);
}

function pushWarning(
  warnings: ProcessProbeWarning[],
  code: ProcessProbeWarning["code"],
  port: number,
  timeoutMs: number
): void {
  const existing = warnings.find((w) => w.code === code);
  if (existing) {
    if (!existing.ports) existing.ports = [port];
    else if (!existing.ports.includes(port)) existing.ports.push(port);
    return;
  }
  warnings.push({ code, ports: [port], timeout_ms: timeoutMs });
}

/**
 * List Neotoma API server processes (listening on candidate ports).
 * Uses lsof (Unix) or netstat (Windows). Not limited to this CLI instance.
 *
 * Timeout / missing-tool must not present as an unqualified empty success:
 * callers surface `probe_status` and optional `warnings`.
 */
export function listNeotomaServerProcesses(
  deps: {
    execSync?: ProcessProbeExecSync;
    platform?: NodeJS.Platform;
    ports?: readonly number[];
  } = {}
): ListNeotomaServerProcessesResult {
  const run = deps.execSync ?? execProcessProbeSync;
  const platform = deps.platform ?? process.platform;
  const ports = deps.ports ?? CANDIDATE_API_PORTS;
  const timeoutMs = resolveProcessProbeTimeoutMs();
  const rows: NeotomaApiProcessRow[] = [];
  let probeStatus: ProcessProbeStatus = "ok";
  const warnings: ProcessProbeWarning[] = [];

  const noteProbeError = (err: unknown, port: number): void => {
    const classification = classifyProcessProbeError(err);
    probeStatus = mergeProcessProbeStatus(probeStatus, classification);
    if (classification === "timed_out") {
      pushWarning(warnings, "process_probe_timed_out", port, timeoutMs);
    } else if (classification === "unavailable") {
      pushWarning(warnings, "process_probe_unavailable", port, timeoutMs);
    }
  };

  if (platform === "win32") {
    for (const port of ports) {
      try {
        const out = String(
          run(`netstat -ano | findstr :${port}`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: timeoutMs,
          })
        );
        const pids = new Set<number>();
        for (const line of out.split("\n")) {
          if (!line.includes(`:${port}`)) continue;
          const parts = line.trim().split(/\s+/);
          const last = parts[parts.length - 1];
          if (last && /^\d+$/.test(last)) {
            const pid = parseInt(last, 10);
            if (pid > 0) pids.add(pid);
          }
        }
        for (const pid of pids) {
          let cmd = "";
          try {
            const wmic = String(
              run(`wmic process where processid=${pid} get commandline /format:list`, {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
                timeout: timeoutMs,
              })
            );
            const cm = wmic.match(/CommandLine=(.+)/);
            cmd = cm ? cm[1].trim().replace(/\r?\n/g, " ").slice(0, 120) : "";
          } catch (err) {
            const classification = classifyProcessProbeError(err);
            if (classification === "timed_out" || classification === "unavailable") {
              noteProbeError(err, port);
            }
            cmd = "(unknown)";
          }
          rows.push({ pid, port, command: cmd || "(unknown)", label: labelForPort(port) });
        }
      } catch (err) {
        const classification = classifyProcessProbeError(err);
        if (classification === "empty") continue;
        noteProbeError(err, port);
      }
    }
  } else {
    for (const port of ports) {
      try {
        const pidsOut = String(
          run(`lsof -i :${port} -n -P -t`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: timeoutMs,
          })
        );
        const pids = pidsOut
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((s) => parseInt(s, 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        for (const pid of pids) {
          let command = "";
          try {
            command = String(
              run(`ps -p ${pid} -o command=`, {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
                timeout: timeoutMs,
              })
            )
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 100);
          } catch (err) {
            const classification = classifyProcessProbeError(err);
            if (classification === "timed_out" || classification === "unavailable") {
              noteProbeError(err, port);
            }
            command = "(unknown)";
          }
          rows.push({
            pid,
            port,
            command: command || "(unknown)",
            label: labelForPort(port),
          });
        }
      } catch (err) {
        const classification = classifyProcessProbeError(err);
        if (classification === "empty") continue;
        noteProbeError(err, port);
      }
    }
  }

  return {
    processes: rows,
    probe_status: probeStatus,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** Detect MCP stdio server processes; advisory count, 0 on timeout/unavailable. */
export function detectNeotomaMcpStdioProcessCount(
  deps: {
    execSync?: ProcessProbeExecSync;
    platform?: NodeJS.Platform;
    pid?: number;
  } = {}
): number {
  const platform = deps.platform ?? process.platform;
  if (platform === "win32") return 0;
  const run = deps.execSync ?? execProcessProbeSync;
  const selfPid = deps.pid ?? process.pid;
  const timeoutMs = resolveProcessProbeTimeoutMs();
  try {
    const out = String(
      run('pgrep -f "run_neotoma_mcp_stdio"', {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: timeoutMs,
      })
    );
    const pids = out
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== selfPid);
    return pids.length;
  } catch {
    return 0;
  }
}
