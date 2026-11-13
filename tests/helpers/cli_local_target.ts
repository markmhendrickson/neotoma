/**
 * Local-only target guard for tests that spawn `node dist/cli/index.js`.
 *
 * Why this exists
 * ---------------
 * Under vitest `NODE_ENV=test`, the CLI's `preAction` hook switches data
 * commands from in-process offline transport to HTTP API transport. The API
 * base URL is then resolved as: `--base-url` flag, then `NEOTOMA_BASE_URL`,
 * then session ports, then saved config. Two things routinely put a real
 * (possibly production) instance on that path:
 *
 *   1. An ambient `NEOTOMA_BASE_URL` / `NEOTOMA_BEARER_TOKEN` in the shell.
 *   2. A project `.env` (or `.env.production` when `NEOTOMA_ENV=production`)
 *      at the repo root. `src/config.ts` loads it with `override: true` inside
 *      the CLI child, so it beats an env var passed by the test and cannot be
 *      avoided by changing `cwd` (the CLI falls back to the repo root derived
 *      from its own file location).
 *
 * The only input that outranks both is the `--base-url` flag, so every CLI
 * invocation made through the helpers below carries an explicit `--base-url`
 * naming the suite's own local test server (started in
 * `vitest.global_setup.ts`). A target that is not local fails the test
 * loudly, before any process is spawned and before any network call.
 *
 * There is deliberately NO opt-out: spawned CLI tests always run against the
 * local test server, including under `RUN_REMOTE_TESTS=1` (which only stops
 * the setup files scrubbing the in-process environment).
 *
 * This module imports only `node:` built-ins so the vitest setup files can
 * share {@link isLocalBaseUrl} without pulling in the application.
 */

import {
  exec,
  execFile,
  execSync,
  spawnSync,
  type ExecFileOptions,
  type ExecOptions,
  type ExecSyncOptions,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "node:child_process";
import { promisify } from "node:util";

const execRaw = promisify(exec);
const execFileRaw = promisify(execFile);

const CLI_ENTRY_MARKER = "dist/cli/index.js";

/** Thrown when a CLI test would resolve to a non-local Neotoma instance. */
export class NonLocalCliTargetError extends Error {
  constructor(source: string, target: string) {
    super(
      `[cli-local-target] Refusing to run a CLI test against a non-local Neotoma target ` +
        `(${source}: ${describeTarget(target)}). CLI tests always run against the local test ` +
        `server started by vitest.global_setup.ts (localhost, 127.0.0.1 or ::1); there is no ` +
        `override, including RUN_REMOTE_TESTS=1. The remote URL can come from the shell ` +
        `environment, from a test's own env or --base-url, or from a repo-root .env file ` +
        `that the CLI loads with override. Unset or fix that source and re-run.`
    );
    this.name = "NonLocalCliTargetError";
  }
}

/** Host only: a target URL may carry credentials or a tenant path, so never echo it whole. */
function describeTarget(target: string): string {
  try {
    return new URL(target).host || "unparseable";
  } catch {
    return "unparseable";
  }
}

/**
 * True when `baseUrl` is a loopback address.
 *
 * Mirrors `isLocalhostBaseUrl` in `src/cli/index.ts` (kept in sync by
 * `tests/cli/cli_local_target_guard.test.ts`, which compares the two) without
 * importing the whole CLI entry module into every CLI test file.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
  } catch {
    return false;
  }
}

/** Throws {@link NonLocalCliTargetError} unless `baseUrl` is loopback. */
export function assertLocalBaseUrl(baseUrl: string, source: string): string {
  if (!isLocalBaseUrl(baseUrl)) throw new NonLocalCliTargetError(source, baseUrl);
  return baseUrl;
}

/**
 * Drop a non-local NEOTOMA_BASE_URL (and the bearer token that goes with it)
 * from `env`. Returns true when something was dropped. Never logs the value.
 * Used by the vitest setup files; a no-op under RUN_REMOTE_TESTS=1.
 */
export function scrubNonLocalBaseUrl(env: NodeJS.ProcessEnv): boolean {
  if (env.RUN_REMOTE_TESTS === "1") return false;
  const base = env.NEOTOMA_BASE_URL?.trim();
  if (!base || isLocalBaseUrl(base)) return false;
  delete env.NEOTOMA_BASE_URL;
  delete env.NEOTOMA_BEARER_TOKEN;
  return true;
}

/** One warning line for a scrub; names the in-process opt-out, never the value. */
export const SCRUB_WARNING =
  "[neotoma] Dropped a non-local NEOTOMA_BASE_URL (and NEOTOMA_BEARER_TOKEN) from the test " +
  "environment so tests cannot reach a real instance. RUN_REMOTE_TESTS=1 keeps it for the " +
  "in-process environment only; spawned CLI tests always use the local test server.";

/**
 * Base URL of the local test API server from `vitest.global_setup.ts`.
 *
 * Global setup exports the port it actually bound as NEOTOMA_SESSION_DEV_PORT;
 * NEOTOMA_HTTP_PORT (default 19080) is the fallback for a file run without it.
 */
export function localTestBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = [env.NEOTOMA_SESSION_DEV_PORT, env.NEOTOMA_HTTP_PORT, env.HTTP_PORT].find(
    (p) => typeof p === "string" && /^\d+$/.test(p.trim())
  );
  return `http://localhost:${port ? port.trim() : "19080"}`;
}

const NO_NETWORK_FLAG = /(?:^|\s)(?:--help|-h|--version|-V)(?:\s|$)/;
const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
const BASE_URL_FLAG = /(?:^|\s)--base-url(?:=|\s+)(?:"([^"]*)"|'([^']*)'|(\S+))/g;
const NO_NETWORK_ARGS = new Set(["--help", "-h", "--version", "-V"]);

/** POSIX single-quote a shell word. */
function shellQuote(word: string): string {
  return `'${word.replace(/'/g, `'\\''`)}'`;
}

/** Scheme + host + port only: drops userinfo, path, query and fragment. */
function originOf(url: string): string {
  return new URL(url).origin;
}

/** True when the arguments after the CLI entry point are a help or version request. */
function isNoNetworkCommand(afterEntry: string): boolean {
  // Quoted payloads (e.g. a JSON body containing the text "--help") are not flags.
  return NO_NETWORK_FLAG.test(afterEntry.replace(QUOTED, '""'));
}

/**
 * Rewrite a CLI command string so it carries an explicit local `--base-url`.
 *
 * - Every explicit `--base-url` in the command must itself be local.
 * - Otherwise `envBaseUrl` (a base URL the test put in the child's env) must be
 *   local and is promoted to the flag, because a project env file would beat
 *   the env var inside the child.
 * - Otherwise the suite's own test server is used.
 * - Commands that do not invoke the built CLI are returned unchanged.
 */
export function withLocalBaseUrl(
  command: string,
  envBaseUrl: string | undefined,
  defaultBaseUrl: string
): string {
  const at = command.indexOf(CLI_ENTRY_MARKER);
  if (at === -1) return command;

  // Skip a closing quote so `node "/abs/dist/cli/index.js"` stays one argument.
  let insertAt = at + CLI_ENTRY_MARKER.length;
  if (command[insertAt] === '"' || command[insertAt] === "'") insertAt += 1;

  // Help and version output makes no request, and the CLI renders it differently when a
  // global option precedes the flag, so leave those invocations byte-for-byte as written.
  if (isNoNetworkCommand(command.slice(insertAt))) return command;

  let sawFlag = false;
  for (const m of command.matchAll(BASE_URL_FLAG)) {
    sawFlag = true;
    assertLocalBaseUrl(m[1] ?? m[2] ?? m[3] ?? "", "--base-url");
  }
  if (sawFlag) return command;

  const envUrl = envBaseUrl?.trim();
  const chosen = envUrl ? assertLocalBaseUrl(envUrl, "NEOTOMA_BASE_URL") : defaultBaseUrl;
  assertLocalBaseUrl(chosen, "test server");
  return `${command.slice(0, insertAt)} --base-url ${shellQuote(originOf(chosen))}${command.slice(insertAt)}`;
}

/** Argument-vector twin of {@link withLocalBaseUrl} for `spawnSync("node", [cli, ...])`. */
export function withLocalBaseUrlArgs(
  args: readonly string[],
  envBaseUrl: string | undefined,
  defaultBaseUrl: string
): string[] {
  const entry = args.findIndex((a) => a.endsWith(CLI_ENTRY_MARKER));
  if (entry === -1) return [...args];
  const rest = args.slice(entry + 1);
  if (rest.some((a) => NO_NETWORK_ARGS.has(a))) return [...args];

  let sawFlag = false;
  rest.forEach((a, i) => {
    if (a === "--base-url") {
      sawFlag = true;
      assertLocalBaseUrl(rest[i + 1] ?? "", "--base-url");
    } else if (a.startsWith("--base-url=")) {
      sawFlag = true;
      assertLocalBaseUrl(a.slice("--base-url=".length), "--base-url");
    }
  });
  if (sawFlag) return [...args];

  const envUrl = envBaseUrl?.trim();
  const chosen = envUrl ? assertLocalBaseUrl(envUrl, "NEOTOMA_BASE_URL") : defaultBaseUrl;
  assertLocalBaseUrl(chosen, "test server");
  return [...args.slice(0, entry + 1), "--base-url", originOf(chosen), ...rest];
}

/**
 * Child environment for a CLI test.
 *
 * Ambient env (no `env` option from the test) is scrubbed of the variables that
 * would aim the CLI at a real instance. An env the test built deliberately is
 * respected; only its base URL is policed by {@link withLocalBaseUrl}.
 */
export function localCliEnv(explicit?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...(explicit ?? process.env) };
  // A test that spreads `...process.env` into its own env inherits the ambient
  // values too. Scrub a value only when it is the ambient one, so a base URL or
  // token the test set on purpose is still honoured (and still policed).
  const ambient = process.env;
  const inherited = (key: string): boolean =>
    explicit === undefined || (env[key] !== undefined && env[key] === ambient[key]);
  const base = env.NEOTOMA_BASE_URL?.trim();
  if (base && inherited("NEOTOMA_BASE_URL") && !isLocalBaseUrl(base)) delete env.NEOTOMA_BASE_URL;
  if (inherited("NEOTOMA_BEARER_TOKEN")) delete env.NEOTOMA_BEARER_TOKEN;
  if (env.NEOTOMA_ENV === "production" && inherited("NEOTOMA_ENV")) {
    env.NEOTOMA_ENV = "development";
  }
  return env;
}

export type CliExecOptions = ExecOptions & { encoding?: BufferEncoding };

/**
 * Drop-in replacement for `promisify(exec)` in CLI tests.
 *
 * Same call shape and result as `promisify(exec)`, plus: the child env is
 * scrubbed, and any `node dist/cli/index.js` invocation is pinned to a local
 * `--base-url`. Throws {@link NonLocalCliTargetError} before spawning when the
 * resolved target is not local.
 */
export async function execAsync(
  command: string,
  options: CliExecOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const env = localCliEnv(options.env);
  const pinned = withLocalBaseUrl(command, env.NEOTOMA_BASE_URL, localTestBaseUrl());
  const { stdout, stderr } = await execRaw(pinned, { ...options, env });
  return { stdout: String(stdout), stderr: String(stderr) };
}

/** Sync twin of {@link execAsync}: a drop-in for `execSync` with the same guard. */
export function execSyncLocal(command: string, options: ExecSyncOptions = {}): string | Buffer {
  const env = localCliEnv(options.env);
  const pinned = withLocalBaseUrl(command, env.NEOTOMA_BASE_URL, localTestBaseUrl());
  return execSync(pinned, { ...options, env });
}

/** Sync twin for `spawnSync(file, args, options)`; pins `node <cli> ...` argument vectors. */
export function spawnSyncLocal(
  file: string,
  args: readonly string[],
  options: SpawnSyncOptions = {}
): SpawnSyncReturns<string | Buffer> {
  const env = localCliEnv(options.env);
  const pinned = withLocalBaseUrlArgs(args, env.NEOTOMA_BASE_URL, localTestBaseUrl());
  return spawnSync(file, pinned, { ...options, env });
}

/**
 * Drop-in for `promisify(execFile)` in CLI tests: `execFileLocal(file, args, options)`.
 * Pins `node <cli> ...` argument vectors to a local `--base-url`, like {@link execAsync}.
 */
export async function execFileLocal(
  file: string,
  args: readonly string[] = [],
  options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const env = localCliEnv(options.env);
  const pinned = withLocalBaseUrlArgs(args, env.NEOTOMA_BASE_URL, localTestBaseUrl());
  const { stdout, stderr } = await execFileRaw(file, pinned, { ...options, env });
  return { stdout: String(stdout), stderr: String(stderr) };
}
