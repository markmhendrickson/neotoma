# Vendor risk & compliance

Vendor risk management demands knowing exactly what was assessed, when, and under which criteria — yet most compliance teams rely on scattered spreadsheets, email threads, and single-date PDFs that lose their temporal context the moment they're filed. Neotoma provides a deterministic state layer that versions every vendor profile, screening result, questionnaire response, and risk assessment as immutable observations with full provenance, enabling compliance officers and AI agents to reconstruct the precise risk picture as recorded by any approval decision.

## Entity examples

- `vendor`
- `assessment`
- `screening`
- `questionnaire`

## Key question

> "What had we recorded about this vendor by the time we approved them?"

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

## External tools

- Sanctions/PEP screening APIs (Dow Jones, Refinitiv World-Check)
- GRC platforms (ServiceNow GRC, OneTrust)
- Document management systems for questionnaire intake
