# Test Fixtures

This directory contains sample files for testing file upload and extraction functionality.

## File Types

### PDF Documents

PDF fixtures are generated using `scripts/generate_pdf_fixtures.ts` and contain structured financial data that can be extracted via text parsing.

**Available PDFs:**

- `sample_transaction_receipt.pdf` - Receipt with transaction details (merchant, date, amount, category)
- `sample_bank_statement.pdf` - Bank statement with balance snapshots and transactions
- `sample_invoice.pdf` - Invoice document with billing information
- `sample_tax_form.pdf` - Tax document with income and capital gains data
- `sample_holding_statement.pdf` - Portfolio statement with asset holdings
- `sample_contract.pdf` - Contract agreement with parties and dates

**Expected Extraction:**
Each PDF contains structured text that should be detected and extracted by the rule-based extraction system. See individual fixture documentation below.

### Image Files

**Note:** OCR support (Tesseract.js) is planned but not yet implemented. Image fixtures will be added once OCR is available.

**Planned Images:**

- `sample_receipt_scan.jpg` - Scanned receipt (requires OCR)
- `sample_statement_scan.jpg` - Scanned bank statement (requires OCR)
- `sample_id_card.jpg` - Identity document (requires OCR)

**Current Status:** Image fixtures are not yet created. They will be added when:

1. OCR support (Tesseract.js) is implemented in `src/services/file_analysis.ts`
2. OCR confidence scoring and low-confidence region handling is in place
3. Deterministic OCR output is verified (same image → same text extraction)

**Image Fixture Requirements:**

- Use privacy-safe fake data (same as PDF fixtures)
- Ensure OCR produces deterministic output
- Document expected extraction in `.md` files
- Include OCR confidence metadata in test expectations

### Text Files

- `sample-upload.txt` - Simple text file for basic upload testing

## Regenerating PDF Fixtures

To regenerate all PDF fixtures:

```bash
tsx scripts/generate_pdf_fixtures.ts
```

## Privacy-Safe Data

All fixtures use fake, obviously test data:

- Names: "John Doe", "Jane Smith"
- Companies: "Acme Corp", "Acme Coffee Shop"
- Addresses: "123 Main Street, City, State 12345"
- SSN: "123-45-6789"
- Account numbers: "\*\*\*\*1234"

## Fixture Documentation

Each fixture should document:

- Expected record type detection
- Expected field extraction
- Expected entity creation
- Expected events/timeline entries



