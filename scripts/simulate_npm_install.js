#!/usr/bin/env node

/**
 * Simulate npm install before publishing.
 *
 * 1. Builds the package (build:server)
 * 2. Runs npm pack to create the tarball that would be published
 * 3. Installs that tarball in a temporary directory (as a consumer would)
 * 4. Runs the installed binary (npx neotoma --help) to verify it works
 * 5. Cleans up
 *
 * Run before `npm publish` to catch pack/list/postinstall issues.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  const cwd = opts.cwd ?? repoRoot;
  execSync(cmd, { cwd, stdio: "inherit", ...opts });
}

function main() {
  let tarballPath = null;
  let tmpDir = null;

  try {
    console.log("Step 1: Building package...");
    run("npm run build:server");

    console.log("\nStep 2: Creating pack tarball...");
    const packStdout = execSync("npm pack", {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const filename = packStdout.trim().split("\n").pop();
    if (!filename?.endsWith(".tgz")) {
      throw new Error("npm pack did not output tarball filename");
    }
    tarballPath = path.join(repoRoot, filename);
    if (!fs.existsSync(tarballPath)) {
      throw new Error(`Tarball not found: ${tarballPath}`);
    }

    tmpDir = fs.mkdtempSync(path.join(repoRoot, "tmp-pack-test-"));
    console.log("\nStep 3: Installing tarball in temp dir:", tmpDir);

    run("npm init -y", { cwd: tmpDir });
    run(`npm install "${tarballPath}"`, { cwd: tmpDir });

    console.log("\nStep 4: Verifying installed binary...");
    run("npx neotoma --help", { cwd: tmpDir });

    console.log("\nSimulate install passed. Package would install and run correctly.");
  } finally {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    if (tarballPath && fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
  }
}

main();
