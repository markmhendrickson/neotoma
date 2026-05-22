/**
 * Sorted, scrubbed snapshot serializer for the Tier 1 agentic-eval
 * runner. Snapshots are written to
 * `tests/__snapshots__/agentic_eval/<scenario>__<harness>__<model>.snap.json`.
 *
 * Goals:
 *   - Stable across runs (timestamps and ids are scrubbed).
 *   - Readable in PR diffs (sorted, indented JSON).
 *   - Strictly additive scope: the snapshot is the recorded request log,
 *     so adding a new endpoint to the mock or a new write to a hook
 *     surfaces as a localized diff in one snapshot file.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { CapturedHookOutput, CapturedRequest } from "./types.js";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SNAP_DIR = join(REPO_ROOT, "tests", "__snapshots__", "agentic_eval");

const VOLATILE_KEYS = new Set([
  "computed_at",
  "last_observation_at",
  "created_at",
  "updated_at",
  "observed_at",
  "timestamp",
  "ts",
  "now",
  "_at",
]);

const ID_KEYS = new Set([
  "entity_id",
  "observation_id",
  "source_id",
  "id",
  "relationship_key",
  "session_id",
  "turn_id",
  "turnId",
  "sessionId",
  "conversation_id",
  "generation_id",
  "idempotency_key",
]);

const ENVIRONMENT_KEYS = new Set([
  "git_branch",
  "cwd",
  "repository_root",
  "repository_remote",
  "repository_name",
  "scope_summary",
  "title",
  "working_directory",
  "workspace_kind",
]);

function scrubValue(value: unknown, ctx: { idMap: Map<string, string>; nextId: { n: number } }): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    // Detect ISO timestamps.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return "<ts>";
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, ctx));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (VOLATILE_KEYS.has(key) || key.endsWith("_at")) {
      out[key] = "<ts>";
      continue;
    }
    if (ID_KEYS.has(key) && typeof v === "string") {
      let mapped = ctx.idMap.get(v);
      if (!mapped) {
        mapped = `<id:${ctx.idMap.size + 1}>`;
        ctx.idMap.set(v, mapped);
      }
      out[key] = mapped;
      continue;
    }
    if (ENVIRONMENT_KEYS.has(key) && typeof v === "string") {
      out[key] = "<env>";
      continue;
    }
    out[key] = scrubValue(v, ctx);
  }
  return out;
}

function sortRequests(requests: CapturedRequest[]): CapturedRequest[] {
  // Stable sort by (endpoint, sequence) so two cells with identical
  // request sets but different in-cell timing still snapshot the same.
  return [...requests].sort((a, b) => {
    if (a.endpoint !== b.endpoint) return a.endpoint < b.endpoint ? -1 : 1;
    return a.sequence - b.sequence;
  });
}

export function serializeSnapshot(
  requests: CapturedRequest[],
  outputs: CapturedHookOutput[]
): string {
  const ctx = { idMap: new Map<string, string>(), nextId: { n: 0 } };
  const scrubbedRequests = sortRequests(requests).map((req) => {
    return {
      method: req.method,
      endpoint: req.endpoint,
      body: scrubValue(req.body, ctx),
    };
  });
  const scrubbedOutputs = outputs
    .map((out) => ({
      hook: out.hook,
      exitCode: out.exitCode,
      output: scrubValue(out.output, ctx),
    }))
    .sort((a, b) => (a.hook < b.hook ? -1 : a.hook > b.hook ? 1 : 0));
  return JSON.stringify(
    {
      requests: scrubbedRequests,
      outputs: scrubbedOutputs,
    },
    null,
    2
  );
}

export function snapshotPath(
  scenarioId: string,
  harness: string,
  model: string
): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(SNAP_DIR, `${safe(scenarioId)}__${safe(harness)}__${safe(model)}.snap.json`);
}

export interface SnapshotResult {
  ok: boolean;
  diff?: string;
  path: string;
  expected?: string;
  actual?: string;
}

function shortDiff(expected: string, actual: string, contextLines = 3): string {
  const a = expected.split("\n");
  const b = actual.split("\n");
  const maxLen = Math.max(a.length, b.length);
  const lines: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    if (a[i] === b[i]) continue;
    const start = Math.max(0, i - contextLines);
    const end = Math.min(maxLen, i + contextLines + 1);
    for (let j = start; j < end; j++) {
      if (a[j] !== b[j]) {
        if (a[j] !== undefined) lines.push(`- ${a[j]}`);
        if (b[j] !== undefined) lines.push(`+ ${b[j]}`);
      } else if (a[j] !== undefined) {
        lines.push(`  ${a[j]}`);
      }
    }
    lines.push("...");
    i = end;
  }
  return lines.slice(0, 60).join("\n");
}

export function compareOrUpdateSnapshot(
  scenarioId: string,
  harness: string,
  model: string,
  serialized: string
): SnapshotResult {
  const file = snapshotPath(scenarioId, harness, model);
  const updateMode =
    process.env.UPDATE_AGENTIC_EVAL_SNAPSHOTS === "1" ||
    process.env.UPDATE_AGENTIC_EVAL_SNAPSHOTS === "true";
  if (updateMode) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, serialized + "\n", "utf-8");
    return { ok: true, path: file };
  }
  if (!existsSync(file)) {
    return {
      ok: false,
      path: file,
      diff: `Snapshot missing. Run with UPDATE_AGENTIC_EVAL_SNAPSHOTS=1 to create:\n  ${file}`,
      expected: "",
      actual: serialized,
    };
  }
  const expected = readFileSync(file, "utf-8").trimEnd();
  const actual = serialized.trimEnd();
  if (expected === actual) {
    return { ok: true, path: file };
  }
  return {
    ok: false,
    path: file,
    expected,
    actual,
    diff: shortDiff(expected, actual),
  };
}
