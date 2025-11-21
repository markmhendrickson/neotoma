import type {
  AccountBase,
  Institution,
  Item,
  Transaction,
} from 'plaid';

export interface NormalizedPlaidRecord {
  type: 'account' | 'transaction';
  externalSource: 'plaid';
  externalId?: string;
  externalHash?: string;
  properties: Record<string, unknown>;
}

export interface AccountNormalizationInput {
  plaidItemId: string;
  environment: string;
  item: Item;
  institution?: Institution;
  account: AccountBase;
}

export interface TransactionNormalizationInput {
  plaidItemId: string;
  environment: string;
  item: Item;
  institution?: Institution;
  accountLookup: Map<string, AccountBase>;
  transaction: Transaction;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
  ) as T;
}

function normalizeInstitution(
  institution?: Institution,
  fallbackName?: string | null
) {
  if (!institution && !fallbackName) return undefined;

  return omitUndefined({
    id: institution?.institution_id ?? null,
    name: institution?.name ?? fallbackName ?? null,
    products: institution?.products,
    url: institution?.url ?? undefined,
    primary_color: institution?.primary_color ?? undefined,
    logo: institution?.logo ?? undefined,
  });
}

type LegacyAccountBase = AccountBase & {
  status?: string | null;
  classification?: string | null;
};

export function normalizeAccount({
  plaidItemId,
  environment,
  item,
  institution,
  account,
}: AccountNormalizationInput): NormalizedPlaidRecord {
  const externalId = `plaid:account:${account.account_id}`;

  const balances = account.balances || {};
  const legacyAccount = account as LegacyAccountBase;

  const properties = omitUndefined({
    provider: 'plaid',
    provider_environment: environment,
    plaid_item_id: plaidItemId,
    plaid_account_id: account.account_id,
    item_id: item.item_id,
    external_id: externalId,
    institution: normalizeInstitution(institution, item.institution_id),
    name: account.name,
    official_name: account.official_name,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    verification_status: account.verification_status,
    persistent_account_id: account.persistent_account_id,
    balances: omitUndefined({
      available: balances.available ?? undefined,
      current: balances.current ?? undefined,
      limit: balances.limit ?? undefined,
      iso_currency_code: balances.iso_currency_code ?? undefined,
      unofficial_currency_code: balances.unofficial_currency_code ?? undefined,
    }),
    status: legacyAccount.status ?? undefined,
    raw: omitUndefined({
      classification: legacyAccount.classification ?? undefined,
      currency_codes: omitUndefined({
        iso: balances.iso_currency_code ?? undefined,
        unofficial: balances.unofficial_currency_code ?? undefined,
      }),
    }),
  });

  return {
    type: 'account',
    externalSource: 'plaid',
    externalId,
    properties,
  };
}

function normalizeLocation(transaction: Transaction) {
  const loc = transaction.location;
  if (!loc) return undefined;

  return omitUndefined({
    address: loc.address ?? undefined,
    city: loc.city ?? undefined,
    region: loc.region ?? undefined,
    postal_code: loc.postal_code ?? undefined,
    country: loc.country ?? undefined,
    latitude: loc.lat ?? undefined,
    longitude: loc.lon ?? undefined,
  });
}

function normalizeAccountSnapshot(
  accountLookup: Map<string, AccountBase>,
  accountId: string
) {
  const account = accountLookup.get(accountId);
  if (!account) return undefined;

  const balances = account.balances || {};

  return omitUndefined({
    plaid_account_id: account.account_id,
    name: account.name,
    official_name: account.official_name,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    balances: omitUndefined({
      available: balances.available ?? undefined,
      current: balances.current ?? undefined,
      iso_currency_code: balances.iso_currency_code ?? undefined,
    }),
  });
}

function normalizeFinanceCategory(transaction: Transaction) {
  const category = transaction.personal_finance_category;
  if (!category) return undefined;

  return omitUndefined({
    primary: category.primary,
    detailed: category.detailed,
    confidence_level: category.confidence_level,
  });
}

function normalizePaymentMeta(transaction: Transaction) {
  const paymentMeta = transaction.payment_meta;
  if (!paymentMeta) return undefined;

  return omitUndefined({
    by_order_of: paymentMeta.by_order_of ?? undefined,
    payee: paymentMeta.payee ?? undefined,
    payer: paymentMeta.payer ?? undefined,
    payment_method: paymentMeta.payment_method ?? undefined,
    payment_processor: paymentMeta.payment_processor ?? undefined,
    ppd_id: paymentMeta.ppd_id ?? undefined,
    reason: paymentMeta.reason ?? undefined,
    reference_number: paymentMeta.reference_number ?? undefined,
  });
}

export function normalizeTransaction({
  plaidItemId,
  environment,
  item,
  institution,
  accountLookup,
  transaction,
}: TransactionNormalizationInput): NormalizedPlaidRecord {
  const externalId = `plaid:transaction:${transaction.transaction_id}`;

  const properties = omitUndefined({
    provider: 'plaid',
    provider_environment: environment,
    plaid_item_id: plaidItemId,
    plaid_transaction_id: transaction.transaction_id,
    plaid_account_id: transaction.account_id,
    item_id: item.item_id,
    external_id: externalId,
    institution: normalizeInstitution(institution, item.institution_id),
    account: normalizeAccountSnapshot(accountLookup, transaction.account_id),
    name: transaction.name,
    merchant_name: transaction.merchant_name,
    merchant_entity_id: (transaction as any).merchant_entity_id ?? undefined,
    amount: transaction.amount,
    iso_currency_code: transaction.iso_currency_code,
    unofficial_currency_code: transaction.unofficial_currency_code,
    pending: transaction.pending,
    status: transaction.pending ? 'pending' : 'posted',
    payment_channel: transaction.payment_channel,
    category: transaction.category,
    category_id: transaction.category_id,
    personal_finance_category: normalizeFinanceCategory(transaction),
    counterparties: (transaction as any).counterparties ?? undefined,
    date: transaction.date,
    authorized_date: transaction.authorized_date ?? undefined,
    datetime: (transaction as any).datetime ?? undefined,
    authorized_datetime: (transaction as any).authorized_datetime ?? undefined,
    location: normalizeLocation(transaction),
    payment_meta: normalizePaymentMeta(transaction),
    transaction_code: (transaction as any).transaction_code ?? undefined,
    reference: (transaction as any).reference_number ?? undefined,
    account_owner: transaction.account_owner ?? undefined,
    check_number: transaction.check_number ?? undefined,
    pending_transaction_id: transaction.pending_transaction_id ?? undefined,
    raw: omitUndefined({
      logo_url: (transaction as any).logo_url ?? undefined,
      website: (transaction as any).website ?? undefined,
      authorized_description: (transaction as any).authorized_description ?? undefined,
      original_description: (transaction as any).original_description ?? undefined,
    }),
  });

  return {
    type: 'transaction',
    externalSource: 'plaid',
    externalId,
    properties,
  };
}

