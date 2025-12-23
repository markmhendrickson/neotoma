import dotenv from "dotenv";
import { getPlaidConfig } from "./config/plaid.js";

const env = process.env.NODE_ENV || "development";

// Load environment-specific .env files
if (env === "production") {
  dotenv.config({ path: ".env.production" });
  dotenv.config(); // Load .env as fallback
} else {
  // Development/test: load .env
  dotenv.config(); // Load .env
}

function getSupabaseConfig() {
  const buildUrl = (projectId: string | undefined, fallbackUrl: string | undefined) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || "";
  };

  if (env === "production") {
    // Production: ONLY use PROD_* variables, never generic SUPABASE_* to prevent accidental dev/prod mixups
    const prodId = process.env.PROD_SUPABASE_PROJECT_ID;
    return {
      url: buildUrl(prodId, process.env.PROD_SUPABASE_URL),
      key: process.env.PROD_SUPABASE_SERVICE_KEY || "",
    };
  }

  // Development/test: ONLY use DEV_* variables, never generic SUPABASE_* to prevent accidental prod usage
  const devId = process.env.DEV_SUPABASE_PROJECT_ID;
  return {
    url: buildUrl(devId, process.env.DEV_SUPABASE_URL),
    key: process.env.DEV_SUPABASE_SERVICE_KEY || "",
  };
}

const supabaseConfig = getSupabaseConfig();

function getOpenAIConfig() {
  if (env === "production") {
    // Production: ONLY use PROD_* variables, never generic OPENAI_API_KEY to prevent accidental dev/prod mixups
    return process.env.PROD_OPENAI_API_KEY || "";
  }

  // Development/test: ONLY use DEV_* variables, never generic OPENAI_API_KEY to prevent accidental prod usage
  return process.env.DEV_OPENAI_API_KEY || "";
}

function getConnectorSecretKey() {
  if (env === "production") {
    // Production: ONLY use PROD_* variables, never generic CONNECTOR_SECRET_KEY to prevent accidental dev/prod mixups
    return (
      process.env.PROD_CONNECTOR_SECRET_KEY ||
      // Backward compatibility: support generic name during transition
      process.env.CONNECTOR_SECRET_KEY ||
      process.env.CONNECTOR_SECRETS_KEY ||
      ""
    );
  }

  // Development/test: ONLY use DEV_* variables, never generic CONNECTOR_SECRET_KEY to prevent accidental prod usage
  return (
    process.env.DEV_CONNECTOR_SECRET_KEY ||
    // Backward compatibility: support generic name during transition
    process.env.CONNECTOR_SECRET_KEY ||
    process.env.CONNECTOR_SECRETS_KEY ||
    ""
  );
}

export const config = {
  supabaseUrl: supabaseConfig.url,
  supabaseKey: supabaseConfig.key,
  openaiApiKey: getOpenAIConfig(),
  connectorSecretKey: getConnectorSecretKey(),
  port: parseInt(process.env.PORT || "3000", 10),
  httpPort: parseInt(process.env.HTTP_PORT || "8080", 10),
  environment: env,
  plaid: getPlaidConfig(),
};

if (!config.supabaseUrl || !config.supabaseKey) {
  const envFile = env === "production" ? ".env.production" : ".env";
  if (env === "production") {
    throw new Error(
      `Missing Supabase configuration for production environment. ` +
        `Create ${envFile} with PROD_SUPABASE_PROJECT_ID (preferred) or PROD_SUPABASE_URL, and PROD_SUPABASE_SERVICE_KEY.`
    );
  } else {
    throw new Error(
      `Missing Supabase configuration for ${env} environment. ` +
        `Create ${envFile} with DEV_SUPABASE_PROJECT_ID (preferred) or DEV_SUPABASE_URL, and DEV_SUPABASE_SERVICE_KEY.`
    );
  }
}

export { type PlaidConfig, type PlaidEnvironment } from "./config/plaid.js";
