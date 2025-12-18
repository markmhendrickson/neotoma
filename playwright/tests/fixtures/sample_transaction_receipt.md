# sample_transaction_receipt.pdf

**Schema Type:** `transaction`

**Expected Extraction:**

- `merchant_name`: "Acme Coffee Shop"
- `date`: "2024-12-10"
- `posting_date`: "2024-12-11"
- `amount`: -50.00
- `currency`: "USD"
- `category`: "Food & Dining"
- `account_id`: "Checking Account (\*\*\*\*1234)"
- `status`: "posted"
- `schema_version`: "1.0"

**Expected Entities:**

- `merchant`: "Acme Coffee Shop" → entity with type `merchant`
- `account`: "Checking Account" → entity with type `account`

**Expected Events:**

- TransactionCreated: 2024-12-10T00:00:00Z
- TransactionPosted: 2024-12-11T00:00:00Z



