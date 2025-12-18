/**
 * Fixture Helper Functions
 *
 * Provides helper functions to generate fixture records for all record types
 * with sensible defaults and override support.
 */

/**
 * Base fixture generator with override support
 */
function createFixture(
  defaults: Record<string, unknown>,
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...defaults, ...overrides };
}

/**
 * Create holding fixture
 */
export function createHoldingFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      snapshot_date: new Date().toISOString(),
      asset_symbol: "AAPL",
      asset_name: "Apple Inc.",
      asset_type: "stock",
      quantity: 100,
      cost_basis_usd: 15000.0,
      current_value_usd: 18500.0,
      account_id: "acc-001",
      account_type: "brokerage",
      provider: "Fidelity",
    },
    overrides,
  );
}

/**
 * Create income fixture
 */
export function createIncomeFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      income_date: new Date().toISOString(),
      income_type: "consulting",
      source: "Acme Corp",
      amount_usd: 5000.0,
      amount_original: 5000.0,
      currency_original: "USD",
      description: "Consulting services",
      entity: "Acme Corp",
      tax_year: new Date().getFullYear(),
    },
    overrides,
  );
}

/**
 * Create tax event fixture
 */
export function createTaxEventFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      event_date: new Date().toISOString(),
      event_type: "sale",
      asset_symbol: "AAPL",
      quantity: 50,
      cost_basis_usd: 7500.0,
      proceeds_usd: 9500.0,
      gain_loss_usd: 2000.0,
      tax_year: new Date().getFullYear(),
      jurisdiction: "US",
      description: "Sale of assets",
    },
    overrides,
  );
}

/**
 * Create crypto transaction fixture
 */
export function createCryptoTransactionFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      transaction_date: new Date().toISOString(),
      transaction_type: "transfer",
      blockchain: "bitcoin",
      from_address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      to_address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
      asset_symbol: "BTC",
      quantity: 0.1,
      value_usd: 4000.0,
      fee_usd: 5.0,
      tx_hash:
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      wallet_id: "wallet-001",
    },
    overrides,
  );
}

/**
 * Create liability fixture
 */
export function createLiabilityFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      name: "Mortgage",
      liability_type: "mortgage",
      amount_usd: 500000.0,
      amount_original: 500000.0,
      currency_original: "USD",
      snapshot_date: new Date().toISOString(),
      notes: "Primary residence mortgage",
    },
    overrides,
  );
}

/**
 * Create flow fixture
 */
export function createFlowFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      flow_name: "Consulting Income",
      flow_date: new Date().toISOString(),
      year: new Date().getFullYear(),
      timeline: "Q1",
      amount_usd: 15000.0,
      amount_original: 15000.0,
      currency_original: "USD",
      for_cash_flow: true,
      party: "Acme Corp",
      flow_type: "income",
      location: "US",
      category: "consulting",
      notes: "Quarterly income",
    },
    overrides,
  );
}

/**
 * Create purchase fixture
 */
export function createPurchaseFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      item_name: "Office Desk",
      status: "pending",
      location: "Home Office",
      priority: "medium",
      estimated_cost_usd: 500.0,
      actual_cost_usd: 0,
      currency: "USD",
      category: "furniture",
      vendor: "IKEA",
      created_date: new Date().toISOString(),
      completed_date: null,
      notes: "Need for home office",
    },
    overrides,
  );
}

/**
 * Create transfer fixture
 */
export function createTransferFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      name: "Transfer to Savings",
      status: "pending",
      amount: 1000.0,
      origin_account: "acc-checking-001",
      destination_account: "acc-savings-001",
      created_time: new Date().toISOString(),
      deposit_address: "",
      fees: 0,
      transaction: "",
      transactions: "",
      notes: "Monthly transfer",
    },
    overrides,
  );
}

/**
 * Create wallet fixture
 */
export function createWalletFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      name: "Fidelity Brokerage",
      number: 1,
      accounts: "acc-001",
      categories: "investments",
      url: "https://fidelity.com",
      urls: "https://fidelity.com",
      investments: "AAPL",
      status: "active",
      notes: "Primary brokerage",
    },
    overrides,
  );
}

/**
 * Create tax filing fixture
 */
export function createTaxFilingFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      name: "US Federal Tax Return",
      jurisdiction: "US",
      year: new Date().getFullYear(),
      filings: "1040",
      status: "pending",
      companies: "",
      due_date: new Date(new Date().getFullYear() + 1, 3, 15).toISOString(),
      filed_date: null,
      amount_owed: 0,
      amount_paid: 0,
      currency: "USD",
      notes: "Annual tax return",
    },
    overrides,
  );
}

/**
 * Create order fixture
 */
export function createOrderFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      name: "Buy Stock",
      status: "pending",
      accounts: "acc-001",
      amount: 10000.0,
      asset_type: "stock",
      order_type: "buy",
      price: 100.0,
      url: "",
      date: new Date().toISOString(),
      notes: "Market order",
    },
    overrides,
  );
}

/**
 * Create fixed cost fixture
 */
export function createFixedCostFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      merchant: "Netflix",
      expense_name: "Netflix Subscription",
      expense_type: "entertainment",
      location: "US",
      frequency_per_year: 12,
      payment_amount_usd: 15.99,
      yearly_amount_usd: 191.88,
      monthly_amount_usd: 15.99,
      status: "active",
      payment_method: "credit_card",
      renews: "monthly",
      started: "2020-01-01",
      ended: "",
      notes: "Monthly subscription",
    },
    overrides,
  );
}

/**
 * Create property fixture
 */
export function createPropertyFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      name: "Primary Residence",
      address: "123 Main St, City, State 12345",
      type: "residential",
      purchase_date: new Date(2020, 5, 15).toISOString(),
      purchase_price: 500000.0,
      current_value: 650000.0,
      currency: "USD",
      notes: "Primary residence",
    },
    overrides,
  );
}

/**
 * Create balance fixture
 */
export function createBalanceFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      snapshot_date: new Date().toISOString(),
      account_id: "acc-checking-001",
      account_type: "checking",
      account_name: "Primary Checking",
      balance_usd: 10000.0,
      balance_original: 10000.0,
      currency_original: "USD",
      provider: "Chase Bank",
    },
    overrides,
  );
}

/**
 * Create transaction fixture (expanded)
 */
export function createTransactionFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      amount: -50.0,
      amount_original: -50.0,
      currency: "USD",
      date: new Date().toISOString(),
      posting_date: new Date().toISOString(),
      merchant_name: "Merchant",
      status: "completed",
      account_id: "acc-checking-001",
      category: "food",
      bank_provider: "Chase Bank",
    },
    overrides,
  );
}

/**
 * Create contact fixture (expanded)
 */
export function createContactFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      name: "John Doe",
      email: "john.doe@example.com",
      phone: "+1-555-0100",
      organization: "Acme Corp",
      role: "CEO",
      contact_type: "business",
      category: "client",
      platform: "minted",
      address: "123 Business St, City, State 12345",
      country: "US",
      website: "https://example.com",
      notes: "Business contact",
      first_contact_date: new Date().toISOString(),
      last_contact_date: new Date().toISOString(),
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    },
    overrides,
  );
}

/**
 * Create contract fixture (expanded)
 */
export function createContractFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      contract_number: "CNT-2024-001",
      parties: "Acme Corp, John Smith",
      effective_date: new Date().toISOString(),
      expiration_date: new Date(
        new Date().getFullYear() + 1,
        11,
        31,
      ).toISOString(),
      status: "active",
      name: "Consulting Agreement",
      signed_date: new Date().toISOString(),
      companies: "Acme Corp",
      files: "contract.pdf",
      type: "consulting",
      notes: "Consulting services agreement",
    },
    overrides,
  );
}

/**
 * Create account fixture (expanded)
 */
export function createAccountFixture(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return createFixture(
    {
      schema_version: "1.0",
      external_id: "acc-001",
      institution: "Chase Bank",
      balance: 10000.0,
      currency: "USD",
      status: "active",
      wallet: "Chase",
      wallet_name: "Chase Bank",
      number: "****1234",
      categories: "checking",
      denomination: "USD",
      notes: "Primary account",
    },
    overrides,
  );
}

/**
 * Create update variant for a record
 */
export function createUpdateVariant(
  baseRecord: Record<string, unknown>,
  changes: Record<string, unknown>,
  updatedAt?: string,
): Record<string, unknown> {
  return {
    ...baseRecord,
    ...changes,
    updated_at: updatedAt || new Date().toISOString(),
  };
}

/**
 * Create status transition variant
 */
export function createStatusTransition(
  baseRecord: Record<string, unknown>,
  fromStatus: string,
  toStatus: string,
  additionalChanges?: Record<string, unknown>,
): Record<string, unknown> {
  if (baseRecord.status !== fromStatus) {
    throw new Error(
      `Base record status (${baseRecord.status}) does not match expected fromStatus (${fromStatus})`,
    );
  }

  return createUpdateVariant(baseRecord, {
    status: toStatus,
    ...additionalChanges,
  });
}

/**
 * Create temporal sequence of balance snapshots
 */
export function createBalanceSnapshotSequence(
  accountId: string,
  dates: string[],
  amounts: number[],
): Record<string, unknown>[] {
  if (dates.length !== amounts.length) {
    throw new Error("Dates and amounts arrays must have the same length");
  }

  return dates.map((date, index) =>
    createBalanceFixture({
      account_id: accountId,
      snapshot_date: date,
      balance_usd: amounts[index],
    }),
  );
}
