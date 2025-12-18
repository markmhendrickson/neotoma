# sample_invoice.pdf

**Schema Type:** `income` or `transaction`

**Expected Extraction:**

- `income_date`: "2024-12-15"
- `source`: "Acme Corp"
- `amount_usd`: 5000.00
- `currency`: "USD"
- `tax_year`: 2024
- `description`: "Consulting Services - Q1 2024"
- `status`: "pending"
- `schema_version`: "1.0"

**Expected Entities:**

- `company`: "Acme Corp" → entity with type `company`
- `contact`: "Acme Corp" → entity with type `contact` (if contact record exists)

**Expected Events:**

- IncomeCreated: 2024-12-15T00:00:00Z
- InvoiceIssued: 2024-12-15T00:00:00Z



