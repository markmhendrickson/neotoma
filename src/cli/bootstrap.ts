#!/usr/bin/env node
/**
 * Bootstrap entry for the Neotoma CLI. Loads the user-level env file
 * (`~/.config/neotoma/.env`) so credentials reach every CLI process, then
 * parses a leading "dev" or "prod" argument to set NEOTOMA_ENV before loading
 * the main CLI and config, then forwards the rest of argv with --env injected
 * so the session uses the chosen environment.
 *
 * The user-env load happens HERE, before `./index.js` is imported, because
 * importing that module transitively loads `../config.js`, which reads
 * `process.env` at module-evaluation time. Hydrating afterwards would be too
 * late for anything config.ts captures.
 *
 * Usage: neotoma [dev|prod] [options] [command] [args...]
 * Examples: neotoma prod, neotoma dev, neotoma prod storage info
 */
import process from "node:process";

import { loadUserEnvFile } from "./user_env.js";

// Fill in credentials/base URL from ~/.config/neotoma/.env before anything
// reads process.env. Real environment variables always win (see user_env.ts).
loadUserEnvFile();

const argv = process.argv;
const first = argv[2];

async function main(): Promise<void> {
  let cliArgv: string[];
  if (first === "dev" || first === "prod") {
    process.env.NEOTOMA_ENV = first === "prod" ? "production" : "development";
    process.env.NEOTOMA_CLI_PREFERRED_ENV = first;
    const rest = argv.slice(3);
    cliArgv = [argv[0], argv[1], "--env", first, ...rest];
  } else {
    cliArgv = argv;
  }
  const { runCli, writeCliError } = await import("./index.js");
  try {
    await runCli(cliArgv);
  } catch (err: unknown) {
    writeCliError(err);
    process.exit(1);
  }
}

main();
