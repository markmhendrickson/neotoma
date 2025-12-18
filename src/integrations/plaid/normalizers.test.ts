import { describe, it, expect } from "vitest";
import type { AccountBase, Institution, Item, Transaction } from "plaid";
import { normalizeAccount, normalizeTransaction } from "./normalizers.js";

const mockItem: Item = {
  available_products: ["transactions"],
  billed_products: [],
  consent_expiration_time: null,
  error: null,
  institution_id: "ins_109508",
  item_id: "test-item",
  webhook: "https://example.com/webhook",
  update_type: "background",
};

const mockInstitution: Institution = {
  country_codes: ["US"],
  institution_id: "ins_109508",
  name: "Test Institution",
  products: ["transactions"],
  routing_numbers: [],
  credentials: [],
  has_mfa: false,
  mfa: [],
  oauth: false,
  url: "https://example.com",
  primary_color: "#123456",
  logo: null,
  brand_color: null,
  logo_url: null,
  status: null,
};

const mockAccount: AccountBase = {
  account_id: "acc_123",
  balances: {
    available: 1200,
    current: 1250,
    iso_currency_code: "USD",
    limit: null,
    unofficial_currency_code: null,
  },
  mask: "1234",
  name: "Everyday Checking",
  official_name: "Everyday Checking",
  subtype: "checking",
  type: "depository",
  verification_status: null,
  persistent_account_id: "pa_123",
  status: null,
  class_type: null as any,
  class_code: null as any,
  classification: null as any,
};

const mockTransaction: Transaction = {
  account_id: "acc_123",
  amount: 42.13,
  iso_currency_code: "USD",
  unofficial_currency_code: null,
  category: ["Shops", "Supermarkets and Groceries"],
  category_id: "19047000",
  date: "2024-01-01",
  name: "Grocery Store",
  merchant_name: "Grocery Store",
  merchant_entity_id: null as any,
  pending: false,
  transaction_id: "txn_123",
  transaction_type: "place",
  payment_channel: "in store",
  account_owner: null,
  authorized_date: null,
  authorized_datetime: null as any,
  datetime: null as any,
  location: {
    address: "123 Main St",
    city: "Anytown",
    region: "CA",
    postal_code: "90001",
    country: "US",
    lat: 37.7749,
    lon: -122.4194,
    store_number: null,
  },
  payment_meta: {
    by_order_of: null,
    payee: null,
    payer: null,
    payment_method: null,
    payment_processor: null,
    ppd_id: null,
    reason: null,
    reference_number: null,
  },
  personal_finance_category: {
    primary: "FOOD_AND_DRINK",
    detailed: "FOOD_AND_DRINK_GROCERIES",
    confidence_level: "HIGH",
  },
  pending_transaction_id: null,
  check_number: null,
  original_description: "Grocery Store",
  merchant_manager_id: null as any,
  merchant_manager_name: null as any,
  personal_finance_category_icon_url: null as any,
  personal_finance_category_flat_icon_url: null as any,
  counterparty: null as any,
  counterparties: [],
  account_owner_id: null as any,
  image_url: null as any,
  logo_url: null as any,
  website: null as any,
  authorized_description: null as any,
  frequency: null as any,
  trail_balance_details: null as any,
  interest_rate: null as any,
  payment_meta_original_payee: null as any,
  payment_meta_reference_number: null as any,
  points_earned: null as any,
  transaction_code: null as any,
};

describe("Plaid normalizers", () => {
  it("normalizes account records with stable external ids", () => {
    const record = normalizeAccount({
      plaidItemId: mockItem.item_id,
      environment: "sandbox",
      item: mockItem,
      institution: mockInstitution,
      account: mockAccount,
    });

    const props = record.properties as any;

    expect(record.type).toBe("account");
    expect(record.externalId).toBe(`plaid:account:${mockAccount.account_id}`);
    // Properties stay machine-case; UI humanizes as needed
    expect(props.external_id).toBe(record.externalId);
    expect(props.provider).toBe("plaid");
    expect(props.balances.current).toBe(1250);
    expect(props.institution?.name).toBe("Test Institution");
  });

  it("normalizes transactions and includes account snapshot", () => {
    const accountLookup = new Map([[mockAccount.account_id, mockAccount]]);
    const record = normalizeTransaction({
      plaidItemId: mockItem.item_id,
      environment: "sandbox",
      item: mockItem,
      institution: mockInstitution,
      accountLookup,
      transaction: mockTransaction,
    });

    const props = record.properties as any;

    expect(record.type).toBe("transaction");
    expect(record.externalId).toBe(
      `plaid:transaction:${mockTransaction.transaction_id}`,
    );
    // Properties stay machine-case; UI humanizes as needed
    expect(props.external_id).toBe(record.externalId);
    expect(props.account?.plaid_account_id).toBe(mockAccount.account_id);
    expect(props.amount).toBeCloseTo(42.13);
    expect(props.location?.city).toBe("Anytown");
    expect(props.personal_finance_category?.detailed).toBe(
      "FOOD_AND_DRINK_GROCERIES",
    );
  });
});
