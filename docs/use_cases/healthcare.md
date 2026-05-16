---
title: Healthcare operations
summary: "Clinical decision-making depends on understanding what was known about a patient at the moment a recommendation was made — yet EHR systems typically present only current state, making it difficult to audit AI-assisted clinical decisions ..."
---

# Healthcare operations

Clinical decision-making depends on understanding what was known about a patient at the moment a recommendation was made — yet EHR systems typically present only current state, making it difficult to audit AI-assisted clinical decisions after the fact. Neotoma provides versioned clinical state, authorization lifecycles, and care plan lineage, enabling healthcare operations teams to reconstruct the exact patient context, active authorizations, and clinical evidence that existed when an AI agent recommended a treatment change. This supports clinical governance, payer audit defense, and patient safety review.

## Entity examples

- `patient`
- `encounter`
- `care_plan`
- `authorization`

## Key question

> "What was known about this patient when the agent recommended the dosage change?"

## Data sources

- Electronic health record (EHR) data feeds
- Clinical notes and encounter summaries
- Prior authorization requests and determinations
- Lab results and imaging reports
- Care plan documents and revisions
- Pharmacy dispensing records

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists structured clinical entities and authorization states |
| `query-memory` | Reconstructs clinical state at any decision point |

## External tools

- None specific — uses Neotoma MCP directly for clinical state versioning (integrates with EHR systems via FHIR/HL7 feeds)
