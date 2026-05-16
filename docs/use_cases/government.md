---
title: "Public sector & GovTech"
summary: "Government determinations — benefit eligibility, permit approvals, enforcement actions — must be traceable to the specific policy version under which they were made. When policies change, agencies need to know which version governed each..."
---

# Public sector & GovTech

Government determinations — benefit eligibility, permit approvals, enforcement actions — must be traceable to the specific policy version under which they were made. When policies change, agencies need to know which version governed each decision and reconstruct the evidence that supported it. Neotoma provides policy-version-bound determinations and inter-agency evidence provenance, enabling government agencies and their AI systems to maintain full audit trails that connect every determination to its governing policy version, supporting evidence, and decision rationale across agency boundaries.

## Entity examples

- `determination`
- `policy_version`
- `applicant`
- `case_record`

## Key question

> "Under which policy version was this eligibility determined?"

## Data sources

- Policy documents and regulatory publications (Federal Register, state codes)
- Application submissions and supporting documentation
- Inter-agency data sharing records
- Case worker notes and determination letters
- Appeal records and administrative hearing transcripts
- Audit and inspector general reports

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists structured determinations, policy versions, and case records |
| `query-memory` | Reconstructs decision context under specific policy versions |

## External tools

- None specific — uses Neotoma MCP directly for policy-versioned state management and inter-agency provenance
