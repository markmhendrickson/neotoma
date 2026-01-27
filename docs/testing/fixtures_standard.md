# Neotoma Test Fixtures Standard

## Unified Fixture Location

**All fixtures consolidated in**: `tests/fixtures/`

**Directory Structure**:

```
tests/fixtures/
├── json/                    # JSON fixtures for programmatic testing
├── csv/                     # CSV files for bulk data testing
├── pdf/                     # PDF documents for extraction testing
├── integration/             # Integration test scenarios
├── helpers.ts               # Fixture generation helpers
├── types.ts                 # TypeScript fixture interfaces
└── validation.ts            # Fixture validation utilities
```

## Fixture Categories

### 1. JSON Fixtures

**Location:** `tests/fixtures/json/`

**Purpose**: Programmatic test data for unit and integration tests

**Available Types** (17 entity types):

- `account.json`, `balance.json`, `contact.json`, `contract.json`, `crypto_transaction.json`
- `fixed_cost.json`, `flow.json`, `holding.json`, `income.json`, `liability.json`
- `order.json`, `property.json`, `purchase.json`, `tax_event.json`, `tax_filing.json`
- `transaction.json`, `transfer.json`, `wallet.json`

**Usage**
```typescript
import { createHoldingFixture } from "../fixtures/helpers.js";

const holding = createHoldingFixture({
  asset_symbol: "AAPL",
  quantity: 100,
  current_value_usd: 18500
});
```

### 2. CSV Fixtures

**Location:** `tests/fixtures/csv/`

**Purpose**: Bulk data import testing

**Available Files** (10 types):

- `sample_balances.csv`, `sample_contacts.csv`, `sample_crypto_transactions.csv`
- `sample_flows.csv`, `sample_holdings.csv`, `sample_income.csv`
- `sample_purchases.csv`, `sample_tax_events.csv`, `sample_transactions.csv`
- `sample_transfers.csv`

### 3. PDF Fixtures

**Location:** `tests/fixtures/pdf/`

**Purpose**: File upload and extraction testing

**PDF Documents**:

- `sample_transaction_receipt.pdf` — Receipt with transaction details
- `sample_bank_statement.pdf` — Bank statement with balances and transactions
- `sample_invoice.pdf` — Invoice with billing information
- `sample_tax_form.pdf` — Tax document with income and capital gains
- `sample_holding_statement.pdf` — Portfolio statement with asset holdings
- `sample_contract.pdf` — Contract agreement

**Text Files**:

- `sample-upload.txt` — Simple text file for basic upload testing

**Requirements:**

- Deterministic content (PDF text extraction produces same text)
- No real PII (use fake names, numbers)
- Documented expected extraction (see `tests/fixtures/pdf/*.md` files)
- Generated via `scripts/generate_pdf_fixtures.ts`

**Regenerating PDFs**:

```bash
tsx scripts/generate_pdf_fixtures.ts
```

### 4. Integration Fixtures

**Location:** `tests/fixtures/integration/`

**Purpose**: Multi-record integration test scenarios

- `multi_record_scenarios.json` — Linked records with expected entities and relationships

### 5. Multi-Language Fixtures (Planned)

**For i18n testing** (not yet implemented):

- `invoice_es.pdf` — Spanish invoice
- `invoice_fr.pdf` — French invoice
- `invoice_en.pdf` — English invoice

**Verify:**

- Content language detected correctly
- Original language preserved
- Search works across languages
## Privacy-Safe Fixtures
**MUST NOT:**
- Use real PII
- Use real SSN, passport numbers
- Use real addresses or phone numbers
- Use real company names (unless public)
**MUST:**
- Use obviously fake data:
  - Names: "John Doe", "Jane Smith"
  - SSN: "123-45-6789"
  - Addresses: "123 Main St, City, State 12345"
  - Companies: "Test Vendor Inc", "Example Corp"
## Helper Functions

**Location:** `tests/fixtures/helpers.ts`

**Functions**:

- `create{Type}Fixture()` — Generate fixture with defaults and overrides
- `createUpdateVariant()` — Create update variant of existing fixture
- `createStatusTransition()` — Create status change variant
- `createBalanceSnapshotSequence()` — Create temporal sequence

**Usage**:

```typescript
import { createHoldingFixture, createUpdateVariant } from "../fixtures/helpers.js";

const base = createHoldingFixture({ asset_symbol: "AAPL" });
const updated = createUpdateVariant(base, { current_value_usd: 20000 });
```

## Validation Utilities

**Location:** `tests/fixtures/validation.ts`

**Functions**:

- `containsRealPII(fixture)` — Checks for real personal information
- `hasSchemaVersion(fixture)` — Validates schema_version field
- `validateFixtureStructure(fixture, schema)` — Validates against entity schema

## Fixture Documentation

Each PDF fixture SHOULD have a corresponding `.md` file documenting:

- Expected record type detection
- Expected field extraction
- Expected entity creation
- Expected events/timeline entries

**Example**: `tests/fixtures/pdf/sample_invoice.md`

```markdown
# sample_invoice.pdf

**Expected Type:** invoice

**Expected Extraction:**

- invoice_number: "INV-TEST-001"
- amount_due: 5000.00
- currency: "USD"
- vendor_name: "Acme Corp"

**Entities:**

- company: "Acme Corp" → ent_abc123...

**Events:**

- InvoiceIssued: 2024-12-15T00:00:00Z
```

## Related Documentation

- [`tests/fixtures/README.md`](../../tests/fixtures/README.md) — Complete fixture documentation
- [`scripts/generate_pdf_fixtures.ts`](../../scripts/generate_pdf_fixtures.ts) — PDF generation script

## Agent Instructions

Load when creating test fixtures or understanding fixture structure.

Required co-loaded: `docs/subsystems/privacy.md`, `docs/testing/testing_standard.md`

Constraints:

- NO real PII in fixtures
- All fixtures MUST be deterministic
- All fixtures MUST be documented
- All fixtures MUST be in `tests/fixtures/` (consolidated location)
