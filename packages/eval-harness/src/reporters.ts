/**
 * Reporters for the Tier 2 eval harness.
 *
 * - tty: human-readable per-cell ✓/✗ with the failing assertion message.
 * - json: structured cell list (for Tier 3 ingestion).
 * - junit: XML so CI surfaces (e.g. GitHub Actions test report) light up.
 */

import type { RunSummary, CellReport } from "./types.js";

function symbol(cell: CellReport): string {
  if (cell.skipped) return "·";
  return cell.pass ? "✓" : "✗";
}

export function renderTty(summary: RunSummary): string {
  const lines: string[] = [];
  lines.push(`# neotoma-eval — ${summary.mode.toUpperCase()} mode`);
  lines.push("");
  for (const cell of summary.cells) {
    const head = `${symbol(cell)} ${cell.scenario.id} | ${cell.model.provider}/${cell.model.model} | profile=${cell.effectiveProfile}`;
    lines.push(head);
    if (cell.skipped) {
      lines.push(`    skipped: ${cell.skipped.reason}`);
    } else if (!cell.pass) {
      const msg = (cell.errorMessage ?? "")
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n");
      lines.push(msg);
    } else if (cell.driverResult) {
      lines.push(
        `    ${cell.driverResult.toolCalls.length} tool calls in ${cell.driverResult.elapsedMs}ms${
          cell.driverResult.estimatedCostUsd > 0 ? ` (~$${cell.driverResult.estimatedCostUsd.toFixed(4)})` : ""
        }`
      );
    }
  }
  lines.push("");
  lines.push(
    `total=${summary.total}  passed=${summary.passed}  failed=${summary.failed}  skipped=${summary.skipped}  spend≈$${summary.estimatedCostUsd.toFixed(4)}`
  );
  return lines.join("\n");
}

export function renderJson(summary: RunSummary): string {
  return JSON.stringify(summary, null, 2);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderJunit(summary: RunSummary): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<testsuites name="neotoma-eval" tests="${summary.total}" failures="${summary.failed}" skipped="${summary.skipped}">`
  );
  lines.push(
    `  <testsuite name="tier2" tests="${summary.total}" failures="${summary.failed}" skipped="${summary.skipped}">`
  );
  for (const cell of summary.cells) {
    const name = `${cell.scenario.id} (${cell.model.provider}/${cell.model.model}, profile=${cell.effectiveProfile})`;
    const time = cell.driverResult ? (cell.driverResult.elapsedMs / 1000).toFixed(3) : "0";
    lines.push(`    <testcase name="${escapeXml(name)}" classname="${escapeXml(cell.scenario.id)}" time="${time}">`);
    if (cell.skipped) {
      lines.push(`      <skipped message="${escapeXml(cell.skipped.reason)}"/>`);
    } else if (!cell.pass) {
      lines.push(
        `      <failure message="${escapeXml((cell.errorMessage ?? "assertion failed").split("\n")[0])}"><![CDATA[\n${cell.errorMessage ?? ""}\n]]></failure>`
      );
    }
    lines.push(`    </testcase>`);
  }
  lines.push(`  </testsuite>`);
  lines.push(`</testsuites>`);
  return lines.join("\n");
}

export function render(summary: RunSummary, reporter: "tty" | "json" | "junit"): string {
  switch (reporter) {
    case "json":
      return renderJson(summary);
    case "junit":
      return renderJunit(summary);
    case "tty":
    default:
      return renderTty(summary);
  }
}
