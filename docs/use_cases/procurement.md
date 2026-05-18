---
title: "Procurement & sourcing"
summary: "Procurement decisions involve multiple competing bids, internal approvals, and supplier evaluations that are difficult to reconstruct after the fact — yet auditors, regulators, and internal stakeholders regularly need to understand why a..."
---

# Procurement & sourcing

Procurement decisions involve multiple competing bids, internal approvals, and supplier evaluations that are difficult to reconstruct after the fact — yet auditors, regulators, and internal stakeholders regularly need to understand why a particular supplier was selected. Neotoma provides a full audit trail for bids, approvals, and supplier decisions by versioning every step of the procurement process as immutable observations with provenance. This enables procurement teams and AI agents to reconstruct the competitive landscape, approval chain, and evaluation criteria that existed at any supplier selection point.

## Entity examples

- `supplier`
- `bid`
- `purchase_order`
- `approval`

## Key question

> "What were the competing bids when we selected this supplier?"

## Data sources

- Request for proposal (RFP) documents and responses
- Bid comparison matrices and evaluation scorecards
- Internal approval workflows and sign-off records
- Purchase orders and change orders
- Supplier performance reviews
- Contract award notifications

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists structured bid, supplier, and approval entities |
| `query-memory` | Reconstructs procurement state at any decision point |

## External tools

- E-procurement platforms (SAP Ariba, Coupa, Jaggaer)
- Supplier management systems
- Approval workflow tools (ServiceNow, Jira)
