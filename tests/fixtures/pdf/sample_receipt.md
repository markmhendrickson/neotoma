# sample_receipt.pdf

**Expected Type:** receipt

**Expected Extraction:**

- receipt_number: "RCP-2024-12-18-001"
- date: "2024-12-18"
- merchant_name: "Target"
- amount_total: 79.71
- currency: "USD"

**Entities:**

- merchant: "Target" → merchant entity

**Events:**

- PurchaseCompleted: 2024-12-18T00:00:00Z

**Testing:**

Use for testing receipt parsing and extraction of:
- Receipt number
- Merchant name
- Purchase date
- Total amount with tax breakdown
- Line items
