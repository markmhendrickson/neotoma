#!/usr/bin/env node
/** Refuse exact env basenames in the index, even if .gitignore was bypassed. */
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const DENIED = new Set([".env", ".env.dev", ".env.development"]);

try {
  const staged = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { encoding: "utf8" }
  );
  const denied = staged.split("\0").filter((name) => name && DENIED.has(basename(name)));
  if (denied.length) {
    console.error(`[worktree-env] staged env filename denied: ${denied.join(", ")}`);
    process.exitCode = 1;
  }
} catch {
  console.error("[worktree-env] could not inspect staged filenames; refusing commit");
  process.exitCode = 1;
}
