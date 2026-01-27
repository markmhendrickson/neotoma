# sample_contract.pdf

**Schema Type:** `contract`

**Expected Extraction:**

- `name`: "Consulting Agreement"
- `parties`: "Acme Corp, John Smith"
- `effective_date`: "2024-01-01"
- `expiration_date`: "2025-12-31"
- `status`: "active"
- `signed_date`: "2024-01-01"
- `contract_type`: "Service Agreement"
- `schema_version`: "1.0"

**Expected Entities:**

- `company`: "Acme Corp" → entity with type `company`
- `contact`: "John Smith" → entity with type `contact`

**Expected Events:**

- ContractCreated: 2024-01-01T00:00:00Z
- ContractSigned: 2024-01-01T00:00:00Z



