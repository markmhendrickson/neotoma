import { z } from "zod";

const plaidEnvSchema = z.enum(["sandbox", "development", "production"]).catch("sandbox");

export type PlaidEnvironment = z.infer<typeof plaidEnvSchema>;

export interface PlaidConfig {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
  products: string[];
  countryCodes: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  redirectUri?: string;
  isConfigured: boolean;
  linkDefaults?: {
    userId?: string;
    clientName?: string;
  };
}

function parseCommaSeparated(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getPlaidConfig(): PlaidConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  
  // Determine which Plaid environment to use
  const environment = plaidEnvSchema.parse(
    (process.env.PLAID_ENV || process.env.PLAID_ENVIRONMENT || "").toLowerCase()
  );

  // Use environment-specific variables to prevent dev/prod mixups
  let clientId: string;
  let secret: string;
  
  if (nodeEnv === "production") {
    // Production: ONLY use PROD_* variables, never generic PLAID_* to prevent accidental dev/prod mixups
    clientId = process.env.PROD_PLAID_CLIENT_ID || "";
    secret = process.env.PROD_PLAID_SECRET || "";
  } else {
    // Development/test: ONLY use DEV_* variables, never generic PLAID_* to prevent accidental prod usage
    clientId = process.env.DEV_PLAID_CLIENT_ID || "";
    secret = process.env.DEV_PLAID_SECRET || "";
  }

  const products = parseCommaSeparated(process.env.PLAID_PRODUCTS, ["transactions"]);
  const countryCodes = parseCommaSeparated(process.env.PLAID_COUNTRY_CODES, ["US"]);

  return {
    clientId,
    secret,
    environment,
    products,
    countryCodes,
    webhookUrl: process.env.PLAID_WEBHOOK_URL || undefined,
    webhookSecret: process.env.PLAID_WEBHOOK_SECRET || undefined,
    redirectUri: process.env.PLAID_REDIRECT_URI || undefined,
    isConfigured: Boolean(clientId && secret),
    linkDefaults: {
      userId: process.env.PLAID_LINK_USER_ID || undefined,
      clientName: process.env.PLAID_LINK_CLIENT_NAME || undefined,
    },
  };
}
