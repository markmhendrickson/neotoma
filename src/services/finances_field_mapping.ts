/**
 * Field Mapping Functions for Finances Repository Data
 *
 * Maps fields from finances repository schemas to Neotoma record properties.
 * Handles field name differences, type conversions, and schema versioning.
 */

/**
 * Map finances transaction schema to Neotoma transaction properties
 */
export function mapTransactionFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    amount: financesRecord.amount_usd,
    amount_original: financesRecord.amount_original,
    currency: financesRecord.currency_original || "USD",
    date: financesRecord.transaction_date,
    posting_date: financesRecord.posting_date,
    merchant_name: financesRecord.description,
    status: "completed", // Default status for imported transactions
    account_id: financesRecord.account_id,
    category: financesRecord.category,
    bank_provider: financesRecord.bank_provider,
  };
}

/**
 * Map finances contact schema to Neotoma contact properties
 */
export function mapContactFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    name: financesRecord.name,
    email: financesRecord.email || "",
    phone: financesRecord.phone || "",
    organization: "", // Not in finances schema
    role: "", // Not in finances schema
    contact_type: financesRecord.contact_type,
    category: financesRecord.category,
    platform: financesRecord.platform,
    address: financesRecord.address,
    country: financesRecord.country,
    website: financesRecord.website,
    notes: financesRecord.notes,
    first_contact_date: financesRecord.first_contact_date,
    last_contact_date: financesRecord.last_contact_date,
    created_date: financesRecord.created_date,
    updated_date: financesRecord.updated_date,
  };
}

/**
 * Map finances contract schema to Neotoma contract properties
 */
export function mapContractFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    contract_number: financesRecord.contract_id || "",
    parties: financesRecord.companies || "",
    effective_date: financesRecord.signed_date || financesRecord.effective_date,
    expiration_date: financesRecord.expiration_date,
    status: financesRecord.status || "active",
    name: financesRecord.name,
    signed_date: financesRecord.signed_date,
    companies: financesRecord.companies,
    files: financesRecord.files,
    type: financesRecord.type,
    notes: financesRecord.notes,
  };
}

/**
 * Map finances holding schema to Neotoma holding properties
 */
export function mapHoldingFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    snapshot_date: financesRecord.snapshot_date,
    asset_symbol: financesRecord.asset_symbol,
    asset_name: financesRecord.asset_name,
    asset_type: financesRecord.asset_type,
    quantity: financesRecord.quantity,
    cost_basis_usd: financesRecord.cost_basis_usd,
    current_value_usd: financesRecord.current_value_usd,
    account_id: financesRecord.account_id,
    account_type: financesRecord.account_type,
    provider: financesRecord.provider,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances income schema to Neotoma income properties
 */
export function mapIncomeFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    income_date: financesRecord.income_date,
    income_type: financesRecord.income_type,
    source: financesRecord.source,
    amount_usd: financesRecord.amount_usd,
    amount_original: financesRecord.amount_original,
    currency_original: financesRecord.currency_original,
    description: financesRecord.description,
    entity: financesRecord.entity,
    tax_year: financesRecord.tax_year,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances tax_event schema to Neotoma tax_event properties
 */
export function mapTaxEventFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    event_date: financesRecord.event_date,
    event_type: financesRecord.event_type,
    asset_symbol: financesRecord.asset_symbol,
    quantity: financesRecord.quantity,
    cost_basis_usd: financesRecord.cost_basis_usd,
    proceeds_usd: financesRecord.proceeds_usd,
    gain_loss_usd: financesRecord.gain_loss_usd,
    tax_year: financesRecord.tax_year,
    jurisdiction: financesRecord.jurisdiction,
    description: financesRecord.description,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances crypto_transaction schema to Neotoma crypto_transaction properties
 */
export function mapCryptoTransactionFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    transaction_date: financesRecord.transaction_date,
    transaction_type: financesRecord.transaction_type,
    blockchain: financesRecord.blockchain,
    from_address: financesRecord.from_address,
    to_address: financesRecord.to_address,
    asset_symbol: financesRecord.asset_symbol,
    quantity: financesRecord.quantity,
    value_usd: financesRecord.value_usd,
    fee_usd: financesRecord.fee_usd,
    tx_hash: financesRecord.tx_hash || financesRecord.crypto_tx_id,
    wallet_id: financesRecord.wallet_id,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances liability schema to Neotoma liability properties
 */
export function mapLiabilityFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    name: financesRecord.name,
    liability_type: financesRecord.liability_type,
    amount_usd: financesRecord.amount_usd,
    amount_original: financesRecord.amount_original,
    currency_original: financesRecord.currency_original,
    snapshot_date: financesRecord.snapshot_date,
    notes: financesRecord.notes,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances flow schema to Neotoma flow properties
 */
export function mapFlowFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    flow_name: financesRecord.flow_name,
    flow_date: financesRecord.flow_date,
    year: financesRecord.year,
    timeline: financesRecord.timeline,
    amount_usd: financesRecord.amount_usd,
    amount_original: financesRecord.amount_original,
    currency_original: financesRecord.currency_original,
    for_cash_flow: financesRecord.for_cash_flow,
    party: financesRecord.party,
    flow_type: financesRecord.flow_type,
    location: financesRecord.location,
    category: financesRecord.category,
    notes: financesRecord.notes,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances purchase schema to Neotoma purchase properties
 */
export function mapPurchaseFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    item_name: financesRecord.item_name,
    status: financesRecord.status,
    location: financesRecord.location,
    priority: financesRecord.priority,
    estimated_cost_usd: financesRecord.estimated_cost_usd,
    actual_cost_usd: financesRecord.actual_cost_usd,
    currency: financesRecord.currency,
    category: financesRecord.category,
    vendor: financesRecord.vendor,
    created_date: financesRecord.created_date,
    completed_date: financesRecord.completed_date,
    notes: financesRecord.notes,
  };
}

/**
 * Map finances transfer schema to Neotoma transfer properties
 */
export function mapTransferFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    name: financesRecord.name,
    status: financesRecord.status,
    amount: financesRecord.amount,
    origin_account: financesRecord.origin_account,
    destination_account: financesRecord.destination_account,
    created_time: financesRecord.created_time,
    deposit_address: financesRecord.deposit_address,
    fees: financesRecord.fees,
    transaction: financesRecord.transaction,
    transactions: financesRecord.transactions,
    notes: financesRecord.notes,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances wallet schema to Neotoma wallet properties
 */
export function mapWalletFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    name: financesRecord.name,
    number: financesRecord.number,
    accounts: financesRecord.accounts,
    categories: financesRecord.categories,
    url: financesRecord.url,
    urls: financesRecord.urls,
    investments: financesRecord.investments,
    status: financesRecord.status,
    notes: financesRecord.notes,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances tax_filing schema to Neotoma tax_filing properties
 */
export function mapTaxFilingFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    name: financesRecord.name,
    jurisdiction: financesRecord.jurisdiction,
    year: financesRecord.year,
    filings: financesRecord.filings,
    status: financesRecord.status,
    companies: financesRecord.companies,
    due_date: financesRecord.due_date,
    filed_date: financesRecord.filed_date,
    amount_owed: financesRecord.amount_owed,
    amount_paid: financesRecord.amount_paid,
    currency: financesRecord.currency,
    notes: financesRecord.notes,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances order schema to Neotoma order properties
 */
export function mapOrderFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    name: financesRecord.name,
    status: financesRecord.status,
    accounts: financesRecord.accounts,
    amount: financesRecord.amount,
    asset_type: financesRecord.asset_type,
    order_type: financesRecord.order_type,
    price: financesRecord.price,
    url: financesRecord.url,
    date: financesRecord.date,
    notes: financesRecord.notes,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances fixed_cost schema to Neotoma fixed_cost properties
 */
export function mapFixedCostFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    merchant: financesRecord.merchant,
    expense_name: financesRecord.expense_name,
    expense_type: financesRecord.expense_type,
    location: financesRecord.location,
    frequency_per_year: financesRecord.frequency_per_year,
    payment_amount_eur: financesRecord.payment_amount_eur,
    payment_amount_usd: financesRecord.payment_amount_usd,
    yearly_amount_eur: financesRecord.yearly_amount_eur,
    yearly_amount_usd: financesRecord.yearly_amount_usd,
    monthly_amount_eur: financesRecord.monthly_amount_eur,
    monthly_amount_usd: financesRecord.monthly_amount_usd,
    percent_fixed_expenses: financesRecord.percent_fixed_expenses,
    percent_net_income: financesRecord.percent_net_income,
    inflates: financesRecord.inflates,
    status: financesRecord.status,
    notes: financesRecord.notes,
    renews: financesRecord.renews,
    started: financesRecord.started,
    ended: financesRecord.ended,
    payment_method: financesRecord.payment_method,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances property schema to Neotoma property properties
 */
export function mapPropertyFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    name: financesRecord.name,
    address: financesRecord.address,
    type: financesRecord.type,
    purchase_date: financesRecord.purchase_date,
    purchase_price: financesRecord.purchase_price,
    current_value: financesRecord.current_value,
    currency: financesRecord.currency,
    notes: financesRecord.notes,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances balance schema to Neotoma balance properties
 */
export function mapBalanceFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    snapshot_date: financesRecord.snapshot_date,
    account_id: financesRecord.account_id,
    account_type: financesRecord.account_type,
    account_name: financesRecord.account_name,
    balance_usd: financesRecord.balance_usd,
    balance_original: financesRecord.balance_original,
    currency_original: financesRecord.currency_original,
    provider: financesRecord.provider,
    import_date: financesRecord.import_date,
    import_source_file: financesRecord.import_source_file,
  };
}

/**
 * Map finances account schema to Neotoma account properties
 */
export function mapAccountFields(
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    external_id: financesRecord.account_id,
    institution: financesRecord.wallet_name || financesRecord.wallet || "",
    balance: 0, // Balance is tracked separately in balance records
    currency: financesRecord.denomination || "USD",
    status: financesRecord.status || "active",
    wallet: financesRecord.wallet,
    wallet_name: financesRecord.wallet_name,
    number: financesRecord.number,
    categories: financesRecord.categories,
    denomination: financesRecord.denomination,
    notes: financesRecord.notes,
  };
}

/**
 * Registry of mapping functions by record type
 */
export const FIELD_MAPPERS: Record<
  string,
  (record: Record<string, unknown>) => Record<string, unknown>
> = {
  transaction: mapTransactionFields,
  contact: mapContactFields,
  contract: mapContractFields,
  holding: mapHoldingFields,
  income: mapIncomeFields,
  tax_event: mapTaxEventFields,
  crypto_transaction: mapCryptoTransactionFields,
  liability: mapLiabilityFields,
  flow: mapFlowFields,
  purchase: mapPurchaseFields,
  transfer: mapTransferFields,
  wallet: mapWalletFields,
  tax_filing: mapTaxFilingFields,
  order: mapOrderFields,
  fixed_cost: mapFixedCostFields,
  property: mapPropertyFields,
  balance: mapBalanceFields,
  account: mapAccountFields,
};

/**
 * Map finances record to Neotoma record properties
 */
export function mapFinancesRecordToNeotoma(
  recordType: string,
  financesRecord: Record<string, unknown>,
): Record<string, unknown> {
  const mapper = FIELD_MAPPERS[recordType];
  if (!mapper) {
    // Fallback: return record as-is with schema_version
    return {
      schema_version: "1.0",
      ...financesRecord,
    };
  }
  return mapper(financesRecord);
}
