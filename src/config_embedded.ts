/**
 * Explicit runtime configuration for in-process (embedded) use.
 *
 * This module is deliberately free of imports from `config.ts` and performs no
 * I/O: it only validates the caller's options and derives the environment-like
 * map that `config.ts` reads from when embedded mode is active.
 *
 * Embedded mode contract:
 *   - No env file (project `.env*`, the user-level env file, the user-level
 *     CLI config file) is read.
 *   - The host process environment is neither read implicitly nor written. A
 *     host variable only takes effect when the caller names it in
 *     `allowProcessEnv`; explicit options always win over it.
 *   - No tunnel discovery files are read.
 *
 * The CLI and server do not use this path and keep their file-based loading.
 */

import { createHash } from "node:crypto";
import os from "node:os";
import { isAbsolute, join } from "node:path";

export interface EmbeddedConfigOptions {
  /** Absolute data directory. Database, raw sources and logs live under it by default. */
  dataDir: string;
  /** Runtime environment. Defaults to "development". */
  environment?: "development" | "production";
  /** Package root used to locate bundled docs. Defaults to the installed package location. */
  projectRoot?: string;
  /** Optional absolute overrides for individual storage locations. */
  sqlitePath?: string;
  rawStorageDir?: string;
  logsDir?: string;
  eventLogPath?: string;
  /** Optional embeddings adapter. When omitted, embeddings are not configured and no request is made. */
  openaiApiKey?: string;
  /** Additional explicit settings (for example `NEOTOMA_ENCRYPTION_ENABLED`). */
  env?: Record<string, string | undefined>;
  /**
   * Names of host process-environment variables to read. Empty by default.
   * Explicit options above and `env` win over these.
   */
  allowProcessEnv?: string[];
}

export interface ResolvedEmbeddedConfig {
  options: EmbeddedConfigOptions;
  /** The only environment map `config.ts` consults in embedded mode. */
  env: Record<string, string | undefined>;
  /** Fingerprint of the full option set; see `embeddedConfigFingerprint`. */
  fingerprint: string;
}

export class EmbeddedConfigError extends Error {
  readonly code: "invalid_option" | "config_already_loaded";
  constructor(code: EmbeddedConfigError["code"], message: string) {
    super(message);
    this.name = "EmbeddedConfigError";
    this.code = code;
  }
}

const STATE_KEY = Symbol.for("neotoma.embedded_config");

type GlobalWithState = typeof globalThis & { [STATE_KEY]?: ResolvedEmbeddedConfig };

function requireAbsolute(name: string, value: string | undefined, required: boolean): void {
  if (value === undefined) {
    if (required) {
      throw new EmbeddedConfigError("invalid_option", `Embedded config requires "${name}".`);
    }
    return;
  }
  if (typeof value !== "string" || value.trim() === "" || !isAbsolute(value)) {
    throw new EmbeddedConfigError(
      "invalid_option",
      `Embedded config option "${name}" must be an absolute path.`
    );
  }
}

function validateOptionShapes(options: EmbeddedConfigOptions): void {
  const allow = options.allowProcessEnv as unknown;
  if (allow !== undefined) {
    if (!Array.isArray(allow)) {
      throw new EmbeddedConfigError(
        "invalid_option",
        'Embedded config option "allowProcessEnv" must be an array of variable names (non-empty, no leading or trailing whitespace).'
      );
    }
    const badIndex = allow.findIndex(
      (n) => typeof n !== "string" || n.trim() === "" || n !== n.trim()
    );
    if (badIndex !== -1) {
      throw new EmbeddedConfigError(
        "invalid_option",
        `Embedded config option "allowProcessEnv" entry at index ${badIndex} is not a valid name: ` +
          "names must be non-empty strings with no leading or trailing whitespace."
      );
    }
  }
  const explicit = options.env as unknown;
  if (explicit !== undefined) {
    const isPlain = explicit !== null && typeof explicit === "object" && !Array.isArray(explicit);
    if (!isPlain) {
      throw new EmbeddedConfigError(
        "invalid_option",
        'Embedded config option "env" must be an object whose values are strings.'
      );
    }
    // Name the key only, never its value (the value may be a secret).
    const badKey = Object.entries(explicit as Record<string, unknown>).find(
      ([, v]) => v !== undefined && typeof v !== "string"
    )?.[0];
    if (badKey !== undefined) {
      throw new EmbeddedConfigError(
        "invalid_option",
        `Embedded config option "env" has a non-string value for key "${badKey}": values must be strings.`
      );
    }
  }
  if (options.openaiApiKey !== undefined && typeof options.openaiApiKey !== "string") {
    throw new EmbeddedConfigError(
      "invalid_option",
      'Embedded config option "openaiApiKey" must be a string.'
    );
  }
}

/**
 * Stable fingerprint of every explicit option: `env`, `openaiApiKey`, the path
 * overrides and the NAMES in `allowProcessEnv` (not their host values). Two
 * requests with the same fingerprint configure the process identically. It is a
 * hash, so a key is not kept in a second readable place.
 */
export function embeddedConfigFingerprint(options: EmbeddedConfigOptions): string {
  const sortedEnv = Object.fromEntries(
    Object.entries(options.env ?? {})
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  const canonical = JSON.stringify({
    dataDir: options.dataDir,
    environment: options.environment ?? "development",
    projectRoot: options.projectRoot ?? null,
    sqlitePath: options.sqlitePath ?? null,
    rawStorageDir: options.rawStorageDir ?? null,
    logsDir: options.logsDir ?? null,
    eventLogPath: options.eventLogPath ?? null,
    openaiApiKey: options.openaiApiKey ?? null,
    env: sortedEnv,
    allowProcessEnv: [...new Set(options.allowProcessEnv ?? [])].sort(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Validate options and derive the explicit environment map. Pure: no I/O, no writes to the host environment. */
export function resolveEmbeddedConfig(options: EmbeddedConfigOptions): ResolvedEmbeddedConfig {
  if (options === null || typeof options !== "object") {
    throw new EmbeddedConfigError("invalid_option", "Embedded config requires an options object.");
  }
  requireAbsolute("dataDir", options?.dataDir, true);
  requireAbsolute("projectRoot", options.projectRoot, false);
  requireAbsolute("sqlitePath", options.sqlitePath, false);
  requireAbsolute("rawStorageDir", options.rawStorageDir, false);
  requireAbsolute("logsDir", options.logsDir, false);
  requireAbsolute("eventLogPath", options.eventLogPath, false);
  if (
    options.environment !== undefined &&
    options.environment !== "development" &&
    options.environment !== "production"
  ) {
    throw new EmbeddedConfigError(
      "invalid_option",
      'Embedded config option "environment" must be "development" or "production".'
    );
  }

  validateOptionShapes(options);

  const env: Record<string, string | undefined> = {};
  // Lowest precedence: host variables the caller explicitly named.
  for (const name of options.allowProcessEnv ?? []) {
    env[name] = process.env[name];
  }
  Object.assign(env, options.env ?? {});

  // Highest precedence: the explicit options.
  env.NEOTOMA_DATA_DIR = options.dataDir;
  env.NEOTOMA_ENV = options.environment ?? "development";
  if (options.sqlitePath) env.NEOTOMA_SQLITE_PATH = options.sqlitePath;
  if (options.rawStorageDir) env.NEOTOMA_RAW_STORAGE_DIR = options.rawStorageDir;
  if (options.logsDir) env.NEOTOMA_LOGS_DIR = options.logsDir;
  if (options.eventLogPath) env.NEOTOMA_EVENT_LOG_PATH = options.eventLogPath;
  if (options.openaiApiKey) env.OPENAI_API_KEY = options.openaiApiKey;
  return { options, env, fingerprint: embeddedConfigFingerprint(options) };
}

/**
 * Declare embedded mode. Must run before `config.ts` is first evaluated in this
 * process; `createEmbeddedNeotoma` guarantees that ordering.
 */
export function setEmbeddedConfig(resolved: ResolvedEmbeddedConfig): void {
  (globalThis as GlobalWithState)[STATE_KEY] = resolved;
}

export function getEmbeddedConfig(): ResolvedEmbeddedConfig | undefined {
  return (globalThis as GlobalWithState)[STATE_KEY];
}

/** Test hook: forget embedded mode so a fresh module graph can load the standard way. */
export function clearEmbeddedConfig(): void {
  delete (globalThis as GlobalWithState)[STATE_KEY];
}

/**
 * The environment every Neotoma module reads runtime settings from. In embedded
 * mode this is the explicit map (the host process environment is not consulted
 * unless a name was listed in `allowProcessEnv`); otherwise it is the process
 * environment itself, so the CLI and server behave exactly as before.
 * Call it at the point of use; do not capture it before embedded mode is declared.
 */
export function runtimeEnv(): NodeJS.ProcessEnv {
  return (getEmbeddedConfig()?.env ?? process.env) as NodeJS.ProcessEnv;
}

/** True when embedded mode is declared in this process. */
export function isEmbeddedMode(): boolean {
  return getEmbeddedConfig() !== undefined;
}

/**
 * Directory that holds Neotoma's small user-level state files (`config.json`,
 * `bundle_state.json`).
 *
 * Standard mode: `<home>/.config/neotoma`, as before. Embedded mode: the explicit
 * data directory, so nothing under a home directory is read or written. A host
 * that names `HOME` (or `USERPROFILE`) in `allowProcessEnv` opts back in to the
 * home-directory location.
 */
export function userStateDir(): string {
  const embedded = getEmbeddedConfig();
  if (!embedded) {
    const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
    return join(home, ".config", "neotoma");
  }
  const allowedHome = embedded.env.HOME || embedded.env.USERPROFILE;
  if (allowedHome) return join(allowedHome, ".config", "neotoma");
  return embedded.options.dataDir;
}
