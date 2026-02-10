import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Use NEOTOMA_ENV to avoid conflicts when running as MCP in other workspaces
// Falls back to NODE_ENV for backward compatibility
const env = process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development";

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

function getSupabaseConfig() {
  const buildUrl = (projectId: string | undefined, fallbackUrl: string | undefined) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || "";
  };

  // Use single variable names (set by 1Password sync based on ENVIRONMENT variable)
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const url = process.env.SUPABASE_URL;

  return {
    url: buildUrl(projectId, url),
    key: serviceKey || "",
  };
}

const supabaseConfig = getSupabaseConfig();

function getOpenAIConfig() {
  // Use OPENAI_API_KEY (set by 1Password sync based on ENVIRONMENT variable)
  return process.env.OPENAI_API_KEY || "";
}

// Default ports differ by environment so dev and prod can run in parallel (dev=8080, prod=8082)
const defaultHttpPort = env === "production" ? "8082" : "8080";
const httpPort = parseInt(process.env.HTTP_PORT || defaultHttpPort, 10);
const storageBackend = process.env.NEOTOMA_STORAGE_BACKEND || "local";
const dataDir = process.env.NEOTOMA_DATA_DIR || join(projectRoot, "data");
const rawStorageSubdir = env === "production" ? "sources_prod" : "sources";
const eventLogSubdir = env === "production" ? "events_prod" : "events";
const logsSubdir = env === "production" ? "logs_prod" : "logs";
const eventLogDir = process.env.NEOTOMA_EVENT_LOG_DIR || join(dataDir, eventLogSubdir);
const logsDir = process.env.NEOTOMA_LOGS_DIR || join(dataDir, logsSubdir);

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
  supabaseUrl: supabaseConfig.url,
  supabaseKey: supabaseConfig.key,
  openaiApiKey: getOpenAIConfig(),
  port: parseInt(process.env.PORT || "3000", 10),
  httpPort,
  environment: env,
  apiBase: process.env.API_BASE_URL || `http://localhost:${httpPort}`,
  mcpTokenEncryptionKey: process.env.MCP_TOKEN_ENCRYPTION_KEY || "",
  oauthClientId: process.env.SUPABASE_OAUTH_CLIENT_ID || "",
  
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
    enabled: process.env.ICON_GENERATION_ENABLED !== "false", // Enabled by default
    confidenceThreshold: parseFloat(process.env.ICON_MATCH_CONFIDENCE_THRESHOLD || "0.8"),
    model: process.env.ICON_GENERATION_MODEL || "gpt-4o",
    cacheTTL: parseInt(process.env.ICON_CACHE_TTL || "86400", 10), // 24 hours default
  },
};

if (config.storageBackend === "supabase" && (!config.supabaseUrl || !config.supabaseKey)) {
  const envFile = env === "production" ? ".env.production" : ".env";
  if (env === "production") {
    throw new Error(
      `Missing Supabase configuration for production environment. ` +
        `NEOTOMA_ENV is set to "production" but Supabase variables are missing. ` +
        `Options: 1) Set NEOTOMA_ENV=development, or ` +
        `2) Provide SUPABASE_PROJECT_ID (or SUPABASE_URL) and SUPABASE_SERVICE_KEY ` +
        `in ${envFile} or via 1Password sync with ENVIRONMENT=production.`
    );
  } else {
    throw new Error(
      `Missing Supabase configuration for ${env} environment. ` +
        `Create ${envFile} with SUPABASE_PROJECT_ID (or SUPABASE_URL) and SUPABASE_SERVICE_KEY, ` +
        `or sync from 1Password with ENVIRONMENT=development.`
    );
  }
}

