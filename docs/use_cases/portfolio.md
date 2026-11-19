# Portfolio monitoring

Fund managers need to track portfolio company performance, valuation changes, milestone achievements, and LP commitments across time — but conventional portfolio management tools present only current state, making it difficult to understand what had been recorded before earlier choices such as follow-on investments or markups. Neotoma provides versioned state for every portfolio company metric, valuation event, and LP commitment, enabling fund operations teams and AI agents to reconstruct the information landscape as recorded by any write-time cutoff and answer temporal questions about investment timing and rationale.

## Entity examples

- `portfolio_company`
- `valuation`
- `milestone`
- `lp_commitment`

## Key question

> "What valuation had been recorded when we made the follow-on?"

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
| `ensure-neotoma` | Ordinary storage and retrieval need no skill: covered directly by the live MCP tool instructions |

## External tools

- Fund administration platform APIs (Allvue, eFront, Carta)
- Financial data providers (PitchBook, Crunchbase)
- Portfolio company reporting tools
