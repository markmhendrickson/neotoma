/** Fixed, synthetic-only child actions for the restore eval's OS sandbox. */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { connect } from "node:net";
import fs from "node:fs/promises";
import path from "node:path";

interface Db {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): { all(): Array<{ value: string }> };
}
const require = createRequire(import.meta.url);
const DatabaseSync = (require("node:sqlite") as { DatabaseSync?: new (path: string) => Db })
  .DatabaseSync;
if (typeof DatabaseSync !== "function") throw new Error("native node:sqlite DatabaseSync required");

const root = (() => {
  const value = process.env.NEOTOMA_EVAL_FIXTURE_ROOT;
  if (!value || !path.isAbsolute(value)) throw new Error("fixed fixture root required");
  return value;
})();
const action = process.argv[2];
const allowed = new Set([
  "setup",
  "inspect",
  "probe-db",
  "probe-wal",
  "read-control",
  "network-control",
  "env-control",
  "sleep-control",
  "overflow-control",
]);
if (!allowed.has(action)) throw new Error("unknown sealed action");
const at = (...parts: string[]) => path.join(root, ...parts);
const hash = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fileHash = async (file: string) => hash(await fs.readFile(file));
const rows = (dbPath: string): string[] => {
  const db = new DatabaseSync!(dbPath);
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok")
      throw new Error("fixture integrity failed");
    return db
      .prepare("select value from eval_rows order by rowid")
      .all()
      .map((row) => row.value);
  } finally {
    db.close();
  }
};
async function writeManifest(dir: string, wal: boolean): Promise<void> {
  const contents: Record<string, string> = { neotoma_db: "neotoma.db" };
  const checksums: Record<string, string> = {
    "neotoma.db": await fileHash(path.join(dir, "neotoma.db")),
  };
  if (wal) {
    contents.wal = "neotoma.db-wal";
    checksums[contents.wal] = await fileHash(path.join(dir, contents.wal));
  }
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({ db_snapshot_method: "file_copy", contents, checksums })
  );
}
async function copyPair(fromDb: string, toDb: string): Promise<void> {
  await fs.mkdir(path.dirname(toDb), { recursive: true });
  await fs.copyFile(fromDb, toDb);
  await fs.copyFile(`${fromDb}-wal`, `${toDb}-wal`);
}
async function checkedPair(dbFile: string, expected: string[]): Promise<void> {
  const check = at("pair-check", path.basename(path.dirname(dbFile)), "neotoma.db");
  await copyPair(dbFile, check);
  const actual = rows(check);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("closed WAL pair did not preserve rows");
}
async function setup(): Promise<Record<string, unknown>> {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  for (const name of [
    "source",
    "created_output",
    "legacy_backup",
    "target",
    "probe_db/backup",
    "probe_db/target",
    "probe_wal/backup",
    "probe_wal/target",
  ]) {
    await fs.mkdir(at(name), { recursive: true, mode: 0o700 });
  }
  const sourcePath = at("source", "neotoma.db");
  const source = new DatabaseSync!(sourcePath);
  source.exec("create table eval_rows(value text); insert into eval_rows values ('A')");
  source.close();

  const legacyTemp = at("legacy_source.db");
  const legacy = new DatabaseSync!(legacyTemp);
  legacy.exec(
    "create table eval_rows(value text); insert into eval_rows values ('A'); PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0"
  );
  legacy.exec("insert into eval_rows values ('B')");
  await copyPair(legacyTemp, at("legacy_backup", "neotoma.db"));
  legacy.close();
  const mainOnly = at("main_only.db");
  await fs.copyFile(at("legacy_backup", "neotoma.db"), mainOnly);
  if (JSON.stringify(rows(mainOnly)) !== JSON.stringify(["A"]))
    throw new Error("B was not WAL-only");
  await checkedPair(at("legacy_backup", "neotoma.db"), ["A", "B"]);
  await writeManifest(at("legacy_backup"), true);

  await fs.writeFile(at("target", "neotoma.db"), "prior-natural-db");
  await fs.writeFile(at("target", "neotoma.db-wal"), "prior-natural-wal");
  await fs.writeFile(at("target", "neotoma.db-shm"), "prior-natural-shm");
  await fs.chmod(at("target", "neotoma.db"), 0o600);
  await fs.writeFile(at("target", "unrelated.txt"), "untouched-natural-content");

  const originalDb = at("probe_db", "backup", "neotoma.db");
  await fs.copyFile(sourcePath, originalDb);
  await writeManifest(at("probe_db", "backup"), false);
  const replacementDb = at("probe_db", "replacement.db");
  const replacement = new DatabaseSync!(replacementDb);
  replacement.exec(
    "create table eval_rows(value text); insert into eval_rows values ('different-db')"
  );
  replacement.close();

  const walSourcePath = at("probe_wal", "base.db");
  const walSource = new DatabaseSync!(walSourcePath);
  walSource.exec(
    "create table eval_rows(value text); insert into eval_rows values ('A'); PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0"
  );
  walSource.exec("insert into eval_rows values ('B')");
  await copyPair(walSourcePath, at("probe_wal", "backup", "neotoma.db"));
  await writeManifest(at("probe_wal", "backup"), true);
  walSource.exec("insert into eval_rows values ('C')");
  await copyPair(walSourcePath, at("probe_wal", "replacement", "neotoma.db"));
  walSource.close();
  await checkedPair(at("probe_wal", "backup", "neotoma.db"), ["A", "B"]);
  await checkedPair(at("probe_wal", "replacement", "neotoma.db"), ["A", "B", "C"]);

  for (const name of ["probe_db", "probe_wal"]) {
    const target = at(name, "target");
    await fs.writeFile(path.join(target, "neotoma.db"), `${name}-prior-db`);
    await fs.writeFile(path.join(target, "neotoma.db-wal"), `${name}-prior-wal`);
    await fs.writeFile(path.join(target, "neotoma.db-shm"), `${name}-prior-shm`);
  }
  return {
    native: true,
    mainOnlyRows: ["A"],
    pairedRows: ["A", "B"],
    walReplacementRows: ["A", "B", "C"],
  };
}
async function inspect(): Promise<Record<string, unknown>> {
  const target = at("target");
  const sidecarsAbsent =
    !(await fs.stat(path.join(target, "neotoma.db-wal")).catch(() => null)) &&
    !(await fs.stat(path.join(target, "neotoma.db-shm")).catch(() => null));
  const mode = (await fs.stat(path.join(target, "neotoma.db"))).mode & 0o777;
  const unrelated = await fs.readFile(path.join(target, "unrelated.txt"), "utf8");
  const restoredRows = rows(path.join(target, "neotoma.db"));
  const allowedTopLevel = new Set([
    "source",
    "created_output",
    "legacy_backup",
    "target",
    "probe_db",
    "probe_wal",
    "legacy_source.db",
    "main_only.db",
    "pair-check",
    "home",
    "tmp",
  ]);
  const unexpectedWrites = (await fs.readdir(root)).some((name) => !allowedTopLevel.has(name));
  return {
    mainRow: restoredRows.includes("A"),
    walOnlyRow: restoredRows.includes("B"),
    staleSidecarsAbsentBeforeOpen: sidecarsAbsent,
    modePreserved: mode === 0o600,
    unrelatedBytesPreserved: unrelated === "untouched-natural-content",
    unexpectedWrites,
  };
}
async function probe(member: "neotoma_db" | "wal"): Promise<Record<string, unknown>> {
  const dir = member === "neotoma_db" ? "probe_db" : "probe_wal";
  const backup = at(dir, "backup");
  const target = at(dir, "target");
  const manifest = JSON.parse(await fs.readFile(path.join(backup, "manifest.json"), "utf8")) as {
    contents: Record<string, string>;
    checksums: Record<string, string>;
  };
  const sourceDb = path.join(backup, "neotoma.db");
  const sourceWal = `${sourceDb}-wal`;
  const original = member === "neotoma_db" ? rows(sourceDb) : ["A", "B"];
  const replacementPath =
    member === "neotoma_db" ? at(dir, "replacement.db") : at(dir, "replacement", "neotoma.db-wal");
  const replacementIntegrity =
    member === "neotoma_db"
      ? JSON.stringify(rows(replacementPath)) === JSON.stringify(["different-db"])
      : await checkedPair(at(dir, "replacement", "neotoma.db"), ["A", "B", "C"]).then(() => true);
  const originalIntegrity =
    JSON.stringify(original) === JSON.stringify(member === "neotoma_db" ? ["A"] : ["A", "B"]);
  const previous = await Promise.all(
    ["neotoma.db", "neotoma.db-wal", "neotoma.db-shm"].map((x) => fileHash(path.join(target, x)))
  );
  const inspection = {
    manifest,
    contents: manifest.contents,
    paths: { neotoma_db: sourceDb, ...(member === "wal" ? { wal: sourceWal } : {}) },
    issues: [],
  };
  await fs.copyFile(replacementPath, member === "neotoma_db" ? sourceDb : sourceWal);
  let caught = "";
  let published = false;
  try {
    const modulePath = new URL("../dist/cli/index.js", import.meta.url).href;
    const cli = (await import(modulePath)) as {
      restoreBackupIntoTarget: (a: string, b: string, c: unknown) => Promise<void>;
    };
    await cli.restoreBackupIntoTarget(backup, target, inspection);
    published = true;
  } catch (error) {
    caught = (error as Error).message;
  }
  const after = await Promise.all(
    ["neotoma.db", "neotoma.db-wal", "neotoma.db-shm"].map((x) => fileHash(path.join(target, x)))
  );
  const mismatchMember = caught.includes("staged database checksum mismatch")
    ? "neotoma_db"
    : caught.includes("staged WAL checksum mismatch")
      ? "wal"
      : null;
  return {
    member,
    originalIntegrity,
    replacementIntegrity,
    replacementDistinct: true,
    mismatchMember,
    priorTargetHashesUnchanged: JSON.stringify(previous) === JSON.stringify(after),
    published,
  };
}
async function networkControl(): Promise<Record<string, unknown>> {
  const port = Number(process.env.NEOTOMA_EVAL_CONTROL_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("fixed control port missing");
  const host = process.env.NEOTOMA_EVAL_CONTROL_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1" && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))
    throw new Error("fixed numeric control host required");
  return await new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve({ connected: true });
    });
    socket.once("error", (error: NodeJS.ErrnoException) =>
      resolve({ connected: false, code: error.code })
    );
    socket.setTimeout(3000, () => {
      socket.destroy();
      resolve({ connected: false, code: "TIMEOUT" });
    });
  });
}
async function main(): Promise<void> {
  let result: Record<string, unknown>;
  switch (action) {
    case "setup":
      result = await setup();
      break;
    case "inspect":
      result = await inspect();
      break;
    case "probe-db":
      result = await probe("neotoma_db");
      break;
    case "probe-wal":
      result = await probe("wal");
      break;
    case "read-control": {
      const marker = process.env.NEOTOMA_EVAL_CONTROL_MARKER;
      if (!marker) throw new Error("fixed marker missing");
      try {
        result = { read: true, value: await fs.readFile(marker, "utf8") };
      } catch (error) {
        result = { read: false, code: (error as NodeJS.ErrnoException).code };
      }
      break;
    }
    case "network-control":
      result = await networkControl();
      break;
    case "env-control":
      result = {
        inherited: [
          "OPENAI_API_KEY",
          "ANTHROPIC_API_KEY",
          "GITHUB_TOKEN",
          "GH_TOKEN",
          "DOCKER_HOST",
          "HTTP_PROXY",
          "HTTPS_PROXY",
          "NODE_OPTIONS",
          "NODE_PATH",
          "LD_PRELOAD",
          "DYLD_INSERT_LIBRARIES",
          "NEOTOMA_ALLOW_USER_ENV_IN_TEST",
        ].filter((key) => Object.hasOwn(process.env, key)),
        syntheticFixture: process.env.NEOTOMA_EVAL_FIXTURE_ROOT === root,
      };
      break;
    case "sleep-control":
      await fs.writeFile(at("sleep-started"), "synthetic-only");
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 10_000));
      result = { completed: true };
      break;
    case "overflow-control":
      process.stdout.write("X".repeat(128 * 1024));
      return;
    default:
      throw new Error("unknown sealed action");
  }
  process.stdout.write(JSON.stringify(result) + "\n");
}
main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
