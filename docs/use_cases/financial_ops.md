# Financial operations & reconciliation

Financial operations require deterministic, auditable state — every ledger entry, reconciliation, and invoice must be traceable to its source and reconstructable at any point for audit, regulatory, or dispute purposes. Neotoma provides deterministic state for every financial record by versioning transactions, reconciliation events, and ledger mutations as immutable observations with provenance chains back to source documents. This enables finance teams and AI agents to answer temporal questions about liability existence, payment timing, and reconciliation status with the same precision expected of a double-entry ledger.

## Entity examples

- `transaction`
- `reconciliation`
- `ledger`
- `invoice`

## Key question

> "Did this liability exist in our books on the audit date?"

## Data sources

- Bank statements and transaction feeds (OFX, MT940, ISO 20022)
- Invoice and billing system records
- ERP general ledger exports
- Payment processor reports (Stripe, Wise, PayPal)
- Reconciliation logs and exception reports
- Audit working papers

## Activation skills

| Skill | Role |
|-------|------|
| `remember-finances` | Captures and versions financial transactions and reconciliation state |

## External tools

- Banking APIs (Plaid, Tink, Open Banking)
- Payment processor APIs (Stripe, Wise)
- ERP system APIs (NetSuite, QuickBooks, Xero)
- Accounting platform integrations
