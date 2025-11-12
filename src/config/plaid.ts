import { z } from 'zod';

const plaidEnvSchema = z
  .enum(['sandbox', 'development', 'production'])
  .catch('sandbox');

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
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getPlaidConfig(): PlaidConfig {
  const environment = plaidEnvSchema.parse(
    (process.env.PLAID_ENV || process.env.PLAID_ENVIRONMENT || '').toLowerCase()
  );

  const clientId = process.env.PLAID_CLIENT_ID || '';
  const secret =
    process.env.PLAID_SECRET ||
    (environment === 'sandbox' ? process.env.PLAID_SANDBOX_SECRET || '' : '');

  const products = parseCommaSeparated(process.env.PLAID_PRODUCTS, ['transactions']);
  const countryCodes = parseCommaSeparated(process.env.PLAID_COUNTRY_CODES, ['US']);

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


