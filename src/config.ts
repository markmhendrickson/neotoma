import dotenv from "dotenv";
import { getPlaidConfig } from "./config/plaid.js";

const env = process.env.NODE_ENV || 'development';

// Load environment-specific .env files
if (env === 'production') {
  dotenv.config({ path: '.env.production' });
  dotenv.config(); // Load .env as fallback
} else {
  // Development/test: load .env.development if it exists, otherwise .env
  dotenv.config({ path: '.env.development' });
  dotenv.config(); // Always load .env as fallback
}

function getSupabaseConfig() {
  const buildUrl = (projectId: string | undefined, fallbackUrl: string | undefined) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || '';
  };

  if (env === 'production') {
    const prodId = process.env.PROD_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID;
    return {
      url: buildUrl(prodId, process.env.PROD_SUPABASE_URL || process.env.SUPABASE_URL),
      key: process.env.PROD_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    };
  }

  // Development/test uses DEV_* or generic variables
  const devId = process.env.DEV_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID;
  return {
    url: buildUrl(devId, process.env.DEV_SUPABASE_URL || process.env.SUPABASE_URL),
    key: process.env.DEV_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
  };
}

const supabaseConfig = getSupabaseConfig();

export const config = {
  supabaseUrl: supabaseConfig.url,
  supabaseKey: supabaseConfig.key,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  connectorSecretKey: process.env.CONNECTOR_SECRET_KEY || process.env.CONNECTOR_SECRETS_KEY || '',
  port: parseInt(process.env.PORT || '3000', 10),
  httpPort: parseInt(process.env.HTTP_PORT || '8080', 10),
  environment: env,
  plaid: getPlaidConfig(),
};

if (!config.supabaseUrl || !config.supabaseKey) {
  const envFile = env === 'production' ? '.env.production' : '.env.development';
  throw new Error(
    `Missing Supabase configuration for ${env} environment. ` +
    `Create ${envFile} or .env with DEV_SUPABASE_URL and DEV_SUPABASE_SERVICE_KEY (for dev/test), ` +
    `or PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_KEY (for production), ` +
    `or use generic SUPABASE_URL and SUPABASE_SERVICE_KEY for backward compatibility.`
  );
}

export { type PlaidConfig, type PlaidEnvironment } from "./config/plaid.js";


