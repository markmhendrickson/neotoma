import dotenv from 'dotenv';

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
  // Production uses PROD_* variables
  if (env === 'production') {
    return {
      url: process.env.PROD_SUPABASE_URL || process.env.SUPABASE_URL || '',
      key: process.env.PROD_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    };
  }

  // Development/test uses DEV_* or generic variables
  return {
    url: process.env.DEV_SUPABASE_URL || process.env.SUPABASE_URL || '',
    key: process.env.DEV_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
  };
}

const supabaseConfig = getSupabaseConfig();

export const config = {
  supabaseUrl: supabaseConfig.url,
  supabaseKey: supabaseConfig.key,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  port: parseInt(process.env.PORT || '3000', 10),
  httpPort: parseInt(process.env.HTTP_PORT || '8080', 10),
  environment: env,
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


