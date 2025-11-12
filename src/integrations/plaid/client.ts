import {
  AccountBase,
  AccountsBalanceGetRequest,
  AccountsBalanceGetResponse,
  CountryCode,
  Institution,
  InstitutionsGetByIdRequest,
  Item,
  ItemGetRequest,
  ItemGetResponse,
  ItemPublicTokenExchangeRequest,
  LinkTokenCreateRequest,
  PlaidApi,
  PlaidApiError,
  PlaidError,
  PlaidEnvironments,
  Products,
  RemovedTransaction,
  Transaction,
  TransactionsSyncRequest,
} from 'plaid';
import { Configuration } from 'plaid/dist/configuration.js';
import { config } from '../../config.js';
import type { PlaidEnvironment } from '../../config/plaid.js';

type SyncCursor = string | null | undefined;

const MAX_SYNC_PAGES = 10;
const DEFAULT_CLIENT_NAME = 'Neotoma';

const productAllowList = new Set<Products>([
  'assets',
  'auth',
  'balance',
  'credit_details',
  'deposit_switch',
  'employment',
  'income',
  'income_verification',
  'investments',
  'liabilities',
  'payment_initiation',
  'signal',
  'transactions',
  'transfer',
  'wallet',
]);

const environmentBasePaths: Record<PlaidEnvironment, string> = {
  sandbox: PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production: PlaidEnvironments.production,
};

function toProducts(input: string[]): Products[] {
  const normalized = input
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) as Products[];

  const filtered = normalized.filter((value) => productAllowList.has(value));
  return filtered.length > 0 ? filtered : ['transactions'];
}

function toCountryCodes(input: string[]): CountryCode[] {
  return input
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value)) as CountryCode[];
}

export interface LinkTokenOptions {
  userId: string;
  clientName?: string;
  accessToken?: string;
  products?: string[];
  redirectUri?: string;
}

export interface ExchangePublicTokenResult {
  accessToken: string;
  itemId: string;
  requestId: string;
}

export interface TransactionsSyncOptions {
  accessToken: string;
  cursor?: SyncCursor;
}

export interface TransactionsSyncResult {
  accounts: AccountBase[];
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  nextCursor: string;
}

export interface PlaidItemContext {
  item: Item;
  institution?: Institution;
  accounts: AccountBase[];
}

let plaidClient: PlaidApi | null = null;

export function isPlaidConfigured(): boolean {
  return config.plaid.isConfigured;
}

export class PlaidNotConfiguredError extends Error {
  constructor() {
    super('Plaid configuration missing. Set PLAID_CLIENT_ID and PLAID_SECRET.');
    this.name = 'PlaidNotConfiguredError';
  }
}

function getPlaidClient(): PlaidApi {
  if (!config.plaid.isConfigured) {
    throw new PlaidNotConfiguredError();
  }

  if (!plaidClient) {
    const configuration = new Configuration({
      basePath: environmentBasePaths[config.plaid.environment],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': config.plaid.clientId,
          'PLAID-SECRET': config.plaid.secret,
        },
      },
    });

    plaidClient = new PlaidApi(configuration);
  }

  return plaidClient;
}

export async function createLinkToken(options: LinkTokenOptions) {
  const client = getPlaidClient();

  const products = toProducts(options.products ?? config.plaid.products);
  const countryCodes = toCountryCodes(config.plaid.countryCodes);
  const userId = options.userId || config.plaid.linkDefaults?.userId;
  const clientName = options.clientName || config.plaid.linkDefaults?.clientName || DEFAULT_CLIENT_NAME;

  if (!userId) {
    throw new Error('Missing user_id for Plaid Link token (set PLAID_LINK_USER_ID or pass user_id).');
  }

  const request: LinkTokenCreateRequest = {
    user: { client_user_id: userId },
    client_name: clientName,
    products,
    language: 'en',
    country_codes: countryCodes.length > 0 ? countryCodes : ['US'],
  };

  if (config.plaid.webhookUrl) {
    request.webhook = config.plaid.webhookUrl;
  }

  if (options.accessToken) {
    request.access_token = options.accessToken;
  }

  const redirectUri = options.redirectUri || config.plaid.redirectUri;
  if (redirectUri) {
    request.redirect_uri = redirectUri;
  }

  const response = await client.linkTokenCreate(request);
  return response.data;
}

export async function exchangePublicToken(
  publicToken: string
): Promise<ExchangePublicTokenResult> {
  const client = getPlaidClient();

  const request: ItemPublicTokenExchangeRequest = {
    public_token: publicToken,
  };

  const response = await client.itemPublicTokenExchange(request);

  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
    requestId: response.data.request_id,
  };
}

export async function fetchItem(accessToken: string): Promise<ItemGetResponse['item']> {
  const client = getPlaidClient();
  const request: ItemGetRequest = {
    access_token: accessToken,
  };

  const response: ItemGetResponse = await client.itemGet(request);
  return response.data.item;
}

export async function fetchInstitution(
  institutionId: string
): Promise<Institution | undefined> {
  const client = getPlaidClient();
  const countryCodes = toCountryCodes(config.plaid.countryCodes);

  const request: InstitutionsGetByIdRequest = {
    institution_id: institutionId,
    country_codes: countryCodes.length > 0 ? countryCodes : ['US'],
  };

  try {
    const response = await client.institutionsGetById(request);
    return response.data.institution;
  } catch (error) {
    const plaidError = normalizePlaidError(error);
    if (plaidError?.code === 'INSTITUTION_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

export async function fetchAccounts(accessToken: string): Promise<AccountBase[]> {
  const client = getPlaidClient();
  const request: AccountsBalanceGetRequest = {
    access_token: accessToken,
  };

  const response: AccountsBalanceGetResponse = await client.accountsBalanceGet(request);
  return response.data.accounts;
}

export async function syncTransactions(
  options: TransactionsSyncOptions
): Promise<TransactionsSyncResult> {
  const client = getPlaidClient();

  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];
  let cursor: SyncCursor = options.cursor ?? null;
  let iterations = 0;
  let hasMore = true;

  while (hasMore) {
    if (iterations >= MAX_SYNC_PAGES) {
      throw new Error('Exceeded maximum Plaid sync pagination iterations.');
    }

    const request: TransactionsSyncRequest = {
      access_token: options.accessToken,
      cursor: cursor ?? undefined,
      options: {
        include_personal_finance_category: true,
        include_original_description: true,
      },
    };

    const response = await client.transactionsSync(request);
    const data = response.data;

    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);

    hasMore = data.has_more ?? false;
    cursor = data.next_cursor ?? cursor;
    iterations += 1;
  }

  const accounts = await fetchAccounts(options.accessToken);

  return {
    accounts,
    added,
    modified,
    removed,
    nextCursor: cursor ?? '',
  };
}

export async function buildPlaidItemContext(
  accessToken: string,
  preloadedAccounts?: AccountBase[]
): Promise<PlaidItemContext> {
  const item = await fetchItem(accessToken);
  const accounts = preloadedAccounts ?? (await fetchAccounts(accessToken));

  let institution: Institution | undefined;
  if (item.institution_id) {
    institution = await fetchInstitution(item.institution_id);
  }

  return {
    item,
    institution,
    accounts,
  };
}

export interface NormalizedPlaidError {
  type: string;
  code: string;
  message: string;
  displayMessage?: string;
  status?: number;
  requestId?: string;
}

export function normalizePlaidError(error: unknown): NormalizedPlaidError | undefined {
  const maybeApiError = error as PlaidApiError;
  const plaidError: PlaidError | undefined = maybeApiError?.response?.data?.error;

  if (!plaidError) {
    return undefined;
  }

  return {
    type: plaidError.error_type,
    code: plaidError.error_code,
    message: plaidError.error_message,
    displayMessage: plaidError.display_message ?? undefined,
    status: plaidError.status_code ?? undefined,
    requestId: plaidError.request_id ?? undefined,
  };
}

export async function createSandboxPublicToken(
  institutionId = 'ins_109508',
  products?: string[]
): Promise<string> {
  const client = getPlaidClient();
  const initialProducts = toProducts(products ?? config.plaid.products);

  const response = await client.sandboxPublicTokenCreate({
    institution_id: institutionId,
    initial_products: initialProducts,
  });

  return response.data.public_token;
}

