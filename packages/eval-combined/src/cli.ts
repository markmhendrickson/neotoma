#!/usr/bin/env node
/**
 * Combined eval CLI — runs both WRIT (state layer) and Tier 2 (agent
 * layer) benchmarks against a shared isolated Neotoma server, then
 * produces a layered coverage matrix.
 *
 * Usage:
 *   npx tsx packages/eval-combined/src/cli.ts run [options]
 *
 * Options:
 *   --mode <replay|record>     Driver mode for Tier 2 (default: replay)
 *   --categories <c1,c2,...>   Filter WRIT categories (comma-separated)
 *   --output <tty|json|md>     Report format (default: tty)
 *   --tier2-only               Skip WRIT, run only Tier 2
 *   --writ-only                Skip Tier 2, run only WRIT
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCombined, type CombinedOptions } from "./runner.js";
import { renderCombinedReport } from "./report.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

function parseArgs(argv: string[]): CombinedOptions & { output: "tty" | "json" | "md" } {
  const opts: CombinedOptions & { output: "tty" | "json" | "md" } = {
    repoRoot: REPO_ROOT,
    mode: "replay",
    output: "tty",
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--mode":
        opts.mode = argv[++i] as "replay" | "record";
        break;
      case "--categories":
        opts.writCategories = argv[++i]?.split(",");
        break;
      case "--output":
        opts.output = argv[++i] as "tty" | "json" | "md";
        break;
      case "--tier2-only":
        opts.tier2Only = true;
        break;
      case "--writ-only":
        opts.writOnly = true;
        break;
    }
  }
  return opts;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "run") args.shift();

  const opts = parseArgs(args);
  const log = (line: string) => process.stderr.write(`${line}\n`);
  opts.log = log;

  log("[eval-combined] starting combined evaluation");
  const result = await runCombined(opts);
  const report = renderCombinedReport(result, opts.output);
  process.stdout.write(report + "\n");

  const exitCode =
    result.tier2Summary && result.tier2Summary.failed > 0 ? 1 :
    result.writReport && result.writReport.aggregate.recall_accuracy < 0.5 ? 1 :
    0;
  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`[eval-combined] fatal: ${(err as Error).message}\n`);
  process.exit(2);
});
