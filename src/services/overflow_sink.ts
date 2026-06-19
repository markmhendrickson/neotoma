/**
 * Overflow sink for `store()` intake mode (#1604).
 *
 * When `intake.mode === "overflow"`, the store tool bypasses graph insertion
 * and instead appends the raw payload as a JSONL line to a date-stamped file
 * under NEOTOMA_OVERFLOW_SINK. This lets agents offload bulk / uncertain
 * writes to disk without touching the graph, then replay or discard later.
 *
 * Returns an OverflowReceipt on success, or an OverflowSinkError when
 * NEOTOMA_OVERFLOW_SINK is not configured.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface OverflowReceipt {
  overflowed: true;
  sink_path: string;
  line_offset: number;
}

export interface OverflowSinkError {
  error: "OVERFLOW_SINK_NOT_CONFIGURED";
  hint: string;
}

/**
 * Append `payload` as a JSONL line to the configured overflow sink.
 *
 * Env: `NEOTOMA_OVERFLOW_SINK`
 *   - If the value ends with `.jsonl`, it is used as the exact file path.
 *   - Otherwise it is treated as a directory; a daily file
 *     `overflow-YYYY-MM-DD.jsonl` is created inside it.
 *
 * @returns OverflowReceipt with the file path and 0-based line offset,
 *          or OverflowSinkError when the env var is absent.
 */
export function writeToOverflowSink(
  payload: unknown,
  reason?: string
): OverflowReceipt | OverflowSinkError {
  const sinkEnv = process.env.NEOTOMA_OVERFLOW_SINK;
  if (!sinkEnv) {
    return {
      error: "OVERFLOW_SINK_NOT_CONFIGURED",
      hint: "Set NEOTOMA_OVERFLOW_SINK env var to an absolute directory path to enable overflow mode. Files are written as overflow-YYYY-MM-DD.jsonl. Example: NEOTOMA_OVERFLOW_SINK=/var/log/neotoma/overflow",
    };
  }

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  let sinkPath: string;

  if (sinkEnv.endsWith(".jsonl")) {
    sinkPath = sinkEnv;
    mkdirSync(path.dirname(sinkPath), { recursive: true });
  } else {
    mkdirSync(sinkEnv, { recursive: true });
    sinkPath = path.join(sinkEnv, `overflow-${dateStr}.jsonl`);
  }

  // Count existing lines to compute the line_offset before appending
  let lineOffset = 0;
  try {
    const existing = readFileSync(sinkPath, "utf8");
    lineOffset = existing.split("\n").filter(Boolean).length;
  } catch {
    // File does not exist yet — line_offset stays 0
    lineOffset = 0;
  }

  const line = JSON.stringify({
    payload,
    reason,
    overflowed_at: new Date().toISOString(),
  });
  appendFileSync(sinkPath, line + "\n", "utf8");

  return {
    overflowed: true,
    sink_path: sinkPath,
    line_offset: lineOffset,
  };
}
