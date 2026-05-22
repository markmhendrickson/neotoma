# Contract lifecycle management

Contracts evolve through negotiations, amendments, and renewals, yet most CLM systems treat each version as a flat document rather than a temporal entity with observable state changes. Neotoma provides version control for every clause, amendment, and obligation by storing each contract modification as an immutable observation with provenance tracing back to the source document, the parties involved, and the timestamp of agreement. This enables legal teams and AI agents to reconstruct the exact contractual state at any point in time, compare amendment histories, and track obligation fulfillment across the full lifecycle.

## Entity examples

- `contract`
- `clause`
- `amendment`
- `obligation`

## Key question

> "What were the terms when we signed? What changed in amendment 3?"

## Data sources

- Executed contract PDFs and Word documents
- Amendment and addendum documents
- Negotiation correspondence (email, redlines)
- Obligation tracking spreadsheets
- Renewal notices and termination letters
- Signature platform audit trails (DocuSign, Adobe Sign)

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists structured contract, clause, and obligation entities |
| `query-memory` | Reconstructs contractual state at any historical point |

## External tools

- DocuSign / Adobe Sign APIs for signature and audit trail data
- Document parsing services for clause extraction
- Gmail / Outlook MCP for negotiation correspondence
