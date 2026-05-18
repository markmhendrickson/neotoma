---
title: Personal agent state
summary: "Individuals interact with dozens of AI tools — fitness trackers, financial apps, habit coaches, goal planners — yet none of these tools share state or maintain temporal continuity across the user's full life context. Neotoma provides ver..."
---

# Personal agent state

Individuals interact with dozens of AI tools — fitness trackers, financial apps, habit coaches, goal planners — yet none of these tools share state or maintain temporal continuity across the user's full life context. Neotoma provides versioned memory for health, finance, habits, and goals across every AI tool, serving as the personal state layer that enables any agent to access the user's complete temporal history. This means a fitness agent can see spending context, a financial agent can see health goals, and every tool benefits from the full picture rather than operating in isolation.

## Entity examples

- `workout`
- `transaction`
- `health_metric`
- `habit`
- `goal`

## Key question

> "How has my bench press progressed, and what was my spending rate when I bought the car?"

## Data sources

- Fitness tracking apps (Apple Health, Strava, Garmin)
- Bank and credit card transactions
- Health metrics (weight, blood pressure, sleep data)
- Habit tracking apps and journal entries
- Goal definitions and progress logs
- Calendar events and life milestones

## Activation skills

| Skill | Role |
|-------|------|
| `remember-email` | Captures purchase confirmations and health-related communications |
| `remember-finances` | Versions financial transactions and spending patterns |
| `remember-contacts` | Maintains relationships relevant to goals and accountability |
| `remember-calendar` | Tracks events, appointments, and milestone dates |

## External tools

- Gmail / Outlook MCP for purchase and health communications
- Google Calendar MCP for scheduling and milestone tracking
- Banking APIs (Plaid, Tink) for transaction data
- Health data APIs (Apple HealthKit, Google Fit)
