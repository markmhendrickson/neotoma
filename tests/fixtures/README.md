# Neotoma Test Fixtures

Unified test fixtures for all Neotoma testing needs. This directory consolidates fixtures from multiple locations into a single, organized structure.

## Directory Structure

```
tests/fixtures/
├── json/                    # JSON fixtures for programmatic testing
│   ├── account.json
│   ├── transaction.json
│   └── ... (17 entity types)
├── csv/                     # CSV files for bulk data testing
│   ├── sample_balances.csv
│   ├── sample_contacts.csv
│   └── ... (10 CSV files)
├── pdf/                     # PDF documents for extraction testing
│   ├── sample_invoice.pdf
│   ├── sample_invoice.md
│   └── ... (6 PDFs + 6 docs)
├── integration/             # Integration test scenarios
│   └── multi_record_scenarios.json
├── helpers.ts               # Fixture generation helpers
├── types.ts                 # TypeScript fixture interfaces
└── validation.ts            # Fixture validation utilities
```

## JSON Fixtures

**Location**: `json/`

**Purpose**: Programmatic test data for unit and integration tests

**Coverage**: 34 entity types, 5 variants each (170 total fixtures)

**Available Types** (34 entity types):

- **Finance** (17): account, balance, contract, crypto_transaction, fixed_cost, flow, holding, income, liability, order, property, purchase, tax_event, tax_filing, transaction, transfer, wallet
- **Productivity** (11): event, note, outcome, process, project, purchase, strategy, task, task_attachment, task_comment, task_dependency, task_story
- **Knowledge** (7): argument, belief, contact, domain, research
- **Health** (6): emotion, exercise, habit, habit_completion, habit_objective, meal, workout

### Usage

```typescript
import { createHoldingFixture, createIncomeFixture } from "../fixtures/helpers.js";

const holding = createHoldingFixture({ asset_symbol: "TSLA" });
const income = createIncomeFixture({ amount_usd: 10000 });
```

### Update Variants

Each fixture file includes variants representing the same record over time:

- **Base record**: Initial state
- **Update variants**: Same record with changed fields
- **State transitions**: Status changes (e.g., pending → completed)

### Helper Functions

```typescript
import {
  createUpdateVariant,
  createStatusTransition,
  createBalanceSnapshotSequence,
} from "../fixtures/helpers.js";

// Create update variant
const updated = createUpdateVariant(base, { amount_usd: 15000 });

// Create status transition
const completed = createStatusTransition(pending, "pending", "completed", {
  completed_date: "2024-12-10T00:00:00Z",
});

// Create temporal sequence
const snapshots = createBalanceSnapshotSequence(
  "acc-001",
  ["2024-12-01", "2024-12-15", "2025-01-01"],
  [10000, 12500, 11000]
);
```

## CSV Fixtures

**Location**: `csv/`

**Purpose**: Bulk data import testing

**Available Files** (10 CSV types):

- `sample_balances.csv`
- `sample_contacts.csv`
- `sample_crypto_transactions.csv`
- `sample_flows.csv`
- `sample_holdings.csv`
- `sample_income.csv`
- `sample_purchases.csv`
- `sample_tax_events.csv`
- `sample_transactions.csv`
- `sample_transfers.csv`

### Usage

Use for testing CSV import functionality and multi-record ingestion.

## PDF Fixtures

**Location**: `pdf/`

**Purpose**: File upload and extraction testing

**Coverage**: 11 PDFs covering 11 entity types

**Available PDFs** (11 documents):

**Finance** (4):
- `sample_transaction_receipt.pdf` - Transaction receipt
- `sample_bank_statement.pdf` - Bank statement with balances
- `sample_invoice.pdf` - Invoice document
- `sample_receipt.pdf` - Purchase receipt

**Productivity/Knowledge** (4):
- `sample_note.pdf` - Meeting notes
- `sample_research.pdf` - Research paper summary
- `sample_contract.pdf` - Contract agreement
- `sample_tax_form.pdf` - Tax document

**Health** (2):
- `sample_meal.pdf` - Daily meal log
- `sample_exercise.pdf` - Exercise/workout log

**Other** (1):
- `sample_holding_statement.pdf` - Portfolio statement

**Documentation**: Each PDF has a corresponding `.md` file documenting:

- Expected record type detection
- Expected field extraction
- Expected entity creation
- Expected events/timeline entries

**Text File**: `sample-upload.txt` - Simple text file for basic upload testing

### Regenerating PDFs

```bash
tsx scripts/generate_pdf_fixtures.ts
```

All PDFs are generated deterministically using `pdfkit`.

### Image Fixtures (Planned)

**Note:** OCR support (Tesseract.js) is planned but not yet implemented.

**Planned Images:**

- `sample_receipt_scan.jpg` - Scanned receipt (requires OCR)
- `sample_statement_scan.jpg` - Scanned bank statement (requires OCR)

**When to add**: After OCR support is implemented with deterministic output verification.

## Integration Fixtures

**Location**: `integration/`

**Purpose**: Multi-record integration test scenarios

**Available Files**:

- `multi_record_scenarios.json` - Linked records with expected entities and relationships

### Usage

Use for testing complex scenarios involving:

- Multiple related records
- Entity resolution across records
- Relationship creation
- Timeline event generation

## Privacy-Safe Data

All fixtures use fake, obviously test data:

- Names: "John Doe", "Jane Smith"
- Companies: "Acme Corp", "Test Vendor Inc"
- Addresses: "123 Main Street, City, State 12345"
- SSN: "123-45-6789"
- Account numbers: "****1234"
- No real PII, SSNs, or sensitive information

## Test Scenarios Covered

Each fixture file covers:

- **Minimal**: Only required fields
- **Complete**: All fields populated
- **Edge Cases**: Null values, empty strings, boundary dates/amounts
- **Update Variants**: Same record at different points in time
- **State Transitions**: Valid status changes

## Expected Extractions

### Entity Extractions

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

### Event Generations

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

## Validation Utilities

**File**: `validation.ts`

**Functions**:

- `containsRealPII(fixture)`: Checks for real personal information
- `hasSchemaVersion(fixture)`: Validates schema_version field
- `validateFixtureStructure(fixture, schema)`: Validates against entity schema

### Usage

```typescript
import { containsRealPII, validateFixtureStructure } from "../fixtures/validation.js";

// Ensure no real PII
if (containsRealPII(fixture)) {
  throw new Error("Fixture contains real PII");
}

// Validate structure
const errors = validateFixtureStructure(fixture, schema);
if (errors.length > 0) {
  console.error("Validation errors:", errors);
}
```

## Related Documentation

- [`docs/testing/fixtures_standard.md`](../../docs/testing/fixtures_standard.md) - Fixture requirements and standards
- [`scripts/generate_pdf_fixtures.ts`](../../scripts/generate_pdf_fixtures.ts) - PDF generation script
