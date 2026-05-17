---
title: Portfolio monitoring
summary: "Fund managers need to track portfolio company performance, valuation changes, milestone achievements, and LP commitments across time — but conventional portfolio management tools present only current state, making it difficult to underst..."
---

# Portfolio monitoring

Fund managers need to track portfolio company performance, valuation changes, milestone achievements, and LP commitments across time — but conventional portfolio management tools present only current state, making it difficult to understand what was known at prior decision points like follow-on investments or markups. Neotoma provides versioned state for every portfolio company metric, valuation event, and LP commitment, enabling fund operations teams and AI agents to reconstruct the exact information landscape at any historical moment and answer temporal questions about investment timing and rationale.

## Entity examples

- `portfolio_company`
- `valuation`
- `milestone`
- `lp_commitment`

## Key question

> "What was the valuation when we made the follow-on?"

## Data sources

- Portfolio company quarterly reports and board decks
- Valuation models and mark-to-market analyses
- LP commitment letters and capital call notices
- Fund administration reports
- Co-investor communications
- KPI dashboards and metric submissions

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists structured portfolio metrics, valuations, and commitments |
| `query-memory` | Reconstructs portfolio state at any investment decision point |

## External tools

- Fund administration platform APIs (Allvue, eFront, Carta)
- Financial data providers (PitchBook, Crunchbase)
- Portfolio company reporting tools
