# sample_tax_form.pdf

**Schema Type:** `tax_event` and `income`

**Expected Extraction:**

For tax_event:

- `event_date`: "2024-12-31" (or date from document)
- `asset_symbol`: "AAPL"
- `quantity`: 50
- `cost_basis_usd`: 7500.00
- `proceeds_usd`: 9500.00
- `gain_loss_usd`: 2000.00
- `tax_year`: 2024
- `jurisdiction`: "US Federal"
- `schema_version`: "1.0"

For income:

- `income_date`: "2024-12-31"
- `source`: "Acme Bank Savings Account"
- `amount_usd`: 150.00
- `tax_year`: 2024
- `income_type`: "interest"

**Expected Entities:**

- `asset`: "AAPL" → entity with type `asset`
- `institution`: "Acme Bank" → entity with type `institution`

**Expected Events:**

- TaxEventCreated: 2024-12-31T00:00:00Z
- IncomeCreated: 2024-12-31T00:00:00Z



