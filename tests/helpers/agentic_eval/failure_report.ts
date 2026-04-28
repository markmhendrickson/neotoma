/**
 * Focused failure renderer for the Tier 1 agentic-eval runner.
 *
 * Goal: a developer who breaks a hook sees one clean message per
 * failed predicate, not a SQLite dump.
 */

import type { AssertionFailure } from "./assertions.js";
import type { CapturedRequest, CellContext } from "./types.js";

export interface RenderInput {
  context: CellContext;
  failures: AssertionFailure[];
  requests: CapturedRequest[];
  snapshotPath?: string;
  snapshotDiff?: string;
}

function summarizeRequests(requests: CapturedRequest[]): string {
  const counts = new Map<string, number>();
  for (const r of requests) {
    counts.set(r.endpoint, (counts.get(r.endpoint) ?? 0) + 1);
  }
  if (counts.size === 0) return "  (no requests captured)";
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([endpoint, count]) => `  ${endpoint}: ${count}`)
    .join("\n");
}

export function renderFailureReport(input: RenderInput): string {
  const { context, failures, requests, snapshotPath, snapshotDiff } = input;
  const lines: string[] = [];
  lines.push("");
  lines.push(
    `[agentic-eval] FAIL ${context.fixture.meta.id} × ${context.harness} × ${context.model}`
  );
  lines.push("");
  for (const failure of failures) {
    const head = "predicate" in failure
      ? `[${(failure.predicate as { type?: string }).type ?? "unknown"}]`
      : "[failure]";
    lines.push(`  ${head} ${failure.message}`);
  }
  lines.push("");
  lines.push("Captured requests:");
  lines.push(summarizeRequests(requests));
  if (snapshotPath && snapshotDiff) {
    lines.push("");
    lines.push(`Snapshot diff (${snapshotPath}):`);
    lines.push(snapshotDiff);
  }
  lines.push("");
  return lines.join("\n");
}
