---
title: "Vendor risk & compliance"
summary: "Vendor risk management demands knowing exactly what was assessed, when, and under which criteria — yet most compliance teams rely on scattered spreadsheets, email threads, and point-in-time PDFs that lose their temporal context the momen..."
---

# Vendor risk & compliance

Vendor risk management demands knowing exactly what was assessed, when, and under which criteria — yet most compliance teams rely on scattered spreadsheets, email threads, and point-in-time PDFs that lose their temporal context the moment they're filed. Neotoma provides a deterministic state layer that versions every vendor profile, screening result, questionnaire response, and risk assessment as immutable observations with full provenance, enabling compliance officers and AI agents to reconstruct the precise risk picture that existed at any approval decision point.

## Entity examples

- `vendor`
- `assessment`
- `screening`
- `questionnaire`

## Key question

> "What did we know about this vendor when we approved them?"

## Data sources

- Vendor questionnaire submissions (SAQ, SIG, CAIQ)
- Third-party screening services (sanctions lists, adverse media)
- Internal risk assessment reports
- Contract and SLA documents
- Audit findings and remediation records
- Email correspondence with vendor contacts

## Activation skills

| Skill | Role |
|-------|------|
| `remember-email` | Captures vendor communications and approval chains |
| `store-data` | Persists structured assessment data and screening results |

## External tools

- Sanctions/PEP screening APIs (Dow Jones, Refinitiv World-Check)
- GRC platforms (ServiceNow GRC, OneTrust)
- Document management systems for questionnaire intake
