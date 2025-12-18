# sample_holding_statement.pdf

**Schema Type:** `holding`

**Expected Extraction:**

- `snapshot_date`: "2024-12-15"
- `asset_symbol`: "AAPL"
- `asset_type`: "stock"
- `quantity`: 100
- `cost_basis_usd`: 15000.00
- `current_value_usd`: 18500.00
- `account_id`: "acc-001"
- `account_type`: "brokerage"
- `provider`: "Fidelity"
- `schema_version`: "1.0"

**Expected Entities:**

- `asset`: "AAPL" → entity with type `asset`
- `account`: "Brokerage Account" → entity with type `account`
- `institution`: "Fidelity" → entity with type `institution`

**Expected Events:**

- HoldingSnapshot: 2024-12-15T00:00:00Z



