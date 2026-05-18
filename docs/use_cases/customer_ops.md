---
title: "Support & CX operations"
summary: "Customer support escalations and routing decisions are often opaque — when a ticket is misrouted or an escalation fails, it's difficult to reconstruct why the system made the choices it did. Neotoma provides routing rationale, escalation..."
---

# Support & CX operations

Customer support escalations and routing decisions are often opaque — when a ticket is misrouted or an escalation fails, it's difficult to reconstruct why the system made the choices it did. Neotoma provides routing rationale, escalation chains, and interaction-level provenance, enabling CX operations teams to audit every routing decision, understand the context that informed agent handoffs, and identify systemic patterns in misroutes. AI support agents can explain their reasoning at any point in the ticket lifecycle, and supervisors can reconstruct the full decision chain that led to any customer outcome.

## Entity examples

- `ticket`
- `routing_decision`
- `interaction`
- `escalation`

## Key question

> "Why was this ticket routed to billing instead of infrastructure?"

## Data sources

- Help desk ticket systems (Zendesk, Intercom, Freshdesk)
- Chat transcripts and email threads
- Routing rule configurations and model outputs
- Escalation policies and SLA definitions
- Customer satisfaction surveys and feedback
- Agent performance and queue metrics

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists structured routing decisions, escalation chains, and interactions |
| `query-memory` | Reconstructs routing rationale and escalation context at any point |

## External tools

- None specific — uses Neotoma MCP directly for support operations provenance (integrates with Zendesk, Intercom, or Freshdesk APIs)
