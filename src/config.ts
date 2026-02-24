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
// Always resolve project root from file location (dist/ -> project root, src/ -> project root)
// This works regardless of process.cwd() when running as MCP
const projectRoot = process.env.NEOTOMA_PROJECT_ROOT || 
  (__dirname.endsWith("/dist") || __dirname.includes("/dist/") 
    ? join(__dirname, "..") 
    : __dirname.endsWith("/src") || __dirname.includes("/src/")
    ? join(__dirname, "..")
    : __dirname);

// Load environment-specific .env files
if (env === "production") {
  // Try .env.production first, then fallback to .env
  dotenv.config({ path: join(projectRoot, ".env.production"), override: false });
  dotenv.config({ path: join(projectRoot, ".env"), override: false }); // Load .env as fallback
} else {
  // Development/test: load .env
  dotenv.config({ path: join(projectRoot, ".env"), override: false });
}

function getOpenAIConfig() {
  // Use OPENAI_API_KEY (set by 1Password sync based on ENVIRONMENT variable)
  return process.env.OPENAI_API_KEY || "";
}

// Default ports: 8080 dev, 8180 prod, 8280 WS (spaced to avoid cascade when prod bumps)
const defaultHttpPort = env === "production" ? "8180" : "8080";
const httpPort = parseInt(
  process.env.NEOTOMA_HTTP_PORT || process.env.HTTP_PORT || defaultHttpPort,
  10
);
const storageBackend = "local";
const dataDir = process.env.NEOTOMA_DATA_DIR || join(projectRoot, "data");
const rawStorageSubdir = env === "production" ? "sources_prod" : "sources";
const eventLogSubdir = env === "production" ? "events_prod" : "events";
const logsSubdir = env === "production" ? "logs_prod" : "logs";
const eventLogDir = process.env.NEOTOMA_EVENT_LOG_DIR || join(dataDir, eventLogSubdir);
const logsDir = process.env.NEOTOMA_LOGS_DIR || join(dataDir, logsSubdir);

/**
 * Auto-discover tunnel URL from file written by setup-https-tunnel.sh
 * This allows tunnels to "just work" without manually setting NEOTOMA_HOST_URL
 */
function discoverTunnelUrl(httpPort: number): string {
  const tunnelFiles = [
    "/tmp/ngrok-mcp-url.txt",  // Combined scripts write here
    "/tmp/cloudflared-tunnel.txt"  // Alternative for cloudflare-only
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

export const config = {
  projectRoot,
  storageBackend,
  dataDir,
  sqlitePath:
    process.env.NEOTOMA_SQLITE_PATH ||
    join(dataDir, env === "production" ? "neotoma.prod.db" : "neotoma.db"),
  rawStorageDir: process.env.NEOTOMA_RAW_STORAGE_DIR || join(dataDir, rawStorageSubdir),
  eventLogDir,
  logsDir,
  eventLogMirrorEnabled: process.env.NEOTOMA_EVENT_LOG_MIRROR === "true",
  // Kept as inert placeholders for backward-compatible call sites while remote storage is removed.
  authServerUrl: "",
  authServiceKey: "",
  openaiApiKey: getOpenAIConfig(),
  port: parseInt(
    process.env.NEOTOMA_PORT || process.env.PORT || "3000",
    10
  ),
  httpPort,
  environment: env,
  apiBase:
    process.env.NEOTOMA_HOST_URL ||
    discoverTunnelUrl(httpPort),
  mcpTokenEncryptionKey:
    process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY ||
    process.env.MCP_TOKEN_ENCRYPTION_KEY ||
    "",
  oauthClientId: process.env.NEOTOMA_OAUTH_CLIENT_ID || "",
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
      process.env.NEOTOMA_ICON_GENERATION_MODEL ||
      process.env.ICON_GENERATION_MODEL ||
      "gpt-4o",
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
  } else if (discovered?.file) {
    console.log(`[Config] NEOTOMA_HOST_URL not set; auto-discovered tunnel URL from ${discovered.file}: ${discovered.url}`);
  } else {
    console.log(`[Config] NEOTOMA_HOST_URL not set and no tunnel URL file found; using localhost:${config.httpPort}`);
  }
  
  console.log(`[Config] API base (apiBase): ${config.apiBase}`);
  console.log(`[Config] Storage backend: ${config.storageBackend}`);
  console.log(`[Config] Environment: ${config.environment}`);
}