# Autonomous trading agents

Multi-agent trading systems make thousands of decisions per day — including decisions NOT to trade — yet most trading infrastructure captures only executed trades, losing the reasoning behind passes, the analyst recommendations that were overridden, and the risk state that informed each choice. Neotoma provides reconstructable decision chains for multi-agent trading systems by versioning every trade decision, pass decision, analyst recommendation, risk evaluation, and portfolio snapshot as immutable observations. This enables compliance teams, risk managers, and system operators to replay any decision — including the ones that didn't result in action — with full multi-agent attribution.

## Entity examples

- `trade_decision`
- `pass_decision`
- `strategy`
- `analysis`
- `risk_state`
- `portfolio_snapshot`

## Key question

> "Why did the agent pass on this trade, and what did each analyst recommend when it did?"

## Data sources

- Agent decision logs and reasoning traces
- Market data feeds at decision time
- Strategy configuration and parameter snapshots
- Risk model outputs and limit evaluations
- Analyst agent recommendations and confidence scores
- Portfolio position snapshots and P&L state

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists structured trade/pass decisions, analyses, and risk states |
| `query-memory` | Reconstructs multi-agent decision context at any point |

## External tools

- None specific — uses Neotoma MCP directly for trading decision provenance (integrates with market data and execution management systems)
