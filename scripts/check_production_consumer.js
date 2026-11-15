#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const tarballName = `${packageJson.name}-${packageJson.version}.tgz`;
const tarballPath = path.join(repoRoot, tarballName);
const frontendBuildOnlyDependencyPatterns = [
  /^@hookform\/resolvers$/,
  /^@radix-ui\//,
  /^@sqlite\.org\/sqlite-wasm$/,
  /^@tanstack\/react-table$/,
  /^@types\/react-syntax-highlighter$/,
  /^class-variance-authority$/,
  /^clsx$/,
  /^cmdk$/,
  /^idb-keyval$/,
  /^lucide-react$/,
  /^next-themes$/,
  /^papaparse$/,
  /^react(?:$|-)/,
  /^sonner$/,
  /^tailwind-merge$/,
  /^tailwindcss-animate$/,
  /^turndown(?:$|-)/,
  /^typewriter-effect$/,
];

function assertNoFrontendBuildDependencies(manifest) {
  const leakedDependencies = Object.keys(manifest.dependencies ?? {})
    .filter((name) => frontendBuildOnlyDependencyPatterns.some((pattern) => pattern.test(name)))
    .sort();
  if (leakedDependencies.length > 0) {
    throw new Error(
      `Frontend build-only packages leaked into production dependencies:\n${leakedDependencies.join("\n")}`
    );
  }
}

export function assertNoFrontendBuildDependenciesInTree(tree) {
  const leakedPaths = [];

  function visit(node, dependencyPath) {
    for (const [key, dependency] of Object.entries(node.dependencies ?? {}).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const name = dependency.name ?? key;
      const nextPath = [...dependencyPath, name];
      if (frontendBuildOnlyDependencyPatterns.some((pattern) => pattern.test(name))) {
        leakedPaths.push(nextPath.join(" > "));
      }
      visit(dependency, nextPath);
    }
  }

  visit(tree, [tree.name ?? "consumer"]);
  if (leakedPaths.length > 0) {
    throw new Error(
      `Frontend build-only packages leaked into the installed production tree:\n${leakedPaths.join("\n")}`
    );
  }
}

function isolatedEnv(dataDir, extra = {}) {
  const env = { ...process.env };
  for (const key of [
    "NEOTOMA_ENV",
    "NEOTOMA_BEARER_TOKEN",
    "NEOTOMA_BASE_URL",
    "NEOTOMA_MCP_USE_LOCAL_PORT_FILE",
    "OPENAI_API_KEY",
  ]) {
    delete env[key];
  }
  return {
    ...env,
    NEOTOMA_DATA_DIR: dataDir,
    ...extra,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: "pipe",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}\n${output}`);
  }
  if (!options.quiet) process.stdout.write(output);
  return result.stdout ?? "";
}

async function waitForServer(child, portFile, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Installed server exited before becoming healthy.\n${output()}`);
    }
    if (fs.existsSync(portFile)) {
      const port = Number.parseInt(fs.readFileSync(portFile, "utf8").trim(), 10);
      if (Number.isInteger(port) && port > 0) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`);
          if (response.ok) return;
        } catch {
          // The listener may have written the port file before accepting requests.
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Installed server did not become healthy within 15 seconds.\n${output()}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) =>
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 5_000)
    ),
  ]);
}

async function main() {
  assertNoFrontendBuildDependencies(packageJson);

  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-consumer-"));
  const dataDir = path.join(consumerDir, "data");
  const portFile = path.join(consumerDir, "server-port");
  let server;
  let serverOutput = "";

  try {
    fs.rmSync(tarballPath, { force: true });
    fs.writeFileSync(
      path.join(consumerDir, "package.json"),
      JSON.stringify({ name: "neotoma-production-consumer", private: true }, null, 2)
    );
    fs.mkdirSync(dataDir, { recursive: true });

    console.log("Packing Neotoma with its prebuilt Inspector...");
    run("npm", ["run", "pack:local"], {
      env: isolatedEnv(dataDir),
    });
    if (!fs.existsSync(tarballPath)) {
      throw new Error(`Expected tarball was not created: ${tarballPath}`);
    }

    console.log("Installing packed Neotoma with production dependencies only...");
    run("npm", ["install", "--omit=dev", "--prefer-offline", "--no-audit", "--no-fund", tarballPath], {
      cwd: consumerDir,
      env: isolatedEnv(dataDir),
    });
    const installedManifest = JSON.parse(
      fs.readFileSync(
        path.join(consumerDir, "node_modules", packageJson.name, "package.json"),
        "utf8"
      )
    );
    assertNoFrontendBuildDependencies(installedManifest);
    const productionTree = JSON.parse(
      run("npm", ["ls", "--omit=dev", "--all", "--json"], {
        cwd: consumerDir,
        env: isolatedEnv(dataDir),
        quiet: true,
      })
    );
    assertNoFrontendBuildDependenciesInTree(productionTree);

    console.log("Running the installed neotoma --help...");
    const binary = path.join(
      consumerDir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "neotoma.cmd" : "neotoma"
    );
    run(binary, ["--help"], {
      cwd: consumerDir,
      env: isolatedEnv(dataDir),
    });

    console.log("Importing the installed public library entry point...");
    run(
      process.execPath,
      ["--input-type=module", "-e", 'await import("neotoma"); process.exit(0);'],
      {
        cwd: consumerDir,
        env: isolatedEnv(dataDir),
      }
    );

    console.log("Starting the installed HTTP server on an ephemeral loopback port...");
    server = spawn(
      process.execPath,
      [fs.realpathSync(path.join(consumerDir, "node_modules", "neotoma", "dist", "actions.js"))],
      {
        cwd: consumerDir,
        env: isolatedEnv(dataDir, {
          HTTP_PORT: "0",
          NEOTOMA_HTTP_HOST: "127.0.0.1",
          NEOTOMA_SESSION_PORT_FILE: portFile,
        }),
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    server.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    await waitForServer(server, portFile, () => serverOutput);
    console.log("Installed server reached /health.");
  } finally {
    if (server) await stopServer(server);
    fs.rmSync(consumerDir, { recursive: true, force: true });
    fs.rmSync(tarballPath, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
