# Test Fixtures

This directory contains test fixtures for all Neotoma record types, organized as separate files per record type to facilitate individual testing via file upload.

## Structure

- **JSON Fixtures** (`*.json`): Test data fixtures for programmatic testing
- **Helper Functions** (`helpers.ts`): Functions to generate fixtures with defaults and overrides

## Related Fixtures

For file upload testing (PDFs, images, CSVs), see:

- **CSV Fixtures**: `tests/fixtures/sample_*.csv` - CSV files for each record type
- **PDF Fixtures**: `playwright/tests/fixtures/sample_*.pdf` - PDF documents with structured financial data
- **Image Fixtures**: `playwright/tests/fixtures/sample_*.jpg` - Scanned documents (requires OCR support)

## Fixture Files

### New Financial Types

- `holding_fixtures.json` - Portfolio position snapshots
- `income_fixtures.json` - Income stream records
- `tax_event_fixtures.json` - Capital gains/losses
- `crypto_transaction_fixtures.json` - Blockchain transactions
- `liability_fixtures.json` - Debt tracking
- `flow_fixtures.json` - Cash flow records
- `purchase_fixtures.json` - Purchase tracking
- `transfer_fixtures.json` - Asset transfers
- `wallet_fixtures.json` - Financial institutions
- `tax_filing_fixtures.json` - Tax filing records
- `order_fixtures.json` - Trading orders
- `fixed_cost_fixtures.json` - Recurring expenses
- `property_fixtures.json` - Real estate records
- `balance_fixtures.json` - Account balance snapshots

### Expanded Existing Types

- `transaction_fixtures.json` - Transactions with new fields (posting_date, category, bank_provider, amount_original)
- `contact_fixtures.json` - Contacts with expanded fields (contact_type, category, platform, address, dates)
- `contract_fixtures.json` - Contracts with new fields (name, signed_date, companies, files, type, notes)
- `account_fixtures.json` - Accounts with new fields (wallet, wallet_name, number, categories, denomination)

## Update Variants

Each fixture file includes variants representing the same record over time:

- **Base record**: Initial state
- **Update variants**: Same record with changed fields at different points in time
- **State transitions**: Records showing status changes (e.g., purchase: pending -> in_progress -> completed)

## Usage

### Programmatic Generation

```typescript
import { createHoldingFixture, createIncomeFixture } from "./helpers";

const holding = createHoldingFixture({ asset_symbol: "TSLA" });
const income = createIncomeFixture({ amount_usd: 10000 });
```

### Update Variants

```typescript
import { createUpdateVariant, createStatusTransition } from "./helpers";

const basePurchase = createPurchaseFixture({ status: "pending" });
const completedPurchase = createStatusTransition(
  basePurchase,
  "pending",
  "completed",
  { completed_date: "2024-12-10T00:00:00Z" }
);
```

### Temporal Sequences

```typescript
import { createBalanceSnapshotSequence } from "./helpers";

const snapshots = createBalanceSnapshotSequence(
  "acc-checking-001",
  ["2024-12-01", "2024-12-15", "2025-01-01"],
  [10000, 12500, 11000]
);
```

## Privacy-Safe Data

All fixtures use fake data:

- Names: "John Doe", "Jane Smith"
- Addresses: "123 Main St, City, State 12345"
- Companies: "Acme Corp", "Test Vendor Inc"
- No real PII, SSNs, or sensitive information

## Test Scenarios Covered

Each fixture file covers:

- **Minimal**: Only required fields
- **Complete**: All fields populated
- **Edge Cases**: Null values, empty strings, boundary dates/amounts
- **Update Variants**: Same record at different points in time
- **State Transitions**: Valid status changes

## Expected Entity Extractions

- **holdings**: `asset_symbol` → asset entity
- **income**: `source` → company/person entity
- **tax_event**: `asset_symbol` → asset entity
- **crypto_transaction**: `from_address`, `to_address` → wallet entities
- **liability**: `name` → liability entity
- **flow**: `party` → entity
- **purchase**: `vendor` → company entity
- **transfer**: `origin_account`, `destination_account` → account entities
- **wallet**: `name` → institution entity
- **tax_filing**: `companies` → company entities
- **order**: `accounts` → account entities
- **fixed_cost**: `merchant` → company entity
- **property**: `address` → location entity
- **balance**: `account_id` → account entity
- **transaction**: `merchant_name` → merchant entity
- **contact**: `name`, `organization` → person/company entities
- **contract**: `companies`, `parties` → company/person entities
- **account**: `institution` → institution entity

## Expected Event Generations

- **holdings**: `HoldingUpdated` when value changes
- **income**: `IncomeReceived` on income_date
- **tax_event**: `TaxEventRecorded` on event_date
- **crypto_transaction**: `CryptoTransactionExecuted` on transaction_date
- **liability**: `LiabilityUpdated` when amount changes
- **flow**: `FlowRecorded` on flow_date
- **purchase**: `PurchaseStatusChanged` on status transitions
- **transfer**: `TransferInitiated`, `TransferCompleted` on status changes
- **wallet**: `WalletUpdated` when accounts change
- **tax_filing**: `TaxFilingStatusChanged` on status transitions
- **order**: `OrderStatusChanged` on status transitions
- **fixed_cost**: `FixedCostUpdated` when amounts change
- **property**: `PropertyValuationUpdated` when current_value changes
- **balance**: `BalanceSnapshotRecorded` on snapshot_date
- **transaction**: `TransactionPosted` on posting_date
- **contact**: `ContactUpdated` on updated_date
- **contract**: `ContractStatusChanged` on status transitions
- **account**: `AccountUpdated` when balance or status changes



