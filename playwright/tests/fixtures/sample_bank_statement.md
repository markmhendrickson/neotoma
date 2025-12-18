# sample_bank_statement.pdf

**Schema Type:** `balance` (multiple snapshots) or `transaction` (individual transactions)

**Expected Extraction:**

For balance records:

- `snapshot_date`: "2024-12-01", "2024-12-15", "2024-12-31"
- `account_id`: "Checking Account (\*\*\*\*1234)"
- `balance_usd`: 10000.00, 12500.00, 11000.00
- `institution`: "Chase Bank"
- `schema_version`: "1.0"

For transaction records:

- Multiple transactions with dates, amounts, merchants

**Expected Entities:**

- `account`: "Checking Account" → entity with type `account`
- `institution`: "Chase Bank" → entity with type `institution`

**Expected Events:**

- BalanceSnapshot: 2024-12-01T00:00:00Z
- BalanceSnapshot: 2024-12-15T00:00:00Z
- BalanceSnapshot: 2024-12-31T00:00:00Z
- TransactionCreated events for each transaction listed



