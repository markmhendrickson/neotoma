import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";

// Use NEOTOMA_ENV only to avoid conflicts when running as MCP in other workspaces
// (host NODE_ENV would incorrectly override Neotoma's dev/prod choice)
const env = process.env.NEOTOMA_ENV || "development";

// Resolve .env file paths relative to this file's location (works when running as MCP)
// When running as MCP, process.cwd() might be the workspace directory, not the Neotoma project
// So we always resolve from the file location: dist/config.js -> project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveUserEnvPath(): string | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) return null;
  return join(homeDir, ".config", "neotoma", ".env");
}

/**
 * Is this process test-shaped (issue #2387)?
 *
 * `VITEST` is set by the vitest runner in workers; `NODE_ENV=test` is set by
 * `vitest.global_setup.ts` and is the conventional signal a child process
 * inherits. `NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR=1` lets any caller demand the
 * same strictness without pretending to be a test.
 */
function requiresExplicitDataDir(): boolean {
  if (process.env.NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR?.trim() === "1") return true;
  if (process.env.VITEST?.trim()) return true;
  return process.env.NODE_ENV?.trim() === "test";
}

/** Deliberate opt-in that re-permits the user-level fallback under test (issue #2387). */
function userEnvFallbackAllowedInTest(): boolean {
  return process.env.NEOTOMA_ALLOW_USER_ENV_IN_TEST?.trim() === "1";
}

/**
 * Refuse the `~/.config/neotoma/.env` data-directory fallback in a test-shaped
 * process (issue #2387).
 *
 * A CLI child spawned by a test does not necessarily inherit `NEOTOMA_DATA_DIR`.
 * Without this guard such a child hydrated the variable from the user-level
 * config and then read and wrote the data directory it names — the operator's
 * real database — silently and with exit code 0. A test that passes against
 * residue in real data is green for the wrong reason twice over, and the write
 * itself is invisible because nothing fails.
 *
 * So: stop, name the variable to set, and exit non-zero. Non-test processes are
 * untouched — the interactive CLI and the server keep hydrating exactly as
 * before — and `NEOTOMA_ALLOW_USER_ENV_IN_TEST=1` re-permits it for the rare
 * test that genuinely means to exercise the fallback.
 */
function refuseUserEnvFallbackUnderTest(userEnvPath: string, configuredDataDir: string): never {
  const message = [
    "[neotoma] Refusing to resolve the data directory from the user-level config while running under test.",
    `  A test-shaped process (VITEST / NODE_ENV=test / NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR=1) has no explicit NEOTOMA_DATA_DIR,`,
    `  so ${userEnvPath} would have pointed it at a data directory holding real data.`,
    "",
    "  Set NEOTOMA_DATA_DIR to a test-scoped directory in the environment of this process",
    "  (and pass it explicitly to any CLI child process the test spawns).",
    "  To exercise the user-level fallback on purpose, set NEOTOMA_ALLOW_USER_ENV_IN_TEST=1.",
  ].join("\n");
  process.stderr.write(`${message}\n`);
  // Length, not content: the configured path may name a real operator directory.
  process.stderr.write(
    `[neotoma] (refused user-level data directory: ${configuredDataDir.length} chars, not used)\n`
  );
  process.exit(1);
}

function hydrateDataDirFromUserEnvConfig(): void {
  if (process.env.NEOTOMA_DATA_DIR?.trim()) return;
  const userEnvPath = resolveUserEnvPath();
  if (!userEnvPath || !existsSync(userEnvPath)) return;
  let configuredDataDir: string | undefined;
  try {
    const parsed = dotenv.parse(readFileSync(userEnvPath, "utf-8"));
    configuredDataDir = parsed.NEOTOMA_DATA_DIR?.trim();
  } catch {
    // Ignore invalid user env files and continue with existing fallbacks.
    return;
  }
  if (!configuredDataDir) return;
  if (requiresExplicitDataDir() && !userEnvFallbackAllowedInTest()) {
    refuseUserEnvFallbackUnderTest(userEnvPath, configuredDataDir);
  }
  process.env.NEOTOMA_DATA_DIR = configuredDataDir;
}

function isNeotomaRepoRoot(candidate: string | null | undefined): candidate is string {
  if (!candidate) return false;
  const packageJsonPath = join(candidate, "package.json");
  if (!existsSync(packageJsonPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { name?: string };
    return parsed.name === "neotoma";
  } catch {
    return false;
  }
}

function resolveRepoRootFromCliConfig(): string | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) return null;
  const configPath = join(homeDir, ".config", "neotoma", "config.json");
  if (!existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as {
      repo_root?: string;
      repoRoot?: string;
    };
    const candidate = parsed.repo_root ?? parsed.repoRoot;
    return isNeotomaRepoRoot(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function resolveProjectRootFromRuntime(): string {
  if (isNeotomaRepoRoot(process.env.NEOTOMA_PROJECT_ROOT)) {
    return process.env.NEOTOMA_PROJECT_ROOT;
  }
  if (isNeotomaRepoRoot(process.cwd())) return process.cwd();
  const configuredRepoRoot = resolveRepoRootFromCliConfig();
  if (configuredRepoRoot) return configuredRepoRoot;
  // Fallback to file-location based root (dist/ -> package root, src/ -> repo root).
  if (__dirname.endsWith("/dist") || __dirname.includes("/dist/")) return join(__dirname, "..");
  if (__dirname.endsWith("/src") || __dirname.includes("/src/")) return join(__dirname, "..");
  return __dirname;
}

const projectRoot = resolveProjectRootFromRuntime();

// Load project-local .env first so it takes precedence over ~/.config/neotoma/.env.
// Use override:true so a worktree .env can pin NEOTOMA_DATA_DIR to a branch-specific path.
if (env === "production") {
  dotenv.config({ path: join(projectRoot, ".env.production"), override: true });
  // Local prod-data dev stacks (`npm run dev:full:prod`) intentionally run with
  // NEOTOMA_ENV=production while still using worktree-local development secrets.
  if ((process.env.NEOTOMA_INSPECTOR_LIVE_BUILD || "").trim() === "1") {
    dotenv.config({ path: join(projectRoot, ".env.development"), override: false });
  }
  dotenv.config({ path: join(projectRoot, ".env"), override: false }); // .env as fallback for prod
} else {
  dotenv.config({ path: join(projectRoot, ".env"), override: true });
}

// Hydrate NEOTOMA_DATA_DIR from ~/.config/neotoma/.env only when no project .env set it.
hydrateDataDirFromUserEnvConfig();

function getOpenAIConfig() {
  // Use OPENAI_API_KEY (set by 1Password sync based on ENVIRONMENT variable)
  return process.env.OPENAI_API_KEY || "";
}

// Default ports: 3080 dev, 3180 prod, 8280 WS (spaced to avoid cascade when prod bumps)
const defaultHttpPort = env === "production" ? "3180" : "3080";
const httpPort = parseInt(
  process.env.NEOTOMA_HTTP_PORT || process.env.HTTP_PORT || defaultHttpPort,
  10
);
const storageBackend = "local";
const dataDir = process.env.NEOTOMA_DATA_DIR || join(projectRoot, "data");
const rawStorageSubdir = env === "production" ? "sources_prod" : "sources";
const logsSubdir = env === "production" ? "logs_prod" : "logs";
const logsDir = process.env.NEOTOMA_LOGS_DIR || join(dataDir, logsSubdir);
// Event log: both envs in data/logs — events.log (dev), events.prod.log (prod)
const eventLogFileName = env === "production" ? "events.prod.log" : "events.log";
const eventLogPath =
  process.env.NEOTOMA_EVENT_LOG_PATH ||
  (process.env.NEOTOMA_EVENT_LOG_DIR
    ? join(process.env.NEOTOMA_EVENT_LOG_DIR, eventLogFileName)
    : null) ||
  join(dataDir, "logs", eventLogFileName);

/**
 * Auto-discover tunnel URL from file written by setup-https-tunnel.sh
 * This allows tunnels to "just work" without manually setting NEOTOMA_HOST_URL
 */
function discoverTunnelUrl(httpPort: number, allowAutoDiscovery: boolean): string {
  if (!allowAutoDiscovery) {
    (discoverTunnelUrl as any)._discovered = { url: `http://localhost:${httpPort}`, file: null };
    return `http://localhost:${httpPort}`;
  }

  const tunnelFiles = [
    "/tmp/ngrok-mcp-url.txt", // Combined scripts write here
    "/tmp/cloudflared-tunnel.txt", // Alternative for cloudflare-only
  ];

  for (const file of tunnelFiles) {
    try {
      if (existsSync(file)) {
        const url = readFileSync(file, "utf-8").trim();
        if (url && url.startsWith("http")) {
          // Store for logging after config is created
          (discoverTunnelUrl as any)._discovered = { url, file };
          return url;
        }
      }
    } catch {
      // File doesn't exist or unreadable, continue to next
    }
  }

  // Store that we're using localhost default
  (discoverTunnelUrl as any)._discovered = { url: `http://localhost:${httpPort}`, file: null };
  return `http://localhost:${httpPort}`;
}

/**
 * DB backend selection (concurrent-backend plan). `sqlite` (default) keeps the
 * zero-config synchronous better-sqlite3/node:sqlite path. `libsql` opts into
 * the concurrent backend — statements run off the Node event loop, so slow
 * queries cannot freeze the whole server. For local `file:` URLs that is
 * delivered by worker threads hosting the synchronous libSQL driver (a writer
 * plus a read-only reader pool under WAL — every local Node binding is
 * synchronous on the calling thread, so "async" local libSQL alone would not
 * fix blocking); remote URLs (sqld/Turso) use the genuinely-async
 * @libsql/client. The trigger for opting in is genuine multi-writer/hosted
 * contention (agent-heavy or shared instances), not data size. Same file
 * format and SQL dialect; a `file:` URL derived from sqlitePath is used
 * unless NEOTOMA_DB_URL points at a remote instance.
 */
const dbBackend = (process.env.NEOTOMA_DB_BACKEND || "sqlite").toLowerCase();
if (dbBackend !== "sqlite" && dbBackend !== "libsql") {
  throw new Error(
    `Invalid NEOTOMA_DB_BACKEND "${process.env.NEOTOMA_DB_BACKEND}": expected "sqlite" or "libsql"`
  );
}

const OAUTH_CALLBACK_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Why an entry is refused, phrased for an operator reading a startup failure.
 * Returns null when the entry is acceptable.
 */
function describeTrustedCallbackDefect(entry: string): string | null {
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return "not a parseable absolute URL (a full URL with a scheme is required, e.g. https://app.example.com/auth/callback)";
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    return `scheme "${protocol}" is not supported here (use https:, or http: only for a loopback host)`;
  }
  if (url.username || url.password) {
    return "carries userinfo (user:password@host), which is a URL-spoofing vector and is never load-bearing in a callback";
  }
  const host = url.hostname.toLowerCase();
  if (!host) {
    return "has no host";
  }
  if (protocol === "http:" && !OAUTH_CALLBACK_LOOPBACK_HOSTS.has(host)) {
    return "is plaintext http: to a non-loopback host, which would ship authorization codes in cleartext (use https:)";
  }
  return null;
}

/**
 * Parse NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS, FAILING CLOSED on the whole list.
 *
 * If any entry is malformed, the entire list is rejected and startup fails —
 * entries 1 and 3 do not survive a bad entry 2. This is deliberate and is the
 * condition pre-registered on #2384 before implementation.
 *
 * The rejected alternative was skipping a bad entry and honouring the rest. That
 * is friendlier on a typo, but it makes an allowlist enforce something other than
 * what the operator wrote, with no signal that it did: the refusal a bad entry
 * produces is indistinguishable from an exact-match miss. An allowlist is a
 * security control, and a control that silently binds less than its configuration
 * says is the failure mode in docs/foundation/principles.md#1. Refusing to start
 * is loud, immediate, and happens before any authorization request is served,
 * rather than surfacing as an unexplained sign-in failure weeks later.
 *
 * The blast radius of the strict reading is bounded: this throws only when the
 * operator has actually set the variable. Leaving it unset is the default and is
 * unaffected.
 */
function parseTrustedCallbackUrls(raw: string | undefined): string[] {
  const entries = (raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const defects = entries
    .map((entry, index) => {
      const defect = describeTrustedCallbackDefect(entry);
      // The entry is operator-authored config, not user input, and is already
      // echoed in startup logs; but userinfo is the one part that could carry a
      // credential, so redact it rather than printing it back.
      return defect ? `  entry ${index + 1} ("${redactUrlUserinfo(entry)}"): ${defect}` : null;
    })
    .filter((defect): defect is string => defect !== null);

  if (defects.length > 0) {
    throw new Error(
      `Invalid NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS: ${defects.length} of ${entries.length} ` +
        `entries are not usable as trusted OAuth callback URLs.\n${defects.join("\n")}\n` +
        `The whole list is rejected rather than partially applied, so the allowlist in force ` +
        `always matches what is configured. Fix the entries above, or unset the variable to ` +
        `fall back to the built-in allowlist (localhost, loopback, cursor:/vscode:/app:, this ` +
        `instance's own origin, and the ChatGPT/Claude callbacks).`
    );
  }

  return entries;
}

/** Replace any `user:password@` in a URL-ish string, for safe echoing in errors. */
function redactUrlUserinfo(value: string): string {
  return value.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@]*@/, "$1<redacted>@");
}

export const config = {
  projectRoot,
  storageBackend,
  dataDir,
  dbBackend: dbBackend as "sqlite" | "libsql",
  /** Connection URL for non-file backends (e.g. libsql://…, http(s)://… for sqld/Turso). */
  dbUrl: process.env.NEOTOMA_DB_URL || "",
  /** Auth token for remote libSQL (sqld/Turso) connections. */
  dbAuthToken: process.env.NEOTOMA_DB_AUTH_TOKEN || "",
  sqlitePath:
    process.env.NEOTOMA_SQLITE_PATH ||
    join(dataDir, env === "production" ? "neotoma.prod.db" : "neotoma.db"),
  rawStorageDir: process.env.NEOTOMA_RAW_STORAGE_DIR || join(dataDir, rawStorageSubdir),
  eventLogPath,
  logsDir,
  eventLogMirrorEnabled: process.env.NEOTOMA_EVENT_LOG_MIRROR === "true",
  // Kept as inert placeholders for backward-compatible call sites while remote storage is removed.
  authServerUrl: "",
  authServiceKey: "",
  openaiApiKey: getOpenAIConfig(),
  port: parseInt(process.env.NEOTOMA_PORT || process.env.PORT || "3000", 10),
  httpPort,
  environment: env,
  tunnelAutoDiscoveryEnabled:
    env !== "production" ||
    (process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD || "false").toLowerCase() === "true",
  apiBase:
    process.env.NEOTOMA_HOST_URL ||
    discoverTunnelUrl(
      httpPort,
      env !== "production" ||
        (process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD || "false").toLowerCase() === "true"
    ),
  mcpTokenEncryptionKey:
    process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY || process.env.MCP_TOKEN_ENCRYPTION_KEY || "",
  /** When true, MCP clients receive the compact instruction block (same body as runtime fallback) instead of the full fenced block from docs — for dual-host setups that already load workspace Neotoma rules. */
  mcpCompactInstructions:
    (process.env.NEOTOMA_MCP_COMPACT_INSTRUCTIONS || "").toLowerCase() === "1" ||
    (process.env.NEOTOMA_MCP_COMPACT_INSTRUCTIONS || "").toLowerCase() === "true",
  oauthClientId: process.env.NEOTOMA_OAUTH_CLIENT_ID || "",
  /**
   * Additional exact callback URLs an operator trusts to receive an authorization
   * code when the authorize request arrives via a tunnel (non-local Host).
   *
   * Comma-separated list of FULL callback URLs, not origins — `https://app.example.com/auth/callback`
   * authorises that path and nothing else on that host. Entries must be https: unless
   * they point at a loopback host. Empty by default: an operator who sets nothing keeps
   * exactly the behaviour they had before this existed.
   *
   * Validated at load, fail-closed on the WHOLE list: one malformed entry rejects
   * every entry and fails startup. See parseTrustedCallbackUrls above for why.
   */
  oauthTrustedCallbackUrls: parseTrustedCallbackUrls(
    process.env.NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS
  ),
  requireKeyForOauth:
    (process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH || "true").toLowerCase() !== "false",
  // Encryption settings (local backend)
  encryption: {
    enabled: process.env.NEOTOMA_ENCRYPTION_ENABLED === "true",
    keyFilePath: process.env.NEOTOMA_KEY_FILE_PATH || "",
    mnemonic: process.env.NEOTOMA_MNEMONIC || "",
    mnemonicPassphrase: process.env.NEOTOMA_MNEMONIC_PASSPHRASE || "",
    logEncryptionEnabled: process.env.NEOTOMA_LOG_ENCRYPTION_ENABLED === "true",
  },

  // Icon generation settings
  iconGeneration: {
    enabled:
      (process.env.NEOTOMA_ICON_GENERATION_ENABLED ?? process.env.ICON_GENERATION_ENABLED) !==
      "false",
    confidenceThreshold: parseFloat(
      process.env.NEOTOMA_ICON_MATCH_CONFIDENCE_THRESHOLD ||
        process.env.ICON_MATCH_CONFIDENCE_THRESHOLD ||
        "0.8"
    ),
    model:
      process.env.NEOTOMA_ICON_GENERATION_MODEL || process.env.ICON_GENERATION_MODEL || "gpt-4o",
    cacheTTL: parseInt(
      process.env.NEOTOMA_ICON_CACHE_TTL || process.env.ICON_CACHE_TTL || "86400",
      10
    ),
  },
};

/**
 * Log configuration after it's loaded
 * Call this after importing config to see what was configured
 */
export function logConfigInfo(): void {
  const discovered = (discoverTunnelUrl as any)._discovered;

  if (process.env.NEOTOMA_HOST_URL) {
    console.log(`[Config] Using NEOTOMA_HOST_URL from environment: ${config.apiBase}`);
  } else if (!config.tunnelAutoDiscoveryEnabled) {
    console.log(
      `[Config] Tunnel URL auto-discovery disabled for ${config.environment}; using localhost:${config.httpPort}`
    );
  } else if (discovered?.file) {
    console.log(
      `[Config] NEOTOMA_HOST_URL not set; auto-discovered tunnel URL from ${discovered.file}: ${discovered.url}`
    );
  } else {
    console.log(
      `[Config] NEOTOMA_HOST_URL not set and no tunnel URL file found; using localhost:${config.httpPort}`
    );
  }

  console.log(`[Config] API base (apiBase): ${config.apiBase}`);
  console.log(`[Config] Storage backend: ${config.storageBackend}`);
  console.log(`[Config] Environment: ${config.environment}`);
}
