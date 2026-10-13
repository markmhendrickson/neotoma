/** Run one synthetic native contract in a fresh local SQLite database. */
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.OWNED_APP_CHECKOUT;
const expected = process.env.OWNED_APP_EXPECTED_SHA;
const python = process.env.OWNED_APP_PYTHON;
const selection = process.argv.slice(2);
const allowedSelections = [
  ["--original-cobro-suite", "receivable"],
  ["--case", "test_actual_native_complete_nullable_first_original_after_legacy_read"],
  ["--baseline-suite", "context", "--baseline-case", "DraftInputValues.test_dev_and_approval_refuse_same_value_foreign_winner"],
];
const selected = allowedSelections.some((allowed) =>
  selection.length === allowed.length && selection.every((arg, index) => arg === allowed[index]));
if (!source || !expected || !/^[0-9a-f]{40}$/.test(expected) || !python ||
    !selected) {
  throw new Error("Set OWNED_APP_CHECKOUT, OWNED_APP_EXPECTED_SHA, OWNED_APP_PYTHON and select one exact owned case");
}
const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
if (actual !== expected) throw new Error("Owned application checkout SHA mismatch before fixture allocation");
if (execFileSync("git", ["status", "--porcelain"], { cwd: source, encoding: "utf8" })) {
  throw new Error("Owned application checkout must be clean before fixture allocation");
}
function assertPrivateFile(path) {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.uid !== process.getuid()) {
    throw new Error("Owned fixture evidence or log is not an owner-only regular file");
  }
  if ((stats.mode & 0o777) !== 0o600) {
    chmodSync(path, 0o600);
    throw new Error("Owned fixture evidence or log is not an owner-only regular file");
  }
}

function createPrivateFile(path, contents = "") {
  const fd = openSync(path, "wx", 0o600);
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile() || (stats.mode & 0o777) !== 0o600 || stats.uid !== process.getuid()) {
      throw new Error("Owned fixture evidence or log was not created owner-only");
    }
    if (contents) writeFileSync(fd, contents);
  } finally {
    closeSync(fd);
  }
  assertPrivateFile(path);
}

const dataRoot = join(root, ".vitest");
mkdirSync(dataRoot, { recursive: true });
const rootStats = lstatSync(dataRoot);
const parentStats = lstatSync(root);
if (!rootStats.isDirectory() || rootStats.uid !== process.getuid() ||
    (rootStats.mode & 0o022) !== 0 || realpathSync(dataRoot) !== resolve(dataRoot) ||
    !parentStats.isDirectory() || parentStats.uid !== process.getuid() ||
    (parentStats.mode & 0o022) !== 0 || realpathSync(root) !== root) {
  throw new Error("Owned fixture parent must be owner-held and non-writable by others");
}
const runDir = mkdtempSync(join(dataRoot, "owned-native-"));
const runStats = lstatSync(runDir);
if (!runStats.isDirectory() || (runStats.mode & 0o777) !== 0o700 || runStats.uid !== process.getuid()) {
  throw new Error("Owned fixture directory was not allocated owner-only");
}
const dbPath = join(runDir, "state.sqlite");
if (existsSync(dbPath)) throw new Error("Fresh SQLite path already exists");
const evidence = join(dataRoot, `owned-native-evidence-${randomUUID()}.private.json`);
if (existsSync(evidence)) throw new Error("Fresh evidence path already exists");
const log = join(dataRoot, `owned-native-log-${randomUUID()}.private.log`);
createPrivateFile(evidence);
createPrivateFile(log);
const custodyPath = join(runDir, "custody.private.json");
const custodyNonce = randomUUID();
createPrivateFile(custodyPath, JSON.stringify({
  nonce: custodyNonce, source, expected, python, selection: selection.join(" "), dbPath, evidence, log,
}));
const env = {
  PATH: process.env.PATH ?? "",
  NODE_ENV: "test", NEOTOMA_ENV: "test", NEOTOMA_DB_BACKEND: "sqlite",
  NEOTOMA_PROJECT_ROOT: root, NEOTOMA_DATA_DIR: dataRoot, NEOTOMA_SQLITE_PATH: dbPath,
  NEOTOMA_HTTP_HOST: "127.0.0.1",
  RUN_REMOTE_TESTS: "0", NEOTOMA_ALLOW_USER_ENV_IN_TEST: "0",
  NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1", ICON_GENERATION_ENABLED: "false",
  NEOTOMA_ICON_GENERATION_ENABLED: "false", OWNED_APP_CHECKOUT: source,
  OWNED_APP_EXPECTED_SHA: expected, OWNED_APP_PYTHON: python,
  OWNED_NATIVE_ARGS: selection.join(" "), OWNED_NATIVE_EVIDENCE: evidence,
  OWNED_NATIVE_CUSTODY_PATH: custodyPath, OWNED_NATIVE_CUSTODY_NONCE: custodyNonce,
  OWNED_NATIVE_OPTIMIZED: process.env.OWNED_NATIVE_OPTIMIZED === "1" ? "1" : "0",
};
let exitCode = 1;
try {
  const run = spawnSync(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"),
    "run", "tests/owned_reapproval/reapproval.test.ts", "--reporter=verbose"],
  { cwd: root, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 270_000 });
  writeFileSync(log, (run.stdout ?? "") + (run.stderr ?? ""), { flag: "w" });
  assertPrivateFile(evidence);
  assertPrivateFile(log);
  assertPrivateFile(custodyPath);
  if (run.error) throw run.error;
  exitCode = run.status ?? 1;
  const summary = (run.stdout ?? "").split("\n").filter((line) =>
    /Test Files|Tests |Duration |FAIL|Error:|No test files found/.test(line));
  console.log(summary.slice(-12).join("\n"));
} finally {
  try {
    assertPrivateFile(evidence);
    assertPrivateFile(log);
    assertPrivateFile(custodyPath);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ evidence, log, sqlite_removed: !existsSync(runDir), exit_code: exitCode }));
  process.exitCode = exitCode;
}
