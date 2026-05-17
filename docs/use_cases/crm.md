---
title: Next-generation CRM
summary: "Traditional CRMs capture snapshots of relationship state but lose the temporal story — who said what, when a deal stage actually changed, and which interactions influenced the outcome. Neotoma serves as the deterministic state layer for ..."
---

# Next-generation CRM

Traditional CRMs capture snapshots of relationship state but lose the temporal story — who said what, when a deal stage actually changed, and which interactions influenced the outcome. Neotoma serves as the deterministic state layer for AI-native CRM platforms, versioning every contact update, engagement signal, and deal progression as immutable observations with provenance. This enables AI sales agents to answer temporal relationship questions, reconstruct the full context behind any deal decision, and surface the right people and history at exactly the right moment.

## Entity examples

- `contact`
- `deal`
- `account`
- `engagement`

## Key question

> "Who should I loop in on the Meridian renewal?"

## Data sources

- Email threads and calendar events
- Meeting notes and call transcripts
- LinkedIn and social interactions
- CRM activity logs (Salesforce, HubSpot)
- Slack/Teams messages with prospects
- Contract and proposal documents

## Activation skills

| Skill | Role |
|-------|------|
| `remember-email` | Captures relationship signals from email correspondence |
| `remember-contacts` | Maintains versioned contact profiles and relationship graphs |

## External tools

- Gmail / Outlook MCP for email ingestion
- Google Calendar / Outlook Calendar MCP for meeting context
- LinkedIn API for social engagement signals
- Salesforce / HubSpot APIs for existing CRM sync
