#!/usr/bin/env node

import fs from "fs";
import path from "path";

const resourcesFile = path.resolve(process.cwd(), ".dev-serve", "dev-resources.txt");
const args = new Set(process.argv.slice(2));
const delayMs = Number(process.env.DEV_RESOURCES_DELAY_MS || "4000");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForResourceFile(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (!fs.existsSync(resourcesFile)) {
    if (Date.now() - startedAt > timeoutMs) {
      return false;
    }
    await sleep(100);
  }
  return true;
}

async function main() {
  if (args.has("--watch")) {
    await sleep(delayMs);
    const exists = await waitForResourceFile();
    if (!exists) {
      console.error(
        "No dev resource block found yet. Start npm run watch:full or npm run watch:full:prod first.",
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(fs.readFileSync(resourcesFile, "utf-8"));
    // Keep the concurrently lane alive so the resources block remains part of the
    // active watch session instead of only appearing in scrollback.
    setInterval(() => {}, 60 * 60 * 1000);
    return;
  }

  if (!fs.existsSync(resourcesFile)) {
    console.error(
      "No dev resource block found yet. Start npm run watch:full or npm run watch:full:prod first.",
    );
    process.exit(1);
  }

  process.stdout.write(fs.readFileSync(resourcesFile, "utf-8"));
}

main();
