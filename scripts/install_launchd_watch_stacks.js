#!/usr/bin/env node
/**
 * Compatibility wrapper for the old `setup:launchd-watch-stacks` flow.
 *
 * The old watch-dev/watch-full-prod plist templates were removed; the maintained
 * split is the dev HTTP agent (`dev:server`) plus the standalone LaunchAgent installed by
 * `setup:launchd-cli-sync` (label `com.neotoma.watch-build`). Keep this file so direct callers
 * get the same behavior as the npm alias.
 */
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

execSync("npm run setup:launchd-dev", { stdio: "inherit", cwd: repoRoot });
execSync("npm run setup:launchd-cli-sync", { stdio: "inherit", cwd: repoRoot });
