/**
 * Report renderer for the combined eval — layered coverage matrix in
 * TTY, JSON, or Markdown format.
 */

import type { CombinedResult, LayeredMatrixRow } from "./runner.js";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function pad(s: string, w: number): string {
  return s.padEnd(w);
}

function renderTty(result: CombinedResult): string {
  const lines: string[] = [];
  lines.push("# Layered Coverage Matrix (WRIT + Tier 2)");
  lines.push("");

  const header = [
    pad("Category", 22),
    pad("Seed Strategy", 18),
    pad("Agent Scenarios", 16),
    pad("Agent Pass%", 12),
    pad("State Scenarios", 16),
    pad("Recall", 8),
    pad("Update", 8),
    pad("Provenance", 10),
  ].join(" | ");
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (const row of result.layeredMatrix) {
    lines.push(
      [
        pad(row.category, 22),
        pad(row.seedStrategy, 18),
        pad(String(row.agentLayer.scenarios), 16),
        pad(row.agentLayer.scenarios > 0 ? pct(row.agentLayer.passRate) : "N/A", 12),
        pad(String(row.stateLayer.scenarios), 16),
        pad(row.stateLayer.scenarios > 0 ? pct(row.stateLayer.recall) : "N/A", 8),
        pad(row.stateLayer.scenarios > 0 ? pct(row.stateLayer.update) : "N/A", 8),
        pad(row.stateLayer.scenarios > 0 ? pct(row.stateLayer.provenance) : "N/A", 10),
      ].join(" | ")
    );
  }

  lines.push("");

  if (result.tier2Summary) {
    lines.push(
      `Tier 2: ${result.tier2Summary.passed}/${result.tier2Summary.total} passed, ${result.tier2Summary.failed} failed, ${result.tier2Summary.skipped} skipped`
    );
  }
  if (result.writReport) {
    lines.push(
      `WRIT: ${result.writReport.scenarios_run} scenarios, recall=${pct(result.writReport.aggregate.recall_accuracy)}, update=${pct(result.writReport.aggregate.update_fidelity)}, provenance=${pct(result.writReport.aggregate.provenance_completeness)}`
    );
  }

  return lines.join("\n");
}

function renderMarkdown(result: CombinedResult): string {
  const lines: string[] = [];
  lines.push("# Layered Coverage Matrix");
  lines.push("");
  lines.push(
    "| Category | Seed Strategy | Agent Scenarios | Agent Pass% | State Scenarios | Recall | Update | Provenance |"
  );
  lines.push(
    "|----------|--------------|-----------------|-------------|-----------------|--------|--------|------------|"
  );

  for (const row of result.layeredMatrix) {
    lines.push(
      `| ${row.category} | ${row.seedStrategy} | ${row.agentLayer.scenarios} | ${
        row.agentLayer.scenarios > 0 ? pct(row.agentLayer.passRate) : "N/A"
      } | ${row.stateLayer.scenarios} | ${
        row.stateLayer.scenarios > 0 ? pct(row.stateLayer.recall) : "N/A"
      } | ${row.stateLayer.scenarios > 0 ? pct(row.stateLayer.update) : "N/A"} | ${
        row.stateLayer.scenarios > 0 ? pct(row.stateLayer.provenance) : "N/A"
      } |`
    );
  }

  lines.push("");
  if (result.tier2Summary) {
    lines.push(
      `**Tier 2:** ${result.tier2Summary.passed}/${result.tier2Summary.total} passed`
    );
  }
  if (result.writReport) {
    lines.push(
      `**WRIT:** ${result.writReport.scenarios_run} scenarios evaluated`
    );
  }

  return lines.join("\n");
}

function renderJson(result: CombinedResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderCombinedReport(
  result: CombinedResult,
  format: "tty" | "json" | "md"
): string {
  switch (format) {
    case "json":
      return renderJson(result);
    case "md":
      return renderMarkdown(result);
    case "tty":
    default:
      return renderTty(result);
  }
}
