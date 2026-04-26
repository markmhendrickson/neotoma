#!/usr/bin/env node
/**
 * `neotoma-eval` CLI for the Tier 2 harness.
 *
 * Usage:
 *   neotoma-eval run [--scenario X] [--provider claude|openai|stub]
 *                    [--mode record|replay] [--reporter junit|json|tty]
 *                    [--max-spend-usd 1.0] [--scenarios-dir ./scenarios]
 *                    [--cassette-dir ./cassettes] [--profile full|compact|auto]
 *                    [--hooks=on|off]
 *
 * The default reporter is human-friendly TTY. Replay is the default mode
 * — record mode requires the relevant API key and is gated by the
 * budget guard.
 */

import { writeFileSync } from "node:fs";

import { loadScenariosFromDir, DEFAULT_SCENARIO_DIR } from "./scenario.js";
import { runScenarios, DEFAULT_CASSETTE_DIR } from "./runner.js";
import { render } from "./reporters.js";
import type { ProviderId, RunMode, InstructionProfile } from "./types.js";

interface ParsedArgs {
  command: string;
  scenarioFilter?: string;
  scenarioFile?: string;
  scenariosDir: string;
  cassetteDir: string;
  provider?: ProviderId;
  mode: RunMode;
  reporter: "tty" | "json" | "junit";
  maxSpendUsd: number;
  output?: string;
  profileOverride?: InstructionProfile;
  hooksOverride?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: argv[0] ?? "run",
    scenariosDir: DEFAULT_SCENARIO_DIR,
    cassetteDir: DEFAULT_CASSETTE_DIR,
    mode: "replay",
    reporter: "tty",
    maxSpendUsd: 0,
  };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--scenario":
        args.scenarioFilter = next();
        break;
      case "--scenario-file":
        args.scenarioFile = next();
        break;
      case "--scenarios-dir":
        args.scenariosDir = next();
        break;
      case "--cassette-dir":
        args.cassetteDir = next();
        break;
      case "--provider":
        args.provider = next() as ProviderId;
        break;
      case "--mode":
        args.mode = next() as RunMode;
        break;
      case "--reporter":
        args.reporter = next() as ParsedArgs["reporter"];
        break;
      case "--max-spend-usd":
        args.maxSpendUsd = parseFloat(next());
        break;
      case "--output":
      case "-o":
        args.output = next();
        break;
      case "--profile":
        args.profileOverride = next() as InstructionProfile;
        break;
      case "--hooks":
        args.hooksOverride = next() === "on";
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        // ignore positional args after the command name
        break;
    }
  }
  // Default budget: replay mode requires $0; record mode defaults to $1.
  if (args.maxSpendUsd === 0 && args.mode === "record") {
    args.maxSpendUsd = 1.0;
  }
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`neotoma-eval — Tier 2 real-LLM eval harness

Usage:
  neotoma-eval run [options]

Options:
  --scenario <id-substring>    Run only scenarios whose id contains this string.
  --scenario-file <path>       Run a single scenario YAML file directly.
  --scenarios-dir <path>       Override the scenarios root (default: package scenarios/).
  --cassette-dir <path>        Override cassette root (default: package cassettes/).
  --provider <claude|openai|stub>  Filter cells by provider.
  --mode <replay|record>       Replay (default, no network) or record (live API).
  --reporter <tty|json|junit>  Reporter format.
  --output, -o <path>          Write the rendered report to a file in addition to stdout.
  --max-spend-usd <number>     Hard cap for live spend (default: $1.00 record, $0 replay).
  --profile <full|compact|auto> Override the instruction profile across the matrix.
  --hooks <on|off>             Override hooks_enabled across the matrix.
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return;
  }
  const args = parseArgs(argv);
  if (args.command !== "run") {
    // eslint-disable-next-line no-console
    console.error(`unknown command "${args.command}". Try \`neotoma-eval run --help\`.`);
    process.exit(2);
  }
  if (args.mode === "replay" && args.maxSpendUsd > 0) {
    // eslint-disable-next-line no-console
    console.error("--max-spend-usd > 0 is incompatible with replay mode (which never hits the network).");
    process.exit(2);
  }
  let scenarios;
  if (args.scenarioFile) {
    const { loadScenarioFile } = await import("./scenario.js");
    scenarios = [loadScenarioFile(args.scenarioFile)];
  } else {
    scenarios = loadScenariosFromDir(args.scenariosDir, args.scenarioFilter);
  }
  if (scenarios.length === 0) {
    // eslint-disable-next-line no-console
    console.error(`no scenarios found in ${args.scenariosDir}${args.scenarioFilter ? ` matching "${args.scenarioFilter}"` : ""}.`);
    process.exit(2);
  }
  const summary = await runScenarios({
    scenarios,
    mode: args.mode,
    cassetteDir: args.cassetteDir,
    providerFilter: args.provider,
    profileOverride: args.profileOverride,
    hooksOverride: args.hooksOverride,
    maxSpendUsd: args.maxSpendUsd > 0 ? args.maxSpendUsd : undefined,
    log: (line) => {
      if (process.env.NEOTOMA_EVAL_VERBOSE) {
        // eslint-disable-next-line no-console
        console.error(line);
      }
    },
  });
  const rendered = render(summary, args.reporter);
  // eslint-disable-next-line no-console
  console.log(rendered);
  if (args.output) {
    writeFileSync(args.output, rendered + "\n", "utf-8");
  }
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`neotoma-eval failed: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
