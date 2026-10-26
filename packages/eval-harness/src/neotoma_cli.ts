/** Single-scenario, closed backup CLI executor. No cassette value becomes a host path or argv. */
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createRequire, builtinModules } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import ts from "typescript";
import type {
  BackupCliInput,
  BackupCliResult,
  BackupCausalProbeResult,
  BackupFixtureState,
} from "./types.js";
import type { CassetteFile } from "./cassette.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = path.join(REPO, "dist/cli/bootstrap.js");
const SEALED = path.join(REPO, "packages/eval-harness/dist/sealed_backup_eval.js");
const MAX_OUTPUT = 64 * 1024;
const OP_TIMEOUT_MS = 30_000;
const MAX_STAGE_FILES = 50_000;
const MAX_STAGE_BYTES = 512 * 1024 * 1024;
const MAX_TARBALL_BYTES = 64 * 1024 * 1024;
const builtins = new Set(builtinModules.map((item) => item.replace(/^node:/, "")));
const stagedExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".node",
  ".wasm",
  ".dat",
  ".so",
  ".dylib",
]);

export function parseBackupCliInput(input: unknown): BackupCliInput {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("neotoma_cli input must be an object");
  const value = input as Record<string, unknown>;
  const expected =
    value.operation === "create"
      ? { operation: "create", source: "source", output: "created_output" }
      : value.operation === "verify"
        ? { operation: "verify", backup: "created_backup" }
        : value.operation === "restore"
          ? { operation: "restore", backup: "legacy_backup", target: "target" }
          : null;
  if (
    !expected ||
    Object.keys(value).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, required]) => value[key] !== required)
  ) {
    throw new Error("neotoma_cli accepts only the fixed backup create/verify/restore handles");
  }
  return value as BackupCliInput;
}

export function validateBackupCassette(
  cassette: CassetteFile,
  scenario: { meta: { id: string }; user_prompt: string; system_prompt?: string }
): void {
  if (
    scenario.meta.id !== "backup_restore_cli_safety" ||
    cassette.meta.scenario_id !== scenario.meta.id ||
    cassette.meta.provider !== "stub" ||
    cassette.meta.model !== "replay-only" ||
    cassette.user_prompt !== scenario.user_prompt ||
    cassette.system_prompt !== scenario.system_prompt ||
    !Array.isArray(cassette.tool_calls) ||
    cassette.tool_calls.length !== 3
  ) {
    throw new Error("restore eval cassette identity or call count mismatch");
  }
  const operations = ["create", "verify", "restore"];
  for (const [index, call] of cassette.tool_calls.entries()) {
    if (
      !call ||
      call.name !== "neotoma_cli" ||
      call.sequence !== index ||
      Object.hasOwn(call, "output") ||
      Object.hasOwn(call, "error") ||
      parseBackupCliInput(call.input).operation !== operations[index]
    ) {
      throw new Error(
        `restore eval cassette call ${index} is not an input-only fixed CLI operation`
      );
    }
  }
}

function sha(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function packageName(specifier: string): string {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}
interface StageBudget {
  files: number;
  bytes: number;
  unpackEntries: number;
  unpackBytes: number;
  deadline: number;
}
function checkStageDeadline(budget: StageBudget): void {
  if (Date.now() > budget.deadline) throw new Error("sealed runtime staging deadline expired");
}
function checkStageAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("sealed runtime staging aborted");
}
function chargeStage(budget: StageBudget, size: number): void {
  budget.files++;
  budget.bytes += size;
  if (
    budget.files > MAX_STAGE_FILES ||
    budget.bytes > MAX_STAGE_BYTES ||
    Date.now() > budget.deadline
  )
    throw new Error("sealed runtime staging exceeded its file, byte, or time bound");
}
// This fixed worker never receives a shell command or a host path from a cassette.
// It verifies decompressed size before unpacking and limits entries as unpacking runs.
const LOCKED_ARCHIVE_WORKER = String.raw`
const fs = require("node:fs");
const zlib = require("node:zlib");
const { Writable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const [archive, destination, byteLimitText, entryLimitText, tarModule] = process.argv.slice(1);
const byteLimit = Number(byteLimitText);
const entryLimit = Number(entryLimitText);
if (!Number.isSafeInteger(byteLimit) || byteLimit < 1 ||
    !Number.isSafeInteger(entryLimit) || entryLimit < 1)
  throw new Error("invalid locked archive extraction limits");
const tar = require(tarModule);
let expandedBytes = 0;
let entries = 0;
let archiveRoot = null;
const unpackOptions = {
  cwd: destination,
  strip: 1,
  strict: true,
  preservePaths: false,
  noMtime: true,
  noChmod: true,
  filter(name, entry) {
    entries++;
    if (entries > entryLimit)
      throw new Error("locked archive entry limit exceeded");
    const parts = typeof name === "string" ? name.split("/").filter((part, index, all) =>
      part !== "" || index !== all.length - 1) : [];
    if (typeof name !== "string" || name.includes("\\") || name.includes(String.fromCharCode(0)) ||
        name.startsWith("/") || parts.length === 0 ||
        parts.some(part => part === "" || part === "." || part === "..") ||
        (parts.length === 1 && entry.type !== "Directory") ||
        (archiveRoot !== null && archiveRoot !== parts[0]) ||
        !["File", "OldFile", "Directory"].includes(entry.type) ||
        !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > byteLimit)
      throw new Error("locked archive contains an unsafe entry: " +
        String(entry.type) + " " + JSON.stringify(name).slice(0, 120));
    archiveRoot = parts[0];
    return true;
  },
};
pipeline(
  fs.createReadStream(archive),
  zlib.createGunzip(),
  new Writable({
    write(chunk, _encoding, callback) {
      expandedBytes += chunk.length;
      if (expandedBytes > byteLimit)
        callback(new Error("locked archive expanded byte limit exceeded"));
      else callback();
    },
  })
)
  .then(() => tar.x({ ...unpackOptions, file: archive }))
  .then(() => process.stdout.write(JSON.stringify({ expandedBytes, entries })))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
`;

/** Internal bounded extractor. The worker is killed and reaped before any caller cleanup. */
export async function extractLockedArchive(
  archive: string,
  destination: string,
  tarModule: string,
  limits: { bytes: number; entries: number; deadline: number },
  signal?: AbortSignal
): Promise<{ expandedBytes: number; entries: number }> {
  const remaining = limits.deadline - Date.now();
  if (remaining <= 0) throw new Error("locked archive extraction deadline expired");
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  const result = await runBounded(
    process.execPath,
    [
      "--max-old-space-size=128",
      "-e",
      LOCKED_ARCHIVE_WORKER,
      archive,
      destination,
      String(limits.bytes),
      String(limits.entries),
      tarModule,
    ],
    {
      cwd: destination,
      env: { HOME: destination, TMPDIR: destination, PATH: "/nonexistent", LANG: "C", LC_ALL: "C" },
      timeoutMs: remaining,
      signal,
    }
  );
  if (result.exitCode !== 0)
    throw new Error(`locked archive extraction failed: ${result.stderr.slice(0, 300)}`);
  const measurement: unknown = JSON.parse(result.stdout);
  if (!measurement || typeof measurement !== "object")
    throw new Error("locked archive extraction omitted its measurement");
  const { expandedBytes, entries } = measurement as Record<string, unknown>;
  if (
    !Number.isSafeInteger(expandedBytes) ||
    !Number.isSafeInteger(entries) ||
    (expandedBytes as number) > limits.bytes ||
    (entries as number) > limits.entries
  )
    throw new Error("locked archive extraction exceeded its reported limits");
  return { expandedBytes: expandedBytes as number, entries: entries as number };
}
async function removeOwnedTree(root: string, deadline: number): Promise<void> {
  let entries = 0;
  const walk = async (candidate: string): Promise<void> => {
    if (++entries > MAX_STAGE_FILES + 20_000 || Date.now() > deadline)
      throw new Error("sealed eval cleanup exceeded its entry or time bound");
    const stat = await fs.lstat(candidate).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!stat) return;
    if (stat.isDirectory()) {
      for (const name of await fs.readdir(candidate)) await walk(path.join(candidate, name));
      await fs.rmdir(candidate);
    } else await fs.unlink(candidate);
  };
  await walk(root);
}
function noSymlinkComponents(candidate: string, stop: string): void {
  const base = path.resolve(stop);
  let current = path.resolve(candidate);
  if (current !== base && !current.startsWith(base + path.sep))
    throw new Error("path escaped confinement root");
  while (current !== base) {
    const stat = fsSync.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("symlink in confined path");
    current = path.dirname(current);
  }
  if (fsSync.lstatSync(base).isSymbolicLink()) throw new Error("symlink at confinement root");
}
async function copyRegular(
  source: string,
  destination: string,
  root: string,
  budget?: StageBudget
): Promise<void> {
  noSymlinkComponents(source, root);
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.nlink !== 1)
    throw new Error("runtime source is not a unique regular file");
  if (budget) chargeStage(budget, stat.size);
  if (
    path.basename(source).startsWith(".env") ||
    /\.(?:key|pem|p12|pfx|jwk)$/i.test(source) ||
    source.split(path.sep).includes(".git")
  )
    throw new Error("private runtime file refused");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination, fsSync.constants.COPYFILE_EXCL);
  await fs.chmod(destination, stat.mode & 0o555);
  if (budget) checkStageDeadline(budget);
}
function specsFromJs(file: string, budget: StageBudget): { specs: string[]; dynamic: boolean } {
  checkStageDeadline(budget);
  if (fsSync.statSync(file).size > MAX_STAGE_BYTES - budget.bytes)
    throw new Error("compiled runtime source exceeded staging byte bound");
  const source = fsSync.readFileSync(file, "utf8");
  checkStageDeadline(budget);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const specs: string[] = [];
  let dynamic = false;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(tree) === "require")
    ) {
      if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]))
        specs.push(node.arguments[0].text);
      else dynamic = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { specs, dynamic };
}
function resolveLocalJs(from: string, specifier: string, root: string): string {
  let candidate = path.resolve(path.dirname(from), specifier);
  if (!path.extname(candidate)) candidate += ".js";
  // dist/db.js has one literal production runtime import to this tracked JS
  // script. Stage exactly that file; it finds no .env in the sealed runtime.
  const migrationScript = path.join(REPO, "scripts/run_migrations.js");
  if (!candidate.startsWith(root + path.sep) && candidate !== migrationScript) {
    throw new Error(
      `compiled import escaped build output: ${path.relative(root, from)} -> ${specifier}`
    );
  }
  if (!fsSync.existsSync(candidate)) throw new Error(`missing compiled import ${specifier}`);
  noSymlinkComponents(candidate, candidate === migrationScript ? REPO : root);
  if (candidate === migrationScript) {
    const relative = "scripts/run_migrations.js";
    const committed = execFileSync("/usr/bin/git", ["show", `HEAD:${relative}`], {
      cwd: REPO,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
    });
    if (sha(committed) !== sha(fsSync.readFileSync(candidate)))
      throw new Error("reviewed migration runtime file differs from exact HEAD");
  }
  return candidate;
}
async function stageBuiltClosure(
  runtime: string,
  budget: StageBudget,
  signal?: AbortSignal
): Promise<Set<string>> {
  const dist = path.join(REPO, "dist");
  const queue = [CLI];
  const seen = new Set<string>();
  const packages = new Set<string>();
  while (queue.length) {
    checkStageDeadline(budget);
    checkStageAbort(signal);
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const relative = path.relative(REPO, file);
    await copyRegular(file, path.join(runtime, relative), REPO, budget);
    if (!file.endsWith(".js")) continue;
    const parsed = specsFromJs(file, budget);
    // These two existing compiled modules contain optional command-specific
    // dynamic imports; neither is reached by fixed backup operations.
    if (
      parsed.dynamic &&
      !["actions.js", "services/aauth_attestation_revocation.js"].includes(
        path.relative(dist, file)
      )
    ) {
      throw new Error(`unreviewed dynamic import in ${path.relative(dist, file)}`);
    }
    for (const specifier of parsed.specs) {
      if (specifier.startsWith(".")) queue.push(resolveLocalJs(file, specifier, dist));
      else if (!specifier.startsWith("node:") && !builtins.has(specifier))
        packages.add(packageName(specifier));
    }
  }
  return packages;
}
function resolveInstalledPackage(name: string, fromDir: string): string | null {
  let cursor = fromDir;
  while (cursor.startsWith(REPO)) {
    const candidate = path.join(cursor, "node_modules", name);
    if (fsSync.existsSync(candidate)) return candidate;
    if (cursor === REPO) break;
    cursor = path.dirname(cursor);
  }
  return null;
}
async function stagePackageClosure(
  runtime: string,
  roots: Set<string>,
  scratch: string,
  budget: StageBudget,
  signal?: AbortSignal
): Promise<void> {
  checkStageDeadline(budget);
  const lockPath = path.join(REPO, "package-lock.json");
  if ((await fs.stat(lockPath)).size > 32 * 1024 * 1024)
    throw new Error("runtime lockfile exceeded staging read bound");
  const lock = JSON.parse(await fs.readFile(lockPath, { encoding: "utf8", signal })) as {
    packages: Record<string, { version?: string; integrity?: string; resolved?: string }>;
  };
  checkStageDeadline(budget);
  const npmRoot = path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm");
  const npmRequire = createRequire(path.join(npmRoot, "package.json"));
  const cacache = npmRequire("cacache") as {
    get: { stream: { byDigest(cache: string, integrity: string): Readable } };
  };
  const tarModule = npmRequire.resolve("tar");
  const npmCache =
    process.env.NEOTOMA_EVAL_NPM_CACHE ??
    process.env.npm_config_cache ??
    path.join(os.homedir(), ".npm");
  const cacheContent = path.join(npmCache, "_cacache");
  const queue = [...roots].map((name) => ({ name, from: REPO }));
  const seen = new Set<string>();
  let tarballBytes = 0;
  while (queue.length) {
    checkStageDeadline(budget);
    checkStageAbort(signal);
    const { name, from } = queue.pop()!;
    const dir = resolveInstalledPackage(name, from);
    if (!dir) throw new Error(`missing installed runtime dependency ${name}`);
    const key = path.relative(REPO, dir);
    if (seen.has(key)) continue;
    seen.add(key);
    noSymlinkComponents(dir, REPO);
    const locked = lock.packages[key];
    if (
      !locked?.version ||
      !locked.integrity?.startsWith("sha512-") ||
      !locked.resolved?.startsWith("https://registry.npmjs.org/")
    )
      throw new Error(`runtime dependency lacks a registry SHA512 lock entry: ${name}`);
    const archive = path.join(scratch, "archives", `${sha(key)}.tgz`);
    const unpacked = path.join(scratch, "unpacked", key);
    await fs.mkdir(path.dirname(archive), { recursive: true, mode: 0o700 });
    const compressedLimit = Math.min(MAX_TARBALL_BYTES, MAX_STAGE_BYTES - tarballBytes);
    if (compressedLimit <= 0) throw new Error("locked runtime archive budget exhausted");
    const archiveHash = createHash("sha512");
    let archiveBytes = 0;
    const cacheAbort = new AbortController();
    const onAbort = (): void => cacheAbort.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const cacheTimer = setTimeout(onAbort, Math.max(1, budget.deadline - Date.now()));
    try {
      await pipeline(
        cacache.get.stream.byDigest(cacheContent, locked.integrity),
        new Transform({
          transform(bytes: Buffer, _encoding, callback) {
            archiveBytes += bytes.length;
            if (archiveBytes > compressedLimit)
              callback(new Error("locked runtime archive compressed byte limit exceeded"));
            else {
              archiveHash.update(bytes);
              callback(null, bytes);
            }
          },
        }),
        createWriteStream(archive, { flags: "wx", mode: 0o600 }),
        { signal: cacheAbort.signal }
      );
    } finally {
      clearTimeout(cacheTimer);
      signal?.removeEventListener("abort", onAbort);
    }
    checkStageDeadline(budget);
    tarballBytes += archiveBytes;
    if (`sha512-${archiveHash.digest("base64")}` !== locked.integrity)
      throw new Error(`locked runtime dependency cache digest invalid: ${name}`);
    const extracted = await extractLockedArchive(
      archive,
      unpacked,
      tarModule,
      {
        bytes: MAX_STAGE_BYTES - budget.unpackBytes,
        entries: MAX_STAGE_FILES - budget.unpackEntries,
        deadline: budget.deadline,
      },
      signal
    );
    budget.unpackBytes += extracted.expandedBytes;
    budget.unpackEntries += extracted.entries;
    const manifestPath = path.join(unpacked, "package.json");
    const manifestStat = await fs.lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.nlink !== 1 || manifestStat.size > 1024 * 1024)
      throw new Error(`locked dependency manifest has unsafe type or size: ${name}`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, { encoding: "utf8", signal })) as {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    if (manifest.name !== name || manifest.version !== locked.version)
      throw new Error(`extracted dependency identity differs from lockfile: ${name}`);
    checkStageDeadline(budget);
    const destinationRoot = path.join(runtime, key);
    const walk = async (sourceDir: string): Promise<void> => {
      checkStageDeadline(budget);
      checkStageAbort(signal);
      for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
        checkStageDeadline(budget);
        checkStageAbort(signal);
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".env"))
          throw new Error(`locked dependency contains forbidden runtime entry: ${name}`);
        const source = path.join(sourceDir, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`dependency symlink refused: ${name}`);
        if (entry.isDirectory()) {
          await walk(source);
          continue;
        }
        if (!entry.isFile() || !stagedExtensions.has(path.extname(entry.name))) continue;
        await copyRegular(
          source,
          path.join(destinationRoot, path.relative(unpacked, source)),
          scratch,
          budget
        );
      }
    };
    await walk(unpacked);
    checkStageDeadline(budget);
    for (const dependency of Object.keys(manifest.dependencies ?? {}))
      queue.push({ name: dependency, from: dir });
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      if (resolveInstalledPackage(dependency, dir)) queue.push({ name: dependency, from: dir });
    }
  }
}

interface ProcessResult {
  exitCode: number;
  processId: string;
  stdout: string;
  stderr: string;
}
async function runBounded(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
    onKill?: () => void;
  }
): Promise<ProcessResult> {
  if (options.signal?.aborted) throw new Error("sandboxed process aborted before start");
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      settled = false,
      killing = false;
    const kill = (reason: string): void => {
      if (settled || killing) return;
      killing = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      failure = new Error(reason);
      try {
        options.onKill?.();
      } catch (error) {
        failure = new Error(`${reason}; cleanup failed: ${(error as Error).message}`);
      }
    };
    let failure: Error | null = null;
    const timer = setTimeout(
      () => kill("sandboxed process timed out"),
      options.timeoutMs ?? OP_TIMEOUT_MS
    );
    const onAbort = (): void => kill("sandboxed process aborted");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    child.stdout?.on("data", (bytes: Buffer) => {
      stdout += bytes.toString();
      if (Buffer.byteLength(stdout) > MAX_OUTPUT) kill("stdout limit exceeded");
    });
    child.stderr?.on("data", (bytes: Buffer) => {
      stderr += bytes.toString();
      if (Buffer.byteLength(stderr) > MAX_OUTPUT) kill("stderr limit exceeded");
    });
    child.once("error", (error) => {
      failure = error;
    });
    child.once("close", (code) => {
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (failure) reject(failure);
      else resolve({ exitCode: code ?? 1, processId: String(child.pid), stdout, stderr });
    });
  });
}

function parsedJson(result: ProcessResult): Record<string, unknown> {
  if (result.exitCode !== 0)
    throw new Error(`sandboxed child failed (${result.exitCode}): ${result.stderr.slice(0, 300)}`);
  const value: unknown = JSON.parse(result.stdout);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("sandboxed child returned non-object JSON");
  return value as Record<string, unknown>;
}
function freezeJson(value: unknown): void {
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length) {
    if (++visited > MAX_OUTPUT) throw new Error("sandboxed JSON structure exceeded freeze bound");
    const next = pending.pop();
    if (next && typeof next === "object") {
      pending.push(...Object.values(next));
      Object.freeze(next);
    }
  }
}

interface LinuxBoundary {
  host: string;
  image: string;
  configDir: string;
  contextHash: string;
}
interface LinuxRunOptions {
  markerMount?: string;
  network?: string;
}

function dockerOutput(boundary: LinuxBoundary, args: string[], timeout = 15_000): string {
  return execFileSync("/usr/bin/docker", ["--host", boundary.host, ...args], {
    encoding: "utf8",
    timeout,
    maxBuffer: MAX_OUTPUT,
    env: {
      HOME: boundary.configDir,
      DOCKER_CONFIG: boundary.configDir,
      PATH: "/usr/bin:/bin",
      LANG: "C",
      LC_ALL: "C",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function verifyLocalDocker(base: string): Promise<LinuxBoundary> {
  const configured = process.env.DOCKER_HOST;
  if (configured && !configured.startsWith("unix:///"))
    throw new Error("restore eval rejects non-Unix Docker endpoints");
  const socket = configured ? configured.slice("unix://".length) : "/var/run/docker.sock";
  if (!(await fs.lstat(socket)).isSocket())
    throw new Error("Docker endpoint is not a local socket");
  const context = process.env.DOCKER_CONTEXT;
  if (context && context !== "default")
    throw new Error("restore eval rejects non-default Docker contexts");
  if (!(await fs.lstat("/usr/bin/docker")).isFile())
    throw new Error("fixed local Docker CLI is unavailable");
  const configDir = path.join(base, "docker-config");
  await fs.mkdir(configDir, { mode: 0o700 });
  const boundary: LinuxBoundary = {
    host: `unix://${socket}`,
    image: `neotoma-eval:${randomUUID()}`,
    configDir,
    contextHash: "",
  };
  if (dockerOutput(boundary, ["info", "--format", "{{.OSType}}"]) !== "linux")
    throw new Error("local Docker daemon is not Linux");
  return boundary;
}

async function stageLinuxLibraries(
  node: string,
  contextRoot: string,
  budget: StageBudget
): Promise<void> {
  const ldd = execFileSync("/usr/bin/ldd", [node], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: MAX_OUTPUT,
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
  });
  if (ldd.includes("not found") || ldd.includes("not a dynamic executable"))
    throw new Error("installed Node 24 ELF library closure is incomplete");
  const readelf = execFileSync("/usr/bin/readelf", ["-l", node], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: MAX_OUTPUT,
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
  });
  const interpreter = readelf.match(/Requesting program interpreter:\s*([^\]]+)\]/)?.[1];
  if (!interpreter) throw new Error("installed Node 24 ELF interpreter unknown");
  const paths = new Set<string>([interpreter]);
  for (const line of ldd.split("\n")) {
    const match = line.match(/(?:=>\s*)?(\/(?:lib|lib64|usr\/lib|usr\/lib64)\/[^\s(]+)/);
    if (match) paths.add(match[1]);
    else if (line.trim() && !line.includes("linux-vdso"))
      throw new Error(`unparsed Node ELF dependency: ${line.trim().slice(0, 120)}`);
  }
  for (const source of paths) {
    if (!path.isAbsolute(source) || source.includes(".."))
      throw new Error("invalid ELF dependency path");
    const resolved = await fs.realpath(source);
    if (![/^\/lib(?:64)?\//, /^\/usr\/lib(?:64)?\//].some((rule) => rule.test(resolved)))
      throw new Error("ELF dependency escaped system library roots");
    const before = sha(await fs.readFile(resolved));
    chargeStage(budget, (await fs.stat(resolved)).size);
    const target = path.join(contextRoot, source.slice(1));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(resolved, target, fsSync.constants.COPYFILE_EXCL);
    await fs.chmod(target, 0o555);
    if (before !== sha(await fs.readFile(resolved)) || before !== sha(await fs.readFile(target)))
      throw new Error("ELF dependency changed during staging");
  }
}

export class BackupEvalSession {
  readonly fixture: string;
  readonly runtime: string;
  readonly runtimeHash: string;
  readonly boundaryId: string;
  private createdBackup: string | null = null;
  private calls = 0;
  private closed = false;
  private profile: string | null = null;
  private readonly linux: LinuxBoundary | null;
  private readonly fixtureIdentity: { dev: number; ino: number };
  private readonly deadlineAt: number;
  private readonly abortController = new AbortController();
  readonly boundaryProof: {
    fileDenied: boolean;
    networkDenied: boolean;
    weakenedFileRead: boolean;
    weakenedNetworkConnect: boolean;
  } = {
    fileDenied: false,
    networkDenied: false,
    weakenedFileRead: false,
    weakenedNetworkConnect: false,
  };
  private constructor(
    fixture: string,
    runtime: string,
    runtimeHash: string,
    linux: LinuxBoundary | null,
    deadlineAt: number
  ) {
    this.fixture = fixture;
    this.runtime = runtime;
    this.runtimeHash = runtimeHash;
    this.linux = linux;
    this.deadlineAt = deadlineAt;
    const stat = fsSync.lstatSync(fixture);
    this.fixtureIdentity = { dev: stat.dev, ino: stat.ino };
    this.boundaryId = randomUUID();
  }
  static async create(
    deadlineAt = Date.now() + 240_000,
    signal?: AbortSignal
  ): Promise<BackupEvalSession> {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-eval-")));
    await fs.chmod(base, 0o700);
    const fixture = path.join(base, "fixture");
    const runtime =
      process.platform === "linux"
        ? path.join(base, "context", "rootfs", "runtime")
        : path.join(base, "runtime");
    await fs.mkdir(fixture, { mode: 0o700 });
    await fs.mkdir(runtime, { mode: 0o700 });
    let linux: LinuxBoundary | null = null;
    try {
      const budget: StageBudget = {
        files: 0,
        bytes: 0,
        unpackEntries: 0,
        unpackBytes: 0,
        deadline: deadlineAt - 30_000,
      };
      const scratch = path.join(base, "pinned-packages");
      await fs.mkdir(scratch, { mode: 0o700 });
      const node = await fs.realpath(process.execPath);
      if (Number(process.versions.node.split(".")[0]) !== 24)
        throw new Error("restore eval requires Node 24");
      if (process.platform === "linux") linux = await verifyLocalDocker(base);
      const packages = await stageBuiltClosure(runtime, budget, signal);
      await stagePackageClosure(runtime, packages, scratch, budget, signal);
      checkStageAbort(signal);
      await removeOwnedTree(scratch, deadlineAt);
      checkStageAbort(signal);
      await copyRegular(SEALED, path.join(runtime, "eval/sealed_backup_eval.js"), REPO, budget);
      await fs.writeFile(
        path.join(runtime, "package.json"),
        JSON.stringify({ name: "neotoma", type: "module", version: "0.25.0" })
      );
      chargeStage(budget, (await fs.stat(node)).size);
      await fs.copyFile(node, path.join(runtime, "node"));
      await fs.chmod(path.join(runtime, "node"), 0o555);
      checkStageAbort(signal);
      if (linux) {
        const context = path.join(base, "context");
        await stageLinuxLibraries(node, path.join(context, "rootfs"), budget);
        await fs.writeFile(path.join(context, "Dockerfile"), "FROM scratch\nCOPY rootfs/ /\n");
        linux.contextHash = sha(
          JSON.stringify(await BackupEvalSession.hashTree(context, budget.deadline))
        );
        dockerOutput(
          linux,
          ["build", "--network=none", "--pull=false", "--quiet", "-t", linux.image, context],
          Math.max(1, Math.min(120_000, budget.deadline - Date.now()))
        );
        if (
          linux.contextHash !==
          sha(JSON.stringify(await BackupEvalSession.hashTree(context, budget.deadline)))
        )
          throw new Error("Docker build context changed during local image construction");
        if (
          !dockerOutput(linux, ["image", "inspect", linux.image, "--format", "{{.Id}}"]).startsWith(
            "sha256:"
          )
        )
          throw new Error("local image build did not yield an image id");
        checkStageAbort(signal);
      }
      const manifest = await BackupEvalSession.hashTree(runtime, budget.deadline);
      const session = new BackupEvalSession(
        fixture,
        runtime,
        sha(JSON.stringify(manifest)),
        linux,
        deadlineAt
      );
      await session.initialize();
      checkStageAbort(signal);
      return session;
    } catch (error) {
      if (linux) {
        try {
          dockerOutput(linux, ["image", "rm", "-f", linux.image]);
        } catch {
          /* not yet built */
        }
      }
      await removeOwnedTree(base, Math.min(deadlineAt, Date.now() + 30_000));
      throw error;
    }
  }
  private static async hashTree(
    root: string,
    deadline = Date.now() + OP_TIMEOUT_MS
  ): Promise<Array<[string, string]>> {
    const result: Array<[string, string]> = [];
    const walk = async (dir: string): Promise<void> => {
      if (Date.now() > deadline) throw new Error("runtime hash traversal deadline expired");
      for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        if (Date.now() > deadline || result.length > MAX_STAGE_FILES)
          throw new Error("runtime hash traversal exceeded its entry or time bound");
        const file = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) throw new Error("runtime symlink detected");
        if (entry.isDirectory()) await walk(file);
        else if (entry.isFile()) {
          if ((await fs.stat(file)).size > MAX_STAGE_BYTES)
            throw new Error("runtime hash traversal file exceeded staging byte bound");
          result.push([path.relative(root, file), sha(await fs.readFile(file))]);
          if (Date.now() > deadline) throw new Error("runtime hash traversal deadline expired");
        } else throw new Error("runtime special file detected");
      }
    };
    await walk(root);
    return result;
  }
  private async validateFixtureTree(): Promise<void> {
    const rootStat = await fs.lstat(this.fixture);
    if (
      !rootStat.isDirectory() ||
      rootStat.dev !== this.fixtureIdentity.dev ||
      rootStat.ino !== this.fixtureIdentity.ino
    )
      throw new Error("fixture root inode changed after child exit");
    const canonicalRoot = await fs.realpath(this.fixture);
    if (canonicalRoot !== this.fixture) throw new Error("fixture root changed after child exit");
    let entries = 0;
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (++entries > 20_000) throw new Error("fixture entry limit exceeded");
        const candidate = path.join(dir, entry.name);
        const stat = await fs.lstat(candidate);
        if (
          stat.isSymbolicLink() ||
          (!stat.isDirectory() && !stat.isFile()) ||
          (stat.isFile() && (stat.nlink !== 1 || stat.size > 64 * 1024 * 1024))
        ) {
          throw new Error(
            "post-child fixture contains a symlink, hardlink, special file or oversized file"
          );
        }
        const real = await fs.realpath(candidate);
        if (!real.startsWith(canonicalRoot + path.sep))
          throw new Error("post-child fixture path escaped root");
        if (stat.isDirectory()) await walk(candidate);
      }
    };
    await walk(this.fixture);
  }
  private childEnv(extra: Record<string, string> = {}): Record<string, string> {
    const data = this.childPath("source");
    return {
      NEOTOMA_ENV: "development",
      NODE_ENV: "test",
      NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
      NEOTOMA_PROJECT_ROOT: this.linux ? "/runtime" : this.runtime,
      NEOTOMA_DATA_DIR: data,
      NEOTOMA_RAW_STORAGE_DIR: this.childPath("source/sources"),
      NEOTOMA_LOGS_DIR: this.childPath("source/logs"),
      NEOTOMA_EVAL_FIXTURE_ROOT: this.linux ? "/fixture" : this.fixture,
      HOME: this.childPath("home"),
      XDG_CONFIG_HOME: this.childPath("home/config"),
      TMPDIR: this.childPath("tmp"),
      LANG: "C",
      LC_ALL: "C",
      PATH: "/nonexistent",
      ...extra,
    };
  }
  private innerPath(suffix: string): string {
    return path.join(this.fixture, suffix);
  }
  private childPath(suffix: string): string {
    return this.linux ? path.posix.join("/fixture", suffix) : this.innerPath(suffix);
  }
  private async initialize(): Promise<void> {
    for (const name of ["home/config", "tmp"])
      await fs.mkdir(this.innerPath(name), { recursive: true, mode: 0o700 });
    if (process.platform === "darwin") {
      const profile = path.join(path.dirname(this.fixture), "sandbox.sb");
      const escaped = (value: string): string => JSON.stringify(fsSync.realpathSync(value));
      const ancestors: string[] = [];
      for (let cursor = path.dirname(this.runtime); cursor !== "/"; cursor = path.dirname(cursor)) {
        ancestors.push(`(allow file-read-metadata (literal ${JSON.stringify(cursor)}))`);
      }
      const source = `(version 1)\n(deny default)\n(allow sysctl-read)\n(allow file-read* (literal "/"))\n${ancestors.join("\n")}\n(allow process-fork)\n(allow process-exec (literal ${escaped(path.join(this.runtime, "node"))}))\n(allow file-read* (subpath ${escaped(this.runtime)}))\n(allow file-read* (subpath "/usr/lib"))\n(allow file-read* (subpath "/System/Library"))\n(allow file-read* (literal "/dev/null"))\n(allow file-read* (subpath ${escaped(this.fixture)}))\n(allow file-write* (subpath ${escaped(this.fixture)}))\n(deny network*)\n`;
      await fs.writeFile(profile, source, { mode: 0o600 });
      this.profile = profile;
    } else if (!this.linux) throw new Error("verified local OS boundary unavailable");
    const setup = parsedJson(await this.runSealed("setup"));
    if (setup.native !== true) throw new Error("native fixture setup failed");
    if (this.linux) await this.verifyLinuxBoundaryControls();
    else await this.verifyMacBoundaryControls();
  }
  private async verifyMacBoundaryControls(): Promise<void> {
    if (!this.profile) throw new Error("sandbox profile missing");
    const base = path.dirname(this.fixture);
    const marker = path.join(base, "synthetic-forbidden-marker.txt");
    const fileWeak = path.join(base, "sandbox-file-control.sb");
    const networkWeak = path.join(base, "sandbox-network-control.sb");
    const markerText = "synthetic-only-boundary-control";
    await fs.writeFile(marker, markerText, { mode: 0o600 });
    const profileText = await fs.readFile(this.profile, "utf8");
    try {
      const deniedFile = parsedJson(
        await this.runSealed("read-control", { NEOTOMA_EVAL_CONTROL_MARKER: marker })
      );
      if (deniedFile.read !== false || !["EPERM", "EACCES"].includes(String(deniedFile.code))) {
        throw new Error("sandbox did not deny synthetic host marker read");
      }
      this.boundaryProof.fileDenied = true;
      await fs.writeFile(
        fileWeak,
        profileText.replace(
          "(deny network*)",
          `(allow file-read* (literal ${JSON.stringify(marker)}))\n(deny network*)`
        ),
        { mode: 0o600 }
      );
      const allowedFile = parsedJson(
        await this.runSealed("read-control", { NEOTOMA_EVAL_CONTROL_MARKER: marker }, fileWeak)
      );
      if (allowedFile.read !== true || allowedFile.value !== markerText)
        throw new Error("file deny control cannot fail when synthetic marker is allowlisted");
      this.boundaryProof.weakenedFileRead = true;

      const listener = net.createServer((socket) => socket.end());
      await new Promise<void>((resolveListen, rejectListen) => {
        listener.once("error", rejectListen);
        listener.listen(0, "127.0.0.1", resolveListen);
      });
      try {
        const address = listener.address();
        if (!address || typeof address === "string")
          throw new Error("synthetic loopback listener unavailable");
        const env = { NEOTOMA_EVAL_CONTROL_PORT: String(address.port) };
        const deniedNetwork = parsedJson(await this.runSealed("network-control", env));
        if (
          deniedNetwork.connected !== false ||
          !["EPERM", "EACCES"].includes(String(deniedNetwork.code))
        ) {
          throw new Error(
            `sandbox did not deny synthetic network connection (${String(deniedNetwork.code)})`
          );
        }
        this.boundaryProof.networkDenied = true;
        await fs.writeFile(
          networkWeak,
          profileText.replace("(deny network*)", "(allow network*)"),
          { mode: 0o600 }
        );
        const allowedNetwork = parsedJson(
          await this.runSealed("network-control", env, networkWeak)
        );
        if (allowedNetwork.connected !== true)
          throw new Error(
            "network deny control cannot fail when synthetic loopback is allowlisted"
          );
        this.boundaryProof.weakenedNetworkConnect = true;
      } finally {
        await new Promise<void>((resolveClose) => listener.close(() => resolveClose()));
      }
      const fileStillDenied = parsedJson(
        await this.runSealed("read-control", { NEOTOMA_EVAL_CONTROL_MARKER: marker })
      );
      if (
        fileStillDenied.read !== false ||
        !["EPERM", "EACCES"].includes(String(fileStillDenied.code))
      )
        throw new Error("restrictive file policy changed after weakened control");
    } finally {
      await Promise.all(
        [marker, fileWeak, networkWeak].map((file) => fs.rm(file, { force: true }))
      );
    }
  }
  private async verifyLinuxBoundaryControls(): Promise<void> {
    const boundary = this.linux;
    if (!boundary) throw new Error("Linux boundary missing");
    const base = path.dirname(this.fixture);
    const marker = path.join(base, "synthetic-forbidden-marker.txt");
    const markerText = "synthetic-only-boundary-control";
    await fs.writeFile(marker, markerText, { mode: 0o600 });
    const network = `neotoma-eval-control-${randomUUID()}`;
    let networkCreated = false;
    try {
      const deniedFile = parsedJson(
        await this.runSealed("read-control", {
          NEOTOMA_EVAL_CONTROL_MARKER: "/synthetic-host-marker",
        })
      );
      if (deniedFile.read !== false || deniedFile.code !== "ENOENT")
        throw new Error("container did not exclude synthetic host marker");
      this.boundaryProof.fileDenied = true;
      const allowedFile = parsedJson(
        await this.runSealed(
          "read-control",
          { NEOTOMA_EVAL_CONTROL_MARKER: "/synthetic-host-marker" },
          undefined,
          { markerMount: marker }
        )
      );
      if (allowedFile.read !== true || allowedFile.value !== markerText)
        throw new Error("synthetic mount negative control did not read marker");
      this.boundaryProof.weakenedFileRead = true;

      dockerOutput(boundary, ["network", "create", "--driver", "bridge", "--internal", network]);
      networkCreated = true;
      const gateway = dockerOutput(boundary, [
        "network",
        "inspect",
        network,
        "--format",
        "{{(index .IPAM.Config 0).Gateway}}",
      ]).trim();
      if (net.isIP(gateway) !== 4 || gateway.startsWith("127."))
        throw new Error("controlled bridge has no numeric non-loopback gateway");
      const listener = net.createServer((socket) => socket.end());
      await new Promise<void>((resolveListen, rejectListen) => {
        listener.once("error", rejectListen);
        listener.listen(0, gateway, resolveListen);
      });
      try {
        const address = listener.address();
        if (!address || typeof address === "string")
          throw new Error("controlled bridge listener unavailable");
        const env = {
          NEOTOMA_EVAL_CONTROL_HOST: gateway,
          NEOTOMA_EVAL_CONTROL_PORT: String(address.port),
        };
        const denied = parsedJson(await this.runSealed("network-control", env));
        if (
          denied.connected !== false ||
          !["ENETUNREACH", "EHOSTUNREACH", "EPERM", "EACCES"].includes(String(denied.code))
        )
          throw new Error(
            `network-none control did not deny controlled endpoint (${String(denied.code)})`
          );
        this.boundaryProof.networkDenied = true;
        const allowed = parsedJson(
          await this.runSealed("network-control", env, undefined, { network })
        );
        if (allowed.connected !== true)
          throw new Error("weakened isolated bridge control did not connect");
        this.boundaryProof.weakenedNetworkConnect = true;
        const stillDenied = parsedJson(await this.runSealed("network-control", env));
        if (
          stillDenied.connected !== false ||
          !["ENETUNREACH", "EHOSTUNREACH", "EPERM", "EACCES"].includes(String(stillDenied.code))
        )
          throw new Error("network-none control changed after weakened control");
      } finally {
        await new Promise<void>((resolveClose) => listener.close(() => resolveClose()));
      }
      const fileStillDenied = parsedJson(
        await this.runSealed("read-control", {
          NEOTOMA_EVAL_CONTROL_MARKER: "/synthetic-host-marker",
        })
      );
      if (fileStillDenied.read !== false || fileStillDenied.code !== "ENOENT")
        throw new Error("fixture-only mount policy changed after weakened control");
    } finally {
      await fs.rm(marker, { force: true });
      if (networkCreated) dockerOutput(boundary, ["network", "rm", network]);
    }
  }
  private async runSealed(
    action: string,
    env: Record<string, string> = {},
    profile?: string,
    linuxOptions?: LinuxRunOptions
  ): Promise<ProcessResult> {
    return await this.runNode(
      path.join(this.runtime, "eval/sealed_backup_eval.js"),
      [action],
      env,
      profile,
      linuxOptions
    );
  }
  private async runNode(
    entry: string,
    args: string[],
    extraEnv: Record<string, string> = {},
    profileOverride?: string,
    linuxOptions?: LinuxRunOptions
  ): Promise<ProcessResult> {
    const remaining = this.deadlineAt - 30_000 - Date.now();
    if (remaining <= 0) throw new Error("required restore eval aggregate deadline expired");
    await this.validateFixtureTree();
    if (sha(JSON.stringify(await BackupEvalSession.hashTree(this.runtime))) !== this.runtimeHash)
      throw new Error("staged runtime changed before child launch");
    let result: ProcessResult;
    try {
      if (this.linux) result = await this.runDocker(entry, args, extraEnv, linuxOptions);
      else {
        if (!this.profile) throw new Error("no verified local OS boundary");
        result = await runBounded(
          "/usr/bin/sandbox-exec",
          ["-f", profileOverride ?? this.profile, path.join(this.runtime, "node"), entry, ...args],
          {
            cwd: this.fixture,
            env: this.childEnv(extraEnv),
            signal: this.abortController.signal,
            timeoutMs: Math.min(OP_TIMEOUT_MS, remaining),
          }
        );
      }
    } finally {
      await this.validateFixtureTree();
      if (sha(JSON.stringify(await BackupEvalSession.hashTree(this.runtime))) !== this.runtimeHash)
        throw new Error("staged runtime changed after child exit");
    }
    return result;
  }
  private async runDocker(
    entry: string,
    args: string[],
    extraEnv: Record<string, string>,
    options: LinuxRunOptions = {}
  ): Promise<ProcessResult> {
    const boundary = this.linux;
    if (!boundary) throw new Error("Linux boundary missing");
    if (!entry.startsWith(this.runtime + path.sep)) throw new Error("Docker entry escaped runtime");
    const container = `neotoma-eval-${randomUUID()}`;
    const insideEntry = path.posix.join("/runtime", path.relative(this.runtime, entry));
    const env = this.childEnv(extraEnv);
    const envArgs = Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
    const dockerArgs = [
      "--host",
      boundary.host,
      "run",
      "--rm",
      "--pull=never",
      "--name",
      container,
      "--network",
      options.network ?? "none",
      "--read-only",
      "--user",
      `${process.getuid!()}:${process.getgid!()}`,
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "32",
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--ulimit",
      "nofile=128:128",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,nodev,size=33554432,mode=1777",
      "--mount",
      `type=bind,source=${this.fixture},target=/fixture`,
      ...(options.markerMount
        ? [
            "--mount",
            `type=bind,source=${options.markerMount},target=/synthetic-host-marker,readonly`,
          ]
        : []),
      "--workdir",
      "/fixture",
      ...envArgs,
      boundary.image,
      "/runtime/node",
      insideEntry,
      ...args,
    ];
    let result: ProcessResult;
    try {
      result = await runBounded("/usr/bin/docker", dockerArgs, {
        cwd: this.fixture,
        env: {
          HOME: boundary.configDir,
          DOCKER_CONFIG: boundary.configDir,
          PATH: "/usr/bin:/bin",
          LANG: "C",
          LC_ALL: "C",
        },
        signal: this.abortController.signal,
        timeoutMs: Math.min(OP_TIMEOUT_MS, this.deadlineAt - 30_000 - Date.now()),
        onKill: () => {
          try {
            dockerOutput(boundary, ["rm", "-f", container]);
          } catch {
            /* inspect below decides */
          }
        },
      });
    } finally {
      try {
        dockerOutput(boundary, ["rm", "-f", container]);
      } catch {
        /* --rm may already remove it */
      }
      let remains = false;
      try {
        dockerOutput(boundary, ["inspect", "--format", "{{.Id}}", container]);
        remains = true;
      } catch {
        /* absent */
      }
      if (remains) throw new Error("sandbox container cleanup failed");
    }
    return { ...result, processId: container };
  }
  abort(): void {
    this.abortController.abort();
  }
  async runCli(raw: unknown): Promise<BackupCliResult> {
    if (this.closed) throw new Error("restore eval session closed");
    const input = parseBackupCliInput(raw);
    if (++this.calls > 3) throw new Error("restore eval CLI call cap exceeded");
    let args: string[];
    if (input.operation === "create")
      args = ["--json", "backup", "create", "--output", this.childPath("created_output")];
    else if (input.operation === "verify") {
      if (!this.createdBackup) throw new Error("created_backup is not bound by a live create");
      args = [
        "--json",
        "backup",
        "verify",
        this.linux
          ? this.childPath(path.relative(this.fixture, this.createdBackup))
          : this.createdBackup,
      ];
    } else
      args = [
        "--json",
        "backup",
        "restore",
        "--from",
        this.childPath("legacy_backup"),
        "--target",
        this.childPath("target"),
      ];
    const result = await this.runNode(path.join(this.runtime, "dist/cli/bootstrap.js"), args);
    const stdoutJson = parsedJson(result);
    freezeJson(stdoutJson);
    if (input.operation === "create") {
      const returned = stdoutJson.backup_dir;
      if (typeof returned !== "string" || !path.isAbsolute(returned))
        throw new Error("create did not return a confined backup_dir");
      const childOutput = this.childPath("created_output");
      if (
        !returned.startsWith(childOutput + path.sep) ||
        !path.resolve(returned).startsWith(childOutput + path.sep)
      )
        throw new Error("live backup_dir escaped the fixed output handle");
      const hostReturned =
        this.linux && returned.startsWith("/fixture/")
          ? this.innerPath(returned.slice("/fixture/".length))
          : returned;
      const output = await fs.realpath(this.innerPath("created_output"));
      noSymlinkComponents(hostReturned, output);
      const canonical = await fs.realpath(hostReturned);
      if (!(await fs.lstat(canonical)).isDirectory())
        throw new Error("live backup_dir is not a directory");
      if (!canonical.startsWith(output + path.sep))
        throw new Error("create backup_dir escaped output root");
      if (this.createdBackup) throw new Error("created_backup was already bound");
      this.createdBackup = canonical;
    }
    return Object.freeze({
      operation: input.operation,
      argv: Object.freeze(args),
      exitCode: result.exitCode,
      processId: result.processId,
      stdoutJson,
      stderr: result.stderr,
      runtimeHash: this.runtimeHash,
      boundaryId: this.boundaryId,
    });
  }
  async finish(): Promise<{
    fixtureState: BackupFixtureState;
    causalProbeResults: BackupCausalProbeResult[];
  }> {
    if (this.calls !== 3) throw new Error("restore eval needs exactly three CLI calls");
    const fixtureState = parsedJson(
      await this.runSealed("inspect")
    ) as unknown as BackupFixtureState;
    const results: BackupCausalProbeResult[] = [];
    for (const [member, name] of [
      ["neotoma_db", "probe_db"],
      ["wal", "probe_wal"],
    ] as const) {
      const verified = parsedJson(
        await this.runNode(path.join(this.runtime, "dist/cli/bootstrap.js"), [
          "--json",
          "backup",
          "verify",
          this.childPath(`${name}/backup`),
        ])
      );
      if (verified.status !== "valid") throw new Error(`causal ${member} preflight was not valid`);
      const actual = parsedJson(await this.runSealed(member === "wal" ? "probe-wal" : "probe-db"));
      results.push(
        Object.freeze({
          ...actual,
          member,
          preflightCliValid: true,
          boundaryId: this.boundaryId,
        }) as unknown as BackupCausalProbeResult
      );
    }
    return { fixtureState: Object.freeze(fixtureState), causalProbeResults: results };
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    let failure: Error | null = null;
    if (this.linux) {
      try {
        dockerOutput(this.linux, ["image", "rm", "-f", this.linux.image]);
      } catch (error) {
        failure = new Error(`sandbox image cleanup failed: ${(error as Error).message}`);
      }
    }
    try {
      await removeOwnedTree(
        path.dirname(this.fixture),
        Math.max(this.deadlineAt, Date.now() + 1_000)
      );
    } catch (error) {
      failure = new Error(`sandbox fixture cleanup failed: ${(error as Error).message}`);
    }
    if (Date.now() > this.deadlineAt)
      failure = new Error("required restore eval cleanup exceeded aggregate deadline");
    if (failure) throw failure;
  }
}
