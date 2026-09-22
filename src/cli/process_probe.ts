/**
 * Shared bounds and classification for CLI process-inspection subprocesses
 * (`lsof`, `ps`, `netstat`, `wmic`, `pgrep`).
 *
 * A cold `lsof` can block for tens of seconds walking kernel socket state.
 * These probes are advisory — degrade with a classified status rather than hang.
 *
 * Keep the default in sync with `scripts/kill_port.js` (plain JS; cannot import
 * this module).
 */

import {
  execFileSync,
  execSync,
  type ExecFileSyncOptions,
  type ExecSyncOptions,
} from "node:child_process";

export const DEFAULT_PROCESS_PROBE_TIMEOUT_MS = 5000;

export type ProcessProbeClassification = "timed_out" | "unavailable" | "empty" | "other";

export type ProcessProbeStatus = "ok" | "timed_out" | "unavailable";

export type ProcessProbeWarningCode = "process_probe_timed_out" | "process_probe_unavailable";

export type ProcessProbeWarning = {
  code: ProcessProbeWarningCode;
  ports?: number[];
  timeout_ms: number;
};

/** Parse `NEOTOMA_PROCESS_PROBE_TIMEOUT_MS` when set to a finite positive int; else default. */
export function resolveProcessProbeTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.NEOTOMA_PROCESS_PROBE_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_PROCESS_PROBE_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    return DEFAULT_PROCESS_PROBE_TIMEOUT_MS;
  }
  return n;
}

export function isProcessProbeTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; killed?: unknown; signal?: unknown };
  if (e.code === "ETIMEDOUT") return true;
  // Node marks timed-out sync child processes with killed=true; prefer that
  // only when it is not a normal signal kill without a timeout code.
  if (e.killed === true && (e.code === "ETIMEDOUT" || e.signal === "SIGTERM")) {
    return true;
  }
  return false;
}

export function isProcessProbeUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; errno?: unknown };
  return e.code === "ENOENT" || e.errno === "ENOENT";
}

function exitStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: unknown; code?: unknown };
  if (typeof e.status === "number") return e.status;
  if (typeof e.code === "number") return e.code;
  return undefined;
}

/**
 * Classify a failed process-inspection subprocess.
 * Exit status 1 → empty (tool ran; nothing on port).
 * Timeout → timed_out. Missing binary → unavailable.
 */
export function classifyProcessProbeError(err: unknown): ProcessProbeClassification {
  if (isProcessProbeTimeoutError(err)) return "timed_out";
  if (isProcessProbeUnavailableError(err)) return "unavailable";
  const status = exitStatus(err);
  if (status === 1) return "empty";
  return "other";
}

/** Worst status across ports/tools: timed_out > unavailable > ok. */
export function mergeProcessProbeStatus(
  current: ProcessProbeStatus,
  next: ProcessProbeClassification
): ProcessProbeStatus {
  if (next === "timed_out") return "timed_out";
  if (next === "unavailable") {
    return current === "timed_out" ? "timed_out" : "unavailable";
  }
  return current;
}

export function execProcessProbeSync(
  command: string,
  options: ExecSyncOptions = {}
): string | Buffer {
  const timeout = options.timeout ?? resolveProcessProbeTimeoutMs();
  return execSync(command, { ...options, timeout });
}

export function execFileProcessProbeSync(
  file: string,
  args: readonly string[],
  options: ExecFileSyncOptions = {}
): string | Buffer {
  const timeout = options.timeout ?? resolveProcessProbeTimeoutMs();
  return execFileSync(file, args, { ...options, timeout });
}
