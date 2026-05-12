---
name: remember-finances
description: Import bank statements, receipts, and invoices into persistent memory. Extract transactions with amounts, dates, merchants, and categories.
triggers:
  - remember my finances
  - import bank statement
  - save receipts
  - import transactions
  - financial memory
  - remember finances
  - import invoices
  - track expenses
---

# Remember Finances

Import financial documents — bank statements, receipts, invoices — into Neotoma memory with structured transaction extraction and full provenance.

## When to use

When the user has financial documents (CSV/PDF bank statements, receipt images, invoice PDFs) and wants to persist the transactions as structured, queryable records.

## Prerequisites

Run the `ensure-neotoma` skill first if Neotoma is not yet installed or configured in your current harness.

## Supported sources

| Source | Format | Method |
|--------|--------|--------|
| Bank statements | CSV, PDF | File read, parse_file for PDFs |
| Receipts | Images (JPEG, PNG), PDF | Vision, parse_file |
| Invoices | PDF, email attachments | parse_file, email MCP |
| Plaid | Live bank data | Plaid MCP (optional) |

## Workflow

### Phase 0: Verify Neotoma

Confirm Neotoma MCP is connected (call `get_session_identity`).

### Phase 1: Identify financial documents

1. Ask the user what to import:
   - Bank statement file path (CSV or PDF)
   - Receipt image(s)
   - Invoice file(s)
   - Live bank account via Plaid MCP
2. Detect the format and choose the appropriate parsing method.

### Phase 2: Parse and preview

1. **CSV statements**: read columns, detect header row, identify date/amount/description fields.
2. **PDF statements**: use `parse_file` to extract text, then parse rows.
3. **Receipt images**: use vision to read merchant, date, items, total, tax.
4. **Invoices**: use `parse_file` to extract vendor, line items, amounts, due date.
5. Present a preview: transaction count, date range, total amounts, top merchants/vendors.
6. Ask for confirmation.

### Phase 3: Extract entities

For each document, extract:

1. **Transactions**: one `transaction` entity per line item or statement row with `amount`, `currency`, `date`, `description`, `merchant`, `category` (when inferable).
2. **Contacts**: merchants, vendors, or counterparties as `contact` entities.
3. **Invoices/Receipts**: the document itself as a `receipt` or `invoice` entity with total, tax, line items.

Use entity_type `transaction` consistently within a batch. Store source-specific details as fields (provider, account_suffix, value_date, concept).

### Phase 4: Store with provenance

Use the combined store path — entities array plus `file_path` for the original document — in a single `store` call. This preserves the raw financial document as a source row.

Set `source_file` to the filename. For each transaction, set `data_source` with a unique identifier (e.g. row number, transaction reference).

### Phase 5: Report results

Summarize:
- Documents processed
- Transactions stored (count, date range, total)
- Top merchants/vendors by frequency or amount
- Offer to query specific transactions or merchants.

## Do not

- Process financial documents without user confirmation.
- Mix entity_type within a batch (use `transaction` consistently for statement rows).
- Skip the raw document preservation — always use the combined store path.
- Echo full financial details in chat beyond what answering requires.
