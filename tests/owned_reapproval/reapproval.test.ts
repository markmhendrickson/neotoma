/** An explicitly selected, synthetic application contract against owned native state. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { config } from "../../src/config.js";
import { app } from "../../src/actions.js";
import { LOCAL_DEV_USER_ID as owner } from "../../src/services/local_auth.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dataRoot = join(root, ".vitest");
const dbPath = process.env.NEOTOMA_SQLITE_PATH;
const checkout = process.env.OWNED_APP_CHECKOUT;
const expectedSha = process.env.OWNED_APP_EXPECTED_SHA;
const python = process.env.OWNED_APP_PYTHON;
const evidence = process.env.OWNED_NATIVE_EVIDENCE;
const args = process.env.OWNED_NATIVE_ARGS;
const custodyPath = process.env.OWNED_NATIVE_CUSTODY_PATH;
const custodyNonce = process.env.OWNED_NATIVE_CUSTODY_NONCE;
let server: ReturnType<typeof createServer>;
let base: string;

function boundCheckout(): string {
  if (!checkout || !expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("Exact owned application checkout and SHA required");
  }
  const source = realpathSync(checkout);
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
  if (actual !== expectedSha) throw new Error("Owned application checkout SHA mismatch");
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: source, encoding: "utf8" });
  if (dirty) throw new Error("Owned application checkout must be clean");
  return join(source, "tools", "test_reapproval_native.py");
}

function assertWrapperCustody(): void {
  if (!custodyPath || !custodyNonce || !dbPath || !checkout || !expectedSha || !python || !evidence || !args) {
    throw new Error("Owned wrapper custody required");
  }
  const runDir = dirname(dbPath);
  const canonicalRoot = realpathSync(dataRoot);
  const canonicalRunDir = realpathSync(runDir);
  if (canonicalRunDir !== resolve(runDir) || !canonicalRunDir.startsWith(canonicalRoot + sep) ||
      resolve(custodyPath) !== join(canonicalRunDir, "custody.private.json")) {
    throw new Error("Owned wrapper custody required");
  }
  const runStats = lstatSync(runDir);
  const proofStats = lstatSync(custodyPath);
  if (!runStats.isDirectory() || (runStats.mode & 0o777) !== 0o700 || runStats.uid !== process.getuid() ||
      !proofStats.isFile() || (proofStats.mode & 0o777) !== 0o600 || proofStats.uid !== process.getuid()) {
    throw new Error("Owned wrapper custody required");
  }
  const proof = JSON.parse(readFileSync(custodyPath, "utf8")) as Record<string, string>;
  if (proof.nonce !== custodyNonce || proof.source !== checkout || proof.expected !== expectedSha ||
      proof.python !== python || proof.selection !== args || proof.dbPath !== dbPath ||
      proof.evidence !== evidence) {
    throw new Error("Owned wrapper custody required");
  }
}

beforeAll(async () => {
  if (!args) return; // Ordinary discovery skips; selected runs use the isolated global-setup database.
  assertWrapperCustody();
  boundCheckout();
  if (process.env.NEOTOMA_ENV !== "test" || config.dbBackend !== "sqlite" ||
      !dbPath || !resolve(dbPath).startsWith(dataRoot + sep) ||
      !process.env.NEOTOMA_DATA_DIR || resolve(process.env.NEOTOMA_DATA_DIR) !== dataRoot ||
      resolve(config.sqlitePath) !== resolve(dbPath)) {
    throw new Error("Dedicated SQLite fixture required");
  }
  if (!python || !evidence || !resolve(evidence).startsWith(dataRoot + sep) ||
      !args || !/^(--original-cobro-suite receivable|--case test_actual_native_complete_nullable_first_original_after_legacy_read|--baseline-suite context --baseline-case DraftInputValues\.test_dev_and_approval_refuse_same_value_foreign_winner)$/.test(args)) {
    throw new Error("Owned runner selection and private evidence required");
  }
  const evidenceStats = lstatSync(evidence);
  if (!evidenceStats.isFile() || (evidenceStats.mode & 0o777) !== 0o600 || evidenceStats.uid !== process.getuid()) {
    throw new Error("Owned fixture evidence must exist as an owner-only regular file");
  }
  server = createServer((req, res) => {
    if (req.url === "/__owned_fixture_custody") {
      const db = new Database(config.sqlitePath, { readonly: true });
      const files = db.pragma("database_list") as { file: string }[];
      db.close();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ owner, actual_sqlite_path: files[0]?.file }));
      return;
    }
    app(req, res);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback server required");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((done) => server.close(() => done()));
});

it.skipIf(!args)("checks the selected application contract against isolated native SQLite", async () => {
  const script = boundCheckout();
  const child = spawn(python!, ["-B", ...(process.env.OWNED_NATIVE_OPTIMIZED === "1" ? ["-O"] : []),
    script, "--base", base, "--owner", owner, ...args!.split(" "),
    "--nonce", `owned-${process.pid}`, "--evidence", evidence!],
  { env: { PATH: process.env.PATH ?? "" }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.resume();
  const timer = setTimeout(() => child.kill("SIGKILL"), 240_000);
  const rc = await new Promise<number | null>((done) => child.once("exit", done));
  clearTimeout(timer);
  const evidenceStats = lstatSync(evidence!);
  expect(evidenceStats.isFile()).toBe(true);
  expect(evidenceStats.mode & 0o777).toBe(0o600);
  expect(evidenceStats.uid).toBe(process.getuid());
  expect(rc, stderr).toBe(0);
}, 250_000);
