#!/usr/bin/env node
/** List possible stale env copies across linked worktrees; never read their contents. */
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { join } from "node:path";

const BASENAMES = [".env", ".env.dev", ".env.development"];

try {
  const inventory = execFileSync("git", ["worktree", "list", "--porcelain", "-z"], {
    encoding: "utf8",
  });
  let count = 0;
  for (const record of inventory.split("\0")) {
    if (!record.startsWith("worktree ")) continue;
    const root = record.slice("worktree ".length);
    for (const name of BASENAMES) {
      const candidate = join(root, name);
      try {
        const stat = lstatSync(candidate);
        if (!stat.isFile() && !stat.isSymbolicLink()) continue;
        console.log(candidate);
        count += 1;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  if (!count) console.log("No worktree env files found.");
} catch {
  console.error("[worktree-env] could not list worktree env paths");
  process.exitCode = 1;
}
