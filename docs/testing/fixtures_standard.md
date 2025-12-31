# Neotoma Test Fixtures Standard
## Fixture Categories
### 1. Sample Documents
**Location:** `playwright/tests/fixtures/`
**PDF Documents:**
- `sample_transaction_receipt.pdf` — Receipt with transaction details
- `sample_bank_statement.pdf` — Bank statement with balances and transactions
- `sample_invoice.pdf` — Invoice with billing information
- `sample_tax_form.pdf` — Tax document with income and capital gains
- `sample_holding_statement.pdf` — Portfolio statement with asset holdings
- `sample_contract.pdf` — Contract agreement
**Image Documents:**
- `sample_receipt_scan.jpg` — Scanned receipt (requires OCR - not yet implemented)
- `sample_statement_scan.jpg` — Scanned bank statement (requires OCR - not yet implemented)
**Requirements:**
- Deterministic content (PDF text extraction produces same text, OCR produces same text)
- No real PII (use fake names, numbers)
- Documented expected extraction (see `playwright/tests/fixtures/*.md` files)
- Generated via `scripts/generate_pdf_fixtures.ts` for PDFs
### 2. Test Data (JSON)
**Location:** `src/__fixtures__/`
**Examples:**
- `financial_record.json` — Sample FinancialRecord properties
- `entity.json` — Sample entity object
- `events.json` — Sample timeline events
```json
{
  "schema_version": "1.0",
  "invoice_number": "INV-TEST-001",
  "amount": 1500.0,
  "currency": "USD",
  "vendor_name": "Test Vendor Inc"
}
```
### 3. Multi-Language Fixtures
**For i18n testing**
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
## Fixture Documentation
Each fixture SHOULD have a corresponding `.md` file:
```markdown
# sample_invoice.pdf
**Schema Type:** FinancialRecord
**Expected Extraction:**
- invoice_number: "INV-001"
- amount: 1500.00
- currency: "USD"
- vendor_name: "Test Vendor Inc"
**Entities:**
- company: "Test Vendor Inc" → ent_abc123...
**Events:**
- InvoiceIssued: 2024-01-15T00:00:00Z
```
## Agent Instructions
Load when creating test fixtures or understanding fixture structure.
Required co-loaded: `docs/subsystems/privacy.md`, `docs/testing/testing_standard.md`
Constraints:
- NO real PII in fixtures
- All fixtures MUST be deterministic
- All fixtures MUST be documented
