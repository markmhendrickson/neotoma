# Neotoma Test Fixtures Standard
*(Fixture Categories, Naming, and Privacy-Safe Handling)*

---

## Purpose

Defines standards for creating and managing test fixtures.

---

## Fixture Categories

### 1. Sample Documents
**Location:** `playwright/fixtures/`

**Examples:**
- `sample_invoice.pdf` — Invoice with known fields
- `sample_passport.jpg` — Identity document
- `sample_itinerary.pdf` — Travel document

**Requirements:**
- Deterministic content (OCR produces same text)
- No real PII (use fake names, numbers)
- Documented expected extraction

---

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
  "amount": 1500.00,
  "currency": "USD",
  "vendor_name": "Test Vendor Inc"
}
```

---

### 3. Multi-Language Fixtures
**For i18n testing**

- `invoice_es.pdf` — Spanish invoice
- `invoice_fr.pdf` — French invoice
- `invoice_en.pdf` — English invoice

**Verify:**
- Content language detected correctly
- Original language preserved
- Search works across languages

---

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

---

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

---

## Agent Instructions

Load when creating test fixtures or understanding fixture structure.

Required co-loaded: `docs/subsystems/privacy.md`, `docs/testing/testing_standard.md`

Constraints:
- NO real PII in fixtures
- All fixtures MUST be deterministic
- All fixtures MUST be documented








