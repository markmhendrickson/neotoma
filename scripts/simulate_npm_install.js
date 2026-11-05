#!/usr/bin/env node

/** Pack and test a real production consumer outside the source checkout. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const flags = new Set(process.argv.slice(2));
for (const flag of flags) {
  assert.ok(
    ["--skip-build", "--verify-controls", "--keep-temp"].includes(flag),
    `Unknown flag: ${flag}`
  );
}
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-pack-"));
const consumer = path.join(tmpRoot, "consumer");
const within = (root, file) => file === root || file.startsWith(root + path.sep);
assert.ok(
  !within(fs.realpathSync(repoRoot), fs.realpathSync(tmpRoot)),
  "Packed consumer must be outside the source checkout; choose an external TMPDIR"
);
const cleanPath = [
  path.dirname(process.execPath),
  ...(process.env.PATH ?? "")
    .split(path.delimiter)
    .filter((entry) => entry && !entry.includes("node_modules") && !within(repoRoot, entry)),
].join(path.delimiter);
fs.mkdirSync(consumer);
fs.mkdirSync(path.join(tmpRoot, "home"));
for (const name of ["user.npmrc", "global.npmrc"]) fs.writeFileSync(path.join(tmpRoot, name), "");
const env = {
  PATH: cleanPath,
  HOME: path.join(tmpRoot, "home"),
  USERPROFILE: path.join(tmpRoot, "home"),
  TMPDIR: tmpRoot,
  TMP: tmpRoot,
  TEMP: tmpRoot,
  NODE_PATH: "",
  NODE_OPTIONS: "",
  OPENAI_API_KEY: "",
  // Packing must not install Git hooks in the caller's repository.
  HUSKY: "0",
  npm_config_cache: path.join(tmpRoot, "npm-cache"),
  npm_config_userconfig: path.join(tmpRoot, "user.npmrc"),
  npm_config_globalconfig: path.join(tmpRoot, "global.npmrc"),
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
};
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(command, args, options = {}) {
  const { stdoutOnly = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: consumer,
    env,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    ...spawnOptions,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${result.error ?? ""}\n${output}`
    );
  }
  return stdoutOnly ? result.stdout : output;
}

try {
  if (!flags.has("--skip-build")) {
    run(npm, ["run", "build:server"], { cwd: repoRoot });
    run(npm, ["run", "build:inspector"], { cwd: repoRoot });
  }
  assert.ok(
    fs.existsSync(path.join(repoRoot, "dist/inspector/index.html")),
    "Build Inspector before packing"
  );
  const packOutput = run(
    npm,
    ["pack", "--json", "--ignore-scripts", "--pack-destination", tmpRoot],
    {
      cwd: repoRoot,
      stdoutOnly: true,
    }
  );
  // npm versions can emit prepare output before the JSON array, including a
  // hook-install skip message without a trailing newline.
  const jsonStart = packOutput.indexOf("[");
  assert.ok(jsonStart >= 0, "npm pack must return its JSON artifact list");
  const packed = JSON.parse(packOutput.slice(jsonStart));
  const tarball = path.join(tmpRoot, packed[0].filename);
  assert.ok(fs.existsSync(tarball));
  fs.writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "synthetic-production-consumer",
      version: "1.0.0",
      private: true,
      type: "module",
    })
  );
  const installOutput = run(npm, ["install", "--omit=dev", "--no-audit", "--no-fund", tarball], {
    env: { ...env, NODE_ENV: "production" },
  });
  process.stdout.write(installOutput);
  assert.doesNotMatch(
    installOutput,
    /deprecated\s+q@/i,
    "Install must not restore the deprecated q dependency"
  );
  run(npm, ["ls", "--omit=dev", "--all", "--json"]);
  const installedRoot = path.join(consumer, "node_modules", "neotoma");
  assert.ok(
    !fs.lstatSync(installedRoot).isSymbolicLink(),
    "Must install tarball bytes, not link the checkout"
  );
  const installed = JSON.parse(fs.readFileSync(path.join(installedRoot, "package.json")));
  const source = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json")));
  assert.deepEqual(installed.exports, source.exports);
  assert.deepEqual(installed.bin, source.bin);

  // Copy test-only files, then execute from the consumer. No source-checkout
  // import or ancestor node_modules may supply missing runtime dependencies.
  fs.copyFileSync(
    path.join(repoRoot, "tests/fixtures/packed_consumer/smoke.mjs"),
    path.join(consumer, "smoke.mjs")
  );
  fs.copyFileSync(
    path.join(repoRoot, "tests/fixtures/schema_release_gate/network.cjs"),
    path.join(tmpRoot, "network.cjs")
  );
  fs.copyFileSync(
    path.join(repoRoot, "tests/fixtures/schema_release_gate/fixture.mjs"),
    path.join(tmpRoot, "network-control.mjs")
  );
  const journals = [];
  function runtime(label) {
    const home = path.join(tmpRoot, label);
    fs.mkdirSync(home);
    const journal = path.join(home, "network-journal");
    fs.writeFileSync(journal, "");
    journals.push(journal);
    return {
      ...env,
      HOME: home,
      USERPROFILE: home,
      NODE_ENV: "test",
      NEOTOMA_ENV: "development",
      NEOTOMA_DATA_DIR: home,
      NEOTOMA_SQLITE_PATH: path.join(home, "state.db"),
      NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
      NEOTOMA_DB_BACKEND: "sqlite",
      NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "1",
      ICON_GENERATION_ENABLED: "false",
      TUNNEL_AUTO_DISCOVER: "0",
      NEOTOMA_FORCE_MODE: "refuse",
      NEOTOMA_REFUSE_MODE: "warn",
      NODE_OPTIONS: `--require=${path.join(tmpRoot, "network.cjs")}`,
      SCHEMA_GATE_NETWORK_JOURNAL: journal,
      SCHEMA_GATE_IPC_ROOT: tmpRoot,
      PACKED_CONSUMER_RESULT: path.join(home, "result.json"),
    };
  }
  const firstEnv = runtime("runtime-green");
  run(process.execPath, [path.join(tmpRoot, "network-control.mjs"), consumer, "network_control"], {
    env: firstEnv,
  });
  fs.writeFileSync(firstEnv.SCHEMA_GATE_NETWORK_JOURNAL, "");
  function smoke(label, runtimeEnv = runtime(label)) {
    run(process.execPath, ["smoke.mjs"], { env: runtimeEnv, timeout: 60_000 });
    return JSON.parse(fs.readFileSync(runtimeEnv.PACKED_CONSUMER_RESULT));
  }
  const green = smoke("initial", firstEnv);
  const bin = typeof installed.bin === "string" ? installed.bin : installed.bin.neotoma;
  assert.match(
    run(process.execPath, [path.join(installedRoot, bin), "--help"], {
      env: firstEnv,
      timeout: 30_000,
    }),
    /Usage: neotoma/
  );

  const controls = [];
  if (flags.has("--verify-controls")) {
    function breakAndRestore(file, label, expected) {
      const backup = path.join(tmpRoot, label + ".backup");
      fs.renameSync(file, backup);
      try {
        let failure;
        try {
          smoke(label);
        } catch (error) {
          failure = error;
        }
        assert.ok(failure, `${label} must fail on the broken installed artifact`);
        assert.match(String(failure), expected);
        fs.writeFileSync(path.join(tmpRoot, label + ".log"), String(failure));
        controls.push(label);
      } finally {
        fs.renameSync(backup, file);
      }
    }
    breakAndRestore(
      path.join(consumer, "node_modules", "express"),
      "missing-runtime-dependency",
      /Cannot find (?:package|module) ['"]?express|ERR_MODULE_NOT_FOUND/
    );
    breakAndRestore(
      path.join(installedRoot, "dist/inspector", green.served_assets[0]),
      "missing-inspector-asset",
      /Inspector asset/
    );
    smoke("restored");
  }
  const deniedAttempts = journals.reduce(
    (sum, journal) => sum + fs.readFileSync(journal, "utf8").split("\n").filter(Boolean).length,
    0
  );
  console.log(
    "PACKED_CONSUMER_RESULT=" +
      JSON.stringify({
        ok: true,
        installed_version: installed.version,
        tarball_sha256: createHash("sha256").update(fs.readFileSync(tarball)).digest("hex"),
        served_assets: green.served_assets,
        core_history_rows: green.history_rows,
        controls,
        network_control: true,
        runtime_denied_attempts: deniedAttempts,
        scope: "production tarball effects; explicit process exit, no natural-disposal claim",
      })
  );
} finally {
  if (flags.has("--keep-temp")) console.log("Packed consumer evidence directory: " + tmpRoot);
  else fs.rmSync(tmpRoot, { recursive: true, force: true });
}
