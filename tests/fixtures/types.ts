/**
 * TypeScript Types for Fixtures
 *
 * Defines types for all fixture structures to ensure type safety.
 */

export interface HoldingFixture {
  schema_version: string;
  snapshot_date: string;
  asset_symbol: string;
  asset_name?: string;
  asset_type?: string;
  quantity: number;
  cost_basis_usd?: number;
  current_value_usd: number;
  account_id?: string;
  account_type?: string;
  provider?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface IncomeFixture {
  schema_version: string;
  income_date: string;
  income_type?: string;
  source: string;
  amount_usd: number;
  amount_original?: number;
  currency_original?: string;
  description?: string;
  entity?: string;
  tax_year: number;
  import_date?: string;
  import_source_file?: string;
}

export interface TaxEventFixture {
  schema_version: string;
  event_date: string;
  event_type?: string;
  asset_symbol: string;
  quantity?: number;
  cost_basis_usd?: number;
  proceeds_usd?: number;
  gain_loss_usd: number;
  tax_year: number;
  jurisdiction?: string;
  description?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface CryptoTransactionFixture {
  schema_version: string;
  transaction_date: string;
  transaction_type?: string;
  blockchain?: string;
  from_address?: string;
  to_address?: string;
  asset_symbol: string;
  quantity?: number;
  value_usd: number;
  fee_usd?: number;
  tx_hash: string;
  wallet_id?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface LiabilityFixture {
  schema_version: string;
  name: string;
  liability_type?: string;
  amount_usd: number;
  amount_original?: number;
  currency_original?: string;
  snapshot_date: string;
  notes?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface FlowFixture {
  schema_version: string;
  flow_name: string;
  flow_date: string;
  year?: number;
  timeline?: string;
  amount_usd: number;
  amount_original?: number;
  currency_original?: string;
  for_cash_flow?: boolean;
  party?: string;
  flow_type?: string;
  location?: string;
  category?: string;
  notes?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface PurchaseFixture {
  schema_version: string;
  item_name: string;
  status: string;
  location?: string;
  priority?: string;
  estimated_cost_usd?: number;
  actual_cost_usd?: number;
  currency?: string;
  category?: string;
  vendor?: string;
  created_date: string;
  completed_date?: string | null;
  notes?: string;
}

export interface TransferFixture {
  schema_version: string;
  name: string;
  status?: string;
  amount?: number;
  origin_account: string;
  destination_account: string;
  created_time: string;
  deposit_address?: string;
  fees?: number;
  transaction?: string;
  transactions?: string;
  notes?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface WalletFixture {
  schema_version: string;
  name: string;
  number?: number;
  accounts?: string;
  categories?: string;
  url?: string;
  urls?: string;
  investments?: string;
  status: string;
  notes?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface TaxFilingFixture {
  schema_version: string;
  name: string;
  jurisdiction: string;
  year: number;
  filings?: string;
  status: string;
  companies?: string;
  due_date?: string;
  filed_date?: string | null;
  amount_owed?: number;
  amount_paid?: number;
  currency?: string;
  notes?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface OrderFixture {
  schema_version: string;
  name: string;
  status?: string;
  accounts?: string;
  amount?: number;
  asset_type?: string;
  order_type: string;
  price?: number;
  url?: string;
  date: string;
  notes?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface FixedCostFixture {
  schema_version: string;
  merchant: string;
  expense_name: string;
  expense_type?: string;
  location?: string;
  frequency_per_year: number;
  payment_amount_eur?: number;
  payment_amount_usd?: number;
  yearly_amount_eur?: number;
  yearly_amount_usd?: number;
  monthly_amount_eur?: number;
  monthly_amount_usd?: number;
  percent_fixed_expenses?: number;
  percent_net_income?: number;
  inflates?: boolean;
  status: string;
  notes?: string;
  renews?: string;
  started?: string;
  ended?: string;
  payment_method?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface PropertyFixture {
  schema_version: string;
  name: string;
  address: string;
  type?: string;
  purchase_date: string;
  purchase_price?: number;
  current_value?: number;
  currency?: string;
  notes?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface BalanceFixture {
  schema_version: string;
  snapshot_date: string;
  account_id: string;
  account_type?: string;
  account_name?: string;
  balance_usd: number;
  balance_original?: number;
  currency_original?: string;
  provider?: string;
  import_date?: string;
  import_source_file?: string;
}

export interface TransactionFixture {
  schema_version: string;
  amount: number;
  amount_original?: number;
  currency: string;
  date: string;
  posting_date?: string;
  merchant_name: string;
  status: string;
  account_id: string;
  category?: string;
  bank_provider?: string;
}

export interface ContactFixture {
  schema_version: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  role?: string;
  contact_type?: string;
  category?: string;
  platform?: string;
  address?: string;
  country?: string;
  website?: string;
  notes?: string;
  first_contact_date?: string;
  last_contact_date?: string;
  created_date?: string;
  updated_date?: string;
}

export interface ContractFixture {
  schema_version: string;
  contract_number?: string;
  parties?: string;
  effective_date?: string;
  expiration_date?: string;
  status?: string;
  name?: string;
  signed_date?: string;
  companies?: string;
  files?: string;
  type?: string;
  notes?: string;
}

export interface AccountFixture {
  schema_version: string;
  external_id: string;
  institution: string;
  balance?: number;
  currency: string;
  status: string;
  wallet?: string;
  wallet_name?: string;
  number?: string;
  categories?: string;
  denomination?: string;
  notes?: string;
}

export type FixtureType =
  | HoldingFixture
  | IncomeFixture
  | TaxEventFixture
  | CryptoTransactionFixture
  | LiabilityFixture
  | FlowFixture
  | PurchaseFixture
  | TransferFixture
  | WalletFixture
  | TaxFilingFixture
  | OrderFixture
  | FixedCostFixture
  | PropertyFixture
  | BalanceFixture
  | TransactionFixture
  | ContactFixture
  | ContractFixture
  | AccountFixture;
