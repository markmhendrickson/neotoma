/** Exercise the public wrapper contract without application data or test dependencies. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const wrapper = join(projectRoot, "scripts/run_owned_reapproval_fixture.mjs");
const cases = [
  ["--original-cobro-suite", "receivable"],
  ["--case", "test_actual_native_complete_nullable_first_original_after_legacy_read"],
  ["--baseline-suite", "context", "--baseline-case", "DraftInputValues.test_dev_and_approval_refuse_same_value_foreign_winner"],
];

function fixture({ nativeScript = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "owned-reapproval-wrapper-"));
  const appRoot = join(root, "application");
  const ownedRoot = join(root, "owned");
  mkdirSync(appRoot);
  mkdirSync(join(ownedRoot, "scripts"), { recursive: true });
  mkdirSync(join(ownedRoot, "node_modules/vitest"), { recursive: true });
  copyFileSync(wrapper, join(ownedRoot, "scripts/run_owned_reapproval_fixture.mjs"));
  writeFileSync(join(appRoot, "fixture.txt"), "synthetic\n");
  if (nativeScript) {
    mkdirSync(join(appRoot, "tools"));
    writeFileSync(join(appRoot, "tools/test_reapproval_native.py"), `
import argparse
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument("--evidence", required=True)
args, _ = parser.parse_known_args()
Path(args.evidence).write_text("{}\\n")
`);
  }
  execFileSync("git", ["init", "-q"], { cwd: appRoot });
  execFileSync("git", ["add", "."], { cwd: appRoot });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Synthetic fixture"], { cwd: appRoot });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" }).trim();
  writeFileSync(join(ownedRoot, "node_modules/vitest/vitest.mjs"), `
    import { appendFileSync, statSync } from "node:fs";
    const evidence = process.env.OWNED_NATIVE_EVIDENCE;
    if (!evidence || (statSync(evidence).mode & 0o777) !== 0o600) process.exit(2);
    appendFileSync(evidence, "{}\\n");
    console.log("Tests  1 passed (1)");
  `);
  const env = {
    PATH: process.env.PATH ?? "",
    OWNED_APP_CHECKOUT: appRoot,
    OWNED_APP_EXPECTED_SHA: sha,
    OWNED_APP_PYTHON: process.execPath,
  };
  const run = (args, overrides = {}) => spawnSync(process.execPath,
    [join(ownedRoot, "scripts/run_owned_reapproval_fixture.mjs"), ...args],
    { env: { ...env, ...overrides }, encoding: "utf8" });
  return { root, appRoot, ownedRoot, sha, run, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

for (const args of cases) {
  test(`accepts only the selected contract ${args.join(" ")}`, () => {
    const fx = fixture();
    try {
      const result = fx.run(args);
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout.trim().split("\n").at(-1));
      assert.equal(output.sqlite_removed, true);
      assert.equal(output.exit_code, 0);
      assert.equal(statSync(output.evidence).mode & 0o777, 0o600);
      assert.equal(statSync(output.log).mode & 0o777, 0o600);
      assert.equal(readFileSync(output.evidence, "utf8"), "{}\n");
      assert.equal(readdirSync(join(fx.ownedRoot, ".vitest")).filter((name) => name.startsWith("owned-native-")).length, 2);
    } finally {
      fx.dispose();
    }
  });
}

test("rejects broad, typo, and extra selectors before allocation", () => {
  const fx = fixture();
  try {
    const invalid = [
      ["--baseline-suite", "context"],
      ["--baseline-suite", "context", "--baseline-case", "DraftInputValues.test_dev_and_approval_refuse_same_value_foreign_winne"],
      [...cases[2], "--omit", "safety"],
      [...cases[2], "--compatibility"],
    ];
    for (const args of invalid) {
      const result = fx.run(args);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /select one exact owned case/);
      assert.equal(existsSync(join(fx.ownedRoot, ".vitest")), false);
    }
  } finally {
    fx.dispose();
  }
});

test("rejects wrong and dirty source revisions before allocation", () => {
  const fx = fixture();
  try {
    const wrong = fx.run(cases[2], { OWNED_APP_EXPECTED_SHA: "0".repeat(40) });
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /SHA mismatch before fixture allocation/);
    assert.equal(existsSync(join(fx.ownedRoot, ".vitest")), false);
    writeFileSync(join(fx.appRoot, "fixture.txt"), "dirty\n");
    const dirty = fx.run(cases[2]);
    assert.notEqual(dirty.status, 0);
    assert.match(dirty.stderr, /must be clean before fixture allocation/);
    assert.equal(existsSync(join(fx.ownedRoot, ".vitest")), false);
  } finally {
    fx.dispose();
  }
});

test("detects and repairs a child that widens retained evidence permissions", () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.ownedRoot, "node_modules/vitest/vitest.mjs"), `
      import { chmodSync } from "node:fs";
      chmodSync(process.env.OWNED_NATIVE_EVIDENCE, 0o644);
      console.log("Tests  1 passed (1)");
    `);
    const result = fx.run(cases[2]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not an owner-only regular file/);
    const evidence = readdirSync(join(fx.ownedRoot, ".vitest"))
      .find((name) => name.startsWith("owned-native-evidence-"));
    assert.ok(evidence);
    assert.equal(statSync(join(fx.ownedRoot, ".vitest", evidence)).mode & 0o777, 0o600);
    assert.equal(readdirSync(join(fx.ownedRoot, ".vitest")).filter((name) => name.startsWith("owned-native-")).length, 2);
  } finally {
    fx.dispose();
  }
});

test("requires all generic owned-application inputs before allocation", () => {
  const fx = fixture();
  try {
    for (const name of ["OWNED_APP_CHECKOUT", "OWNED_APP_EXPECTED_SHA", "OWNED_APP_PYTHON"]) {
      const result = fx.run(cases[2], { [name]: "" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Set OWNED_APP_CHECKOUT, OWNED_APP_EXPECTED_SHA, OWNED_APP_PYTHON/);
      assert.equal(existsSync(join(fx.ownedRoot, ".vitest")), false);
    }
  } finally {
    fx.dispose();
  }
});

test("rejects an owned fixture parent writable by another account", () => {
  const fx = fixture();
  try {
    const dataRoot = join(fx.ownedRoot, ".vitest");
    mkdirSync(dataRoot);
    for (const dir of [dataRoot, fx.ownedRoot]) {
      chmodSync(dir, 0o770);
      const result = fx.run(cases[2]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /parent must be owner-held and non-writable by others/);
      assert.equal(readdirSync(dataRoot).length, 0);
      chmodSync(dir, 0o700);
    }
  } finally {
    fx.dispose();
  }
});

test("direct Vitest with a selected case refuses absent wrapper custody", () => {
  const fx = fixture();
  const dataRoot = join(projectRoot, ".vitest");
  const runDir = mkdtempSync(join(dataRoot, "owned-native-direct-"));
  try {
    const evidence = join(runDir, "evidence.private.json");
    const fd = openSync(evidence, "wx", 0o600);
    closeSync(fd);
    const result = spawnSync(process.execPath,
      [join(projectRoot, "node_modules/vitest/vitest.mjs"), "run", "tests/owned_reapproval/reapproval.test.ts", "--reporter=verbose"],
      {
        cwd: projectRoot, encoding: "utf8", timeout: 30_000, maxBuffer: 5 * 1024 * 1024,
        env: {
          PATH: process.env.PATH ?? "", NODE_ENV: "test", NEOTOMA_ENV: "test", NEOTOMA_DB_BACKEND: "sqlite",
          NEOTOMA_PROJECT_ROOT: projectRoot, NEOTOMA_DATA_DIR: dataRoot,
          NEOTOMA_SQLITE_PATH: join(runDir, "state.sqlite"), NEOTOMA_HTTP_HOST: "127.0.0.1",
          RUN_REMOTE_TESTS: "0", NEOTOMA_ALLOW_USER_ENV_IN_TEST: "0", NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
          OWNED_APP_CHECKOUT: fx.appRoot, OWNED_APP_EXPECTED_SHA: fx.sha, OWNED_APP_PYTHON: process.execPath,
          OWNED_NATIVE_ARGS: cases[2].join(" "), OWNED_NATIVE_EVIDENCE: evidence,
        },
      });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Owned wrapper custody required/);
    assert.equal(existsSync(join(runDir, "state.sqlite")), false);
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      assert.equal(existsSync(join(runDir, "state.sqlite") + suffix), false);
    }
    assert.equal(existsSync(evidence), true); // Caller-created evidence is not ours to delete.
    assert.equal(existsSync(join(fx.ownedRoot, ".vitest")), false);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
    fx.dispose();
  }
});

test("fresh forged direct custody cannot leave a native SQLite file after a passing run", () => {
  const fx = fixture({ nativeScript: true });
  const dataRoot = join(projectRoot, ".vitest");
  const runDir = mkdtempSync(join(dataRoot, "owned-native-fresh-forged-"));
  try {
    const dbPath = join(runDir, "state.sqlite");
    const evidence = join(runDir, "evidence.private.json");
    const custodyPath = join(runDir, "custody.private.json");
    const nonce = "fresh-forged-direct-custody";
    const selection = cases[2].join(" ");
    for (const path of [evidence, custodyPath]) {
      const fd = openSync(path, "wx", 0o600);
      closeSync(fd);
    }
    writeFileSync(custodyPath, JSON.stringify({
      nonce, source: fx.appRoot, expected: fx.sha, python: "python3",
      selection, dbPath, evidence,
    }));
    const result = spawnSync(process.execPath,
      [join(projectRoot, "node_modules/vitest/vitest.mjs"), "run", "tests/owned_reapproval/reapproval.test.ts", "--reporter=verbose"],
      {
        cwd: projectRoot, encoding: "utf8", timeout: 30_000, maxBuffer: 5 * 1024 * 1024,
        env: {
          PATH: process.env.PATH ?? "", NODE_ENV: "test", NEOTOMA_ENV: "test", NEOTOMA_DB_BACKEND: "sqlite",
          NEOTOMA_PROJECT_ROOT: projectRoot, NEOTOMA_DATA_DIR: dataRoot,
          NEOTOMA_SQLITE_PATH: dbPath, NEOTOMA_HTTP_HOST: "127.0.0.1",
          RUN_REMOTE_TESTS: "0", NEOTOMA_ALLOW_USER_ENV_IN_TEST: "0", NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
          OWNED_APP_CHECKOUT: fx.appRoot, OWNED_APP_EXPECTED_SHA: fx.sha, OWNED_APP_PYTHON: "python3",
          OWNED_NATIVE_ARGS: selection, OWNED_NATIVE_EVIDENCE: evidence,
          OWNED_NATIVE_CUSTODY_PATH: custodyPath, OWNED_NATIVE_CUSTODY_NONCE: nonce,
        },
      });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /1 passed/);
    assert.equal(existsSync(dbPath), false);
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      assert.equal(existsSync(dbPath + suffix), false);
    }
    assert.equal(existsSync(custodyPath), true); // Caller-created proof remains caller-owned.
    assert.equal(readFileSync(evidence, "utf8"), "{}\n");
  } finally {
    rmSync(runDir, { recursive: true, force: true });
    fx.dispose();
  }
});

test("forged direct custody cannot reuse an existing SQLite file", () => {
  const fx = fixture();
  const dataRoot = join(projectRoot, ".vitest");
  const runDir = mkdtempSync(join(dataRoot, "owned-native-forged-"));
  try {
    const dbPath = join(runDir, "state.sqlite");
    const evidence = join(runDir, "evidence.private.json");
    const custodyPath = join(runDir, "custody.private.json");
    const nonce = "forged-direct-custody";
    const selection = cases[2].join(" ");
    const prior = new Database(dbPath);
    prior.exec("CREATE TABLE prior_fixture_marker (value TEXT NOT NULL); INSERT INTO prior_fixture_marker VALUES ('untouched')");
    prior.close();
    for (const path of [evidence, custodyPath]) {
      const fd = openSync(path, "wx", 0o600);
      closeSync(fd);
    }
    writeFileSync(custodyPath, JSON.stringify({
      nonce, source: fx.appRoot, expected: fx.sha, python: process.execPath,
      selection, dbPath, evidence,
    }));
    const result = spawnSync(process.execPath,
      [join(projectRoot, "node_modules/vitest/vitest.mjs"), "run", "tests/owned_reapproval/reapproval.test.ts", "--reporter=verbose"],
      {
        cwd: projectRoot, encoding: "utf8", timeout: 30_000, maxBuffer: 5 * 1024 * 1024,
        env: {
          PATH: process.env.PATH ?? "", NODE_ENV: "test", NEOTOMA_ENV: "test", NEOTOMA_DB_BACKEND: "sqlite",
          NEOTOMA_PROJECT_ROOT: projectRoot, NEOTOMA_DATA_DIR: dataRoot,
          NEOTOMA_SQLITE_PATH: dbPath, NEOTOMA_HTTP_HOST: "127.0.0.1",
          RUN_REMOTE_TESTS: "0", NEOTOMA_ALLOW_USER_ENV_IN_TEST: "0", NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
          OWNED_APP_CHECKOUT: fx.appRoot, OWNED_APP_EXPECTED_SHA: fx.sha, OWNED_APP_PYTHON: process.execPath,
          OWNED_NATIVE_ARGS: selection, OWNED_NATIVE_EVIDENCE: evidence,
          OWNED_NATIVE_CUSTODY_PATH: custodyPath, OWNED_NATIVE_CUSTODY_NONCE: nonce,
        },
      });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Fresh SQLite allocation required/);
    const retained = new Database(dbPath, { readonly: true });
    try {
      assert.equal(retained.prepare("SELECT value FROM prior_fixture_marker").pluck().get(), "untouched");
    } finally {
      retained.close();
    }
  } finally {
    rmSync(runDir, { recursive: true, force: true });
    fx.dispose();
  }
});
